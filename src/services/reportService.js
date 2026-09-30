const PDFDocument = require('pdfkit')
const { stringify } = require('csv-stringify/sync')
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const pool = require('../db/pool')

const BRAND_NAVY = '1A365D'
const BRAND_GOLD = 'B7791F'

// Fetch the HOD's uploaded signature image for a given department.
// Returns the base64 data-URI string or null if none uploaded.
async function fetchHodSignature(department) {
  try {
    const result = await pool.query(
      `SELECT signature_image FROM users
       WHERE role = 'HOD' AND LOWER(department) = LOWER($1)
         AND is_active = TRUE AND signature_image IS NOT NULL
       ORDER BY updated_at DESC LIMIT 1`,
      [department || '']
    )
    return result.rows[0]?.signature_image || null
  } catch {
    return null
  }
}

const humanize = (value = '') => value
  .replace(/([A-Z])/g, ' $1')
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (char) => char.toUpperCase())
  .trim()

const formatDate = (dateValue) => {
  if (!dateValue) return '—'
  const date = new Date(`${String(dateValue).split('T')[0]}T00:00:00`)
  if (Number.isNaN(date.getTime())) return String(dateValue)
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const formatDateRange = (record) => {
  const start = formatDate(record.start_date)
  const end = record.end_date && record.end_date !== record.start_date
    ? formatDate(record.end_date)
    : ''
  if (!end) return start
  return `${start} – ${end}`
}

const displayValue = (value) => {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const buildReportMetadata = (user, query, records) => {
  const includesPending = records.some((record) => record.workflow_status !== 'Approved')
  const coverageLabel = user.role === 'Club' ? 'Club / Chapter' : (user.role === 'Faculty' ? 'Faculty Name' : 'Department')
  const coverageValue = user.role === 'Club'
    ? user.name
    : user.role === 'Faculty'
      ? user.name
      : user.role === 'HOD'
        ? `${user.department} Department`
        : query.department || 'All departments'

  const period = query.periodLabel
    ? query.periodLabel
    : query.academicYears
      ? `Combined Academic Years (${query.academicYears.split(',').length} Years)`
      : query.academicYear
        ? `Academic Year ${query.academicYear}`
        : query.from || query.to
          ? `${query.from ? formatDate(query.from) : 'Beginning'} to ${query.to ? formatDate(query.to) : 'Present'}`
          : 'Combined years'

  return {
    title: 'Faculty Activity Summary Report',
    coverageLabel,
    coverageValue,
    period,
    generatedAt: new Date(),
    generatedBy: user.name,
    includesPending,
    filters: [
      query.type && `Type: ${query.type}`,
      query.role && `Role: ${query.role}`,
      query.scope && `Level: ${query.scope}`,
      query.status && `Workflow: ${query.status}`
    ].filter(Boolean)
  }
}

function summarize(records) {
  const byType = new Map()
  const byStatus = new Map()
  for (const record of records) {
    byType.set(record.type_name, (byType.get(record.type_name) || 0) + 1)
    byStatus.set(record.workflow_status, (byStatus.get(record.workflow_status) || 0) + 1)
  }
  return {
    byType: [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    byStatus: [...byStatus.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }
}

function generateCsv(records, metadata) {
  const rows = records.map((record, index) => ({
    'Sr. No.': index + 1,
    'Faculty Name': record.staff_name,
    Department: record.department,
    'Academic Year': record.acad_year,
    Date: formatDateRange(record),
    'Event Timing': record.start_time && record.end_time
      ? `${String(record.start_time).slice(0, 5)} to ${String(record.end_time).slice(0, 5)}`
      : (record.start_time ? String(record.start_time).slice(0, 5) : (record.end_time ? String(record.end_time).slice(0, 5) : (record.event_time || ''))),
    'Activity Type': record.type_name,
    Title: record.title,
    'Faculty Role': record.faculty_role,
    Mode: record.mode,
    'Scope / Level': record.scope,
    'Host / Organiser': record.host_organisation,
    Venue: record.venue,
    'Activity Status': record.activity_status,
    'Review Status': record.workflow_status,
    Participants: record.participant_count,
    Summary: record.summary,
    Outcomes: record.outcomes,
    'Official URL': record.official_url,
    'Evidence Availability': record.evidence_availability,
    'Attachment Count': record.attachments?.length || 0,
    'Additional Details': Object.entries(record.details || {})
      .map(([key, value]) => `${humanize(key)}: ${displayValue(value)}`)
      .join('; ')
  }))

  const heading = [
    [metadata.title],
    [`${metadata.coverageLabel}: ${metadata.coverageValue}`],
    [`Period: ${metadata.period}`],
    [`Generated: ${metadata.generatedAt.toLocaleString('en-IN')}`],
    []
  ]
  return `\uFEFF${stringify(heading, { quoted: true, escape_formulas: true })}${stringify(rows, { header: true, escape_formulas: true })}`
}

// ─────────────────────────────────────────────────────────────
// MULTI-EVENT COMBINED / ANNUAL PDF REPORT GENERATOR
// ─────────────────────────────────────────────────────────────
function generatePdf(records, metadata) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: metadata.title, Author: 'WCE Prof-Insights' } })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const drawHeader = () => {
      const logoCandidates = [
        path.resolve(__dirname, '../../client/public/wce-logo.png'),
        path.resolve(__dirname, '../../client/src/assets/wce-logo.png')
      ]
      const foundLogo = logoCandidates.find((p) => fs.existsSync(p))
      if (foundLogo) {
        try {
          doc.image(foundLogo, 48, 42, { width: 42, height: 42 })
          doc.fillColor(`#${BRAND_NAVY}`).font('Helvetica-Bold').fontSize(11).text('WALCHAND COLLEGE OF ENGINEERING, SANGLI', 98, 44)
          doc.fillColor('#64748B').font('Helvetica').fontSize(8.5).text('Faculty Activities & Contribution Portal · Academic Repository', 98, 59)
          doc.y = 96
        } catch {
          doc.fillColor(`#${BRAND_NAVY}`).font('Helvetica-Bold').fontSize(11).text('WALCHAND COLLEGE OF ENGINEERING, SANGLI')
          doc.fillColor('#64748B').font('Helvetica').fontSize(8.5).text('Faculty Activities & Contribution Portal · Academic Repository')
          doc.moveDown(0.6)
        }
      } else {
        doc.fillColor(`#${BRAND_NAVY}`).font('Helvetica-Bold').fontSize(11).text('WALCHAND COLLEGE OF ENGINEERING, SANGLI')
        doc.fillColor('#64748B').font('Helvetica').fontSize(8.5).text('Faculty Activities & Contribution Portal · Academic Repository')
        doc.moveDown(0.6)
      }
      doc.strokeColor(`#${BRAND_GOLD}`).lineWidth(2).moveTo(48, doc.y).lineTo(547, doc.y).stroke()
      doc.moveDown(0.8)
    }

    drawHeader()

    doc.fillColor(`#${BRAND_NAVY}`).font('Helvetica-Bold').fontSize(20).text(metadata.title)
    doc.moveDown(0.2)
    doc.fillColor('#334155').font('Helvetica').fontSize(10)
      .text(`${metadata.coverageLabel}: ${metadata.coverageValue}   |   Period: ${metadata.period}`)
      .text(`Generated by ${metadata.generatedBy} on ${metadata.generatedAt.toLocaleString('en-IN')}`)
    if (metadata.filters.length) doc.text(`Applied Filters: ${metadata.filters.join(' · ')}`)
    if (metadata.includesPending) {
      doc.moveDown(0.4).fillColor('#9A3412').font('Helvetica-Bold').fontSize(9)
        .text('DRAFT REPORT — contains records currently awaiting approval.')
    }

    // Summary Box
    const summary = summarize(records)
    doc.moveDown(1)
    doc.fillColor(`#${BRAND_NAVY}`).font('Helvetica-Bold').fontSize(12).text('Summary')
    doc.moveDown(0.3)
    doc.fillColor('#1E293B').font('Helvetica').fontSize(9.5)
      .text(`Total Activities: ${records.length}`)
      .text(`By Review Status: ${summary.byStatus.map(([status, count]) => `${status} (${count})`).join('  ·  ') || 'None'}`)
      .text(`By Category: ${summary.byType.map(([type, count]) => `${type} (${count})`).join('  ·  ') || 'None'}`)

    doc.moveDown(1.2)
    doc.fillColor(`#${BRAND_NAVY}`).font('Helvetica-Bold').fontSize(13).text('Chronological Activity Register')

    if (!records.length) {
      doc.moveDown(0.8).fillColor('#64748B').font('Helvetica-Oblique').fontSize(10).text('No records match the selected report filters.')
    }

    records.forEach((record, index) => {
      // Check space for card
      if (doc.y > 700) {
        doc.addPage()
      }

      doc.moveDown(0.8)
      doc.fillColor(`#${BRAND_GOLD}`).font('Helvetica-Bold').fontSize(9.5)
        .text(`${index + 1}. ${formatDateRange(record)} · ${record.type_name}`)
      const timingText = record.start_time && record.end_time
        ? `Timing: ${String(record.start_time).slice(0, 5)} to ${String(record.end_time).slice(0, 5)}`
        : (record.start_time ? `Timing: ${String(record.start_time).slice(0, 5)}` : (record.end_time ? `Timing: ${String(record.end_time).slice(0, 5)}` : (record.event_time ? `Timing: ${record.event_time}` : null)))
      doc.fillColor('#334155').font('Helvetica').fontSize(9)
        .text([
          record.staff_name,
          record.faculty_role,
          record.mode,
          timingText,
          record.scope ? `Scope: ${record.scope}` : null,
          `Status: ${record.workflow_status}`
        ].filter(Boolean).join(' · '))
      
      if (record.host_organisation && record.host_organisation.toLowerCase() !== 'no' && record.host_organisation.toLowerCase() !== 'none') {
        doc.text(`Host / Organiser: ${record.host_organisation}${record.venue ? ` · Venue: ${record.venue}` : ''}`)
      } else if (record.venue) {
        doc.text(`Venue: ${record.venue}`)
      }

      if (record.summary) {
        doc.text(`Summary: ${record.summary}`, { width: 499 })
      }
      if (record.outcomes) {
        doc.text(`Outcomes: ${record.outcomes}`, { width: 499 })
      }

      const imgCount = (record.attachments || []).filter(a => a.kind === 'image' || a.mimeType?.startsWith('image/')).length
      const docCount = (record.attachments || []).filter(a => a.kind !== 'image' && !a.mimeType?.startsWith('image/')).length
      const attSummary = imgCount > 0 && docCount > 0
        ? `${docCount} document(s), ${imgCount} photo(s)`
        : imgCount > 0
          ? `${imgCount} photo(s) attached`
          : docCount > 0
            ? `${docCount} document(s) attached`
            : 'No attachments recorded'
      doc.text(`Evidence: ${attSummary}${record.official_url ? ' · Official URL available' : ''}`)
      
      doc.moveDown(0.6)
      doc.strokeColor('#E2E8F0').lineWidth(0.6).moveTo(48, doc.y).lineTo(547, doc.y).stroke()
    })

    doc.end()
  })
}

