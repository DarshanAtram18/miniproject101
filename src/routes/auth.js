const router = require('express').Router()
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const pool = require('../db/pool')
const { isLoggedIn, isAdmin } = require('../middleware/auth')

const JWT_SECRET = process.env.JWT_SECRET

const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  department: user.department || '',
  designation: user.designation || 'Faculty',
  role: user.role || 'Faculty'
})

router.post('/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = String(req.body.password || '')

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' })
  }
  if (!JWT_SECRET) {
    return res.status(503).json({ error: 'Authentication is not configured on the server.' })
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1', [email])
    const user = result.rows[0]

    if (!user || !user.is_active || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'The email or password is incorrect.' })
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '12h', issuer: 'wce-prof-insights' }
    )

    return res.json({ token, user: publicUser(user) })
  } catch (error) {
    console.error('Login error:', error)
    return res.status(500).json({ error: 'Unable to sign in at the moment.' })
  }
})

router.get('/me', isLoggedIn, (req, res) => {
  res.json({ user: publicUser(req.user) })
})

router.post('/signup', isLoggedIn, isAdmin, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = String(req.body.password || '')
  const name = String(req.body.name || '').trim()
  const department = String(req.body.department || '').trim()
  const designation = String(req.body.designation || 'Faculty').trim()
  const role = ['Faculty', 'HOD', 'Admin'].includes(req.body.role) ? req.body.role : 'Faculty'

  if (!email || !name || !department || password.length < 8) {
    return res.status(400).json({ error: 'Name, department, email and a password of at least 8 characters are required.' })
  }

  try {
    const hash = await bcrypt.hash(password, 12)
    const result = await pool.query(
      `INSERT INTO users (email, password, name, department, designation, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, name, department, designation, role`,
      [email, hash, name, department, designation, role]
    )
    return res.status(201).json({ user: result.rows[0] })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An account already exists for this email.' })
    console.error('Account creation error:', error)
    return res.status(500).json({ error: 'Unable to create the account.' })
  }
})

router.patch('/change-password', isLoggedIn, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || req.body.oldPassword || '')
  const newPassword = String(req.body.newPassword || '')

  if (!currentPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Enter your current password and a new password of at least 8 characters.' })
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'The new password must be different from the current password.' })
  }

  try {
    const result = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.id])
    const matches = await bcrypt.compare(currentPassword, result.rows[0]?.password || '')
    if (!matches) return res.status(401).json({ error: 'The current password is incorrect.' })

    const hash = await bcrypt.hash(newPassword, 12)
    await pool.query(
      'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
      [hash, req.user.id]
    )
    return res.json({ message: 'Password updated successfully.' })
  } catch (error) {
    console.error('Password change error:', error)
    return res.status(500).json({ error: 'Unable to update the password.' })
  }
})

module.exports = router
