const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildReportMetadata,
  generateCsv,
  generatePdf,
  generateDocx,
  generateActivitySummaryPdf
} = require('../src/services/reportService')

const faculty = {
  id: 7,
  name: 'Dr Asha Patil',
  department: 'Computer Science and Engineering',
  role: 'Faculty'
}

const approvedRecord = {
  act_id: 101,
  staff_name: 'Dr Asha Patil',
  department: 'Computer Science and Engineering',
  acad_year: '2025-26',
  start_date: '2025-07-01',
  end_date: '2025-07-03',
  type_name: 'Faculty Development Programme (FDP)',
  title: 'AI-assisted teaching and assessment',
  faculty_role: 'Participant / Attendee',
  mode: 'Online',
  scope: 'National',
  host_organisation: 'AICTE',
  venue: null,
  activity_status: 'Completed',
  workflow_status: 'Approved',
  participant_count: null,
  summary: 'Three-day programme on responsible AI use in teaching.',
  outcomes: 'Designed a new assessment rubric.',
  official_url: 'https://example.edu/fdp/ai-teaching',
  evidence_availability: 'Available now',
  attachments: [{ id: 1, kind: 'evidence', fileName: 'certificate.pdf' }],
  details: { funded: 'No', certificateNumber: 'FDP-101' }
}

const submittedRecord = {
  ...approvedRecord,
  act_id: 102,
  start_date: '2025-09-12',
  end_date: null,
  type_name: 'Guest Lecture',
  title: 'Industry pathways in cloud engineering',
  faculty_role: 'Organizer / Coordinator',
  mode: 'Offline',
  scope: 'Institute / Local',
  host_organisation: 'WCE Sangli',
  venue: 'Tilak Hall',
  workflow_status: 'Submitted',
  participant_count: 88,
  official_url: null,
  evidence_availability: 'Not issued',
  attachments: [],
  details: {}
}

test('report metadata labels faculty and department coverage clearly', () => {
  const facultyMetadata = buildReportMetadata(faculty, { academicYear: '2025-26' }, [approvedRecord])
  const hodMetadata = buildReportMetadata(
    { ...faculty, role: 'HOD' },
    { from: '2025-07-01', to: '2026-06-30' },
    [approvedRecord]
  )
  const adminMetadata = buildReportMetadata(
    { ...faculty, role: 'Admin' },
    { department: 'Mechanical Engineering' },
    [approvedRecord, submittedRecord]
  )

  assert.equal(facultyMetadata.coverageLabel, 'Faculty Name')
  assert.equal(facultyMetadata.coverageValue, faculty.name)
  assert.equal(facultyMetadata.period, 'Academic Year 2025-26')
  assert.equal(facultyMetadata.includesPending, false)
  assert.equal(hodMetadata.coverageLabel, 'Department')
  assert.equal(hodMetadata.coverageValue, `${faculty.department} Department`)
  assert.equal(hodMetadata.period, '01/07/2025 to 30/06/2026')
  assert.equal(adminMetadata.coverageLabel, 'Department')
  assert.equal(adminMetadata.coverageValue, 'Mechanical Engineering')
  assert.equal(adminMetadata.period, 'Combined years')
  assert.equal(adminMetadata.includesPending, true)
})

test('metadata records active report filters', () => {
  const metadata = buildReportMetadata(faculty, {
    type: 'Webinar',
    role: 'Speaker / Resource Person',
    scope: 'International',
    status: 'Approved'
  }, [approvedRecord])

  assert.deepEqual(metadata.filters, [
    'Type: Webinar',
    'Role: Speaker / Resource Person',
    'Level: International',
    'Workflow: Approved'
  ])
})

