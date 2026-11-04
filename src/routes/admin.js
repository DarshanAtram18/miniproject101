const router = require('express').Router()
const pool = require('../db/pool')
const bcrypt = require('bcrypt')
const { isLoggedIn, isReviewer } = require('../middleware/auth')
const { listActivities, getActivityById, canAccessActivity } = require('../services/activityService')
const { sendActivityApprovedEmail, sendChangesRequestedEmail } = require('../services/emailService')
const { processNextJob } = require('../services/emailWorker')

router.use(isLoggedIn, isReviewer)

router.get('/activities', async (req, res) => {
  try {
    const result = await listActivities(req.user, { ...req.query, mine: 'false' })
    return res.json(result)
  } catch (error) {
    console.error('Reviewer activity list error:', error)
    return res.status(500).json({ error: 'Unable to load the review queue.' })
  }
})

router.patch('/activities/:activityId/review', async (req, res) => {
  const activityId = Number(req.params.activityId)
  const decision = String(req.body.decision || '').trim()
  const comment = String(req.body.comment || '').trim().slice(0, 3000)
  const allowedDecisions = ['Approved', 'Changes Requested']

  if (!allowedDecisions.includes(decision)) {
    return res.status(400).json({ error: 'Choose Approved or Changes Requested.' })
  }
  if (decision === 'Changes Requested' && !comment) {
    return res.status(400).json({ error: 'A review comment is required when requesting changes.' })
  }

  const activity = await getActivityById(activityId)
  if (!activity) return res.status(404).json({ error: 'Activity not found.' })
  if (!canAccessActivity(req.user, activity)) {
    return res.status(403).json({ error: 'You cannot review an activity outside your department.' })
  }
  if (Number(activity.staff_id) === Number(req.user.id)) {
    return res.status(409).json({ error: 'A reviewer cannot approve their own activity. Ask another authorised reviewer.' })
  }
  if (activity.workflow_status !== 'Submitted') {
    return res.status(409).json({ error: `This activity is currently ${activity.workflow_status} and is not awaiting review.` })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE activity
       SET workflow_status = $1,
           approved = $2,
           reviewed_at = NOW(),
           reviewed_by = $3,
           review_comment = $4,
           updated_at = NOW(),
           version = version + 1
       WHERE act_id = $5`,
      [decision, decision === 'Approved', req.user.id, comment || null, activityId]
    )
    await client.query(
      `INSERT INTO activity_audit
         (activity_id, actor_id, action, from_status, to_status, note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [activityId, req.user.id, decision === 'Approved' ? 'Approved' : 'Requested changes', activity.workflow_status, decision, comment || null]
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Review decision error:', err)
    return res.status(500).json({ error: 'Unable to save the review decision.' })
  } finally {
    client.release()
  }

  // Send in-app notification to faculty/club member
  try {
    const notifTitle = decision === 'Approved'
      ? 'Your Activity Has Been Approved!'
      : 'Changes Requested for Your Activity'
    const notifMsg = decision === 'Approved'
      ? `Your activity "${activity.title}" has been approved by your HOD. You can now download the approved record from your dashboard.${comment ? ' HOD note: ' + comment : ''}`
      : `Your HOD has requested changes to "${activity.title}". Please review the feedback and resubmit. Feedback: ${comment}`
    await pool.query(
      `INSERT INTO notifications (user_id, kind, title, message, activity_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [activity.staff_id, decision === 'Approved' ? 'approved' : 'changes_requested', notifTitle, notifMsg, activityId]
    )
  } catch (notifErr) {
    console.warn('Could not create review notification:', notifErr.message)
  }

  // Send email to faculty/club member
  try {
    const facultyResult = await pool.query('SELECT name, email FROM users WHERE id = $1', [activity.staff_id])
    const faculty = facultyResult.rows[0]
    if (faculty?.email) {
      if (decision === 'Approved') {
        await sendActivityApprovedEmail({
          to: faculty.email,
          facultyName: faculty.name,
          activityTitle: activity.title,
          reviewerName: req.user.name || 'HOD',
          reviewerComment: comment || ''
        })
      } else {
        await sendChangesRequestedEmail({
          to: faculty.email,
          facultyName: faculty.name,
          activityTitle: activity.title,
          reviewerName: req.user.name || 'HOD',
          reviewerComment: comment
        })
      }
    }
  } catch (emailErr) {
    console.warn('Could not send review email:', emailErr.message)
  }

  return res.json({ activity: await getActivityById(activityId) })
})

router.delete('/activities/:activityId', async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Only a system administrator can archive another faculty member’s record.' })
  }

  const activityId = Number(req.params.activityId)
  const reason = String(req.body.reason || '').trim().slice(0, 3000)
  if (!reason) return res.status(400).json({ error: 'An archival reason is required.' })

  const activity = await getActivityById(activityId)
  if (!activity) return res.status(404).json({ error: 'Activity not found.' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO activity_audit
         (activity_id, actor_id, action, from_status, to_status, note)
       VALUES ($1, $2, 'Archived by administrator', $3, 'Archived', $4)`,
      [activityId, req.user.id, activity.workflow_status, reason]
    )
    await client.query(
      `UPDATE activity
       SET deleted_at = NOW(), workflow_status = 'Archived', approved = FALSE,
           updated_at = NOW(), version = version + 1
       WHERE act_id = $1`,
      [activityId]
    )
    await client.query('COMMIT')
    return res.json({ message: 'Activity archived. Its audit history is retained.' })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Administrator archive error:', error)
    return res.status(500).json({ error: 'Unable to archive the activity.' })
  } finally {
    client.release()
  }
})

router.get('/stats', async (req, res) => {
  const values = []
  let access = 'a.deleted_at IS NULL'
  if (req.user.role === 'HOD') {
    values.push(req.user.department)
    access += ' AND a.department = $1'
  }

  try {
    const result = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE a.workflow_status = 'Submitted')::int AS awaiting_review,
         COUNT(*) FILTER (WHERE a.workflow_status = 'Changes Requested')::int AS changes_requested,
         COUNT(*) FILTER (WHERE a.workflow_status = 'Approved')::int AS approved,
         COUNT(DISTINCT a.staff_id)::int AS contributing_faculty
       FROM activity a
       WHERE ${access}`,
      values
    )
    return res.json(result.rows[0])
  } catch (error) {
    console.error('Reviewer statistics error:', error)
    return res.status(500).json({ error: 'Unable to load reviewer statistics.' })
  }
})

// Reviewer/Admin inspection of email jobs queue
router.get('/email-queue-status', async (req, res) => {
  try {
    const jobsResult = await pool.query(
      `SELECT id, achievement_id, recipient_email, letter_version, status, attempt_count, max_attempts, last_error, next_retry_at, sent_at, created_at, updated_at
       FROM email_jobs
       ORDER BY id DESC
       LIMIT 20`
    )
    return res.json({
      activeProvider: process.env.RESEND_API_KEY ? 'Resend API (HTTPS)' : process.env.BREVO_API_KEY ? 'Brevo API (HTTPS)' : 'SMTP (Nodemailer)',
      resendConfigured: Boolean(process.env.RESEND_API_KEY),
      brevoConfigured: Boolean(process.env.BREVO_API_KEY),
      smtpConfigured: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS),
      smtpUser: process.env.SMTP_USER || null,
      smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
      facultyTestEmail: process.env.FACULTY_TEST_EMAIL || 'atram.darshan@walchandsangli.ac.in',
      jobs: jobsResult.rows
    })
  } catch (error) {
    console.error('Email queue status check error:', error)
    return res.status(500).json({ error: error.message })
  }
})

// Reviewer/Admin manual retry of failed email jobs
router.post('/email-queue-retry', async (req, res) => {
  try {
    const updateResult = await pool.query(
      `UPDATE email_jobs
       SET status = 'PENDING',
           attempt_count = 0,
           last_error = NULL,
           next_retry_at = NOW(),
           locked_at = NULL,
           locked_by = NULL,
           updated_at = NOW()
       WHERE status IN ('FAILED', 'SENDING')
       RETURNING id, achievement_id`
    )

    // Trigger worker immediately to process retried jobs
    setImmediate(async () => {
      try {
        let count = 0
        while (count < 10) {
          const workerRes = await processNextJob('admin-manual-retry')
          if (!workerRes.processed) break
          count++
        }
      } catch (e) {
        console.warn('Manual retry worker error:', e.message)
      }
    })

    return res.json({
      success: true,
      retriedCount: updateResult.rowCount,
      retriedJobs: updateResult.rows
    })
  } catch (error) {
    console.error('Email queue retry error:', error)
    return res.status(500).json({ error: error.message })
  }
})


// ─────────────────────────────────────────────────────────────
// USER MANAGEMENT ENDPOINTS (SYSTEM ADMINISTRATOR ONLY)
// ─────────────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Only a System Administrator can access the user directory.' })
  }

  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.email,
        u.name,
        u.salutation,
        u.department,
        u.designation,
        u.role,
        u.is_active,
        u.created_at,
        u.updated_at,
        COUNT(a.act_id) FILTER (WHERE a.deleted_at IS NULL)::int AS activity_count
      FROM users u
      LEFT JOIN activity a ON a.staff_id = u.id
      GROUP BY u.id
      ORDER BY
        (CASE u.role WHEN 'Admin' THEN 1 WHEN 'HOD' THEN 2 WHEN 'Faculty' THEN 3 ELSE 4 END),
        u.name ASC
    `)
    return res.json({ users: result.rows })
  } catch (error) {
    console.error('Admin users list error:', error)
    return res.status(500).json({ error: 'Unable to load user accounts.' })
  }
})

