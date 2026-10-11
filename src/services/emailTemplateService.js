'use strict'

/**
 * Escapes unsafe characters for HTML to prevent injection attacks.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Strips carriage returns and newlines from text to prevent header injection.
 * @param {string} str
 * @returns {string}
 */
function sanitizeHeader(str) {
  if (!str) return ''
  return String(str).replace(/[\r\n]+/g, ' ').trim()
}

/**
 * Returns tailored, authentic contextual sentences based on the achievement type.
 * Uses only categories that genuinely exist in the project catalog.
 * @param {object} activity
 * @returns {string}
 */
function getCategorySpecificNarrative(activity) {
  const typeName = String(activity.type_name || activity.typeName || '').trim()
  const lower = typeName.toLowerCase()

  if (lower.includes('research publication') || lower.includes('book')) {
    return 'Your scholarly publication and academic research contribute meaningfully to the advancement of knowledge in your field.'
  }
  if (lower.includes('grant') || lower.includes('project')) {
    return 'Securing and leading this research grant reflects notable research excellence and institutional initiative.'
  }
  if (lower.includes('patent') || lower.includes('innovation')) {
    return 'Your innovative patent work reflects exceptional ingenuity and intellectual achievement.'
  }
  if (lower.includes('achievement') || lower.includes('award') || lower.includes('recognition')) {
    return 'Receiving this distinguished recognition brings honor and pride to our academic community.'
  }
  if (lower.includes('conference') || lower.includes('seminar') || lower.includes('webinar') || lower.includes('workshop') || lower.includes('fdp')) {
    return 'Your scholarly engagement and contribution demonstrate ongoing dedication to professional academic excellence and knowledge dissemination.'
  }
  if (lower.includes('guest lecture')) {
    return 'Your insightful guest session shares valuable domain expertise and academic leadership.'
  }
  if (lower.includes('value-added') || lower.includes('course') || lower.includes('student development') || lower.includes('cep')) {
    return 'Your educational contribution significantly enriches the student learning experience and institutional curriculum.'
  }
  if (lower.includes('consultancy') || lower.includes('training') || lower.includes('mou') || lower.includes('partnership')) {
    return 'Your collaborative industry engagement strengthens institutional ties and real-world technology application.'
  }

  return 'Your dedicated contribution reflects your commitment to academic excellence and institutional development.'
}

/**
 * Builds the personalized appreciation email content (Subject, Plain Text, and Responsive HTML).
 * @param {object} params
 * @param {string} params.facultyName
 * @param {object} params.activity
 * @param {string} [params.reviewerName]
 * @param {string} [params.issuedDate]
 * @returns {{ subject: string, text: string, html: string }}
 */
