require('dotenv').config()

const bcrypt = require('bcrypt')
const pool = require('../src/db/pool')

const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase()
const name = String(process.env.ADMIN_NAME || 'System Administrator').trim()
const department = String(
  process.env.ADMIN_DEPARTMENT || 'Computer Science and Engineering'
).trim()
const password = String(process.env.ADMIN_PASSWORD || '')

function validateConfiguration() {
  const errors = []

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('ADMIN_EMAIL must be a valid institutional email address.')
  }
  if (email.length > 255) errors.push('ADMIN_EMAIL must not exceed 255 characters.')
  if (!name) errors.push('ADMIN_NAME is required.')
  if (name.length > 255) errors.push('ADMIN_NAME must not exceed 255 characters.')
  if (!department) errors.push('ADMIN_DEPARTMENT is required.')
  if (department.length > 255) errors.push('ADMIN_DEPARTMENT must not exceed 255 characters.')

  if (password.length < 12) {
    errors.push('ADMIN_PASSWORD must contain at least 12 characters.')
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    errors.push('ADMIN_PASSWORD must not exceed bcrypt\'s 72-byte input limit.')
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    errors.push('ADMIN_PASSWORD must include lowercase, uppercase, number, and symbol characters.')
  }
  if (email && password.toLowerCase().includes(email.split('@')[0])) {
    errors.push('ADMIN_PASSWORD must not contain the email account name.')
  }

  return errors
}

async function bootstrapAdmin() {
  const errors = validateConfiguration()
  if (errors.length) throw new Error(errors.join(' '))

  const passwordHash = await bcrypt.hash(password, 12)
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const existing = await client.query(
      'SELECT id FROM users WHERE LOWER(email) = $1 FOR UPDATE',
      [email]
    )

    if (existing.rowCount > 1) {
      throw new Error('Multiple existing accounts differ only by email letter case. Resolve them before bootstrap.')
    }

    if (existing.rowCount) {
      await client.query(
        `UPDATE users
         SET email = $1,
             password = $2,
             name = $3,
             department = $4,
             designation = 'System Administrator',
             role = 'Admin',
             is_active = TRUE,
             updated_at = NOW()
         WHERE id = $5`,
        [email, passwordHash, name, department, existing.rows[0].id]
      )
      console.log(`Administrator account updated for ${email}.`)
    } else {
      await client.query(
        `INSERT INTO users
           (email, password, name, department, designation, role, is_active)
         VALUES ($1, $2, $3, $4, 'System Administrator', 'Admin', TRUE)`,
        [email, passwordHash, name, department]
      )
      console.log(`Administrator account created for ${email}.`)
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

bootstrapAdmin()
  .catch((error) => {
    console.error(`Administrator bootstrap failed: ${error.message}`)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
