const test = require('node:test')
const assert = require('node:assert/strict')

const {
  typeMap,
  legacyTypeAliases,
  reviewerRoles,
  editableStatuses,
  workflowTransitions,
  isOrganizerRole,
  normalizeActivityPayload,
  validateActivity,
  safeText
} = require('../src/domain/activity')

const faculty = {
  id: 7,
  name: 'Dr Asha Patil',
  department: 'Computer Science and Engineering',
  role: 'Faculty'
}

const tinyFile = (overrides = {}) => ({
  kind: 'evidence',
  fileName: 'proof.pdf',
  mimeType: 'application/pdf',
  data: Buffer.from('faculty activity proof').toString('base64'),
  ...overrides
})

const webinarBody = (overrides = {}) => ({
  typeName: 'Webinar',
  title: 'Outcome-based education webinar',
  facultyRole: 'Participant / Attendee',
  mode: 'Online',
  academicYear: '2026-27',
  startDate: '2026-08-20',
  scope: 'National',
  hostOrganisation: 'AICTE',
  activityStatus: 'Completed',
  summary: 'A faculty development session on outcome-based education.',
  evidenceAvailability: 'Not issued',
  details: { funded: 'No' },
  ...overrides
})

const normalizeWebinar = (overrides = {}, user = faculty, targetStatus = 'Submitted') => (
  normalizeActivityPayload(webinarBody(overrides), user, targetStatus)
)

const hasError = (errors, text) => errors.some((error) => error.includes(text))

test('catalog keeps similar academic events as distinct activity types', () => {
  assert.ok(typeMap.has('Faculty Development Programme (FDP)'))
  assert.ok(typeMap.has('Workshop'))
  assert.ok(typeMap.has('Seminar'))
  assert.ok(typeMap.has('Webinar'))
  assert.equal(legacyTypeAliases['FDP/Workshop/Seminar/Webinar'], 'Workshop')
})

test('normalization trims values, locks department to the signed-in profile, and sanitizes file names', () => {
  const activity = normalizeWebinar({
    title: '  Inclusive teaching practices  ',
    department: 'Untrusted Department',
    attachments: [tinyFile({
      kind: 'not-a-real-kind',
      fileName: '../unsafe:proof?.pdf',
      caption: '  Attendance evidence  '
    })]
  })

  assert.equal(activity.title, 'Inclusive teaching practices')
  assert.equal(activity.department, faculty.department)
  assert.equal(activity.workflowStatus, 'Submitted')
  assert.equal(activity.attachments.length, 1)
  assert.equal(activity.attachments[0].kind, 'other')
  assert.equal(activity.attachments[0].fileName, 'unsafe_proof_.pdf')
  assert.equal(activity.attachments[0].caption, 'Attendance evidence')
  assert.equal(activity.attachments[0].sizeBytes, Buffer.byteLength('faculty activity proof'))
  assert.match(activity.attachments[0].sha256, /^[a-f0-9]{64}$/)
})

test('normalization preserves a legitimate zero participant count', () => {
  const activity = normalizeWebinar({
    activityStatus: 'Cancelled',
    participantCount: 0
  })

  assert.equal(activity.participantCount, 0)
})

test('safeText handles empty values and enforces field length', () => {
  assert.equal(safeText('   '), null)
  assert.equal(safeText(null), null)
  assert.equal(safeText('  abc  ', 2), 'ab')
})

test('a complete online attendee record passes without venue, attendance count, or certificate', () => {
  const errors = validateActivity(normalizeWebinar())
  assert.deepEqual(errors, [])
})

test('offline and hybrid events require a venue, while online events do not', () => {
  const offlineErrors = validateActivity(normalizeWebinar({ mode: 'Offline' }))
  const hybridErrors = validateActivity(normalizeWebinar({ mode: 'Hybrid' }))
  const onlineErrors = validateActivity(normalizeWebinar({ mode: 'Online' }))

  assert.ok(hasError(offlineErrors, 'Venue is required'))
  assert.ok(hasError(hybridErrors, 'Venue is required'))
  assert.ok(!hasError(onlineErrors, 'Venue is required'))
})