const ACTIVITY_DETAIL_LABELS = {
  type: 'Participation type',
  duration: 'Duration (days)',
  fees: 'Fees / registration amount',
  fees_funded: 'Fees funded',
  fund_agency: 'Funding agency',
  collab_entity: 'Collaborating organisation'
}

const omittedActivityDetails = new Set(['event_name', 'legacyOriginalType'])

const activityOverview = (activity) => {
  const facultyName = activity.staff_name || 'The faculty member'
  const role = String(activity.faculty_role || '').toLowerCase()
  const involvement = role.includes('organizer') || role.includes('organiser') || role.includes('coordinator')
    ? 'organised or coordinated'
    : role.includes('speaker') || role.includes('resource')
      ? 'contributed as a speaker or resource person to'
      : 'participated in'
  const parts = [
    `${facultyName} ${involvement} the ${activity.type_name || 'faculty activity'} “${activity.title || 'Untitled activity'}” during ${formatDateRange(activity)}.`
  ]
  if (activity.mode) parts.push(`It was conducted in ${String(activity.mode).toLowerCase()} mode.`)
  if (activity.host_organisation && activity.host_organisation.toLowerCase() !== 'no' && activity.host_organisation.toLowerCase() !== 'none') {
    parts.push(`The host or organising body was ${activity.host_organisation}.`)
  }
  if (activity.venue) parts.push(`The recorded venue was ${activity.venue}.`)
  return parts.join(' ')
}

