const router = require('express').Router()
const pool = require('../db/pool')
const { isLoggedIn, isReviewer } = require('../middleware/auth')
const { listActivities, getActivityById, canAccessActivity } = require('../services/activityService')

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
    return res.json({ activity: await getActivityById(activityId) })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Review decision error:', error)
    return res.status(500).json({ error: 'Unable to save the review decision.' })
  } finally {
    client.release()
  }
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

module.exports = router
