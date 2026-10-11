const PDFDocument = require('pdfkit')
const { stringify } = require('csv-stringify/sync')
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ImageRun
} = require('docx')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const pool = require('../db/pool')

const BRAND_NAVY = '14284B'
const BRAND_GOLD = 'B7791F'

// Activity Type Color Palette (consistent across app, reports, and charts)
const ACTIVITY_TYPE_COLORS = {
  'Workshop': '#0f766e',
  'Research Paper': '#7e22ce',
  'Research Paper / Publication': '#7e22ce',
  'Research Publication': '#7e22ce',
  'Industry Visit': '#b45309',
  'Industry Visit / Guest Visit': '#b45309',
  'Online Certification': '#1d4ed8',
  'Online Certification / Course': '#1d4ed8',
  'Faculty Development Programme (FDP)': '#14284b',
  'FDP': '#14284b',
  'Seminar': '#15803d',
  'Guest Lecture': '#be123c',
  'Value Added Course': '#0369a1',
  'Club Event': '#c2410c',
  'Other': '#475569'
}

function getTypeColor(typeName = '') {
  const norm = String(typeName).toLowerCase()
  if (norm.includes('workshop')) return '#0f766e'
  if (norm.includes('research') || norm.includes('publication') || norm.includes('paper')) return '#7e22ce'
  if (norm.includes('industry') || norm.includes('guest visit')) return '#b45309'
  if (norm.includes('online certification') || norm.includes('certification') || norm.includes('course')) return '#1d4ed8'
  if (norm.includes('fdp') || norm.includes('faculty development')) return '#14284b'
  if (norm.includes('seminar')) return '#15803d'
  if (norm.includes('guest lecture')) return '#be123c'
  if (norm.includes('value added') || norm.includes('vac')) return '#0369a1'
  if (norm.includes('club')) return '#c2410c'
  return '#475569'
}

// Fetch HOD's uploaded digital signature image
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

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