// ─────────────────────────────────────────────────────────────
// SINGLE ACTIVITY SUMMARY PDF GENERATOR
// ─────────────────────────────────────────────────────────────
function generateActivitySummaryPdf(activity, generatedBy) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: {
        Title: `${activity.title || 'Faculty Activity'} - Event Summary`,
        Author: 'WCE Prof-Insights',
        Subject: 'Faculty Activity Summary'
      }
    })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const drawHeader = () => {
      const logoCandidates = [
        path.resolve(__dirname, '../../client/public/wce-logo.png'),
        path.resolve(__dirname, '../../client/src/assets/wce-logo.png')
      ]
      const foundLogo = logoCandidates.find((p) => fs.existsSync(p))
      if (foundLogo) {
        try {
          doc.image(foundLogo, 48, 42, { width: 44, height: 44 })
          doc.fillColor(`#${BRAND_NAVY}`).font('Helvetica-Bold').fontSize(11.5).text('WALCHAND COLLEGE OF ENGINEERING, SANGLI', 100, 44)
          doc.fillColor('#64748B').font('Helvetica').fontSize(8.5).text('Faculty Activities & Contribution Record · Prof-Insights', 100, 60)
          doc.y = 96
        } catch {
          doc.fillColor(`#${BRAND_NAVY}`).font('Helvetica-Bold').fontSize(11.5).text('WALCHAND COLLEGE OF ENGINEERING, SANGLI')
          doc.fillColor('#64748B').font('Helvetica').fontSize(8.5).text('WCE Prof-Insights · Individual Activity Record')
          doc.moveDown(0.5)
        }
      } else {
        doc.fillColor(`#${BRAND_NAVY}`).font('Helvetica-Bold').fontSize(11.5).text('WALCHAND COLLEGE OF ENGINEERING, SANGLI')
        doc.fillColor('#64748B').font('Helvetica').fontSize(8.5).text('WCE Prof-Insights · Individual Activity Record')
        doc.moveDown(0.5)
      }
      doc.strokeColor(`#${BRAND_GOLD}`).lineWidth(2).moveTo(48, doc.y).lineTo(547, doc.y).stroke()
      doc.moveDown(0.8)
    }

    drawHeader()

    const ensureSpace = (height = 60) => {
      if (doc.y + height > doc.page.height - 54) {
        doc.addPage()
      }
    }

    const section = (title) => {
      ensureSpace(60)
      doc.moveDown(0.9)
      doc.fillColor(`#${BRAND_NAVY}`).font('Helvetica-Bold').fontSize(12).text(title)
      doc.moveDown(0.35)
    }

    const field = (label, value) => {
      if (!hasReportValue(value)) return
      ensureSpace(34)
      doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(8).text(label.toUpperCase())
      doc.fillColor('#1E293B').font('Helvetica').fontSize(10).text(String(value), { width: 499 })
      doc.moveDown(0.35)
    }

    // Title & Subtitle
    doc.fillColor(`#${BRAND_NAVY}`).font('Helvetica-Bold').fontSize(18).text(activity.title || 'Faculty Activity')
    doc.moveDown(0.2)
    doc.fillColor('#475569').font('Helvetica').fontSize(9)
      .text(`Official Contribution Report · Status: ${activity.workflow_status || 'Submitted'}`)

    if (activity.workflow_status !== 'Approved') {
      doc.moveDown(0.4).fillColor('#9A3412').font('Helvetica-Bold').fontSize(9)
        .text('REVIEW COPY — this activity has not yet received final approval.')
    }

    // 1. Overall Event Summary
    section('Overall event summary')
    doc.fillColor('#1E293B').font('Helvetica').fontSize(10)
      .text(activityOverview(activity), { width: 499, lineGap: 2 })
    if (activity.summary) {
      doc.moveDown(0.5)
      field('Faculty-provided description', activity.summary)
    }
    if (activity.outcomes) {
      doc.moveDown(0.3)
      field('Recorded outcomes / impact', activity.outcomes)
    }

    // 2. Faculty and Event Information
    section('Faculty and event information')
    field('Faculty name', activity.staff_name)
    field('Designation', activity.staff_designation || 'Faculty')
    field('Department', activity.department)
    field('Activity category', activity.type_name)
    field('Date / duration', formatDateRange(activity))
    if (activity.start_time || activity.end_time || activity.event_time) {
      const timingText = activity.start_time && activity.end_time
        ? `${String(activity.start_time).slice(0, 5)} to ${String(activity.end_time).slice(0, 5)}`
        : (activity.start_time ? `From ${String(activity.start_time).slice(0, 5)}` : (activity.end_time ? `Until ${String(activity.end_time).slice(0, 5)}` : activity.event_time))
      field('Event timing', timingText)
    }
    field('Academic year', activity.acad_year)
    field('Mode / level', [activity.mode, activity.scope].filter(Boolean).join(' · '))
    field('Host / organiser', activity.host_organisation)
    field('Venue', activity.venue)
    field('Participants', activity.participant_count)

    // 3. Guests / Resource Persons (if any)
    if (activity.guests?.length) {
      section('Invited Guests / Resource Persons')
      activity.guests.forEach((guest, index) => {
        ensureSpace(32)
        const guestDetails = [
          guest.designation,
          guest.organisation,
          guest.country
        ].filter(Boolean).join(', ')
        const guestLine = `${index + 1}. ${guest.name}${guestDetails ? ` (${guestDetails})` : ''}${guest.guestRole ? ` — ${guest.guestRole}` : ''}`
        doc.fillColor('#1E293B').font('Helvetica').fontSize(9.5).text(guestLine, { width: 499 })
        doc.moveDown(0.2)
      })
    }

    // 4. Reported Activity Details
    const detailEntries = Object.entries(activity.details || {})
      .filter(([key, value]) => !omittedActivityDetails.has(key) && hasReportValue(value))
    if (detailEntries.length) {
      section('Reported activity details')
      for (const [key, value] of detailEntries) {
        field(ACTIVITY_DETAIL_LABELS[key] || humanize(key), displayValue(value))
      }
    }

    // 5. Evidence and Verification
    section('Evidence and verification')
    field('Evidence availability', activity.evidence_availability || 'Available now')
    field('Evidence note', activity.evidence_note)
    field('Official source', activity.official_url)

    if (activity.attachments?.length) {
      ensureSpace(40)
      doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(8).text('ATTACHMENT INDEX')
      const imageAttachments = activity.attachments.filter(a => a.kind === 'image' || a.mimeType?.startsWith('image/'))
      const nonImageAttachments = activity.attachments.filter(a => a.kind !== 'image' && !a.mimeType?.startsWith('image/'))
      let idx = 1
      nonImageAttachments.forEach((attachment) => {
        ensureSpace(26)
        const description = [
          `${idx++}. ${attachment.fileName}`,
          humanize(attachment.kind),
          attachment.caption
        ].filter(Boolean).join(' · ')
        doc.fillColor('#1E293B').font('Helvetica').fontSize(9.5).text(description, { width: 499 })
      })
      if (imageAttachments.length > 0) {
        ensureSpace(26)
        doc.fillColor('#1E293B').font('Helvetica').fontSize(9.5)
          .text(`${idx}. ${imageAttachments.length} image${imageAttachments.length > 1 ? 's' : ''} attached · Event Photos`, { width: 499 })
      }
    } else {
      doc.fillColor('#64748B').font('Helvetica-Oblique').fontSize(9.5).text('No file attachments are listed for this activity.')
    }

    // 6. Review Record
    section('Review record')
    field('Workflow status', activity.workflow_status)
    field('Submitted on', activity.submitted_at ? new Date(activity.submitted_at).toLocaleString('en-IN') : null)
    field('Reviewed by', activity.reviewer_name)
    field('Reviewed on', activity.reviewed_at ? new Date(activity.reviewed_at).toLocaleString('en-IN') : null)
    field('Reviewer comment', activity.review_comment)

    // Footer
    ensureSpace(50)
    doc.moveDown(1)
    doc.strokeColor('#CBD5E0').lineWidth(0.5).moveTo(48, doc.y).lineTo(547, doc.y).stroke()
    doc.moveDown(0.5)
    doc.fillColor('#64748B').font('Helvetica').fontSize(8)
      .text(`Generated by ${generatedBy?.name || 'Authorised user'} on ${new Date().toLocaleString('en-IN')}.`)
      .text('This system-generated summary reflects the submitted activity record. Original attachments remain the primary supporting evidence.')

    doc.end()
  })
}