test('participant count is conditional on a completed activity organised by the faculty member', () => {
  const missing = validateActivity(normalizeWebinar({ facultyRole: 'Organizer / Coordinator' }))
  const present = validateActivity(normalizeWebinar({
    facultyRole: 'Organizer / Coordinator',
    participantCount: 42
  }))
  const planned = validateActivity(normalizeWebinar({
    facultyRole: 'Organizer / Coordinator',
    activityStatus: 'Planned'
  }))

  assert.ok(hasError(missing, 'Participant count is required'))
  assert.ok(!hasError(present, 'Participant count is required'))
  assert.ok(!hasError(planned, 'Participant count is required'))
})

test('completed activities accept a legitimate no-certificate case but require promised evidence', () => {
  const notIssued = validateActivity(normalizeWebinar({ evidenceAvailability: 'Not issued' }))
  const promisedWithoutProof = validateActivity(normalizeWebinar({ evidenceAvailability: 'Available now' }))
  const officialLink = validateActivity(normalizeWebinar({
    evidenceAvailability: 'Available now',
    officialUrl: 'https://example.edu/events/obe-webinar'
  }))
  const uploadedProof = validateActivity(normalizeWebinar({
    evidenceAvailability: 'Available now',
    attachments: [tinyFile()]
  }))

  assert.ok(!hasError(notIssued, 'Upload at least one'))
  assert.ok(hasError(promisedWithoutProof, 'Upload at least one'))
  assert.ok(!hasError(officialLink, 'Upload at least one'))
  assert.ok(!hasError(uploadedProof, 'Upload at least one'))
})

test('guest details are required only when organising a guest lecture', () => {
  const common = {
    typeName: 'Guest Lecture',
    title: 'Industry expert interaction',
    mode: 'Offline',
    venue: 'Seminar Hall',
    academicYear: '2026-27',
    startDate: '2026-08-20',
    scope: 'Institute / Local',
    hostOrganisation: 'WCE Sangli',
    participantCount: 75,
    activityStatus: 'Completed',
    summary: 'An expert interaction for students and faculty.',
    evidenceAvailability: 'Not issued'
  }

  const speaker = validateActivity(normalizeActivityPayload({
    ...common,
    facultyRole: 'Speaker / Resource Person'
  }, faculty))
  const organiserMissingGuest = validateActivity(normalizeActivityPayload({
    ...common,
    facultyRole: 'Organizer / Coordinator'
  }, faculty))
  const organiserWithGuest = validateActivity(normalizeActivityPayload({
    ...common,
    facultyRole: 'Organizer / Coordinator',
    guests: [{ name: 'Ms Kavya Shah', organisation: 'Tata Technologies' }]
  }, faculty))

  assert.ok(!hasError(speaker, 'Add at least one guest'))
  assert.ok(hasError(organiserMissingGuest, 'Add at least one guest'))
  assert.ok(!hasError(organiserWithGuest, 'Add at least one guest'))
})

test('type-specific required fields and conditional funding details are enforced', () => {
  const industrialVisit = normalizeActivityPayload({
    typeName: 'Industrial Visit',
    title: 'Automotive manufacturing visit',
    facultyRole: 'Faculty Accompanying',
    mode: 'Offline',
    venue: 'Pune',
    academicYear: '2026-27',
    startDate: '2026-08-20',
    scope: 'State',
    hostOrganisation: 'Example Motors',
    activityStatus: 'Completed',
    summary: 'Industry exposure visit.',
    evidenceAvailability: 'Not issued',
    details: {}
  }, faculty)
  const fundedWebinar = normalizeWebinar({
    details: { funded: 'Yes', fundingAmount: '-10' }
  })

  const visitErrors = validateActivity(industrialVisit)
  const fundingErrors = validateActivity(fundedWebinar)

  assert.ok(hasError(visitErrors, 'Company / organisation visited is required'))
  assert.ok(hasError(visitErrors, 'Student programme and year is required'))
  assert.ok(hasError(visitErrors, 'Academic relevance / learning objective is required'))
  assert.ok(hasError(fundingErrors, 'Funding agency is required'))
  assert.ok(hasError(fundingErrors, 'valid funded amount'))
})

test('server-side validation rejects a faculty role that is not offered for the selected type', () => {
  const errors = validateActivity(normalizeWebinar({ facultyRole: 'Patent Inventor' }))
  assert.ok(hasError(errors, 'valid faculty role'))
})