router.post('/users', async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Only a System Administrator can create new user accounts.' })
  }

  const email = String(req.body.email || '').trim().toLowerCase()
  const name = String(req.body.name || '').trim()
  const salutation = String(req.body.salutation || '').trim()
  const department = String(req.body.department || 'Computer Science and Engineering').trim()
  const designation = String(req.body.designation || 'Assistant Professor').trim()
  const role = String(req.body.role || 'Faculty').trim()
  const password = String(req.body.password || '123').trim()

  if (!email || !name) {
    return res.status(400).json({ error: 'Both name and institutional email / username are required.' })
  }

  const allowedRoles = ['Faculty', 'HOD', 'Club', 'Admin']
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${allowedRoles.join(', ')}` })
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email])
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: `An account with email or username "${email}" already exists.` })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const result = await pool.query(
      `INSERT INTO users (email, password, name, salutation, department, designation, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
       RETURNING id, email, name, salutation, department, designation, role, is_active, created_at`,
      [email, passwordHash, name, salutation || null, department, designation, role]
    )

    return res.status(201).json({ user: result.rows[0], message: `Account for ${name} (${email}) created successfully.` })
  } catch (error) {
    console.error('Admin create user error:', error)
    return res.status(500).json({ error: 'Unable to create user account.' })
  }
})

router.put('/users/:userId', async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Only a System Administrator can update user profiles.' })
  }

  const targetId = Number(req.params.userId)
  const name = String(req.body.name || '').trim()
  const salutation = String(req.body.salutation || '').trim()
  const department = String(req.body.department || '').trim()
  const designation = String(req.body.designation || '').trim()
  const role = String(req.body.role || '').trim()
  const isActive = req.body.is_active !== false

  if (!name) {
    return res.status(400).json({ error: 'Name is required.' })
  }

  if (targetId === Number(req.user.id) && !isActive) {
    return res.status(400).json({ error: 'You cannot deactivate your own administrative account.' })
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET name = $1,
           salutation = $2,
           department = $3,
           designation = $4,
           role = $5,
           is_active = $6,
           updated_at = NOW()
       WHERE id = $7
       RETURNING id, email, name, salutation, department, designation, role, is_active, updated_at`,
      [name, salutation || null, department, designation, role, isActive, targetId]
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found.' })
    }

    return res.json({ user: result.rows[0], message: `Account for ${name} updated successfully.` })
  } catch (error) {
    console.error('Admin update user error:', error)
    return res.status(500).json({ error: 'Unable to update user profile.' })
  }
})

