'use strict'

const os = require('os')
const pool = require('../db/pool')
const { getActivityById } = require('./activityService')
const { generateAppreciationLetterPdf } = require('./reportService')
const { sendEmail } = require('./emailService')
const { buildPersonalizedAppreciationEmail } = require('./emailTemplateService')
const {
  claimNextJob,
  markJobSent,
  markJobFailed
} = require('./emailQueueService')

const MAX_PDF_SIZE_BYTES = 15 * 1024 * 1024 // 15 MB limit

/**
 * Validates that a buffer is a well-formed PDF within safe bounds.
 * @param {Buffer} buffer
 */
function validatePdfBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Retrieved document is not a valid buffer.')
  }
  if (buffer.length < 500) {
    throw new Error(`Retrieved document is too small (${buffer.length} bytes) to be a valid PDF.`)
  }
  if (buffer.length > MAX_PDF_SIZE_BYTES) {
    throw new Error(`Retrieved document size (${buffer.length} bytes) exceeds maximum allowable limit of ${MAX_PDF_SIZE_BYTES} bytes.`)
  }
  const header = buffer.subarray(0, 5).toString('ascii')
  if (header !== '%PDF-') {
    throw new Error(`Invalid PDF header: expected "%PDF-", got "${header}".`)
  }
}

/**
 * Processes a single claimed email job.
 * @param {object} job
 * @param {string} [workerId]
 * @param {object} [dependencies] - Optional injected dependencies for testability
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
async function processJob(job, workerId = 'worker-default', dependencies = {}) {
  if (!job) return { success: false, error: 'No job provided' }

  const db = dependencies.dbPool || pool
  const getActivity = dependencies.activityGetter || getActivityById
  const sendEmailFn = dependencies.sendEmailFn || sendEmail

  try {
    // 1. Load the approved achievement details
    const activity = await getActivity(job.achievement_id)
    if (!activity) {
      throw new Error(`Achievement with ID ${job.achievement_id} not found in repository.`)
    }

    // 2. Security validation: Must be officially approved and issued
    if (activity.workflow_status !== 'Approved') {
      throw new Error(`Activity ${activity.act_id} is not in Approved status (current: "${activity.workflow_status}"). Cannot email unapproved letter.`)
    }

    const letterData = activity.details?.appreciation_letter
    if (!letterData || !letterData.issued) {
      throw new Error(`Letter of Appreciation for activity ${activity.act_id} has not been officially issued by HOD.`)
    }

    // 3. Retrieve correct registered faculty email directly from database
    const userResult = await db.query('SELECT id, name, email FROM users WHERE id = $1', [activity.staff_id])
    const recipientUser = userResult.rows[0]
    if (!recipientUser || !recipientUser.email) {
      throw new Error(`Recipient faculty member (ID: ${activity.staff_id}) has no registered email in the database.`)
    }

    const recipientEmail = recipientUser.email.trim()

    // 4. Retrieve exact signed PDF used by download functionality
    const pdfBuffer = await generateAppreciationLetterPdf(activity, {
      role: 'Faculty',
      id: activity.staff_id,
      name: recipientUser.name
    })

    // 5. Validate the PDF buffer
    validatePdfBuffer(pdfBuffer)

    // 6. Build personalized email message based on actual achievement details
    const { subject, text, html } = buildPersonalizedAppreciationEmail({
      facultyName: recipientUser.name,
      activity,
      reviewerName: letterData.issued_by_name || activity.reviewer_name,
      issuedDate: letterData.issued_at
    })

    // 7. Send the email with the existing signed PDF attached
    const sendResult = await sendEmailFn({
      to: recipientEmail,
      subject,
      html,
      text,
      attachments: [
        {
          filename: 'Appreciation_Letter.pdf',
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ],
      throwOnError: true
    })

    const messageId = sendResult?.messageId || 'local-msg-id-' + Date.now()

    // 8. Record success in PostgreSQL
    await markJobSent(db, job.id, messageId)
    console.log(`[emailWorker] Successfully delivered appreciation letter for activity ${activity.act_id} to ${recipientEmail} (Job ID: ${job.id})`)

    return { success: true, messageId }
  } catch (err) {
    const errorMsg = err?.message || String(err)
    console.error(`[emailWorker] Failed to process job ${job.id} (Attempt ${job.attempt_count}/${job.max_attempts}):`, errorMsg)

    // Record error & schedule retry if attempts remain
    await markJobFailed(db, job.id, errorMsg, job.attempt_count, job.max_attempts).catch((e) => {
      console.error(`[emailWorker] Failed to record job failure in DB:`, e.message)
    })

    return { success: false, error: errorMsg }
  }
}

/**
 * Claims and processes the next pending job from the queue.
 * @param {string} [workerId]
 * @returns {Promise<{ processed: boolean, jobId?: number, status?: string }>}
 */
async function processNextJob(workerId = `worker-${process.pid}-${os.hostname()}`) {
  let job = null
  try {
    job = await claimNextJob(pool, workerId)
  } catch (err) {
    console.error('[emailWorker] Error claiming next job from queue:', err.message)
    return { processed: false, error: err.message }
  }

  if (!job) {
    return { processed: false }
  }

  const result = await processJob(job, workerId)
  return {
    processed: true,
    jobId: job.id,
    status: result.success ? 'SENT' : 'FAILED',
    error: result.error
  }
}

// Worker state
let workerTimer = null
let isWorkerRunning = false
let isProcessingTick = false

/**
 * Starts the worker polling interval.
 * @param {object} [options]
 * @param {number} [options.intervalMs=5000]
 * @param {string} [options.workerId]
 */
function startEmailWorker({ intervalMs = 5000, workerId } = {}) {
  if (isWorkerRunning) return

  const effectiveWorkerId = workerId || `worker-${process.pid}-${os.hostname()}`
  isWorkerRunning = true
  console.log(`[emailWorker] Started background email queue worker (${effectiveWorkerId}, poll interval: ${intervalMs}ms)`)

  const tick = async () => {
    if (isProcessingTick || !isWorkerRunning) return
    isProcessingTick = true
    try {
      // Process pending jobs in batches up to 5 per tick
      let batchCount = 0
      while (isWorkerRunning && batchCount < 5) {
        const result = await processNextJob(effectiveWorkerId)
        if (!result.processed) break
        batchCount++
      }
    } catch (err) {
      console.error('[emailWorker] Unexpected error in worker tick:', err.message)
    } finally {
      isProcessingTick = false
    }
  }

  workerTimer = setInterval(tick, intervalMs)
  if (workerTimer.unref) workerTimer.unref()

  // Run first tick shortly after start
  setTimeout(tick, 500).unref?.()
}

/**
 * Stops the worker polling interval gracefully.
 */
async function stopEmailWorker() {
  if (!isWorkerRunning) return
  isWorkerRunning = false
  if (workerTimer) {
    clearInterval(workerTimer)
    workerTimer = null
  }
  // Wait if a job is currently being processed
  let waitCount = 0
  while (isProcessingTick && waitCount < 30) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    waitCount++
  }
  console.log('[emailWorker] Email queue worker stopped gracefully.')
}

module.exports = {
  validatePdfBuffer,
  processJob,
  processNextJob,
  startEmailWorker,
  stopEmailWorker
}