function buildPersonalizedAppreciationEmail({ facultyName, activity, reviewerName, issuedDate }) {
  const safeFacultyName = escapeHtml(facultyName || activity.staff_name || 'Faculty Member')
  const rawTitle = activity.title || 'Academic Achievement'
  const safeTitle = escapeHtml(rawTitle)
  const categoryNarrative = getCategorySpecificNarrative(activity)
  const safeTypeName = escapeHtml(activity.type_name || activity.typeName || 'Academic Activity')
  const safeReviewer = escapeHtml(reviewerName || activity.reviewer_name || 'Head of Department')
  const safeDate = escapeHtml(issuedDate || (activity.reviewed_at ? new Date(activity.reviewed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'recently'))

  // Optional concise summary snippet if provided by faculty
  const summarySnippet = activity.summary && typeof activity.summary === 'string'
    ? escapeHtml(activity.summary.trim().slice(0, 220))
    : ''

  const subject = sanitizeHeader(`Letter of Appreciation – ${rawTitle}`)

  // Plain-text version
  const text = [
    `Dear ${facultyName || 'Faculty Member'},`,
    '',
    `Congratulations on your achievement in "${rawTitle}"!`,
    '',
    categoryNarrative,
    summarySnippet ? `Summary: ${activity.summary.trim().slice(0, 220)}` : '',
    '',
    'Your efforts are appreciated and contribute positively to our institution.',
    'Please find attached your official HOD-approved and signed Letter of Appreciation in PDF format.',
    '',
    'We wish you continued success in your future endeavours.',
    '',
    'Warm regards,',
    'College Administration',
    'Department of Computer Science and Engineering',
    'Walchand College of Engineering, Sangli'
  ].filter(Boolean).join('\n')

  // Responsive, institutional HTML email
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 32px 12px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a365d 0%, #2a4d8f 100%); padding: 28px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="color: #ffffff; font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">WCE Prof-Insights</div>
                    <div style="color: #90b4d8; font-size: 12px; margin-top: 4px;">Walchand College of Engineering, Sangli · Academic Activity Portal</div>
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    <span style="display: inline-block; background-color: rgba(255, 255, 255, 0.15); color: #fde68a; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Official Letter
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 36px 36px 24px 36px;">
              <p style="font-size: 16px; margin: 0 0 16px 0; color: #1e293b;">Dear <strong>${safeFacultyName}</strong>,</p>

              <div style="background: linear-gradient(135deg, #fef9c3 0%, #fef08a 100%); border: 1px solid #fde047; border-radius: 8px; padding: 18px 20px; margin: 0 0 20px 0;">
                <div style="color: #854d0e; font-size: 15px; font-weight: 700;">Congratulations on your achievement!</div>
                <div style="color: #713f12; font-size: 14px; margin-top: 4px; line-height: 1.5;">
                  <strong>${safeTitle}</strong>
                </div>
                <div style="color: #a16207; font-size: 12px; margin-top: 6px;">
                  Category: <em>${safeTypeName}</em>
                </div>
              </div>

              <p style="font-size: 14px; line-height: 1.7; color: #334155; margin: 0 0 14px 0;">
                ${escapeHtml(categoryNarrative)}
              </p>

              ${summarySnippet ? `
              <div style="background-color: #f8fafc; border-left: 3px solid #2a4d8f; padding: 12px 16px; margin: 0 0 18px 0; font-size: 13px; color: #475569; line-height: 1.6;">
                <strong>Contribution Detail:</strong> ${summarySnippet}
              </div>` : ''}

              <p style="font-size: 14px; line-height: 1.7; color: #334155; margin: 0 0 18px 0;">
                Your dedication and hard work have been officially reviewed and approved by <strong>${safeReviewer}</strong>, Head of Department. Your efforts are sincerely appreciated and contribute positively to our institution.
              </p>

              <!-- PDF Attachment Notice Box -->
              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 18px; margin: 0 0 22px 0;">
                <table cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td width="32" style="vertical-align: middle; font-size: 22px;">📎</td>
                    <td style="vertical-align: middle;">
                      <div style="color: #166534; font-size: 13.5px; font-weight: 700;">Signed Letter of Appreciation Attached</div>
                      <div style="color: #15803d; font-size: 12px; margin-top: 2px;">
                        Your official HOD-approved and digitally signed Letter of Appreciation is attached as a PDF file (<strong>Appreciation_Letter.pdf</strong>).
                      </div>
                    </td>
                  </tr>
                </table>
              </div>

              <p style="font-size: 14px; line-height: 1.7; color: #334155; margin: 0 0 24px 0;">
                We wish you continued success in your future endeavours.
              </p>

              <!-- Sign-off -->
              <div style="border-top: 1px solid #e2e8f0; padding-top: 18px; margin-top: 24px;">
                <p style="font-size: 14px; color: #1e293b; margin: 0 0 4px 0; font-weight: 600;">Warm regards,</p>
                <p style="font-size: 13px; color: #475569; margin: 0; line-height: 1.5;">
                  <strong>College Administration</strong><br>
                  Department of Computer Science and Engineering<br>
                  Walchand College of Engineering, Sangli
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 16px 36px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="color: #94a3b8; font-size: 11px; margin: 0; line-height: 1.5;">
                This is an automated delivery from WCE Prof-Insights Academic Repository · Issued on ${safeDate}.<br>
                You may also view and download your appreciation letter directly from the portal at any time.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, text, html }
}

module.exports = {
  escapeHtml,
  sanitizeHeader,
  getCategorySpecificNarrative,
  buildPersonalizedAppreciationEmail
}
