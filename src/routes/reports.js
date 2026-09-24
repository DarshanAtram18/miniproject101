const router = require('express').Router()
const { isLoggedIn } = require('../middleware/auth')
const { listActivities } = require('../services/activityService')
const {
  buildReportMetadata,
  generateCsv,
  generatePdf,
  generateDocx
} = require('../services/reportService')

router.use(isLoggedIn)

const safeFilenamePart = (value) => String(value || 'combined-years')
  .replace(/[^a-zA-Z0-9-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase()

router.get('/activity-register', async (req, res) => {
  const format = String(req.query.format || 'pdf').toLowerCase()
  if (!['pdf', 'docx', 'csv'].includes(format)) {
    return res.status(400).json({ error: 'Report format must be pdf, docx or csv.' })
  }

  try {
    const result = await listActivities(req.user, req.query, { reports: true, unpaged: true })
    const records = [...result.items].reverse()
    const metadata = buildReportMetadata(req.user, req.query, records)
    const period = safeFilenamePart(req.query.academicYear || `${req.query.from || 'all'}-${req.query.to || 'years'}`)
    const filename = `faculty-activity-report-${period}.${format}`

    let body
    let contentType
    if (format === 'csv') {
      body = generateCsv(records, metadata)
      contentType = 'text/csv; charset=utf-8'
    } else if (format === 'docx') {
      body = await generateDocx(records, metadata)
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    } else {
      body = await generatePdf(records, metadata)
      contentType = 'application/pdf'
    }

    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-store')
    return res.send(body)
  } catch (error) {
    console.error('Report generation error:', error)
    return res.status(500).json({ error: 'Unable to generate the requested report.' })
  }
})

module.exports = router
