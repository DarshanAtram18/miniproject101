require('dotenv').config()

const fs = require('fs')
const path = require('path')
const pool = require('./pool')

const migrationsDir = path.join(__dirname, '../../migrations')

async function migrate() {
  const client = await pool.connect()

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const files = fs.readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort()

    for (const file of files) {
      const exists = await client.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1',
        [file]
      )
      if (exists.rowCount > 0) continue

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
      process.stdout.write(`Applying ${file}... `)
      await client.query(sql)
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
        [file]
      )
      process.stdout.write('done\n')
    }

    if (process.env.ADMIN_EMAIL) {
      await client.query(
        `UPDATE users
         SET role = 'Admin', designation = COALESCE(NULLIF(designation, ''), 'System Administrator')
         WHERE LOWER(email) = LOWER($1)`,
        [process.env.ADMIN_EMAIL]
      )
    }

    process.stdout.write('Database is up to date.\n')
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch((error) => {
  console.error('Migration failed:', error.message)
  process.exitCode = 1
})