test('CSV export has a BOM, stable headings, attachment counts, details, and caller-provided chronology', () => {
  const records = [approvedRecord, submittedRecord]
  const metadata = buildReportMetadata(faculty, { academicYear: '2025-26' }, records)
  metadata.generatedAt = new Date('2026-08-20T06:00:00.000Z')

  const csv = generateCsv(records, metadata)

  assert.equal(typeof csv, 'string')
  assert.ok(csv.startsWith('\uFEFF'))
  assert.match(csv, /(?:^|\n)Sr\. No\.,Faculty Name,Department,/)
  assert.match(csv, /Evidence Availability,Attachment Count,Additional Details/)
  assert.match(csv, /Certificate Number: FDP-101/)
  assert.match(csv, /Faculty Name: Dr Asha Patil/)
  assert.ok(!csv.includes('Scope:'))
  assert.ok(csv.indexOf(approvedRecord.title) < csv.indexOf(submittedRecord.title))
  assert.match(csv, /01\/07\/2025 – 03\/07\/2025/)
  assert.ok(!csv.includes('â'))
})

test('CSV export neutralizes spreadsheet formulas in faculty-entered text', () => {
  const dangerousRecord = {
    ...approvedRecord,
    title: '=HYPERLINK("https://malicious.example","Open")',
    summary: '+cmd|\' /C calc\'!A0'
  }
  const metadata = buildReportMetadata(faculty, {}, [dangerousRecord])
  const csv = generateCsv([dangerousRecord], metadata)

  assert.ok(csv.includes("'=HYPERLINK"))
  assert.ok(csv.includes("'+cmd"))
})

test('PDF export returns a complete PDF buffer for populated and empty reports', async () => {
  const metadata = buildReportMetadata(faculty, { academicYear: '2025-26' }, [approvedRecord, submittedRecord])
  metadata.generatedAt = new Date('2026-08-20T06:00:00.000Z')

  const populated = await generatePdf([approvedRecord, submittedRecord], metadata)
  const emptyMetadata = buildReportMetadata(faculty, {}, [])
  const empty = await generatePdf([], emptyMetadata)

  for (const buffer of [populated, empty]) {
    assert.ok(Buffer.isBuffer(buffer))
    assert.equal(buffer.subarray(0, 5).toString('ascii'), '%PDF-')
    assert.match(buffer.subarray(-32).toString('ascii'), /%%EOF/)
    assert.ok(buffer.length > 1000)
  }
  assert.ok(populated.length > empty.length)
})

test('DOCX export returns a valid ZIP-based Office document buffer for populated and empty reports', async () => {
  const metadata = buildReportMetadata(faculty, { academicYear: '2025-26' }, [approvedRecord, submittedRecord])
  metadata.generatedAt = new Date('2026-08-20T06:00:00.000Z')

  const populated = await generateDocx([approvedRecord, submittedRecord], metadata)
  const emptyMetadata = buildReportMetadata(faculty, {}, [])
  const empty = await generateDocx([], emptyMetadata)

  for (const buffer of [populated, empty]) {
    assert.ok(Buffer.isBuffer(buffer))
    assert.equal(buffer.subarray(0, 4).toString('binary'), 'PK\u0003\u0004')
    assert.ok(buffer.lastIndexOf(Buffer.from('PK\u0005\u0006', 'binary')) > 0)
    assert.ok(buffer.length > 3000)
  }
  assert.ok(populated.length > empty.length)
})

test('individual activity summary returns a complete PDF for faculty and HOD download', async () => {
  const activity = {
    ...approvedRecord,
    staff_designation: 'Assistant Professor',
    reviewer_name: 'Dr Reviewer',
    reviewed_at: '2026-08-20T06:00:00.000Z',
    review_comment: 'Evidence verified.',
    details: { duration: 3, fees_funded: true, legacyOriginalType: 'Old category' }
  }
  const buffer = await generateActivitySummaryPdf(activity, { name: 'Dr Reviewer', role: 'HOD' })

  assert.ok(Buffer.isBuffer(buffer))
  assert.equal(buffer.subarray(0, 5).toString('ascii'), '%PDF-')
  assert.match(buffer.subarray(-32).toString('ascii'), /%%EOF/)
  assert.ok(buffer.length > 2000)
})
