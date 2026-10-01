const express = require('express')
const router = express.Router()
const pool = require('../db/pool')
const { isLoggedIn } = require('../middleware/auth')

// All routes require authentication
router.use(isLoggedIn)

// GET /api/notifications – fetch current user's notifications (latest 50)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, kind, title, message, activity_id, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    )
    const unreadCount = result.rows.filter((n) => !n.is_read).length
    return res.json({ notifications: result.rows, unreadCount })
  } catch (error) {
    console.error('Notifications fetch error:', error)
    return res.status(500).json({ error: 'Unable to load notifications.' })
  }
})

// PATCH /api/notifications/:id/read – mark a single notification as read
router.patch('/:id/read', async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    )
    return res.json({ success: true })
  } catch (error) {
    console.error('Mark notification read error:', error)
    return res.status(500).json({ error: 'Unable to mark notification as read.' })
  }
})

// PATCH /api/notifications/read-all – mark all notifications as read
router.patch('/read-all', async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    )
    return res.json({ success: true })
  } catch (error) {
    console.error('Mark all read error:', error)
    return res.status(500).json({ error: 'Unable to mark all as read.' })
  }
})

module.exports = router
