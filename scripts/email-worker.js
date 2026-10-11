#!/usr/bin/env node
'use strict'

require('dotenv').config()

const pool = require('../src/db/pool')
const { startEmailWorker, stopEmailWorker } = require('../src/services/emailWorker')

console.log('[standalone-worker] Starting WCE Prof-Insights Appreciation Email Queue Worker...')

const pollIntervalMs = Number(process.env.EMAIL_WORKER_POLL_INTERVAL_MS || 5000)

startEmailWorker({ intervalMs: pollIntervalMs })

async function handleShutdown(signal) {
  console.log(`[standalone-worker] Received ${signal}. Shutting down worker gracefully...`)
  try {
    await stopEmailWorker()
    await pool.end()
    console.log('[standalone-worker] Worker shutdown complete.')
    process.exit(0)
  } catch (err) {
    console.error('[standalone-worker] Error during shutdown:', err)
    process.exit(1)
  }
}

process.on('SIGINT', () => handleShutdown('SIGINT'))
process.on('SIGTERM', () => handleShutdown('SIGTERM'))