function parseLocalDate(val) {
  if (!val) return null
  const str = String(val).split('T')[0]
  const [y, m, d] = str.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

// Format date range as "24–26 September 2026", "2 August 2026"
function formatNarrativeDateRange(record) {
  const start = parseLocalDate(record.start_date)
  if (!start) return '—'
  const end = parseLocalDate(record.end_date)
  const sDay = start.getDate()
  const sMonth = MONTHS_LONG[start.getMonth()]
  const sYear = start.getFullYear()

  if (!end || record.start_date === record.end_date || end.getTime() === start.getTime()) {
    return `${sDay} ${sMonth} ${sYear}`
  }

  const eDay = end.getDate()
  const eMonth = MONTHS_LONG[end.getMonth()]
  const eYear = end.getFullYear()

  if (sYear === eYear && sMonth === eMonth) {
    return `${sDay}–${eDay} ${sMonth} ${sYear}`
  }
  if (sYear === eYear) {
    return `${sDay} ${sMonth} – ${eDay} ${eMonth} ${sYear}`
  }
  return `${sDay} ${sMonth} ${sYear} – ${eDay} ${eMonth} ${eYear}`
}

function normalizeHost(host = '') {
  if (!host) return 'Walchand College of Engineering, Sangli'
  const trimmed = host.trim()
  const lower = trimmed.toLowerCase()
  if (lower === 'no' || lower === 'none' || lower === 'na' || lower === 'n/a') {
    return 'Walchand College of Engineering, Sangli'
  }
  if (
    lower.includes('walchand') ||
    lower.includes('walchaand') ||
    lower === 'wce' ||
    lower === 'wce sangli' ||
    lower === 'wce, sangli'
  ) {
    return 'Walchand College of Engineering, Sangli'
  }
  return trimmed
}

function formatFacultyNameWithSalutation(record) {
  const raw = String(record.staff_name || 'Faculty Member').trim()
  const prefixes = ['Dr.', 'Prof.', 'Mr.', 'Mrs.', 'Ms.', 'Dr ', 'Prof ', 'Mr ', 'Mrs ', 'Ms ']
  for (const p of prefixes) {
    if (raw.startsWith(p)) return raw
  }
  const sal = record.staff_salutation || 'Prof.'
  return `${sal} ${raw}`
}

// Build formal narrative tokens with bold navy highlights for PDF, DOCX, and Preview
function buildActivityNarrative(record) {
  const name = formatFacultyNameWithSalutation(record)
  const title = (record.title || 'Academic Activity').trim()
  const host = normalizeHost(record.host_organisation)
  const dates = formatNarrativeDateRange(record)
  const typeName = (record.type_name || 'Activity').toLowerCase()
  const role = String(record.faculty_role || '').toLowerCase()
  const venue = record.venue ? record.venue.trim() : ''
  const scope = record.scope ? record.scope.trim() : 'Institute'
  const participants = record.participant_count ? String(record.participant_count) : null

  let tokens = []

  if (typeName.includes('research') || typeName.includes('paper') || typeName.includes('publication')) {
    tokens = [
      { text: name, bold: true },
      { text: ' presented a research paper at the ', bold: false },
      { text: title, bold: true },
      { text: ', held at ', bold: false },
      { text: host, bold: true },
      { text: ', during ', bold: false },
      { text: dates, bold: true },
      { text: '. Through this presentation, she/he disseminated research findings, engaged with academicians and researchers, and contributed to the exchange of innovative ideas, thereby enhancing the institute’s research visibility.', bold: false }
    ]
  } else if (role.includes('organis') || role.includes('organiz') || role.includes('coordinat') || role.includes('conven')) {
    const venueText = venue && venue.toLowerCase() !== 'online' ? ` (${venue})` : ''
    const partText = participants ? ` for ${participants} registered participants.` : '.'
    tokens = [
      { text: name, bold: true },
      { text: ' organised and coordinated the ', bold: false },
      { text: title, bold: true },
      { text: ' at ', bold: false },
      { text: `${host}${venueText}`, bold: true },
      { text: ' from ', bold: false },
      { text: dates, bold: true },
      { text: `, held at the ${scope.toLowerCase()} level${partText}`, bold: false }
    ]
  } else if (typeName.includes('industry visit') || typeName.includes('guest visit')) {
    tokens = [
      { text: name, bold: true },
      { text: ' arranged the visit of ', bold: false },
      { text: title, bold: true },
      { text: ' to ', bold: false },
      { text: host, bold: true },
      { text: ' on ', bold: false },
      { text: dates, bold: true },
      { text: '. The visit showcased the vibrant open-source ecosystem, modern infrastructure, and collaborative initiatives undertaken by WCE, Sangli.', bold: false }
    ]
  } else if (typeName.includes('fdp') || typeName.includes('faculty development')) {
    tokens = [
      { text: name, bold: true },
      { text: ' attended the ', bold: false },
      { text: title, bold: true },
      { text: ' conducted by ', bold: false },
      { text: host, bold: true },
      { text: ' from ', bold: false },
      { text: dates, bold: true },
      { text: '. The FDP provided comprehensive insights into emerging technologies, including advanced computational methodologies, and their applications in research and education.', bold: false }
    ]
  } else if (typeName.includes('online certification') || typeName.includes('certification') || typeName.includes('course')) {
    tokens = [
      { text: name, bold: true },
      { text: ' successfully completed the ', bold: false },
      { text: `“${title}”`, bold: true },
      { text: ' online training conducted by ', bold: false },
      { text: host, bold: true },
      { text: ' during ', bold: false },
      { text: dates, bold: true },
      { text: ', enhancing core technical competence and applied proficiency in modern industry frameworks.', bold: false }
    ]
  } else if (role.includes('speaker') || role.includes('resource') || role.includes('expert')) {
    tokens = [
      { text: name, bold: true },
      { text: ' delivered an invited expert session on ', bold: false },
      { text: `“${title}”`, bold: true },
      { text: ' organised by ', bold: false },
      { text: host, bold: true },
      { text: ' on ', bold: false },
      { text: dates, bold: true },
      { text: `, sharing domain expertise with registered participants at the ${scope.toLowerCase()} level.`, bold: false }
    ]
  } else {
    tokens = [
      { text: name, bold: true },
      { text: ' successfully completed the ', bold: false },
      { text: title, bold: true },
      { text: ' organised by ', bold: false },
      { text: host, bold: true },
      { text: ' on ', bold: false },
      { text: dates, bold: true },
      { text: '. The programme provided hands-on training in effective methodologies, problem solving, and modern domain practices.', bold: false }
    ]
  }

  if (record.summary && record.summary.trim().length > 10) {
    const extraSummary = record.summary.trim()
    if (!tokens.some(t => t.text.includes(extraSummary))) {
      tokens.push({ text: ` ${extraSummary.endsWith('.') ? extraSummary : extraSummary + '.'}`, bold: false })
    }
  }

  if (record.outcomes && record.outcomes.trim().length > 10) {
    const extraOutcomes = record.outcomes.trim()
    tokens.push({ text: ` ${extraOutcomes.endsWith('.') ? extraOutcomes : extraOutcomes + '.'}`, bold: false })
  }

  const fullText = tokens.map(t => t.text).join('')
  const html = tokens.map(t => t.bold ? `<strong style="color: #14284b;">${t.text}</strong>` : t.text).join('')

  return { tokens, fullText, html }
}

// Attach image media and captions to activity records
async function attachMediaToRecords(records) {
  if (!records || !records.length) return records
  const actIds = records.map(r => r.act_id).filter(Boolean)
  if (!actIds.length) return records

  try {
    const res = await pool.query(
      `SELECT attachment_id, activity_id, kind, file_name, mime_type, size_bytes, data, caption, is_primary, is_report_visible
       FROM activity_attachment
       WHERE activity_id = ANY($1::int[])
         AND (is_report_visible IS NULL OR is_report_visible = TRUE)
       ORDER BY activity_id, (CASE WHEN is_primary = TRUE THEN 0 WHEN kind = 'evidence' OR file_name ILIKE '%cert%' THEN 1 WHEN mime_type LIKE 'image/%' THEN 2 ELSE 3 END), sort_order, attachment_id`,
      [actIds]
    )

    const byActId = new Map()
    for (const row of res.rows) {
      if (!byActId.has(row.activity_id)) byActId.set(row.activity_id, [])
      byActId.get(row.activity_id).push(row)
    }

    for (const record of records) {
      const atts = byActId.get(record.act_id) || []
      const imageAtts = atts.filter(a => a.mime_type?.startsWith('image/') && a.data)
      const primaryAtt = atts.find(a => a.is_primary && a.mime_type?.startsWith('image/') && a.data)
        || atts.find(a => (a.kind === 'evidence' || a.file_name?.toLowerCase().includes('cert')) && a.mime_type?.startsWith('image/') && a.data)
        || imageAtts[0]
        || null

      let caption = 'Certificate of Completion'
      const typeLower = (record.type_name || '').toLowerCase()
      if (primaryAtt?.caption) {
        caption = primaryAtt.caption
      } else if (typeLower.includes('research') || typeLower.includes('publication')) {
        caption = 'Certificate of Appreciation'
      } else if (typeLower.includes('fdp') || typeLower.includes('seminar') || typeLower.includes('conference')) {
        caption = 'Certificate of Participation'
      } else if (typeLower.includes('visit') || primaryAtt?.kind === 'image') {
        caption = 'Event Photograph'
      }

      const otherImages = imageAtts.filter(a => !primaryAtt || a.attachment_id !== primaryAtt.attachment_id)
      const thumbnails = otherImages.slice(0, 2).map(a => a.data)
      const extraCount = Math.max(0, otherImages.length - 2)

      record.reportMedia = {
        hasMedia: Boolean(primaryAtt?.data),
        mainImage: primaryAtt?.data || null,
        mainFileName: primaryAtt?.file_name || null,
        caption,
        thumbnails,
        extraCount,
        allCount: imageAtts.length
      }
    }
  } catch {
    // In disconnected DB or test mocks, fallback gracefully
    for (const record of records) {
      if (!record.reportMedia) {
        record.reportMedia = {
          hasMedia: false,
          mainImage: null,
          mainFileName: null,
          caption: 'Certificate of Completion',
          thumbnails: [],
          extraCount: 0,
          allCount: 0
        }
      }
    }
  }

  return records
}

const displayValue = (value) => {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const buildReportMetadata = (user, query = {}, records = []) => {
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

  const acadYear = query.academicYear || (records[0]?.acad_year) || '2026-27'
  const refNumber = `WCE/CSE/RPT/${acadYear}/0007`

  return {
    title: 'Faculty Activity & Contribution Report',
    coverageLabel,
    coverageValue,
    department: user.department || 'Computer Science and Engineering',
    period,
    academicYear: acadYear,
    refNumber,
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
  const rows = records.map((record, index) => {
    const certAtt = (record.attachments || []).find(a => a.isPrimary || a.kind === 'evidence' || a.fileName?.toLowerCase().includes('cert'))
    return {
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
        .join('; '),
      'Certificate File Name': certAtt ? certAtt.fileName : ((record.attachments && record.attachments[0]) ? record.attachments[0].fileName : 'None')
    }
  })

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
// PAGE DECORATIVE BORDER (Navy 1.6pt outer, Gold 0.6pt inner, corner markers)
// ─────────────────────────────────────────────────────────────
function drawPageBorder(doc) {
  doc.save()
  // Outer Navy line
  doc.rect(18, 18, 559.28, 805.89).lineWidth(1.6).strokeColor('#14284b').stroke()
  // Inner Gold line
  doc.rect(23, 23, 549.28, 795.89).lineWidth(0.6).strokeColor('#b7791f').stroke()

  // 4 Corner square markers (4x4pt filled gold squares)
  const cornerSize = 4
  const corners = [
    [21, 21],
    [570.28, 21],
    [21, 816.89],
    [570.28, 816.89]
  ]
  doc.fillColor('#b7791f')
  corners.forEach(([cx, cy]) => {
    doc.rect(cx, cy, cornerSize, cornerSize).fill()
  })
  doc.restore()
}

// ─────────────────────────────────────────────────────────────
// PAGE 1 HEADER (WCE Crest, Serif Title, Dept in Gold, Navy rule)
// ─────────────────────────────────────────────────────────────
function drawPage1Header(doc, metadata) {
  const logoCandidates = [
    path.resolve(__dirname, '../../client/public/wce-logo.png'),
    path.resolve(__dirname, '../../client/src/assets/wce-logo.png')
  ]
  const foundLogo = logoCandidates.find((p) => fs.existsSync(p))
  if (foundLogo) {
    try {
      doc.image(foundLogo, 36, 32, { width: 44, height: 44 })
    } catch {}
  }

  // College Name & Subtitle
  doc.fillColor('#14284b').font('Times-Bold').fontSize(14)
    .text('WALCHAND COLLEGE OF ENGINEERING, SANGLI', 88, 32, { characterSpacing: 0.3 })
  doc.fillColor('#475569').font('Helvetica').fontSize(7.5)
    .text('(An Autonomous Institute · Government Aided · Established 1947)', 88, 48)
  const deptName = `DEPARTMENT OF ${(metadata.department || 'Computer Science and Engineering').toUpperCase()}`
  doc.fillColor('#b7791f').font('Helvetica-Bold').fontSize(9)
    .text(deptName, 88, 60, { characterSpacing: 0.6 })

  // Navy rule under header
  doc.strokeColor('#14284b').lineWidth(1.6).moveTo(36, 76).lineTo(559, 76).stroke()

  // Title
  doc.fillColor('#14284b').font('Times-Bold').fontSize(16)
    .text('Faculty Activity & Contribution Report', 36, 86, { align: 'center', width: 523 })

  // Subtitle with IST timestamp (no seconds) and reference code
  const istDateStr = metadata.generatedAt.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  const istTimeStr = metadata.generatedAt.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).toLowerCase()
  const subLine = `${metadata.coverageValue || metadata.department} · Period: ${metadata.period} · Generated ${istDateStr}, ${istTimeStr} IST · Ref: ${metadata.refNumber}`

  doc.fillColor('#64748b').font('Helvetica').fontSize(8)
    .text(subLine, 36, 106, { align: 'center', width: 523 })
}

// ─────────────────────────────────────────────────────────────
// STAT STRIP (Activities | Approved | With certificates | Activity types)
// ─────────────────────────────────────────────────────────────
function drawStatStrip(doc, records, y = 124) {
  const total = records.length
  const approved = records.filter(r => r.workflow_status === 'Approved').length
  const withCert = records.filter(r => (r.attachments || []).some(a => a.kind === 'evidence' || a.fileName?.toLowerCase().includes('cert') || a.mimeType?.startsWith('image/')) || r.reportMedia?.hasMedia).length
  const typesCount = new Set(records.map(r => r.type_name).filter(Boolean)).size

  const stats = [
    { num: String(total), label: 'ACTIVITIES' },
    { num: String(approved), label: 'APPROVED' },
    { num: String(withCert), label: 'WITH CERTIFICATES' },
    { num: String(typesCount), label: 'ACTIVITY TYPES' }
  ]

  const startX = 36
  const totalW = 523
  const cardW = (totalW - (3 * 8)) / 4
  const cardH = 38

  stats.forEach((st, idx) => {
    const x = startX + idx * (cardW + 8)
    doc.save()
    doc.roundedRect(x, y, cardW, cardH, 3).fillAndStroke('#F8FAFC', '#E2E8F0')
    doc.fillColor('#14284b').font('Helvetica-Bold').fontSize(14)
      .text(st.num, x, y + 5, { width: cardW, align: 'center' })
    doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(6.5)
      .text(st.label, x, y + 23, { width: cardW, align: 'center', characterSpacing: 0.5 })
    doc.restore()
  })

  return y + cardH + 12
}

// ─────────────────────────────────────────────────────────────
// HOD SIGNATURE BLOCK (Right aligned, NO Faculty Coordinator)
// ─────────────────────────────────────────────────────────────
function drawHodSignatureBlock(doc, hodSignatureBase64, startY = doc.y) {
  const boxX = 360
  const boxW = 200
  let currentY = startY

  if (hodSignatureBase64) {
    try {
      const imgData = hodSignatureBase64.startsWith('data:')
        ? Buffer.from(hodSignatureBase64.split(',')[1], 'base64')
        : Buffer.from(hodSignatureBase64, 'base64')
      doc.image(imgData, boxX + 40, currentY, { width: 120, height: 38, fit: [120, 38] })
      currentY += 40
    } catch {
      currentY += 28
    }
  } else {
    currentY += 28
  }

  // Signature line
  doc.strokeColor('#14284b').lineWidth(0.8).moveTo(boxX + 15, currentY).lineTo(boxX + boxW, currentY).stroke()
  currentY += 6

  doc.fillColor('#14284b').font('Helvetica-Bold').fontSize(9)
    .text('Head of Department', boxX + 10, currentY, { width: boxW - 10, align: 'center' })
  doc.fillColor('#334155').font('Helvetica').fontSize(8.5)
    .text('(Dr. A. R. Surve)', boxX + 10, currentY + 12, { width: boxW - 10, align: 'center' })
}

// Draw faint diagonal DRAFT watermark
function drawWatermark(doc) {
  doc.save()
  doc.fillColor('#DC2626').opacity(0.07)
  doc.font('Helvetica-Bold').fontSize(68)
  doc.rotate(-35, { origin: [297, 420] })
  doc.text('DRAFT REPORT', 120, 390, { align: 'center', width: 350 })
  doc.restore()
}

// ─────────────────────────────────────────────────────────────
// MULTI-EVENT COMBINED / ANNUAL PDF REPORT GENERATOR
// ─────────────────────────────────────────────────────────────
async function generatePdf(records, metadata = {}) {
  await attachMediaToRecords(records)
  const dept = (metadata && metadata.department) ? metadata.department : 'Computer Science and Engineering'
  const hodSignatureBase64 = await fetchHodSignature(dept)

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      bufferPages: true,
      info: {
        Title: (metadata && metadata.title) || 'Faculty Activity & Contribution Report',
        Author: 'Walchand College of Engineering, Sangli',
        Subject: 'Faculty Activity & Contribution Report'
      }
    })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    drawPageBorder(doc)
    drawPage1Header(doc, metadata)
    let currentY = drawStatStrip(doc, records, 126)

    if (!records.length) {
      doc.fillColor('#64748B').font('Helvetica-Oblique').fontSize(10)
        .text('No activity records match the selected report criteria.', 36, currentY + 20, { align: 'center', width: 523 })
      currentY += 60
    }

    records.forEach((record, index) => {
      const typeColor = getTypeColor(record.type_name)
      const narrative = buildActivityNarrative(record)

      const cardX = 36
      const cardW = 523
      const detailsX = cardX + 36
      const detailsW = 310
      const mediaX = cardX + 356
      const mediaW = 156

      // Measure narrative height
      const textH = doc.heightOfString(narrative.fullText, { width: detailsW, font: 'Helvetica', size: 8.5, lineGap: 2.2 })
      const cardH = Math.max(28 + textH + 14 + 44, 134)

      // Page break check (must leave space for border and running footer, limit = 770)
      if (currentY + cardH > 770) {
        doc.addPage()
        drawPageBorder(doc)
        currentY = 38
      }

      const cardY = currentY

      // Card outer frame
      doc.roundedRect(cardX, cardY, cardW, cardH, 4).strokeColor('#E2E8F0').lineWidth(0.8).stroke()

      // Left Accent Color Bar & Sr. No circle
      doc.roundedRect(cardX, cardY, 4, cardH, 2).fill(typeColor)
      const circleX = cardX + 18
      const circleY = cardY + 18
      doc.circle(circleX, circleY, 10).fill(typeColor)
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8)
        .text(String(index + 1).padStart(2, '0'), circleX - 10, circleY - 4.5, { width: 20, align: 'center' })

      // Top row in Details Column: Pill Chip | Date | Approved tick

      const chipText = (record.type_name || 'ACTIVITY').toUpperCase()
      const chipW = Math.min(130, chipText.length * 5.8 + 12)
      doc.roundedRect(detailsX, cardY + 8, chipW, 14, 3).fillAndStroke('#F1F5F9', typeColor)
      doc.fillColor(typeColor).font('Helvetica-Bold').fontSize(6.8)
        .text(chipText, detailsX, cardY + 11.5, { width: chipW, align: 'center' })

      const dateStr = formatNarrativeDateRange(record)
      doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(8.5)
        .text(dateStr, detailsX + chipW + 8, cardY + 11)

      if (record.workflow_status === 'Approved') {
        doc.fillColor('#15803D').font('Helvetica-Bold').fontSize(7.5)
          .text('✓ Approved by HOD', detailsX, cardY + 11, { width: detailsW, align: 'right' })
      }

      // Narrative text — only pass coordinates to the 1st token to avoid cursor-reset collision
      const textY = cardY + 28
      doc.fontSize(8.5)
      narrative.tokens.forEach((tok, tokIdx) => {
        const isLast = tokIdx === narrative.tokens.length - 1
        if (tok.bold) {
          doc.fillColor('#14284B').font('Helvetica-Bold')
        } else {
          doc.fillColor('#1E293B').font('Helvetica')
        }
        if (tokIdx === 0) {
          doc.text(tok.text, detailsX, textY, {
            width: detailsW,
            lineGap: 2.2,
            continued: !isLast
          })
        } else {
          doc.text(tok.text, {
            lineGap: 2.2,
            continued: !isLast
          })
        }
      })

      // Detail grid (2x2)
      const gridY = cardY + cardH - 38
      const colW = (detailsW - 10) / 2

      // Left Column: ROLE & HOST
      doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(6.5).text('ROLE', detailsX, gridY)
      doc.fillColor('#1E293B').font('Helvetica').fontSize(8).text(record.faculty_role || 'Participant', detailsX, gridY + 8, { width: colW - 5, ellipsis: true })

      doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(6.5).text('HOST / ORGANISER', detailsX, gridY + 18)
      doc.fillColor('#1E293B').font('Helvetica').fontSize(8).text(normalizeHost(record.host_organisation), detailsX, gridY + 26, { width: colW - 5, ellipsis: true })

      // Right Column: MODE · LEVEL & VENUE
      doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(6.5).text('MODE · LEVEL', detailsX + colW + 10, gridY)
      doc.fillColor('#1E293B').font('Helvetica').fontSize(8).text([record.mode, record.scope].filter(Boolean).join(' · ') || 'Offline · Institute', detailsX + colW + 10, gridY + 8, { width: colW - 5, ellipsis: true })

      doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(6.5).text('VENUE', detailsX + colW + 10, gridY + 18)
      doc.fillColor('#1E293B').font('Helvetica').fontSize(8).text(record.venue || 'Online Platform', detailsX + colW + 10, gridY + 26, { width: colW - 5, ellipsis: true })

      // Media Column (Certificate/Photo or Dashed placeholder)
      const mediaBoxY = cardY + 8
      const mediaBoxH = cardH - 16

      if (record.reportMedia?.hasMedia && record.reportMedia.mainImage) {
        doc.roundedRect(mediaX, mediaBoxY, mediaW, mediaBoxH, 3).strokeColor('#CBD5E1').lineWidth(0.6).stroke()
        try {
          doc.image(record.reportMedia.mainImage, mediaX + 3, mediaBoxY + 3, {
            width: mediaW - 6,
            height: mediaBoxH - 18,
            fit: [mediaW - 6, mediaBoxH - 18],
            align: 'center'
          })
        } catch {}
        doc.fillColor('#64748B').font('Helvetica-Oblique').fontSize(7)
          .text(record.reportMedia.caption || 'Certificate of Completion', mediaX, mediaBoxY + mediaBoxH - 13, { width: mediaW, align: 'center' })
      } else {
        // Dashed placeholder box
        doc.save().dash(3, { space: 3 })
        doc.roundedRect(mediaX, mediaBoxY, mediaW, mediaBoxH, 3).strokeColor('#CBD5E1').lineWidth(0.6).stroke()
        doc.restore()
        doc.fillColor('#94A3B8').font('Helvetica-Oblique').fontSize(7.5)
          .text('No certificate or photo\nuploaded for this activity', mediaX + 5, mediaBoxY + (mediaBoxH / 2) - 10, { width: mediaW - 10, align: 'center' })
      }

      currentY += cardH + 10
    })

    // Check room for HOD signature block
    if (currentY + 85 > 770) {
      doc.addPage()
      drawPageBorder(doc)
      currentY = 40
    }
    drawHodSignatureBlock(doc, hodSignatureBase64, currentY + 10)

    // Draft watermark
    if (metadata.includesPending) {
      const range = doc.bufferedPageRange()
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i)
        drawWatermark(doc)
      }
    }

    // Footers on every page ("Page X of Y")
    const range = doc.bufferedPageRange()
    const refCode = metadata.refNumber || `WCE/CSE/RPT/${metadata.academicYear || '2026-27'}/0007`
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i)
      doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(36, 804).lineTo(559, 804).stroke()
      doc.fillColor('#64748B').font('Helvetica').fontSize(7.5)
      doc.text(`Generated from WCE Prof-Insights · Verify at miniproject-app.onrender.com/verify/${refCode.replace(/\//g, '-')}`, 36, 810, { width: 380 })
      doc.text(`Page ${i + 1} of ${range.count}`, 430, 810, { width: 129, align: 'right' })
    }

    doc.end()
  })
}

