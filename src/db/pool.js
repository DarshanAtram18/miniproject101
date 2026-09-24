const { Pool, types } = require('pg')

// Keep PostgreSQL DATE values as YYYY-MM-DD strings. Converting them to a local
// JavaScript Date can move an event to the previous day in Indian time zones.
types.setTypeParser(1082, (value) => value)

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
      max: Number(process.env.DB_POOL_SIZE || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    }
  : {
      host:     process.env.DB_HOST,
      port:     process.env.DB_PORT,
      database: process.env.DB_NAME,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: Number(process.env.DB_POOL_SIZE || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    }

const pool = new Pool(poolConfig)

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error)
})

module.exports = pool