test('server-side validation rejects unsupported values for configured select fields', () => {
  const publication = normalizeActivityPayload({
    typeName: 'Research Publication',
    title: 'A peer-reviewed paper',
    facultyRole: 'Author / Co-author',
    academicYear: '2026-27',
    startDate: '2026-08-20',
    scope: 'International',
    hostOrganisation: 'International Journal of Engineering Education',
    activityStatus: 'Completed',
    summary: 'Research on engineering pedagogy.',
    evidenceAvailability: 'Not issued',
    details: {
      publicationType: 'Unrecognised category',
      authors: 'Asha Patil, Ravi Kulkarni',
      publicationDate: '2026-08-20'
    }
  }, faculty)

  assert.ok(hasError(validateActivity(publication), 'valid Publication type'))
})

test('calendar-invalid dates are rejected instead of being silently rolled over', () => {
  const errors = validateActivity(normalizeWebinar({ startDate: '2026-02-31' }))
  assert.ok(hasError(errors, 'valid start date'))
})

test('drafts may be incomplete while still enforcing type and attachment safety', () => {
  const draft = normalizeActivityPayload({ typeName: 'Webinar' }, faculty, 'Draft')
  assert.deepEqual(validateActivity(draft, { draft: true }), [])

  const unknownType = normalizeActivityPayload({ typeName: 'Unknown' }, faculty, 'Draft')
  assert.ok(hasError(validateActivity(unknownType, { draft: true }), 'valid activity type'))
})

test('attachment validation rejects empty, unsupported, wrongly classified, oversized, and excessive images', () => {
  const oversized = Buffer.alloc((10 * 1024 * 1024) + 1, 1).toString('base64')
  const imageFiles = Array.from({ length: 9 }, (_, index) => tinyFile({
    kind: 'image',
    fileName: `event-${index + 1}.png`,
    mimeType: 'image/png'
  }))
  const files = [
    tinyFile({ fileName: 'empty.pdf', data: '' }),
    tinyFile({ fileName: 'script.html', mimeType: 'text/html' }),
    tinyFile({ kind: 'image', fileName: 'fake-image.pdf' }),
    tinyFile({ fileName: 'too-large.pdf', data: oversized }),
    ...imageFiles
  ]

  const errors = validateActivity(normalizeWebinar({ attachments: files }))
  assert.ok(hasError(errors, 'empty.pdf is empty or invalid'))
  assert.ok(hasError(errors, 'script.html has an unsupported file type'))
  assert.ok(hasError(errors, 'fake-image.pdf is marked as an image'))
  assert.ok(hasError(errors, 'too-large.pdf exceeds the 10 MB'))
  assert.ok(hasError(errors, 'maximum of 8 activity images'))
})

test('combined attachment size is limited to 35 MB', () => {
  const nineMegabytes = Buffer.alloc(9 * 1024 * 1024, 2).toString('base64')
  const attachments = Array.from({ length: 4 }, (_, index) => tinyFile({
    fileName: `large-${index + 1}.pdf`,
    data: nineMegabytes
  }))

  const errors = validateActivity(normalizeWebinar({ attachments }))
  assert.ok(hasError(errors, 'Combined attachments must not exceed 35 MB'))
})

test('more than 15 attachments are rejected rather than silently discarded', () => {
  const attachments = Array.from({ length: 16 }, (_, index) => tinyFile({
    fileName: `proof-${index + 1}.pdf`
  }))
  const errors = validateActivity(normalizeWebinar({ attachments }))

  assert.ok(hasError(errors, 'maximum of 15 attachments'))
})

test('workflow helpers encode reviewer access, editability, and legal transitions', () => {
  assert.deepEqual([...reviewerRoles].sort(), ['Admin', 'HOD'])
  assert.ok(editableStatuses.has('Draft'))
  assert.ok(editableStatuses.has('Changes Requested'))
  assert.ok(!editableStatuses.has('Approved'))
  assert.deepEqual(workflowTransitions.Draft, ['Submitted'])
  assert.deepEqual(workflowTransitions.Submitted, ['Draft', 'Changes Requested', 'Approved'])
  assert.deepEqual(workflowTransitions.Approved, ['Archived'])
  assert.deepEqual(workflowTransitions.Archived, [])
  assert.ok(isOrganizerRole('Organizer / Coordinator'))
  assert.ok(isOrganizerRole('Convenor'))
  assert.ok(!isOrganizerRole('Participant / Attendee'))
})