router.post('/users/:userId/reset-password', async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Only a System Administrator can reset credentials.' })
  }

  const targetId = Number(req.params.userId)
  const newPassword = String(req.body.newPassword || '123').trim()
  if (!newPassword) {
    return res.status(400).json({ error: 'Password cannot be blank.' })
  }

  try {
    const passwordHash = await bcrypt.hash(newPassword, 10)
    const result = await pool.query(
      `UPDATE users
       SET password = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, name`,
      [passwordHash, targetId]
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found.' })
    }

    return res.json({
      message: `Password for ${result.rows[0].name} (${result.rows[0].email}) has been reset to '${newPassword}'.`
    })
  } catch (error) {
    console.error('Admin reset password error:', error)
    return res.status(500).json({ error: 'Unable to reset user password.' })
  }
})

router.delete('/users/:userId', async (req, res) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Only a System Administrator can delete user accounts.' })
  }

  const targetId = Number(req.params.userId)
  if (targetId === Number(req.user.id)) {
    return res.status(400).json({ error: 'You cannot remove your own administrative account.' })
  }

  const reassignTo = req.query.reassignTo ? Number(req.query.reassignTo) : null

  try {
    const userResult = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [targetId])
    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'User not found.' })
    }
    const targetUser = userResult.rows[0]

    if (reassignTo) {
      await pool.query('UPDATE activity SET staff_id = $1 WHERE staff_id = $2', [reassignTo, targetId])
    }

    const actResult = await pool.query('SELECT COUNT(*)::int AS count FROM activity WHERE staff_id = $1', [targetId])
    const count = actResult.rows[0]?.count || 0

    if (count > 0 && !req.query.force) {
      await pool.query('UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [targetId])
      return res.json({
        message: `${targetUser.name} has ${count} recorded activities. Account has been deactivated to preserve institutional audit trails.`
      })
    } else {
      if (req.query.force && count > 0) {
        await pool.query('DELETE FROM activity_attachments WHERE activity_id IN (SELECT act_id FROM activity WHERE staff_id = $1)', [targetId])
        await pool.query('DELETE FROM activity_reviews WHERE activity_id IN (SELECT act_id FROM activity WHERE staff_id = $1)', [targetId])
        await pool.query('DELETE FROM activity WHERE staff_id = $1', [targetId])
      }
      await pool.query('DELETE FROM users WHERE id = $1', [targetId])
      return res.json({ message: `Account for ${targetUser.name} (${targetUser.email}) removed permanently.` })
    }
  } catch (error) {
    console.error('Admin delete user error:', error)
    return res.status(500).json({ error: 'Unable to remove user account.' })
  }
})