// ─────────────────────────────────────────────────────────────
// SINGLE ACTIVITY SUMMARY PDF GENERATOR
// ─────────────────────────────────────────────────────────────
async function generateActivitySummaryPdf(activity, generatedBy) {
  const records = [activity]
  await attachMediaToRecords(records)
  const metadata = buildReportMetadata(
    generatedBy || { name: activity.staff_name, department: activity.department, role: 'Faculty' },
    { academicYear: activity.acad_year },
    records
  )
  const hodSignatureBase64 = await fetchHodSignature(activity.department || 'Computer Science and Engineering')

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      bufferPages: true,
      info: {
        Title: `${activity.title || 'Faculty Activity'} - Contribution Report`,
        Author: 'Walchand College of Engineering, Sangli',
        Subject: 'Faculty Activity & Contribution Report'
      }
    })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    drawPageBorder(doc)
    drawPage1Header(doc, metadata)
    let currentY = drawStatStrip(doc, records, 126)

    const cardX = 36
    const cardW = 523
    const cardY = currentY
    const detailsX = cardX + 36
    const detailsW = 310
    const mediaX = cardX + 356
    const mediaW = 156

    const typeColor = getTypeColor(activity.type_name)
    const narrative = buildActivityNarrative(activity)

    const textH = doc.heightOfString(narrative.fullText, { width: detailsW, font: 'Helvetica', size: 8.5, lineGap: 2.2 })
    const cardH = Math.max(28 + textH + 14 + 44, 140)

    // Card outer frame
    doc.roundedRect(cardX, cardY, cardW, cardH, 4).strokeColor('#E2E8F0').lineWidth(0.8).stroke()
    doc.roundedRect(cardX, cardY, 4, cardH, 2).fill(typeColor)

    const circleX = cardX + 18
    const circleY = cardY + 18
    doc.circle(circleX, circleY, 10).fill(typeColor)
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8)
      .text('01', circleX - 10, circleY - 4.5, { width: 20, align: 'center' })

    const chipText = (activity.type_name || 'ACTIVITY').toUpperCase()
    const chipW = Math.min(130, chipText.length * 5.8 + 12)
    doc.roundedRect(detailsX, cardY + 8, chipW, 14, 3).fillAndStroke('#F1F5F9', typeColor)
    doc.fillColor(typeColor).font('Helvetica-Bold').fontSize(6.8)
      .text(chipText, detailsX, cardY + 11.5, { width: chipW, align: 'center' })

    const dateStr = formatNarrativeDateRange(activity)
    doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(8.5)
      .text(dateStr, detailsX + chipW + 8, cardY + 11)

    if (activity.workflow_status === 'Approved') {
      doc.fillColor('#15803D').font('Helvetica-Bold').fontSize(7.5)
        .text('✓ Approved by HOD', detailsX, cardY + 11, { width: detailsW, align: 'right' })
    }

    // Narrative text — only pass coordinates to the 1st token to avoid cursor-reset collision
    const textY = cardY + 28
    doc.fontSize(8.5)
    narrative.tokens.forEach((tok, tokIdx) => {
      const isLast = tokIdx === narrative.tokens.length - 1
      if (tok.bold) {
        doc.fillColor('#14284B').font('Helvetica-Bold')
      } else {
        doc.fillColor('#1E293B').font('Helvetica')
      }
      if (tokIdx === 0) {
        doc.text(tok.text, detailsX, textY, {
          width: detailsW,
          lineGap: 2.2,
          continued: !isLast
        })
      } else {
        doc.text(tok.text, {
          lineGap: 2.2,
          continued: !isLast
        })
      }
    })

    // Detail grid (2x2)
    const gridY = cardY + cardH - 38
    const colW = (detailsW - 10) / 2

    doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(6.5).text('ROLE', detailsX, gridY)
    doc.fillColor('#1E293B').font('Helvetica').fontSize(8).text(activity.faculty_role || 'Participant', detailsX, gridY + 8, { width: colW - 5, ellipsis: true })

    doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(6.5).text('HOST / ORGANISER', detailsX, gridY + 18)
    doc.fillColor('#1E293B').font('Helvetica').fontSize(8).text(normalizeHost(activity.host_organisation), detailsX, gridY + 26, { width: colW - 5, ellipsis: true })

    doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(6.5).text('MODE · LEVEL', detailsX + colW + 10, gridY)
    doc.fillColor('#1E293B').font('Helvetica').fontSize(8).text([activity.mode, activity.scope].filter(Boolean).join(' · ') || 'Offline · Institute', detailsX + colW + 10, gridY + 8, { width: colW - 5, ellipsis: true })

    doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(6.5).text('VENUE', detailsX + colW + 10, gridY + 18)
    doc.fillColor('#1E293B').font('Helvetica').fontSize(8).text(activity.venue || 'Online Platform', detailsX + colW + 10, gridY + 26, { width: colW - 5, ellipsis: true })

    // Media Column
    const mediaBoxY = cardY + 8
    const mediaBoxH = cardH - 16

    if (activity.reportMedia?.hasMedia && activity.reportMedia.mainImage) {
      doc.roundedRect(mediaX, mediaBoxY, mediaW, mediaBoxH, 3).strokeColor('#CBD5E1').lineWidth(0.6).stroke()
      try {
        doc.image(activity.reportMedia.mainImage, mediaX + 3, mediaBoxY + 3, {
          width: mediaW - 6,
          height: mediaBoxH - 18,
          fit: [mediaW - 6, mediaBoxH - 18],
          align: 'center'
        })
      } catch {}
      doc.fillColor('#64748B').font('Helvetica-Oblique').fontSize(7)
        .text(activity.reportMedia.caption || 'Certificate of Completion', mediaX, mediaBoxY + mediaBoxH - 13, { width: mediaW, align: 'center' })
    } else {
      doc.save().dash(3, { space: 3 })
      doc.roundedRect(mediaX, mediaBoxY, mediaW, mediaBoxH, 3).strokeColor('#CBD5E1').lineWidth(0.6).stroke()
      doc.restore()
      doc.fillColor('#94A3B8').font('Helvetica-Oblique').fontSize(7.5)
        .text('No certificate or photo\nuploaded for this activity', mediaX + 5, mediaBoxY + (mediaBoxH / 2) - 10, { width: mediaW - 10, align: 'center' })
    }

    currentY += cardH + 16

    drawHodSignatureBlock(doc, hodSignatureBase64, currentY)

    if (activity.workflow_status !== 'Approved') {
      const range = doc.bufferedPageRange()
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i)
        drawWatermark(doc)
      }
    }

    const range = doc.bufferedPageRange()
    const refCode = metadata.refNumber || `WCE/CSE/RPT/${activity.acad_year || '2026-27'}/0007`
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i)
      doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(36, 804).lineTo(559, 804).stroke()
      doc.fillColor('#64748B').font('Helvetica').fontSize(7.5)
      doc.text(`Generated from WCE Prof-Insights · Verify at miniproject-app.onrender.com/verify/${refCode.replace(/\//g, '-')}`, 36, 810, { width: 380 })
      doc.text(`Page ${i + 1} of ${range.count}`, 430, 810, { width: 129, align: 'right' })
    }

    doc.end()
  })
}

