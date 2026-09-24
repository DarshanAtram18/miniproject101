require('dotenv').config()

const fs = require('fs')
const path = require('path')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const { rateLimit } = require('express-rate-limit')
const pool = require('./db/pool')

const authRoutes = require('./routes/auth')
const activityRoutes = require('./routes/activity')
const adminRoutes = require('./routes/admin')
const reportRoutes = require('./routes/reports')

const app = express()
const port = Number(process.env.PORT || 3000)
const isProduction = process.env.NODE_ENV === 'production'

if (isProduction) app.set('trust proxy', 1)
app.disable('x-powered-by')

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", ...(isProduction ? [] : ['http://localhost:3000', 'http://localhost:5173'])],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginResourcePolicy: { policy: 'same-site' }
}))

const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
)

const apiCors = cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600
})

app.use('/api', (req, res, next) => {
  const origin = req.get('Origin')
  const sameOrigin = `${req.protocol}://${req.get('host')}`
  if (origin && origin !== sameOrigin && !allowedOrigins.has(origin)) {
    return res.status(403).json({ error: 'This browser origin is not allowed to access the API.' })
  }
  return apiCors(req, res, next)
})

app.use(express.json({ limit: '45mb', strict: true }))
app.use(express.urlencoded({ limit: '1mb', extended: false }))

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProduction ? 60 : 1000,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many failed sign-in attempts. Please wait 15 minutes and try again.' }
})

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')
    return res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() })
  } catch (error) {
    return res.status(503).json({ status: 'unavailable', database: 'disconnected' })
  }
})

app.use('/api/auth/login', loginLimiter)
app.use('/api/auth', authRoutes)
app.use('/api/activity', activityRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/reports', reportRoutes)

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' })
})

const clientBuild = path.join(__dirname, '../client/dist')
if (fs.existsSync(path.join(clientBuild, 'index.html'))) {
  app.use(express.static(clientBuild, { maxAge: isProduction ? '1d' : 0, index: false }))
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'))
  })
} else {
  app.get('/', (req, res) => {
    res.json({ service: 'WCE Prof-Insights API', status: 'running', frontend: 'not built' })
  })
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error)
  console.error('Unhandled request error:', error)
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'The uploaded files are too large. Keep the combined upload below 35 MB.' })
  }
  if (error instanceof SyntaxError && error.status === 400) {
    return res.status(400).json({ error: 'Invalid JSON request.' })
  }
  return res.status(500).json({ error: 'Unexpected server error.' })
})

const server = app.listen(port, () => {
  console.log(`WCE Prof-Insights running on port ${port}`)
  if (!process.env.JWT_SECRET) console.warn('WARNING: JWT_SECRET is not configured.')
})

const shutdown = (signal) => {
  console.log(`${signal} received; closing server.`)
  server.close(async () => {
    await pool.end()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

module.exports = app