router.get('/system-summary', async (req, res) => {
  try {
    const [userStats, actStats, emailStats] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS total_users,
          COUNT(*) FILTER (WHERE role = 'Faculty')::int AS faculty_count,
          COUNT(*) FILTER (WHERE role = 'HOD')::int AS hod_count,
          COUNT(*) FILTER (WHERE role = 'Club')::int AS club_count,
          COUNT(*) FILTER (WHERE role = 'Admin')::int AS admin_count,
          COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active_users,
          COUNT(*) FILTER (WHERE is_active = FALSE)::int AS inactive_users
        FROM users
      `),
      pool.query(`
        SELECT
          COUNT(*)::int AS total_activities,
          COUNT(*) FILTER (WHERE workflow_status = 'Approved')::int AS approved_count,
          COUNT(*) FILTER (WHERE workflow_status = 'Submitted')::int AS pending_count,
          COUNT(*) FILTER (WHERE workflow_status = 'Changes Requested')::int AS changes_requested_count,
          COUNT(*) FILTER (WHERE workflow_status = 'Draft')::int AS draft_count
        FROM activity
        WHERE deleted_at IS NULL
      `),
      pool.query(`
        SELECT
          COUNT(*)::int AS total_jobs,
          COUNT(*) FILTER (WHERE status = 'SENT')::int AS sent_jobs,
          COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending_jobs,
          COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed_jobs
        FROM email_jobs
      `)
    ])

    return res.json({
      users: userStats.rows[0],
      activities: actStats.rows[0],
      emails: emailStats.rows[0],
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('System summary error:', error)
    return res.status(500).json({ error: 'Unable to load system summary.' })
  }
})

module.exports = router
