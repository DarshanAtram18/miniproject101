const path = require('path')
const crypto = require('crypto')
const catalog = require('../../shared/activity-catalog.json')

const baseDefinitions = catalog.typeGroups
  .flatMap((group) => group.types.map((type) => ({ ...type, group: group.label })))

const fallbackLegacyTypes = [
  { name: 'Faculty Development Programme (FDP)', eventBased: true, supportsAttendance: true, supportsFunding: true, defaultRole: 'Participant / Attendee', roles: ['Participant / Attendee', 'Organizer / Coordinator', 'Convenor', 'Speaker / Resource Person'] },
  { name: 'Workshop', eventBased: true, supportsAttendance: true, supportsFunding: true, defaultRole: 'Participant / Attendee', roles: ['Participant / Attendee', 'Organizer / Coordinator', 'Convenor', 'Speaker / Resource Person'] },
  { name: 'Seminar', eventBased: true, supportsAttendance: true, supportsFunding: true, defaultRole: 'Participant / Attendee', roles: ['Participant / Attendee', 'Organizer / Coordinator', 'Convenor', 'Speaker / Resource Person', 'Session Chair / Judge'] },
  { name: 'Webinar', eventBased: true, supportsAttendance: true, supportsFunding: true, defaultRole: 'Participant / Attendee', roles: ['Participant / Attendee', 'Organizer / Coordinator', 'Convenor', 'Speaker / Resource Person', 'Session Chair / Judge'] },
  { name: 'Conference', eventBased: true, supportsAttendance: true, supportsFunding: true, defaultRole: 'Participant / Attendee', roles: ['Participant / Attendee', 'Organizer / Coordinator', 'Convenor', 'Speaker / Resource Person', 'Session Chair / Judge'] },
  { name: 'Training / Certification', eventBased: true, supportsAttendance: false, supportsFunding: true, defaultRole: 'Participant / Attendee', roles: ['Participant / Attendee', 'Organizer / Coordinator', 'Trainer / Resource Person'] },
  { name: 'Guest Lecture', eventBased: true, supportsAttendance: true, supportsFunding: false, supportsGuests: true, defaultRole: 'Organizer / Coordinator', roles: ['Organizer / Coordinator', 'Speaker / Resource Person', 'Session Chair / Judge'] }
]

const typeDefinitions = [...baseDefinitions, ...fallbackLegacyTypes]
const typeMap = new Map(typeDefinitions.map((type) => [type.name, type]))

const legacyTypeAliases = {
  'Value Added Course': 'Value-Added Course',
  'FDP/Workshop/Seminar/Webinar': 'Workshop',
  'FTP/ Seminar / Webinar': 'FDP / Workshop / Seminar / Webinar (Attended)',
  'Guest Invitation/Expert Session': 'Guest Lecture',
  'Guest lecture Delivered': 'Guest Lecture Delivered',
  'Guest lec organized': 'Guest Lecture Organized',
  'Industrial visit': 'Industrial Visit',
  'Faculty Achievements': 'Faculty Achievement / Award',
  'Faculty Achievements / Awards': 'Faculty Achievement / Award',
  'MOU': 'Partnership / MoU',
  'Grant Received': 'Research Project / Grant',
  'Research Published': 'Research Publication',
  'Book Chapter Published': 'Book / Book Chapter',
  'E-Learning Material': 'E-Learning / OER',
  'Consultancy Corporate Activity': 'Consultancy / Corporate Training',
  Recognition: 'Faculty Achievement / Award',
  'CEP Program': 'Student Development / CEP',
  'Misc/Other': 'Other'
}

const reviewerRoles = new Set(['HOD', 'Admin'])
const editableStatuses = new Set(['Draft', 'Submitted', 'Changes Requested'])
const workflowTransitions = {
  Draft: ['Submitted'],
  Submitted: ['Draft', 'Changes Requested', 'Approved'],
  'Changes Requested': ['Submitted', 'Draft'],
  Approved: ['Archived'],
  Archived: []
}

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain'
])

const allowedAttachmentKinds = new Set([
  'image',
  'evidence',
  'attendance',
  'report',
  'invitation',
  'approval-letter',
  'other'
])

const safeText = (value, maxLength = 1000) => {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text ? text.slice(0, maxLength) : null
}

const safeInteger = (value) => {
  if (value === '' || value === undefined || value === null) return null
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : null
}

const safeNumber = (value) => {
  if (value === '' || value === undefined || value === null) return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

const safeObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 80)
      .map(([key, item]) => [safeText(key, 80), typeof item === 'string' ? safeText(item, 5000) : item])
      .filter(([key]) => Boolean(key))
  )
}

const isDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

const isHttpUrl = (value) => {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const isOrganizerRole = (role) => [
  'Organizer / Coordinator',
  'Convenor',
  'Course Coordinator',
  'Project Coordinator',
  'MoU Coordinator'
].includes(role)

function normalizeAttachments(files = []) {
  if (!Array.isArray(files)) return []

  return files.map((file, index) => {
    const kind = allowedAttachmentKinds.has(file?.kind) ? file.kind : 'other'
    const fileName = path.basename(safeText(file?.fileName, 255) || `attachment-${index + 1}`)
      .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    const mimeType = safeText(file?.mimeType, 150) || 'application/octet-stream'
    const data = safeText(file?.data, 15_000_000)
    const buffer = data ? Buffer.from(data, 'base64') : Buffer.alloc(0)

    return {
      kind,
      fileName,
      mimeType,
      sizeBytes: buffer.length,
      data: buffer,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      caption: safeText(file?.caption, 500),
      sortOrder: Number.isInteger(file?.sortOrder) ? file.sortOrder : index
    }
  })
}

function validateAttachments(files) {
  const errors = []
  const totalBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0)

  if (files.length > 15) errors.push('A maximum of 15 attachments is allowed per activity.')
  if (totalBytes > 35 * 1024 * 1024) errors.push('Combined attachments must not exceed 35 MB.')

  const imageCount = files.filter((file) => file.kind === 'image').length
  if (imageCount > 8) errors.push('A maximum of 8 activity images is allowed.')

  for (const file of files) {
    if (!file.data.length) errors.push(`${file.fileName} is empty or invalid.`)
    if (file.sizeBytes > 10 * 1024 * 1024) errors.push(`${file.fileName} exceeds the 10 MB file limit.`)
    if (!allowedMimeTypes.has(file.mimeType)) errors.push(`${file.fileName} has an unsupported file type.`)
    if (file.kind === 'image' && !file.mimeType.startsWith('image/')) {
      errors.push(`${file.fileName} is marked as an image but is not an accepted image type.`)
    }
  }

  return errors
}

function normalizeGuests(guests = []) {
  if (!Array.isArray(guests)) return []
  return guests.map((guest) => ({
    name: safeText(guest?.name, 255),
    designation: safeText(guest?.designation, 255),
    organisation: safeText(guest?.organisation, 500),
    country: safeText(guest?.country, 120),
    guestRole: safeText(guest?.guestRole, 120),
    guestType: safeText(guest?.guestType, 30) || 'External',
    email: safeText(guest?.email, 255),
    phone: safeText(guest?.phone, 50)
  }))
}

function normalizeActivityPayload(body, user, targetStatus = 'Submitted') {
  const rawTypeName = safeText(body.typeName || body.type_name, 100)
  const typeName = legacyTypeAliases[rawTypeName] || rawTypeName
  const type = typeMap.get(typeName)
  const details = safeObject(body.details)
  const attachments = normalizeAttachments(body.attachments)
  const guests = normalizeGuests(body.guests)

  const explicitRole = safeText(body.facultyRole || body.faculty_role || body.role, 255)
  const facultyRole = explicitRole || type?.defaultRole || (type?.roles && type.roles.length > 0 ? type.roles[0] : 'Participant / Attendee')

  return {
    typeName,
    type,
    title: safeText(body.title, 500),
    department: safeText(user.department, 255),
    facultyRole,
    mode: type?.eventBased ? safeText(body.mode, 20) : null,
    academicYear: safeText(body.academicYear || body.acad_year, 9),
    startDate: safeText(body.startDate || body.start_date, 10),
    endDate: safeText(body.endDate || body.end_date, 10),
    startTime: safeText(body.startTime || body.start_time, 8),
    endTime: safeText(body.endTime || body.end_time, 8),
    scope: safeText(body.scope, 50),
    hostOrganisation: safeText(body.hostOrganisation || body.host_organisation, 500),
    venue: safeText(body.venue, 500),
    activityStatus: safeText(body.activityStatus || body.activity_status, 30) || 'Completed',
    participantCount: safeInteger(body.participantCount ?? body.participant_count),
    summary: safeText(body.summary, 5000),
    outcomes: safeText(body.outcomes, 5000),
    evidenceAvailability: safeText(body.evidenceAvailability || body.evidence_availability, 30),
    evidenceNote: safeText(body.evidenceNote || body.evidence_note, 2000),
    officialUrl: safeText(body.officialUrl || body.official_url, 1000),
    details,
    guests,
    attachments,
    workflowStatus: targetStatus,
    confirmDuplicate: body.confirmDuplicate === true
  }
}

