'use strict'

const pool = require('../db/pool')

/**
 * Calculates exponential backoff delay in seconds for retry attempts.
 * @param {number} attempt
 * @returns {number} Delay in seconds
 */
function calculateRetryBackoffSeconds(attempt) {
  if (attempt <= 1) return 60 // 1 minute
  if (attempt === 2) return 300 // 5 minutes
  return 900 // 15 minutes
}

/**
 * Enqueues an appreciation letter email job into PostgreSQL.
 * Deduplicates automatically via UNIQUE (achievement_id, letter_version).
 * @param {object} client - pg client or pool
 * @param {object} params
 * @param {number} params.activityId
 * @param {number} params.userId
 * @param {string} params.recipientEmail
 * @param {number} [params.version=1]
 * @param {string} [params.pdfReference]
 * @returns {Promise<{ enqueued: boolean, jobId?: number, reason?: string }>}
 */
async function enqueueAppreciationEmail(client, { activityId, userId, recipientEmail, version = 1, pdfReference = '' }) {
  const db = client || pool
  const reference = pdfReference || `/api/activity/${activityId}/appreciation-letter`

  const query = `
    INSERT INTO email_jobs (
      achievement_id,
      recipient_user_id,
      recipient_email,
      letter_version,
      pdf_reference,
      status,
      attempt_count,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, 'PENDING', 0, NOW(), NOW())
    ON CONFLICT (achievement_id, letter_version)
    DO UPDATE SET
      status = 'PENDING',
      attempt_count = 0,
      last_error = NULL,
      next_retry_at = NOW(),
      locked_at = NULL,
      locked_by = NULL,
      updated_at = NOW()
    WHERE email_jobs.status != 'SENT'
    RETURNING id;
  `

  const result = await db.query(query, [
    Number(activityId),
    Number(userId),
    String(recipientEmail).trim(),
    Number(version) || 1,
    String(reference).trim()
  ])

  if (result.rows.length > 0) {
    return { enqueued: true, jobId: result.rows[0].id }
  }

  return { enqueued: false, reason: 'duplicate_version' }
}

/**
 * Atomically claims the next pending or retryable job using FOR UPDATE SKIP LOCKED.
 * Also recovers stale jobs stuck in 'SENDING' status if the worker crashed (> 5 minutes).
 * @param {object} client - pg client or pool
 * @param {string} workerId - identifier for the worker instance
 * @returns {Promise<object|null>} The claimed job row or null
 */
async function claimNextJob(client, workerId = 'worker-default') {
  const db = client || pool

  const claimQuery = `
    WITH candidate AS (
      SELECT id
      FROM email_jobs
      WHERE (
        status = 'PENDING'
        OR (status = 'SENDING' AND locked_at < NOW() - INTERVAL '5 minutes')
        OR (status = 'FAILED' AND attempt_count < max_attempts AND next_retry_at <= NOW())
      )
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE email_jobs j
    SET status = 'SENDING',
        locked_at = NOW(),
        locked_by = $1,
        attempt_count = j.attempt_count + 1,
        updated_at = NOW()
    FROM candidate c
    WHERE j.id = c.id
    RETURNING j.*;
  `

  const result = await db.query(claimQuery, [workerId])
  return result.rows[0] || null
}

/**
 * Marks a job as successfully sent.
 * @param {object} client
 * @param {number} jobId
 * @param {string} providerMessageId
 */
async function markJobSent(client, jobId, providerMessageId = null) {
  const db = client || pool

  await db.query(
    `UPDATE email_jobs
     SET status = 'SENT',
         provider_message_id = $2,
         sent_at = NOW(),
         locked_at = NULL,
         locked_by = NULL,
         last_error = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [jobId, providerMessageId ? String(providerMessageId).slice(0, 255) : null]
  )
}

/**
 * Marks a job as failed, scheduling a retry if attempts remain.
 * @param {object} client
 * @param {number} jobId
 * @param {string|Error} error
 * @param {number} attemptCount
 * @param {number} [maxAttempts=3]
 */
async function markJobFailed(client, jobId, error, attemptCount = 1, maxAttempts = 3) {
  const db = client || pool
  const safeErrorMessage = String(error?.message || error || 'Unknown email delivery error').slice(0, 1000)
  const isExhausted = attemptCount >= maxAttempts

  if (isExhausted) {
    await db.query(
      `UPDATE email_jobs
       SET status = 'FAILED',
           last_error = $2,
           locked_at = NULL,
           locked_by = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [jobId, safeErrorMessage]
    )
  } else {
    const delaySeconds = calculateRetryBackoffSeconds(attemptCount)
    await db.query(
      `UPDATE email_jobs
       SET status = 'FAILED',
           last_error = $2,
           next_retry_at = NOW() + ($3 || ' seconds')::INTERVAL,
           locked_at = NULL,
           locked_by = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [jobId, safeErrorMessage, `${delaySeconds} seconds`]
    )
  }
}

/**
 * Retrieves the status of a specific job by achievement ID and version.
 * @param {object} client
 * @param {number} achievementId
 * @param {number} letterVersion
 */
async function getJobStatus(client, achievementId, letterVersion = 1) {
  const db = client || pool
  const result = await db.query(
    `SELECT * FROM email_jobs WHERE achievement_id = $1 AND letter_version = $2 LIMIT 1`,
    [Number(achievementId), Number(letterVersion)]
  )
  return result.rows[0] || null
}

module.exports = {
  calculateRetryBackoffSeconds,
  enqueueAppreciationEmail,
  claimNextJob,
  markJobSent,
  markJobFailed,
  getJobStatus
}