const hasReportValue = (value) => value !== null && value !== undefined && value !== ''

const paragraph = (text, options = {}) => new Paragraph({
  spacing: { after: options.after ?? 100 },
  heading: options.heading,
  alignment: options.alignment,
  children: [new TextRun({
    text: String(text || ''),
    bold: options.bold,
    color: options.color,
    size: options.size ?? 22
  })]
})

function generateDocx(records, metadata) {
  const summary = summarize(records)
  const children = [
    paragraph('WALCHAND COLLEGE OF ENGINEERING, SANGLI', { bold: true, size: 26, color: BRAND_NAVY }),
    paragraph('WCE Prof-Insights · Faculty Activities & Evidence Portal', { color: '64748B', size: 18 }),
    paragraph(metadata.title, { heading: HeadingLevel.TITLE, color: BRAND_NAVY }),
    paragraph(`${metadata.coverageLabel}: ${metadata.coverageValue}`),
    paragraph(`Period: ${metadata.period}`),
    paragraph(`Generated by ${metadata.generatedBy} on ${metadata.generatedAt.toLocaleString('en-IN')}`),
    paragraph(`Total activities: ${records.length}`),
    paragraph('Summary', { heading: HeadingLevel.HEADING_1, color: BRAND_NAVY }),
    paragraph(`By review status: ${summary.byStatus.map(([status, count]) => `${status}: ${count}`).join(' · ') || 'None'}`),
    paragraph(`By category: ${summary.byType.map(([type, count]) => `${type}: ${count}`).join(' · ') || 'None'}`),
    paragraph('Chronological activity register', { heading: HeadingLevel.HEADING_1, color: BRAND_NAVY })
  ]

  if (!records.length) {
    children.push(paragraph('No records match the selected report filters.'))
  }

  records.forEach((record, index) => {
    children.push(paragraph(`${index + 1}. ${formatDateRange(record)} · ${record.type_name}`, { bold: true, color: BRAND_GOLD }))
    children.push(paragraph(record.title || 'Untitled activity', { bold: true, size: 24, color: BRAND_NAVY }))
    const docxTiming = record.start_time && record.end_time
      ? `Timing: ${String(record.start_time).slice(0, 5)} to ${String(record.end_time).slice(0, 5)}`
      : (record.start_time ? `Timing: ${String(record.start_time).slice(0, 5)}` : (record.end_time ? `Timing: ${String(record.end_time).slice(0, 5)}` : (record.event_time ? `Timing: ${record.event_time}` : null)))
    children.push(paragraph([
      record.staff_name,
      record.faculty_role,
      record.mode,
      docxTiming,
      record.scope,
      `Status: ${record.workflow_status}`
    ].filter(Boolean).join(' · ')))
    if (record.host_organisation) children.push(paragraph(`Host / organiser: ${record.host_organisation}`))
    if (record.venue) children.push(paragraph(`Venue: ${record.venue}`))
    if (record.summary) children.push(paragraph(`Summary: ${record.summary}`))
    if (record.outcomes) children.push(paragraph(`Outcome: ${record.outcomes}`))
    children.push(paragraph(`Evidence index: ${record.attachments?.length || 0} attachment(s)`))
  })

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, right: 720, bottom: 720, left: 720 }
        }
      },
      children
    }]
  })
  return Packer.toBuffer(doc)
}

// Build rich, human-written body text for the letter based on activity details
function buildAppreciationBody(activity) {
  const name = activity.staff_name || 'the faculty member'
  const type = (activity.type_name || 'activity').toLowerCase()
  const title = activity.title || 'the activity'
  const role = String(activity.faculty_role || '').toLowerCase()
  const scope = String(activity.scope || '').toLowerCase()
  const dept = activity.department || 'Computer Science and Engineering'
  const mode = String(activity.mode || '').toLowerCase()
  const dateRange = formatDateRange(activity)
  const participants = activity.participant_count
  const host = activity.host_organisation
  const outcomes = activity.outcomes

  // Determine the nature of involvement
  let involvementPhrase = 'participated in'
  let roleDesc = 'participant'
  if (role.includes('organis') || role.includes('organiz') || role.includes('coordinator') || role.includes('convenor') || role.includes('head')) {
    involvementPhrase = 'successfully organised and coordinated'
    roleDesc = 'organiser and coordinator'
  } else if (role.includes('speaker') || role.includes('resource person') || role.includes('keynote') || role.includes('expert')) {
    involvementPhrase = 'delivered an expert talk and served as a resource person at'
    roleDesc = 'invited speaker'
  } else if (role.includes('judge') || role.includes('evaluator') || role.includes('reviewer')) {
    involvementPhrase = 'served as a distinguished judge and evaluator at'
    roleDesc = 'evaluator'
  } else if (role.includes('trainer') || role.includes('facilitator')) {
    involvementPhrase = 'led and facilitated training sessions at'
    roleDesc = 'trainer and facilitator'
  } else if (role.includes('chair') || role.includes('session')) {
    involvementPhrase = 'chaired a technical session at'
    roleDesc = 'session chair'
  }

  // Build the scope/level phrase
  let scopePhrase = 'at the institute level'
  if (scope.includes('international')) scopePhrase = 'at the international level'
  else if (scope.includes('national')) scopePhrase = 'at the national level'
  else if (scope.includes('state')) scopePhrase = 'at the state level'
  else if (scope.includes('university') || scope.includes('inter-college')) scopePhrase = 'at the university/inter-college level'

  // Build host phrase
  const hostPhrase = host && host.toLowerCase() !== 'no' && host.toLowerCase() !== 'none' && host.toLowerCase() !== 'wce'
    ? ` organised by / at ${host}`
    : ''

  // Mode phrase
  const modePhrase = mode && mode !== 'offline'
    ? ` (conducted in ${mode} mode)`
    : ''

  // Outcomes sentence
  let outcomesSentence = ''
  if (outcomes && outcomes.trim().length > 10) {
    outcomesSentence = ` The outcomes of this engagement were particularly noteworthy: ${outcomes.trim().endsWith('.') ? outcomes.trim() : outcomes.trim() + '.'}`
  }

  // Participants sentence
  let participantsSentence = ''
  if (participants && Number(participants) > 0) {
    participantsSentence = ` The activity benefited ${participants} participants, directly contributing to the enrichment of our academic community.`
  }

  // Build type-specific opening recognition sentence
  let typeSpecific = ''
  if (type.includes('fdp') || type.includes('faculty development') || type.includes('training')) {
    typeSpecific = `Your commitment to continuous professional development and lifelong learning is an inspiration to colleagues and students alike. Attending and ${roleDesc === 'organiser and coordinator' ? 'organising' : 'participating in'} such programmes directly strengthens our department's academic capacity and research culture.`
  } else if (type.includes('research') || type.includes('publication') || type.includes('paper') || type.includes('journal')) {
    typeSpecific = `Research dissemination at ${scope || 'reputed'} forums is a cornerstone of academic excellence. Your scholarly contribution advances the department's research profile and brings recognition to Walchand College of Engineering on the ${scope || 'academic'} stage.`
  } else if (type.includes('guest') || type.includes('lecture') || type.includes('seminar')) {
    typeSpecific = `Organising distinguished guest sessions bridges the gap between industry and academia, and provides students with invaluable exposure to expert practitioners and thought leaders. Your role in facilitating this knowledge exchange is deeply valued.`
  } else if (type.includes('workshop') || type.includes('conference') || type.includes('symposium')) {
    typeSpecific = `Events of this nature are pivotal in creating collaborative academic environments and sharing cutting-edge knowledge across disciplines. Your ${roleDesc} role has helped foster an intellectually vibrant atmosphere in our institution.`
  } else if (type.includes('club') || type.includes('student') || type.includes('co-curricular') || type.includes('extracurricular')) {
    typeSpecific = `Student-centric activities are the hallmark of a holistic educational experience. Your guidance and mentorship in co-curricular pursuits have a lasting and meaningful impact on student development, leadership, and innovation.`
  } else if (type.includes('consultancy') || type.includes('project') || type.includes('industry')) {
    typeSpecific = `Industry-academia collaboration through consultancy and sponsored projects not only brings recognition to the institution but also creates practical learning opportunities for students. Your efforts in bridging this gap are highly commendable.`
  } else if (type.includes('award') || type.includes('achievement') || type.includes('recognition')) {
    typeSpecific = `Achievements of this calibre reflect not only personal excellence but also the high standards of scholarship maintained at Walchand College of Engineering. This recognition is a testament to your sustained dedication and outstanding professional conduct.`
  } else {
    typeSpecific = `Your consistent efforts in enriching the academic and professional environment of our department reflect the highest ideals of a dedicated educator and researcher.`
  }

  const opening = `The Department of ${dept} takes great pleasure in recognising and placing on official record its sincere appreciation to ${name} for ${involvementPhrase} the ${type} titled "${title}"${hostPhrase}${modePhrase}, held on ${dateRange} ${scopePhrase}.`

  const body = `${typeSpecific}${outcomesSentence}${participantsSentence}`

  const closing = `Your dedication, initiative, and hard work have made a substantial contribution to the academic stature, vibrant knowledge sharing, and overall excellence of the department. The Department and Walchand College of Engineering are proud of your achievement and extend heartfelt congratulations with best wishes for continued success in all your future academic and professional endeavours.`

  return { opening, body, closing }
}

