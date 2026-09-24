const jwt = require('jsonwebtoken')
const pool = require('../db/pool')

const JWT_SECRET = process.env.JWT_SECRET

async function isLoggedIn(req, res, next) {
  let token = null
  const header = req.headers.authorization
  if (header && header.startsWith('Bearer ')) {
    token = header.slice(7)
  } else if (req.query && req.query.token) {
    token = req.query.token
  }

  if (!token) {
    return res.status(401).json({ error: 'Please sign in to continue.', code: 'AUTH_REQUIRED' })
  }

  if (!JWT_SECRET) {
    return res.status(503).json({ error: 'Authentication is not configured on the server.' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const result = await pool.query(
      `SELECT id, email, name, department, designation, role, is_active
       FROM users
       WHERE id = $1`,
      [decoded.id]
    )
    const user = result.rows[0]

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'This account is no longer active.', code: 'ACCOUNT_INACTIVE' })
    }

    req.user = user
    return next()
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Your session has expired. Please sign in again.', code: 'SESSION_EXPIRED' })
    }
    return res.status(401).json({ error: 'Invalid session. Please sign in again.', code: 'INVALID_SESSION' })
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' })
    }
    return next()
  }
}

const isReviewer = requireRole('HOD', 'Admin')
const isAdmin = requireRole('Admin')

module.exports = { isLoggedIn, isReviewer, isAdmin, requireRole }
