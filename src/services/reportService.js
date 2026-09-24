const PDFDocument = require('pdfkit')
const { stringify } = require('csv-stringify/sync')
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx')
const path = require('path')
const fs = require('fs')

const BRAND_NAVY = '1A365D'
const BRAND_GOLD = 'B7791F'

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
  const coverageLabel = user.role === 'Faculty' ? 'Faculty Name' : 'Department'
  const coverageValue = user.role === 'Faculty'
    ? user.name
    : user.role === 'HOD'
      ? `${user.department} Department`
      : query.department || 'All departments'

  const period = query.academicYear
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

module.exports = {
  buildReportMetadata,
  generateCsv,
  generatePdf,
  generateDocx,
  generateActivitySummaryPdf
}
