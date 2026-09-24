require('dotenv').config()

const jwt = require('jsonwebtoken')
const pool = require('../src/db/pool')

const confirmed = process.argv.includes('--confirm-live-smoke')
const userId = Number(process.env.SMOKE_USER_ID || 3)
const apiBase = process.env.SMOKE_API_BASE || 'http://127.0.0.1:3000/api'
const title = `[Codex smoke test] ${new Date().toISOString()}`

if (!confirmed) {
  console.error('Refusing to touch the live database without --confirm-live-smoke.')
  process.exit(2)
}

if (!process.env.JWT_SECRET || !Number.isInteger(userId)) {
  console.error('JWT_SECRET and a numeric SMOKE_USER_ID are required.')
  process.exit(2)
}

let activityId = null
let baselineCount = null

const onePixelPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlB8AAAAASUVORK5CYII='

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${request.token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  })
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer())
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed (${response.status}): ${body.error || 'unexpected response'}`)
  }
  return { response, body }
}

async function cleanup() {
  if (!activityId) return
  const result = await pool.query(
    `DELETE FROM activity
     WHERE act_id = $1
       AND staff_id = $2
       AND title = $3
     RETURNING act_id`,
    [activityId, userId, title]
  )
  if (result.rowCount !== 1) {
    throw new Error('Smoke-test cleanup refused: the exact temporary record could not be verified.')
  }
  activityId = null
}

async function main() {
  const userResult = await pool.query(
    'SELECT id, email, name, department, role, is_active FROM users WHERE id = $1',
    [userId]
  )
  const user = userResult.rows[0]
  if (!user?.is_active) throw new Error(`Active smoke-test faculty user ${userId} was not found.`)

  baselineCount = Number((await pool.query('SELECT COUNT(*)::int AS count FROM activity')).rows[0].count)
  request.token = jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '5m', issuer: 'wce-prof-insights' }
  )

  const payload = {
    typeName: 'Guest Lecture',
    title,
    facultyRole: 'Organizer / Coordinator',
    mode: 'Online',
    academicYear: '2026-27',
    startDate: '2026-08-20',
    endDate: '2026-08-20',
    scope: 'National',
    hostOrganisation: 'WCE Prof-Insights automated quality check',
    activityStatus: 'Completed',
    participantCount: 1,
    summary: 'Temporary end-to-end verification record. It is removed automatically.',
    outcomes: 'Verified faculty CRUD, guest, multi-image, attendance and protected download flows.',
    evidenceAvailability: 'Available now',
    details: {},
    guests: [{
      name: 'Automated Test Resource Person',
      organisation: 'WCE Prof-Insights Quality Assurance',
      guestRole: 'Resource Person',
      guestType: 'Internal'
    }],
    attachments: [
      { kind: 'image', fileName: 'smoke-image-1.png', mimeType: 'image/png', data: onePixelPng, caption: 'Image one' },
      { kind: 'image', fileName: 'smoke-image-2.png', mimeType: 'image/png', data: onePixelPng, caption: 'Image two' },
      {
        kind: 'attendance',
        fileName: 'smoke-attendance.csv',
        mimeType: 'text/csv',
        data: Buffer.from('student_name\nSmoke Test Attendee\n').toString('base64')
      }
    ],
    saveAsDraft: true
  }

  const created = await request('/activity', { method: 'POST', body: JSON.stringify(payload) })
  activityId = Number(created.body.activity.act_id)
  if (!activityId || created.body.activity.workflow_status !== 'Draft') throw new Error('Draft creation assertion failed.')
  if (created.body.activity.attachments.length !== 3 || created.body.activity.guests.length !== 1) {
    throw new Error('Multi-attachment or guest persistence assertion failed.')
  }

  const image = created.body.activity.attachments.find((item) => item.kind === 'image')
  const downloaded = await request(`/activity/${activityId}/attachments/${image.id}?disposition=inline`)
  if (!Buffer.isBuffer(downloaded.body) || downloaded.body.length === 0) throw new Error('Protected attachment download assertion failed.')

  const submitted = await request(`/activity/${activityId}`, {
    method: 'PUT',
    body: JSON.stringify({ ...payload, attachments: [], saveAsDraft: false, version: created.body.activity.version })
  })
  if (submitted.body.activity.workflow_status !== 'Submitted') throw new Error('Submission assertion failed.')

  const recalled = await request(`/activity/${activityId}/recall`, {
    method: 'POST',
    body: JSON.stringify({ note: 'Automated recall verification' })
  })
  if (recalled.body.activity.workflow_status !== 'Draft') throw new Error('Recall assertion failed.')

  await request(`/activity/${activityId}`, {
    method: 'DELETE',
    body: JSON.stringify({ note: 'Automated soft-delete verification' })
  })
  const deletedRow = await pool.query('SELECT deleted_at, workflow_status FROM activity WHERE act_id = $1', [activityId])
  if (!deletedRow.rows[0]?.deleted_at || deletedRow.rows[0].workflow_status !== 'Archived') {
    throw new Error('Soft-delete assertion failed.')
  }

  await cleanup()
  const finalCount = Number((await pool.query('SELECT COUNT(*)::int AS count FROM activity')).rows[0].count)
  if (finalCount !== baselineCount) throw new Error('Database record count did not return to its baseline.')

  console.log('Live smoke test passed: draft, guests, multiple images, attendance, download, submit, recall, soft delete and cleanup.')
}

main()
  .catch(async (error) => {
    console.error(`Live smoke test failed: ${error.message}`)
    try {
      await cleanup()
    } catch (cleanupError) {
      console.error(`Cleanup warning: ${cleanupError.message}`)
    }
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