function validateActivity(activity, { draft = false, existingAttachmentCount = 0 } = {}) {
  const errors = validateAttachments(activity.attachments)

  if (!activity.type) errors.push('Select a valid activity type.')
  if (draft) return errors

  if (!activity.title || activity.title.length < 3) errors.push('Activity title is required.')
  if (!activity.department) errors.push('Your faculty profile must have a department before submission.')
  if (!activity.facultyRole) errors.push('Faculty involvement / role is required.')
  if (activity.facultyRole && !activity.type?.roles?.includes(activity.facultyRole)) {
    errors.push('Select a valid faculty role for this activity type.')
  }
  if (!activity.academicYear || !/^\d{4}-\d{2}$/.test(activity.academicYear)) errors.push('Select a valid academic year.')
  if (!isDate(activity.startDate)) errors.push('A valid start date is required.')
  if (activity.endDate && !isDate(activity.endDate)) errors.push('End date is invalid.')
  if (activity.startDate && activity.endDate && activity.endDate < activity.startDate) {
    errors.push('End date cannot be before the start date.')
  }
  if (!catalog.activityStatuses.includes(activity.activityStatus)) errors.push('Select a valid activity status.')
  if (activity.type?.eventBased && !catalog.modes.includes(activity.mode)) errors.push('Mode is required for this activity type.')
  if (activity.type?.requiresScope && !catalog.scopes.includes(activity.scope)) errors.push('Scope / level is required for this activity type.')
  if (activity.type?.requiresHost && !activity.hostOrganisation) errors.push('Host / organising institution is required.')
  if (activity.mode && ['Offline', 'Hybrid'].includes(activity.mode) && activity.type?.eventBased && !activity.venue) {
    errors.push('Venue is required for offline or hybrid activities.')
  }
  if (!activity.summary) errors.push('Add a short description of the activity.')
  if (activity.officialUrl && !isHttpUrl(activity.officialUrl)) errors.push('Official URL must begin with http:// or https://.')
  if (activity.participantCount === null && activity.type?.supportsAttendance && isOrganizerRole(activity.facultyRole) && activity.activityStatus === 'Completed') {
    errors.push('Participant count is required for a completed activity you organised.')
  }

  for (const field of activity.type?.fields || []) {
    const value = activity.details[field.name]
    if (field.required && (value === undefined || value === null || String(value).trim() === '')) {
      errors.push(`${field.label} is required.`)
    }
    if (field.type === 'url' && value && !isHttpUrl(value)) errors.push(`${field.label} must be a valid web address.`)
    if (field.type === 'select' && value && !field.options?.includes(value)) {
      errors.push(`Select a valid ${field.label}.`)
    }
    if (field.type === 'number' && value !== undefined && value !== '' && safeNumber(value) === null) {
      errors.push(`${field.label} must be a positive number.`)
    }
  }

  if (activity.type?.supportsFunding) {
    if (!['Yes', 'No'].includes(activity.details.funded)) {
      errors.push('Select whether funding or fee support was involved.')
    }
    if (activity.details.funded === 'Yes') {
      if (!safeText(activity.details.fundingAgency, 500)) errors.push('Funding agency is required when funding was involved.')
      if (safeNumber(activity.details.fundingAmount) === null) errors.push('Enter a valid funded amount.')
    }
  }

  if (activity.type?.supportsGuests && isOrganizerRole(activity.facultyRole)) {
    if (activity.guests.length > 20) errors.push('A maximum of 20 guests / resource persons is allowed.')
    if (!activity.guests.length) errors.push('Add at least one guest / resource person for an organised guest lecture.')
    activity.guests.forEach((guest, index) => {
      if (!guest.name) errors.push(`Guest ${index + 1}: name is required.`)
      if (!guest.organisation) errors.push(`Guest ${index + 1}: organisation is required.`)
    })
  }

  if (activity.activityStatus === 'Completed') {
    if (!catalog.evidenceAvailability.includes(activity.evidenceAvailability)) {
      errors.push('Select the evidence availability for this completed activity.')
    }
    if (activity.evidenceAvailability === 'Available now'
      && activity.attachments.length + existingAttachmentCount === 0
      && !activity.officialUrl) {
      errors.push('Upload at least one acceptable proof or add an official URL.')
    }
  }

  return [...new Set(errors)]
}

module.exports = {
  catalog,
  typeDefinitions,
  typeMap,
  legacyTypeAliases,
  reviewerRoles,
  editableStatuses,
  workflowTransitions,
  isOrganizerRole,
  normalizeActivityPayload,
  validateActivity,
  safeText
}
