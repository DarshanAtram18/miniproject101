'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  escapeHtml,
  sanitizeHeader,
  getCategorySpecificNarrative,
  buildPersonalizedAppreciationEmail
} = require('../src/services/emailTemplateService')
const {
  calculateRetryBackoffSeconds,
  enqueueAppreciationEmail
} = require('../src/services/emailQueueService')
const {
  validatePdfBuffer,
  processJob
} = require('../src/services/emailWorker')

test('escapeHtml neutralizes HTML tags, quotes, and dangerous characters', () => {
  assert.equal(escapeHtml('<script>alert("XSS")</script>'), '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;')
  assert.equal(escapeHtml('Dr. O\'Connor & Associates'), 'Dr. O&#39;Connor &amp; Associates')
  assert.equal(escapeHtml(''), '')
  assert.equal(escapeHtml(null), '')
})

test('sanitizeHeader strips CRLF to prevent email header injection', () => {
  const dirty = 'Letter of Appreciation\r\nBcc: evil@attacker.com\nSubject: Injected'
  const clean = sanitizeHeader(dirty)
  assert.ok(!clean.includes('\r'))
  assert.ok(!clean.includes('\n'))
  assert.equal(clean, 'Letter of Appreciation Bcc: evil@attacker.com Subject: Injected')
})

test('getCategorySpecificNarrative tailors congratulations by authentic catalog types', () => {
  const pubNarrative = getCategorySpecificNarrative({ type_name: 'Research Publication' })
  assert.match(pubNarrative, /scholarly publication and academic research/i)

  const grantNarrative = getCategorySpecificNarrative({ type_name: 'Research Project / Grant' })
  assert.match(grantNarrative, /research grant/i)

  const patentNarrative = getCategorySpecificNarrative({ type_name: 'Patent / Innovation' })
  assert.match(patentNarrative, /patent work/i)

  const awardNarrative = getCategorySpecificNarrative({ type_name: 'Faculty Achievement / Award' })
  assert.match(awardNarrative, /distinguished recognition/i)

  const fdpNarrative = getCategorySpecificNarrative({ type_name: 'Faculty Development Programme (FDP)' })
  assert.match(fdpNarrative, /scholarly engagement/i)

  const guestNarrative = getCategorySpecificNarrative({ type_name: 'Guest Lecture' })
  assert.match(guestNarrative, /guest session/i)

  const unknownNarrative = getCategorySpecificNarrative({ type_name: 'Unspecified Event' })
  assert.match(unknownNarrative, /dedicated contribution/i)
})

test('buildPersonalizedAppreciationEmail constructs safe HTML and text with PDF attachment notice', () => {
  const activity = {
    title: 'Machine Learning in Healthcare <2026>',
    type_name: 'Research Publication',
    summary: 'Published IEEE comparative analysis on patient diagnostic models.',
    reviewed_at: '2026-09-15T00:00:00.000Z'
  }

  const { subject, text, html } = buildPersonalizedAppreciationEmail({
    facultyName: 'Dr. Jane Doe',
    activity,
    reviewerName: 'Dr. A. R. Surve',
    issuedDate: '15 September 2026'
  })

  // Subject line
  assert.equal(subject, 'Letter of Appreciation – Machine Learning in Healthcare <2026>')
  assert.ok(!subject.includes('\n'))

  // Text version contains essential requirements
  assert.match(text, /Dear Dr\. Jane Doe/)
  assert.match(text, /Machine Learning in Healthcare <2026>/)
  assert.match(text, /scholarly publication and academic research/)
  assert.match(text, /Please find attached your official HOD-approved and signed Letter of Appreciation in PDF format\./)
  assert.match(text, /College Administration/)

  // HTML version escapes user input and contains styled attachment notice
  assert.match(html, /&lt;2026&gt;/)
  assert.ok(!html.includes('<2026>'))
  assert.match(html, /Appreciation_Letter\.pdf/)
  assert.match(html, /Signed Letter of Appreciation Attached/)
  assert.match(html, /Walchand College of Engineering, Sangli/)
})

test('validatePdfBuffer verifies genuine PDF buffers and rejects invalid content or oversized files', () => {
  // Valid PDF buffer
  const validBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<\n>>\nendobj\ntrailer\n<<\n>>\n%%EOF\n' + 'x'.repeat(600))
  assert.doesNotThrow(() => validatePdfBuffer(validBuffer))

  // Non-buffer
  assert.throws(() => validatePdfBuffer('not a buffer'), /valid buffer/)

  // Too small
  const tinyBuffer = Buffer.from('%PDF-1.4')
  assert.throws(() => validatePdfBuffer(tinyBuffer), /too small/)

  // Wrong header
  const badHeaderBuffer = Buffer.from('NOTPDF' + 'x'.repeat(600))
  assert.throws(() => validatePdfBuffer(badHeaderBuffer), /Invalid PDF header/)

  // Exceeds size limit (simulate with mocked length)
  const oversizedBuffer = Buffer.from('%PDF-' + 'x'.repeat(600))
  Object.defineProperty(oversizedBuffer, 'length', { value: 16 * 1024 * 1024 })
  assert.throws(() => validatePdfBuffer(oversizedBuffer), /exceeds maximum allowable limit/)
})

test('calculateRetryBackoffSeconds scales backoff progressively', () => {
  assert.equal(calculateRetryBackoffSeconds(1), 60)
  assert.equal(calculateRetryBackoffSeconds(2), 300)
  assert.equal(calculateRetryBackoffSeconds(3), 900)
})