// ─────────────────────────────────────────────────────────────
// APPRECIATION LETTER PDF GENERATOR (WITH HOD APPROVAL & DIGITAL SIGNATURE)
// ─────────────────────────────────────────────────────────────
async function generateAppreciationLetterPdf(activity, generatedBy, customSignature = null) {
  // Fetch HOD signature before starting the PDF stream
  const hodSignatureBase64 = customSignature || await fetchHodSignature(activity.department)

  // Build body text — use custom overrides if HOD edited them, else auto-generate
  const autoText = buildAppreciationBody(activity)
  const opening = activity.custom_opening || autoText.opening
  const body = activity.custom_body || autoText.body
  const closing = activity.custom_closing || autoText.closing
  const reviewerName = activity.custom_reviewer_name || activity.reviewer_name || 'Dr. A. R. Surve'
  const reviewerTitle = activity.custom_reviewer_title || 'Head of Department'

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 36,
      info: {
        Title: `Letter of Appreciation - ${activity.title || 'Faculty Activity'}`,
        Author: 'WCE Prof-Insights',
        Subject: 'Official Letter of Appreciation'
      }
    })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Outer Navy Border & Inner Gold Border
    doc.rect(18, 18, 559, 805).lineWidth(2).strokeColor(`#${BRAND_NAVY}`).stroke()
    doc.rect(23, 23, 549, 795).lineWidth(0.8).strokeColor(`#${BRAND_GOLD}`).stroke()

    // Decorative corner accents
    const drawCorner = (x, y, dx, dy) => {
      doc.strokeColor(`#${BRAND_GOLD}`).lineWidth(1.5)
        .moveTo(x, y + dy * 12).lineTo(x, y).lineTo(x + dx * 12, y).stroke()
    }
    drawCorner(28, 28, 1, 1)
    drawCorner(567, 28, -1, 1)
    drawCorner(28, 813, 1, -1)
    drawCorner(567, 813, -1, -1)

    // Header Logo & Institution Details
    const logoCandidates = [
      path.resolve(__dirname, '../../client/public/wce-logo.png'),
      path.resolve(__dirname, '../../client/src/assets/wce-logo.png')
    ]
    const foundLogo = logoCandidates.find((p) => fs.existsSync(p))
    if (foundLogo) {
      try {
        doc.image(foundLogo, 38, 34, { width: 52, height: 52 })
      } catch {}
    }

    doc.fillColor(`#${BRAND_NAVY}`).font('Helvetica-Bold').fontSize(13)
      .text('WALCHAND COLLEGE OF ENGINEERING, SANGLI', 98, 36)
    doc.fillColor('#64748B').font('Helvetica').fontSize(8)
      .text('(An Autonomous Institute · Government Aided · Established 1947)', 98, 52)
    doc.fillColor(`#${BRAND_GOLD}`).font('Helvetica-Bold').fontSize(10.5)
      .text(`DEPARTMENT OF ${(activity.department || 'Computer Science and Engineering').toUpperCase()}`, 98, 64)
    doc.fillColor('#64748B').font('Helvetica').fontSize(7.5)
      .text('Vishrambag, Sangli, Maharashtra - 416415 · www.walchandsangli.ac.in', 98, 78)

    // Header dividing lines
    doc.strokeColor(`#${BRAND_NAVY}`).lineWidth(1.5).moveTo(36, 94).lineTo(559, 94).stroke()
    doc.strokeColor(`#${BRAND_GOLD}`).lineWidth(0.75).moveTo(36, 97).lineTo(559, 97).stroke()

    // Reference & Date
    const refCode = `WCE/${(activity.department || 'CSE').replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 3) || 'CSE'}/APPR/${activity.acad_year || '2025-26'}/${String(activity.act_id || 101).padStart(4, '0')}`
    doc.fillColor('#475569').font('Helvetica').fontSize(8.5)
      .text(`Ref: ${refCode}`, 38, 106)
    const issueDate = activity.reviewed_at
      ? new Date(activity.reviewed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
    doc.text(`Date of Issue: ${issueDate}`, 38, 106, { align: 'right', width: 519 })

    // Letter of Appreciation Ribbon Banner
    doc.roundedRect(118, 122, 360, 34, 4).fillAndStroke('#FFFBEB', `#${BRAND_GOLD}`)
    doc.fillColor(`#${BRAND_NAVY}`).font('Helvetica-Bold').fontSize(16)
      .text('LETTER OF APPRECIATION', 118, 130, { width: 360, align: 'center', characterSpacing: 1.8 })

    // Recipient Section
    doc.fillColor('#64748B').font('Helvetica-Oblique').fontSize(9.5)
      .text('This letter of appreciation is proudly presented to', 38, 170, { align: 'center', width: 519 })
    doc.fillColor(`#${BRAND_NAVY}`).font('Helvetica-Bold').fontSize(20)
      .text(activity.staff_name || 'Contributor', 38, 184, { align: 'center', width: 519 })

    // Decorative line under name
    doc.strokeColor(`#${BRAND_GOLD}`).lineWidth(1.4).moveTo(190, 210).lineTo(406, 210).stroke()

    const recipientRole = activity.staff_designation || (String(activity.faculty_role || '').toLowerCase().includes('club') ? 'Club Representative' : 'Faculty Member')
    doc.fillColor('#334155').font('Helvetica').fontSize(9.5)
      .text(`${recipientRole} · ${activity.department || 'Computer Science and Engineering'}`, 38, 216, { align: 'center', width: 519 })
    doc.fillColor('#64748B').font('Helvetica').fontSize(8.5)
      .text('Walchand College of Engineering, Sangli', 38, 229, { align: 'center', width: 519 })

    // Opening paragraph
    doc.fillColor('#1E293B').font('Helvetica').fontSize(9.8)
      .text(opening, 48, 250, { align: 'justify', width: 499, lineGap: 3 })

    // Activity Highlight Card
    const cardY = doc.y + 12
    const cardH = 130
    doc.roundedRect(42, cardY, 511, cardH, 5).fillAndStroke('#F8FAFC', '#CBD5E1')
    doc.rect(42, cardY, 5, cardH).fill(`#${BRAND_GOLD}`)

    doc.fillColor(`#${BRAND_NAVY}`).font('Helvetica-Bold').fontSize(12)
      .text(activity.title || 'Untitled Activity', 56, cardY + 10, { width: 488 })

    const metaParts = [
      `Category: ${activity.type_name || 'Faculty Activity'}`,
      `Involvement: ${activity.faculty_role || 'Participant'}`,
      `Academic Year: ${activity.acad_year || '2025-26'}`
    ]
    doc.fillColor('#475569').font('Helvetica').fontSize(8.5)
      .text(metaParts.join('  ·  '), 56, cardY + 28, { width: 488 })

    const dY = cardY + 46
    doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(8.5).text('DURATION & DATE:', 56, dY)
    doc.font('Helvetica').text(formatDateRange(activity), 165, dY, { width: 375 })

    doc.font('Helvetica-Bold').text('MODE & SCOPE:', 56, dY + 16)
    doc.font('Helvetica').text([activity.mode, activity.scope ? `${activity.scope} Level` : null].filter(Boolean).join(' · ') || 'Institute Level', 165, dY + 16, { width: 375 })

    if (activity.host_organisation && activity.host_organisation.toLowerCase() !== 'no' && activity.host_organisation.toLowerCase() !== 'none') {
      doc.font('Helvetica-Bold').text('HOST / ORGANISER:', 56, dY + 32)
      doc.font('Helvetica').text(activity.host_organisation + (activity.venue ? ` · ${activity.venue}` : ''), 165, dY + 32, { width: 375 })
    } else if (activity.venue) {
      doc.font('Helvetica-Bold').text('VENUE:', 56, dY + 32)
      doc.font('Helvetica').text(activity.venue, 165, dY + 32, { width: 375 })
    }

    if (activity.participant_count) {
      doc.font('Helvetica-Bold').text('BENEFICIARIES:', 56, dY + 48)
      doc.font('Helvetica').text(`${activity.participant_count} Registered Participants / Beneficiaries`, 165, dY + 48, { width: 375 })
    }

    if (activity.summary) {
      const sumLine = dY + (activity.participant_count ? 64 : 48)
      doc.font('Helvetica-Bold').text('KEY HIGHLIGHT:', 56, sumLine)
      doc.font('Helvetica').text(activity.summary.slice(0, 160) + (activity.summary.length > 160 ? '…' : ''), 165, sumLine, { width: 375 })
    }

    // Body paragraph
    const bodyY = cardY + cardH + 14
    doc.fillColor('#1E293B').font('Helvetica').fontSize(9.8)
      .text(body, 48, bodyY, { align: 'justify', width: 499, lineGap: 3 })

    // Closing paragraph
    const closingY = doc.y + 10
    doc.fillColor('#1E293B').font('Helvetica').fontSize(9.8)
      .text(closing, 48, closingY, { align: 'justify', width: 499, lineGap: 3 })

    // Bottom Stamps & Digital Signature Section
    const stampY = doc.y + 18

    // Left Box: Seal of Authority
    doc.roundedRect(42, stampY, 215, 120, 6).fillAndStroke('#F8FAFC', '#94A3B8')
    doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8.5)
      .text('SEAL OF AUTHORITY', 42, stampY + 10, { width: 215, align: 'center' })
    doc.strokeColor('#CBD5E1').lineWidth(0.5).moveTo(58, stampY + 23).lineTo(240, stampY + 23).stroke()
    doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(7.8)
      .text(`DEPARTMENT OF ${(activity.department || 'Computer Science and Engineering').toUpperCase().slice(0, 38)}`, 52, stampY + 30, { width: 200, align: 'center' })
    doc.font('Helvetica').fontSize(7.5)
      .text('Walchand College of Engineering, Sangli', 52, stampY + 45, { width: 200, align: 'center' })
      .text('Autonomous Institute of Govt. of Maharashtra', 52, stampY + 57, { width: 200, align: 'center' })
    doc.fillColor('#15803D').font('Helvetica-Bold').fontSize(8)
      .text('INSTITUTIONAL RECORD: VERIFIED', 52, stampY + 74, { width: 200, align: 'center' })
    doc.fillColor('#64748B').font('Helvetica').fontSize(7)
      .text(`Approval Status: ${activity.workflow_status || 'Approved'}`, 52, stampY + 88, { width: 200, align: 'center' })
    doc.fillColor('#64748B').font('Helvetica').fontSize(6.5)
      .text(refCode, 52, stampY + 100, { width: 200, align: 'center' })

    // Right Box: HOD Digital Signature & Approval
    doc.roundedRect(295, stampY, 260, 120, 6).fillAndStroke('#F0FDF4', '#16A34A')
    doc.roundedRect(295, stampY, 260, 22, 4).fill('#16A34A')
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5)
      .text('✓  HOD APPROVED — DIGITAL SIGNATURE', 295, stampY + 6, { width: 260, align: 'center' })

    // Draw the HOD's signature image if available, else show typed name
    if (hodSignatureBase64) {
      try {
        const imgData = hodSignatureBase64.startsWith('data:')
          ? Buffer.from(hodSignatureBase64.split(',')[1], 'base64')
          : Buffer.from(hodSignatureBase64, 'base64')
        doc.image(imgData, 310, stampY + 26, { width: 120, height: 52, fit: [120, 52] })
      } catch {
        doc.fillColor('#14532D').font('Helvetica-BoldOblique').fontSize(14)
          .text(reviewerName, 308, stampY + 32, { width: 238 })
      }
    } else {
      doc.fillColor('#14532D').font('Helvetica-BoldOblique').fontSize(14)
        .text(reviewerName, 308, stampY + 30, { width: 238 })
      doc.fillColor('#64748B').font('Helvetica-Oblique').fontSize(7)
        .text('(Signature not yet uploaded — contact HOD)', 308, stampY + 48, { width: 238 })
    }

    doc.fillColor('#166534').font('Helvetica-Bold').fontSize(9)
      .text(reviewerTitle, 308, stampY + 80)
    doc.fillColor('#15803D').font('Helvetica').fontSize(8)
      .text(activity.department || 'Department of Computer Science and Engineering', 308, stampY + 93)
    doc.fillColor('#166534').font('Helvetica').fontSize(7.5)
      .text(`Approved: ${issueDate}`, 308, stampY + 105)

    // Verification hash
    const verHash = crypto.createHash('sha256')
      .update(`WCE-APPR-${activity.act_id}-${activity.reviewed_at || 'APPROVED'}`)
      .digest('hex').slice(0, 16).toUpperCase()
    doc.strokeColor('#CBD5E1').lineWidth(0.5).moveTo(38, stampY + 130).lineTo(557, stampY + 130).stroke()
    doc.fillColor('#64748B').font('Helvetica').fontSize(7.5)
      .text('This is an official digitally signed Letter of Appreciation generated from the verified WCE Prof-Insights Academic Repository. Authenticity can be verified using the reference number and digital validation token.', 38, stampY + 136, { width: 519, align: 'center' })
    doc.fillColor('#94A3B8').font('Courier').fontSize(6.5)
      .text(`SHA-256: WCE-VAL-${activity.act_id || '?'}-${verHash}`, 38, stampY + 150, { width: 519, align: 'center' })

    doc.end()
  })
}