// ─────────────────────────────────────────────────────────────
// DOCX REPORT GENERATOR (Ma'am's exact table layout: Sr. No | Event Details | Photo)
// ─────────────────────────────────────────────────────────────
async function generateDocx(records, metadata) {
  await attachMediaToRecords(records)

  const summary = summarize(records)

  const crestPath = [
    path.resolve(__dirname, '../../client/public/wce-logo.png'),
    path.resolve(__dirname, '../../client/src/assets/wce-logo.png')
  ].find(p => fs.existsSync(p))

  const docChildren = []

  // Top Institute Header (Two-column layout matching PDF)
  const headerCells = []
  if (crestPath) {
    try {
      const crestBuffer = fs.readFileSync(crestPath)
      headerCells.push(
        new TableCell({
          width: { size: 1000, type: WidthType.DXA },
          borders: {
            top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new ImageRun({
                  data: crestBuffer,
                  transformation: { width: 52, height: 52 }
                })
              ]
            })
          ]
        })
      )
    } catch {}
  }

  const textCellWidth = headerCells.length > 0 ? 8500 : 9500
  headerCells.push(
    new TableCell({
      width: { size: textCellWidth, type: WidthType.DXA },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
      },
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: 'WALCHAND COLLEGE OF ENGINEERING, SANGLI',
              bold: true,
              size: 26,
              color: BRAND_NAVY,
              font: 'Georgia'
            })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: '(An Autonomous Institute · Government Aided · Established 1947)',
              italics: true,
              size: 16,
              color: '475569'
            })
          ]
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `DEPARTMENT OF ${(metadata.department || 'COMPUTER SCIENCE AND ENGINEERING').toUpperCase()}`,
              bold: true,
              size: 19,
              color: BRAND_GOLD
            })
          ]
        })
      ]
    })
  )

  const istDateStr = metadata.generatedAt.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  const istTimeStr = metadata.generatedAt.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).toLowerCase()

  docChildren.push(
    new Table({
      rows: [new TableRow({ children: headerCells })],
      width: { size: 9500, type: WidthType.DXA }
    }),
    new Paragraph({
      spacing: { before: 80, after: 100 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND_NAVY }
      }
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'Faculty Activity & Contribution Report',
          bold: true,
          size: 28,
          color: BRAND_NAVY,
          font: 'Georgia'
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 140 },
      children: [
        new TextRun({
          text: `${metadata.coverageValue || metadata.department} · Period: ${metadata.period} · Generated ${istDateStr}, ${istTimeStr} IST · Ref: ${metadata.refNumber || 'WCE/CSE/RPT/2026-27/0007'}`,
          size: 16,
          color: '64748B'
        })
      ]
    })
  )

  // 4-Card Stat Strip in DOCX
  const totalActs = records.length
  const approvedCount = records.filter(r => r.workflow_status === 'Approved').length
  const withCertsCount = records.filter(r => (r.attachments || []).some(a => a.mimeType?.startsWith('image/') || a.kind === 'image' || a.kind === 'evidence') || r.reportMedia?.hasMedia).length
  const typesCount = new Set(records.map(r => r.type_name).filter(Boolean)).size

  const statCellWidth = 2375
  const statBoxBorder = {
    top: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
    left: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
    right: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' }
  }

  const statTable = new Table({
    width: { size: 9500, type: WidthType.DXA },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: statCellWidth, type: WidthType.DXA },
            shading: { fill: 'F8FAFC' },
            borders: statBoxBorder,
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(totalActs), bold: true, size: 28, color: BRAND_NAVY })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'ACTIVITIES', bold: true, size: 14, color: '64748B' })] })
            ]
          }),
          new TableCell({
            width: { size: statCellWidth, type: WidthType.DXA },
            shading: { fill: 'F8FAFC' },
            borders: statBoxBorder,
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(approvedCount), bold: true, size: 28, color: '15803D' })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'APPROVED', bold: true, size: 14, color: '64748B' })] })
            ]
          }),
          new TableCell({
            width: { size: statCellWidth, type: WidthType.DXA },
            shading: { fill: 'F8FAFC' },
            borders: statBoxBorder,
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(withCertsCount), bold: true, size: 28, color: '1D4ED8' })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'WITH CERTIFICATES', bold: true, size: 14, color: '64748B' })] })
            ]
          }),
          new TableCell({
            width: { size: statCellWidth, type: WidthType.DXA },
            shading: { fill: 'F8FAFC' },
            borders: statBoxBorder,
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(typesCount), bold: true, size: 28, color: '7E22CE' })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'ACTIVITY TYPES', bold: true, size: 14, color: '64748B' })] })
            ]
          })
        ]
      })
    ]
  })

  docChildren.push(statTable, new Paragraph({ spacing: { before: 160 } }))

  // Activity Cards Table: [Sr. No | Event Details | Photo]
  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({
          width: { size: 850, type: WidthType.DXA },
          shading: { fill: BRAND_NAVY },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: BRAND_NAVY },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND_NAVY },
            left: { style: BorderStyle.SINGLE, size: 4, color: BRAND_NAVY },
            right: { style: BorderStyle.SINGLE, size: 4, color: BRAND_NAVY }
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'Sr. No', bold: true, color: 'FFFFFF', size: 18 })]
            })
          ]
        }),
        new TableCell({
          width: { size: 5850, type: WidthType.DXA },
          shading: { fill: BRAND_NAVY },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: BRAND_NAVY },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND_NAVY },
            left: { style: BorderStyle.SINGLE, size: 4, color: BRAND_NAVY },
            right: { style: BorderStyle.SINGLE, size: 4, color: BRAND_NAVY }
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.LEFT,
              children: [new TextRun({ text: 'Event Details & Formal Narrative', bold: true, color: 'FFFFFF', size: 18 })]
            })
          ]
        }),
        new TableCell({
          width: { size: 2800, type: WidthType.DXA },
          shading: { fill: BRAND_NAVY },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: BRAND_NAVY },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND_NAVY },
            left: { style: BorderStyle.SINGLE, size: 4, color: BRAND_NAVY },
            right: { style: BorderStyle.SINGLE, size: 4, color: BRAND_NAVY }
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'Certificate / Photograph', bold: true, color: 'FFFFFF', size: 18 })]
            })
          ]
        })
      ]
    })
  ]

  records.forEach((record, index) => {
    const narrative = buildActivityNarrative(record)
    const typeColorRaw = getTypeColor(record.type_name)
    const typeColor = typeColorRaw.replace('#', '')

    const rowBorders = {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1' },
      left: { style: BorderStyle.SINGLE, size: 24, color: typeColor },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' }
    }

    // Build Event Details Cell Paragraphs
    const detailsParagraphs = [
      new Paragraph({
        children: [
          new TextRun({
            text: `[${(record.type_name || 'Activity').toUpperCase()}] `,
            bold: true,
            color: typeColor,
            size: 18
          }),
          new TextRun({
            text: `${formatNarrativeDateRange(record)}   `,
            bold: true,
            color: '1E293B',
            size: 18
          }),
          new TextRun({
            text: record.workflow_status === 'Approved' ? '✓ Approved by HOD' : '(Pending Review)',
            bold: true,
            color: record.workflow_status === 'Approved' ? '15803D' : 'B45309',
            size: 16
          })
        ]
      }),
      new Paragraph({
        spacing: { before: 80, after: 100 },
        alignment: AlignmentType.BOTH,
        children: narrative.tokens.map(tok => new TextRun({
          text: tok.text,
          bold: tok.bold,
          color: tok.bold ? BRAND_NAVY : '1E293B',
          size: 19
        }))
      }),
      new Paragraph({
        spacing: { before: 60 },
        children: [
          new TextRun({ text: 'ROLE: ', bold: true, size: 15, color: '64748B' }),
          new TextRun({ text: `${record.faculty_role || 'Participant'}      `, bold: true, size: 16, color: '1E293B' }),
          new TextRun({ text: 'MODE · LEVEL: ', bold: true, size: 15, color: '64748B' }),
          new TextRun({ text: `${[record.mode, record.scope].filter(Boolean).join(' · ')}`, bold: true, size: 16, color: '1E293B' })
        ]
      }),
      new Paragraph({
        spacing: { before: 40 },
        children: [
          new TextRun({ text: 'HOST / ORGANISER: ', bold: true, size: 15, color: '64748B' }),
          new TextRun({ text: `${normalizeHost(record.host_organisation)}      `, bold: true, size: 16, color: '1E293B' }),
          new TextRun({ text: 'VENUE: ', bold: true, size: 15, color: '64748B' }),
          new TextRun({ text: `${record.venue || 'Online Platform'}`, bold: true, size: 16, color: '1E293B' })
        ]
      })
    ]

    // Build Photo Cell Paragraphs
    const photoParagraphs = []
    if (record.reportMedia?.hasMedia && record.reportMedia.mainImage) {
      try {
        photoParagraphs.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: record.reportMedia.mainImage,
                transformation: { width: 170, height: 115 }
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 40 },
            children: [
              new TextRun({
                text: record.reportMedia.caption || 'Certificate of Completion',
                italics: true,
                size: 15,
                color: '64748B'
              })
            ]
          })
        )
      } catch {
        photoParagraphs.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Certificate on file in repository',
                italics: true,
                size: 15,
                color: '64748B'
              })
            ]
          })
        )
      }
    } else {
      photoParagraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: 'No certificate or photo\nuploaded for this activity',
              italics: true,
              size: 15,
              color: '94A3B8'
            })
          ]
        })
      )
    }

    tableRows.push(
      new TableRow({
        children: [
          new TableCell({
            width: { size: 850, type: WidthType.DXA },
            borders: rowBorders,
            shading: { fill: 'F8FAFC' },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: String(index + 1).padStart(2, '0'),
                    bold: true,
                    size: 24,
                    color: typeColor
                  })
                ]
              })
            ]
          }),
          new TableCell({
            width: { size: 5850, type: WidthType.DXA },
            borders: rowBorders,
            children: detailsParagraphs
          }),
          new TableCell({
            width: { size: 2800, type: WidthType.DXA },
            borders: rowBorders,
            shading: { fill: 'FAFAFA' },
            children: photoParagraphs
          })
        ]
      })
    )
  })

  docChildren.push(
    new Table({
      rows: tableRows,
      width: { size: 9500, type: WidthType.DXA }
    }),
    new Paragraph({ spacing: { before: 280 } }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({
          text: '_____________________________________\nHead of Department\n(Dr. A. R. Surve)\nProfessor & Head, CSE\nWalchand College of Engineering, Sangli',
          bold: true,
          size: 18,
          color: BRAND_NAVY
        })
      ]
    })
  )

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, right: 720, bottom: 720, left: 720 }
        }
      },
      children: docChildren
    }]
  })

  return Packer.toBuffer(doc)
}