test('enqueueAppreciationEmail deduplicates repeat requests for the same version', async () => {
  let callCount = 0
  const mockClient = {
    query: async (sql, params) => {
      callCount++
      if (callCount === 1) {
        return { rows: [{ id: 42 }] } // first insert succeeds
      }
      return { rows: [] } // conflict returns empty
    }
  }

  const first = await enqueueAppreciationEmail(mockClient, {
    activityId: 101,
    userId: 5,
    recipientEmail: 'faculty@wce.ac.in',
    version: 1
  })
  assert.equal(first.enqueued, true)
  assert.equal(first.jobId, 42)

  const repeat = await enqueueAppreciationEmail(mockClient, {
    activityId: 101,
    userId: 5,
    recipientEmail: 'faculty@wce.ac.in',
    version: 1
  })
  assert.equal(repeat.enqueued, false)
  assert.equal(repeat.reason, 'duplicate_version')
})

test('processJob strictly rejects null jobs', async () => {
  const result = await processJob(null)
  assert.equal(result.success, false)
  assert.equal(result.error, 'No job provided')
})

test('processJob strictly rejects unapproved achievements', async () => {
  const unapprovedJob = { id: 1, achievement_id: 101, attempt_count: 1, max_attempts: 3 }
  const mockDb = { query: async () => ({ rows: [] }) }
  const mockActivityGetter = async () => ({
    act_id: 101,
    workflow_status: 'Submitted',
    details: {}
  })

  const result = await processJob(unapprovedJob, 'test-worker', {
    dbPool: mockDb,
    activityGetter: mockActivityGetter
  })

  assert.equal(result.success, false)
  assert.match(result.error, /not in Approved status/)
})

test('processJob strictly rejects achievements with unissued letters', async () => {
  const unissuedJob = { id: 2, achievement_id: 102, attempt_count: 1, max_attempts: 3 }
  const mockDb = { query: async () => ({ rows: [] }) }
  const mockActivityGetter = async () => ({
    act_id: 102,
    workflow_status: 'Approved',
    details: { appreciation_letter: { issued: false } }
  })

  const result = await processJob(unissuedJob, 'test-worker', {
    dbPool: mockDb,
    activityGetter: mockActivityGetter
  })

  assert.equal(result.success, false)
  assert.match(result.error, /has not been officially issued/)
})

test('processJob successfully processes approved achievement and delivers email with PDF attachment', async () => {
  const job = { id: 3, achievement_id: 103, attempt_count: 1, max_attempts: 3 }
  let sentParams = null
  let markedSentJobId = null

  const mockDb = {
    query: async (sql, params) => {
      if (sql.includes('SELECT id, name, email FROM users')) {
        return { rows: [{ id: 10, name: 'Prof. Sharma', email: 'sharma@wce.ac.in' }] }
      }
      if (sql.includes("status = 'SENT'")) {
        markedSentJobId = params[0]
        return { rows: [] }
      }
      return { rows: [] }
    }
  }

  const mockActivityGetter = async () => ({
    act_id: 103,
    staff_id: 10,
    staff_name: 'Prof. Sharma',
    department: 'Computer Science and Engineering',
    title: 'Advanced AI Research Workshop',
    type_name: 'Workshop',
    workflow_status: 'Approved',
    details: {
      appreciation_letter: {
        issued: true,
        issued_at: '2026-09-01T00:00:00.000Z',
        issued_by_name: 'Dr. A. R. Surve',
        custom_signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
      }
    }
  })

  const mockSendEmail = async (params) => {
    sentParams = params
    return { success: true, messageId: '<test-msg-123@wce.ac.in>' }
  }

  const result = await processJob(job, 'test-worker', {
    dbPool: mockDb,
    activityGetter: mockActivityGetter,
    sendEmailFn: mockSendEmail
  })

  assert.equal(result.success, true)
  assert.equal(result.messageId, '<test-msg-123@wce.ac.in>')
  assert.equal(markedSentJobId, 3)

  // Verify email recipient and subject
  assert.equal(sentParams.to, 'sharma@wce.ac.in')
  assert.equal(sentParams.subject, 'Letter of Appreciation – Advanced AI Research Workshop')

  // Verify PDF attachment
  assert.equal(sentParams.attachments.length, 1)
  assert.equal(sentParams.attachments[0].filename, 'Appreciation_Letter.pdf')
  assert.equal(sentParams.attachments[0].contentType, 'application/pdf')
  assert.ok(Buffer.isBuffer(sentParams.attachments[0].content))
  assert.equal(sentParams.attachments[0].content.subarray(0, 5).toString('ascii'), '%PDF-')
})

test('getEffectiveRecipient routes faculty/club to atram.darshan@walchandsangli.ac.in while preserving HOD', () => {
  const { getEffectiveRecipient } = require('../src/services/emailService')

  // Faculty and club emails route to target test address
  assert.equal(getEffectiveRecipient('darshan@wce'), 'atram.darshan@walchandsangli.ac.in')
  assert.equal(getEffectiveRecipient('darshan@gmail.com'), 'atram.darshan@walchandsangli.ac.in')
  assert.equal(getEffectiveRecipient('acm@wce'), 'atram.darshan@walchandsangli.ac.in')
  assert.equal(getEffectiveRecipient('sharma@wce.ac.in'), 'atram.darshan@walchandsangli.ac.in')

  // HOD emails are preserved without routing
  assert.equal(getEffectiveRecipient('hod.cse@wce.ac.in'), 'hod.cse@wce.ac.in')
})