// ─────────────────────────────────────────────────────────────
// SPECIALIZED ACTIVITY-SPECIFIC REPORT PDF GENERATOR (LANDSCAPE MATRIX)
// ─────────────────────────────────────────────────────────────

function generateActivitySpecificPdf(records, metadata, activityTypeName) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 36,
      info: {
        Title: `${activityTypeName || 'Activity'} Consolidated Report`,
        Author: 'WCE Prof-Insights',
        Subject: 'Specialized Activity Register'
      }
    })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const typeTitle = (activityTypeName || metadata.filters.find(f => f.startsWith('Type:'))?.replace('Type: ', '') || 'Faculty Activity').toUpperCase()
    const lowerType = typeTitle.toLowerCase()

    // Setup specialized columns based on activity category
    let columns = []
    if (lowerType.includes('guest')) {
      columns = [
        { label: 'Sr.', width: 28, align: 'center', get: (r, i) => String(i + 1) },
        { label: 'Lecture Topic / Title', width: 170, align: 'left', get: (r) => r.title || '—' },
        { label: 'Faculty Role', width: 75, align: 'left', get: (r) => r.faculty_role || '—' },
        { label: 'Date & Time', width: 75, align: 'left', get: (r) => `${formatDate(r.start_date)}${r.start_time ? `\n${String(r.start_time).slice(0, 5)}` : ''}` },
        { label: 'Guest Speaker & Organisation', width: 140, align: 'left', get: (r) => {
          if (r.guests && r.guests.length > 0) {
            return r.guests.map(g => `${g.name}${g.organisation ? ` (${g.organisation})` : ''}`).join('\n')
          }
          return r.host_organisation || '—'
        }},
        { label: 'Host / Venue', width: 95, align: 'left', get: (r) => [r.host_organisation, r.venue].filter(Boolean).join('\n') || 'WCE Sangli' },
        { label: 'Mode & Scope', width: 75, align: 'left', get: (r) => [r.mode, r.scope].filter(Boolean).join(' · ') || '—' },
        { label: 'Count', width: 45, align: 'center', get: (r) => String(r.participant_count || '—') },
        { label: 'Status', width: 57, align: 'center', get: (r) => r.workflow_status || 'Approved' }
      ]
    } else if (lowerType.includes('research') || lowerType.includes('publication') || lowerType.includes('book') || lowerType.includes('patent')) {
      columns = [
        { label: 'Sr.', width: 28, align: 'center', get: (r, i) => String(i + 1) },
        { label: 'Paper / Publication Title', width: 185, align: 'left', get: (r) => r.title || '—' },
        { label: 'Authors / Faculty', width: 95, align: 'left', get: (r) => r.staff_name || '—' },
        { label: 'Journal / Publisher / Conference', width: 145, align: 'left', get: (r) => r.host_organisation || r.details?.journal_name || r.details?.publisher || '—' },
        { label: 'ISSN / ISBN / Volume', width: 85, align: 'left', get: (r) => r.details?.issn || r.details?.isbn || r.details?.volume || '—' },
        { label: 'Scope / Indexing', width: 75, align: 'left', get: (r) => [r.scope, r.details?.indexed].filter(Boolean).join(' · ') || r.scope || '—' },
        { label: 'Date', width: 65, align: 'left', get: (r) => formatDate(r.start_date) },
        { label: 'Status', width: 52, align: 'center', get: (r) => r.workflow_status || 'Approved' }
      ]
    } else if (lowerType.includes('fdp') || lowerType.includes('faculty development') || lowerType.includes('value-added') || lowerType.includes('training')) {
      columns = [
        { label: 'Sr.', width: 28, align: 'center', get: (r, i) => String(i + 1) },
        { label: 'Programme Name & Code', width: 180, align: 'left', get: (r) => r.title || '—' },
        { label: 'Faculty Name', width: 95, align: 'left', get: (r) => r.staff_name || '—' },
        { label: 'Organising Body / Host', width: 110, align: 'left', get: (r) => r.host_organisation || '—' },
        { label: 'Dates & Duration', width: 80, align: 'left', get: (r) => formatDateRange(r) },
        { label: 'Level / Scope', width: 65, align: 'left', get: (r) => r.scope || 'National' },
        { label: 'Mode', width: 55, align: 'left', get: (r) => r.mode || 'Offline' },
        { label: 'Evidence / Cert', width: 80, align: 'center', get: (r) => r.attachments?.length ? `${r.attachments.length} Verified` : (r.evidence_availability || '—') },
        { label: 'Status', width: 47, align: 'center', get: (r) => r.workflow_status || 'Approved' }
      ]
    } else {
      // Default: Workshop / Seminar / Conference / Institutional events
      columns = [
        { label: 'Sr.', width: 28, align: 'center', get: (r, i) => String(i + 1) },
        { label: 'Title of Event / Activity', width: 180, align: 'left', get: (r) => r.title || '—' },
        { label: 'Faculty Coordinator', width: 95, align: 'left', get: (r) => `${r.staff_name}\n(${r.faculty_role || 'Organizer'})` },
        { label: 'Dates & Duration', width: 75, align: 'left', get: (r) => formatDateRange(r) },
        { label: 'Scope / Level', width: 65, align: 'left', get: (r) => r.scope || 'National' },
        { label: 'Mode & Venue', width: 80, align: 'left', get: (r) => [r.mode, r.venue].filter(Boolean).join('\n') || '—' },
        { label: 'Host / Organiser', width: 90, align: 'left', get: (r) => r.host_organisation || 'WCE Sangli' },
        { label: 'Beneficiaries', width: 65, align: 'center', get: (r) => String(r.participant_count || '—') },
        { label: 'Status', width: 62, align: 'center', get: (r) => r.workflow_status || 'Approved' }
      ]
    }

    const totalTableWidth = columns.reduce((sum, col) => sum + col.width, 0)
    const startX = 36

    const drawPageHeader = () => {
      const logoCandidates = [
        path.resolve(__dirname, '../../client/public/wce-logo.png'),
        path.resolve(__dirname, '../../client/src/assets/wce-logo.png')
      ]
      const foundLogo = logoCandidates.find((p) => fs.existsSync(p))
      if (foundLogo) {
        try { doc.image(foundLogo, startX, 28, { width: 38, height: 38 }) } catch {}
      }

      doc.fillColor(`#${BRAND_NAVY}`).font('Helvetica-Bold').fontSize(11)
        .text('WALCHAND COLLEGE OF ENGINEERING, SANGLI (AUTONOMOUS INSTITUTE)', startX + 46, 28)
      doc.fillColor('#64748B').font('Helvetica').fontSize(8)
        .text('Department of Computer Science & Engineering · Academic Performance & Verification Register', startX + 46, 42)

      doc.fillColor(`#${BRAND_GOLD}`).font('Helvetica-Bold').fontSize(13)
        .text(`CONSOLIDATED REPORT ON: ${typeTitle}`, startX + 46, 54)

      doc.fillColor('#334155').font('Helvetica').fontSize(8.5)
        .text(`Period: ${metadata.period}   |   ${metadata.coverageLabel}: ${metadata.coverageValue}   |   Generated: ${new Date().toLocaleDateString('en-IN')}`, startX + 46, 70)

      doc.strokeColor(`#${BRAND_GOLD}`).lineWidth(1.5).moveTo(startX, 86).lineTo(startX + totalTableWidth, 86).stroke()
      doc.y = 92
    }

    const drawTableHeader = () => {
      const headerY = doc.y
      doc.rect(startX, headerY, totalTableWidth, 22).fill(`#${BRAND_NAVY}`)

      let currentX = startX
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8)
      for (const col of columns) {
        doc.text(col.label, currentX + 3, headerY + 6, {
          width: col.width - 6,
          align: col.align
        })
        currentX += col.width
      }
      doc.y = headerY + 22
    }

    drawPageHeader()

    // Metrics Bar
    const totalParticipants = records.reduce((sum, r) => sum + (Number(r.participant_count) || 0), 0)
    const scopesCount = new Map()
    records.forEach(r => {
      const sc = r.scope || 'Local'
      scopesCount.set(sc, (scopesCount.get(sc) || 0) + 1)
    })
    const scopesSummary = [...scopesCount.entries()].map(([k, v]) => `${k} (${v})`).join('  ·  ') || 'None'

    doc.rect(startX, doc.y, totalTableWidth, 24).fillAndStroke('#F1F5F9', '#CBD5E1')
    doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(8.5)
      .text(`Total Records: ${records.length}   |   Total Participants / Footprint: ${totalParticipants}   |   Levels: ${scopesSummary}`, startX + 10, doc.y + 7, { width: totalTableWidth - 20 })
    doc.y += 28

    drawTableHeader()

    if (!records.length) {
      doc.moveDown(1.5).fillColor('#64748B').font('Helvetica-Oblique').fontSize(10)
        .text('No records match this specific activity type during the selected period.', { align: 'center', width: totalTableWidth })
    }

    records.forEach((record, index) => {
      // Approximate height needed
      const rowHeight = 32
      if (doc.y + rowHeight > 510) {
        doc.addPage()
        drawPageHeader()
        drawTableHeader()
      }

      const rowY = doc.y
      const isAlt = index % 2 === 1
      if (isAlt) {
        doc.rect(startX, rowY, totalTableWidth, rowHeight).fill('#F8FAFC')
      }

      let currentX = startX
      doc.fillColor('#1E293B').font('Helvetica').fontSize(7.8)
      for (const col of columns) {
        const textVal = col.get(record, index)
        doc.text(textVal, currentX + 4, rowY + 5, {
          width: col.width - 8,
          align: col.align,
          height: rowHeight - 8,
          ellipsis: true
        })
        currentX += col.width
      }

      // Row bottom divider
      doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(startX, rowY + rowHeight).lineTo(startX + totalTableWidth, rowY + rowHeight).stroke()
      doc.y = rowY + rowHeight
    })

    // Department Sign-off Block
    if (doc.y + 70 > 540) {
      doc.addPage()
      drawPageHeader()
    }

    doc.moveDown(1.2)
    const signY = doc.y + 10
    doc.strokeColor('#CBD5E1').lineWidth(0.8).moveTo(startX, signY).lineTo(startX + totalTableWidth, signY).stroke()

    // Left sign
    doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8.5)
      .text('Compiled & Verified By:', startX, signY + 12)
    doc.font('Helvetica').fontSize(8)
      .text(`${metadata.generatedBy} (${metadata.coverageLabel})`, startX, signY + 24)
      .text('WCE Prof-Insights Academic Repository', startX, signY + 36)

    // Center endorsement
    doc.font('Helvetica-Bold').fontSize(8.5)
      .text('Department Academic Reviewer:', startX + 260, signY + 12)
    doc.font('Helvetica').fontSize(8)
      .text('Internal Quality Assurance Cell (IQAC)', startX + 260, signY + 24)
      .text('Walchand College of Engineering, Sangli', startX + 260, signY + 36)

    // Right HOD Endorsement
    doc.font('Helvetica-Bold').fontSize(8.5)
      .text('Approved & Endorsed By:', startX + 530, signY + 12)
    doc.fillColor(`#${BRAND_NAVY}`).font('Helvetica-Bold').fontSize(9)
      .text('Dr. A. R. Surve', startX + 530, signY + 24)
    doc.fillColor('#475569').font('Helvetica').fontSize(8)
      .text('Head of Department', startX + 530, signY + 36)
      .text('Department of Computer Science & Engineering', startX + 530, signY + 47)

    doc.end()
  })
}

module.exports = {
  buildReportMetadata,
  generateCsv,
  generatePdf,
  generateDocx,
  generateActivitySummaryPdf,
  generateAppreciationLetterPdf,
  generateActivitySpecificPdf
}