// ─────────────────────────────────────────────────────────────
// APPRECIATION LETTER PDF GENERATOR (WITH HOD DIGITAL SIGNATURE)
// ─────────────────────────────────────────────────────────────
function buildAppreciationBody(activity) {
  const name = formatFacultyNameWithSalutation(activity)
  const type = (activity.type_name || 'activity').toLowerCase()
  const title = activity.title || 'the activity'
  const role = String(activity.faculty_role || '').toLowerCase()
  const scope = String(activity.scope || '').toLowerCase()
  const dept = activity.department || 'Computer Science and Engineering'
  const mode = String(activity.mode || '').toLowerCase()
  const dateRange = formatNarrativeDateRange(activity)
  const participants = activity.participant_count
  const host = normalizeHost(activity.host_organisation)
  const outcomes = activity.outcomes

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

  let scopePhrase = 'at the institute level'
  if (scope.includes('international')) scopePhrase = 'at the international level'
  else if (scope.includes('national')) scopePhrase = 'at the national level'
  else if (scope.includes('state')) scopePhrase = 'at the state level'
  else if (scope.includes('university') || scope.includes('inter-college')) scopePhrase = 'at the university/inter-college level'

  const hostPhrase = host && !host.toLowerCase().includes('walchand')
    ? ` organised by / at ${host}`
    : ''

  const modePhrase = mode && mode !== 'offline'
    ? ` (conducted in ${mode} mode)`
    : ''

  let outcomesSentence = ''
  if (outcomes && outcomes.trim().length > 10) {
    outcomesSentence = ` The outcomes of this engagement were particularly noteworthy: ${outcomes.trim().endsWith('.') ? outcomes.trim() : outcomes.trim() + '.'}`
  }

  let participantsSentence = ''
  if (participants && Number(participants) > 0) {
    participantsSentence = ` The activity benefited ${participants} participants, directly contributing to the enrichment of our academic community.`
  }

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

async function generateAppreciationLetterPdf(activity, generatedBy, customSignature = null) {
  const letterData = activity.details?.appreciation_letter || {}
  const hodSignatureBase64 = customSignature || letterData.custom_signature || activity.custom_signature || await fetchHodSignature(activity.department)

  const autoText = buildAppreciationBody(activity)
  const opening = activity.custom_opening || letterData.custom_opening || autoText.opening
  const body = activity.custom_body || letterData.custom_body || autoText.body
  const closing = activity.custom_closing || letterData.custom_closing || autoText.closing
  const reviewerName = activity.custom_reviewer_name || letterData.issued_by_name || activity.reviewer_name || 'Dr. A. R. Surve'
  const reviewerTitle = activity.custom_reviewer_title || letterData.issued_by_title || 'Head of Department'

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

    // Ribbon Banner
    doc.roundedRect(118, 122, 360, 34, 4).fillAndStroke('#FFFBEB', `#${BRAND_GOLD}`)
    doc.fillColor(`#${BRAND_NAVY}`).font('Helvetica-Bold').fontSize(16)
      .text('LETTER OF APPRECIATION', 118, 130, { width: 360, align: 'center', characterSpacing: 1.8 })

    // Recipient Section
    doc.fillColor('#64748B').font('Helvetica-Oblique').fontSize(9.5)
      .text('This letter of appreciation is proudly presented to', 38, 170, { align: 'center', width: 519 })
    doc.fillColor(`#${BRAND_NAVY}`).font('Helvetica-Bold').fontSize(20)
      .text(formatFacultyNameWithSalutation(activity), 38, 184, { align: 'center', width: 519 })

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
    doc.font('Helvetica').text(formatNarrativeDateRange(activity), 165, dY, { width: 375 })

    doc.font('Helvetica-Bold').text('MODE & SCOPE:', 56, dY + 16)
    doc.font('Helvetica').text([activity.mode, activity.scope ? `${activity.scope} Level` : null].filter(Boolean).join(' · ') || 'Institute Level', 165, dY + 16, { width: 375 })

    doc.font('Helvetica-Bold').text('HOST / ORGANISER:', 56, dY + 32)
    doc.font('Helvetica').text(normalizeHost(activity.host_organisation) + (activity.venue ? ` · ${activity.venue}` : ''), 165, dY + 32, { width: 375 })

    if (activity.participant_count) {
      doc.font('Helvetica-Bold').text('BENEFICIARIES:', 56, dY + 48)
      doc.font('Helvetica').text(`${activity.participant_count} Registered Participants / Beneficiaries`, 165, dY + 48, { width: 375 })
    }

    if (activity.summary) {
      const sumLine = dY + (activity.participant_count ? 64 : 48)
      doc.font('Helvetica-Bold').text('KEY HIGHLIGHT:', 56, sumLine)
      doc.font('Helvetica').text(activity.summary.slice(0, 160) + (activity.summary.length > 160 ? '…' : ''), 165, sumLine, { width: 375 })
    }

    const bodyY = cardY + cardH + 14
    doc.fillColor('#1E293B').font('Helvetica').fontSize(9.8)
      .text(body, 48, bodyY, { align: 'justify', width: 499, lineGap: 3 })

    const closingY = doc.y + 10
    doc.fillColor('#1E293B').font('Helvetica').fontSize(9.8)
      .text(closing, 48, closingY, { align: 'justify', width: 499, lineGap: 3 })

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

      doc.fillColor('#14284b').font('Helvetica-Bold').fontSize(11)
        .text('WALCHAND COLLEGE OF ENGINEERING, SANGLI (AUTONOMOUS INSTITUTE)', startX + 46, 28)
      doc.fillColor('#64748B').font('Helvetica').fontSize(8)
        .text('Department of Computer Science & Engineering · Academic Performance & Verification Register', startX + 46, 42)

      doc.fillColor('#b7791f').font('Helvetica-Bold').fontSize(13)
        .text(`CONSOLIDATED REPORT ON: ${typeTitle}`, startX + 46, 54)

      doc.fillColor('#334155').font('Helvetica').fontSize(8.5)
        .text(`Period: ${metadata.period}   |   ${metadata.coverageLabel}: ${metadata.coverageValue}   |   Generated: ${new Date().toLocaleDateString('en-IN')}`, startX + 46, 70)

      doc.strokeColor('#b7791f').lineWidth(1.5).moveTo(startX, 86).lineTo(startX + totalTableWidth, 86).stroke()
      doc.y = 92
    }

    const drawTableHeader = () => {
      const headerY = doc.y
      doc.rect(startX, headerY, totalTableWidth, 22).fill('#14284b')

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

      doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(startX, rowY + rowHeight).lineTo(startX + totalTableWidth, rowY + rowHeight).stroke()
      doc.y = rowY + rowHeight
    })

    if (doc.y + 70 > 540) {
      doc.addPage()
      drawPageHeader()
    }

    doc.moveDown(1.2)
    const signY = doc.y + 10
    doc.strokeColor('#CBD5E1').lineWidth(0.8).moveTo(startX, signY).lineTo(startX + totalTableWidth, signY).stroke()

    doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8.5)
      .text('Compiled & Verified By:', startX, signY + 12)
    doc.font('Helvetica').fontSize(8)
      .text(`${metadata.generatedBy} (${metadata.coverageLabel})`, startX, signY + 24)
      .text('WCE Prof-Insights Academic Repository', startX, signY + 36)

    doc.font('Helvetica-Bold').fontSize(8.5)
      .text('Approved & Endorsed By:', startX + 530, signY + 12)
    doc.fillColor('#14284b').font('Helvetica-Bold').fontSize(9)
      .text('Dr. A. R. Surve', startX + 530, signY + 24)
    doc.fillColor('#475569').font('Helvetica').fontSize(8)
      .text('Head of Department', startX + 530, signY + 36)
      .text('Department of Computer Science & Engineering', startX + 530, signY + 47)

    doc.end()
  })
}

module.exports = {
  buildReportMetadata,
  formatNarrativeDateRange,
  formatFacultyNameWithSalutation,
  buildActivityNarrative,
  generateCsv,
  generatePdf,
  generateDocx,
  generateActivitySummaryPdf,
  generateAppreciationLetterPdf,
  generateActivitySpecificPdf,
  ACTIVITY_TYPE_COLORS,
  getTypeColor
}
