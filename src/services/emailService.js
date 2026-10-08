'use strict'
const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

const FROM = process.env.SMTP_FROM || `"WCE Prof-Insights" <${process.env.SMTP_USER}>`

/**
 * Send an HTML email. Silently logs errors — never throws, so it never
 * breaks the main request flow.
 */
async function sendEmail({ to, subject, html, text }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[emailService] SMTP not configured — skipping email to', to)
    return
  }
  try {
    await transporter.sendMail({ from: FROM, to, subject, html, text })
    console.log('[emailService] Email sent to', to, '|', subject)
  } catch (err) {
    console.error('[emailService] Failed to send email to', to, ':', err.message)
  }
}

// ── Branded HTML email template ───────────────────────────────────────────────
function buildHtml({ title, greeting, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10)">
  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#1a365d 0%,#2a4d8f 100%);padding:28px 36px">
      <div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:0.5px">&#127891; WCE Prof-Insights</div>
      <div style="color:#90b4d8;font-size:12px;margin-top:4px">Walchand College of Engineering, Sangli &mdash; Academic Activity Portal</div>
    </td>
  </tr>
  <!-- Body -->
  <tr>
    <td style="padding:32px 36px">
      <h2 style="color:#1a365d;font-size:20px;margin:0 0 20px;font-family:Arial,sans-serif">${title}</h2>
      <p style="color:#475569;font-size:15px;margin:0 0 16px;line-height:1.6">${greeting}</p>
      ${bodyHtml}
    </td>
  </tr>
  <!-- Footer -->
  <tr>
    <td style="background:#f8fafc;padding:18px 36px;border-top:1px solid #e2e8f0;text-align:center">
      <p style="color:#94a3b8;font-size:11px;margin:0;line-height:1.6">
        This is an automated notification from WCE Prof-Insights &bull; Department of Computer Science and Engineering &bull; Walchand College of Engineering, Sangli.
      </p>
      <p style="color:#94a3b8;font-size:11px;margin:6px 0 0">Please do not reply to this email.</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

// ── Specific email senders ────────────────────────────────────────────────────

/**
 * Notify faculty/club: their activity was APPROVED by HOD
 */
async function sendActivityApprovedEmail({ to, facultyName, activityTitle, reviewerName, reviewerComment }) {
  const subject = `Activity Approved — ${activityTitle}`
  const bodyHtml = `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0">
      <div style="color:#166534;font-weight:700;font-size:16px">&#10003; Your activity has been Approved!</div>
      <div style="color:#15803d;font-size:13px;margin-top:4px">Activity: <strong>${activityTitle}</strong></div>
    </div>
    <p style="color:#374151;font-size:14px;line-height:1.7">
      Your submitted activity <strong>&ldquo;${activityTitle}&rdquo;</strong> has been reviewed and <strong>officially approved</strong> by
      <strong>${reviewerName}</strong>, Head of Department, Department of Computer Science and Engineering,
      Walchand College of Engineering, Sangli.
    </p>
    ${reviewerComment ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;margin:12px 0">
      <div style="color:#1e40af;font-weight:700;font-size:13px;margin-bottom:6px">HOD&rsquo;s Comment:</div>
      <div style="color:#1e3a8a;font-size:13px;line-height:1.6">${reviewerComment}</div>
    </div>` : ''}
    <p style="color:#374151;font-size:14px;line-height:1.7">
      Please log in to <strong>WCE Prof-Insights</strong> to view the full status and download your approved activity records.
      Your HOD may also issue an official <strong>Letter of Appreciation</strong> &mdash; you will be notified separately when that is ready.
    </p>
    <a href="https://miniproject-app.onrender.com" style="display:inline-block;background:linear-gradient(135deg,#15803d,#16a34a);color:#ffffff;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;margin:8px 0">View in Portal &rarr;</a>`
  const text = `Your activity "${activityTitle}" has been APPROVED by ${reviewerName}.${reviewerComment ? ' HOD Comment: ' + reviewerComment : ''} Login at https://miniproject-app.onrender.com`
  await sendEmail({
    to,
    subject,
    html: buildHtml({ title: 'Activity Approved', greeting: `Dear ${facultyName},`, bodyHtml }),
    text
  })
}

/**
 * Notify faculty/club: HOD requested changes
 */
async function sendChangesRequestedEmail({ to, facultyName, activityTitle, reviewerName, reviewerComment }) {
  const subject = `Changes Requested — ${activityTitle}`
  const bodyHtml = `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0">
      <div style="color:#b45309;font-weight:700;font-size:16px">&#8635; Changes Requested for Your Activity</div>
      <div style="color:#92400e;font-size:13px;margin-top:4px">Activity: <strong>${activityTitle}</strong></div>
    </div>
    <p style="color:#374151;font-size:14px;line-height:1.7">
      <strong>${reviewerName}</strong>, Head of Department, has reviewed your activity <strong>&ldquo;${activityTitle}&rdquo;</strong>
      and has requested some changes before it can be approved.
    </p>
    <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;padding:14px;margin:12px 0">
      <div style="color:#92400e;font-weight:700;font-size:13px;margin-bottom:6px">HOD&rsquo;s Feedback / Changes Required:</div>
      <div style="color:#78350f;font-size:14px;line-height:1.7">${reviewerComment || 'Please check the portal for detailed feedback.'}</div>
    </div>
    <p style="color:#374151;font-size:14px;line-height:1.7">
      Please log in to <strong>WCE Prof-Insights</strong>, update your activity based on the feedback above, and re-submit for review.
    </p>
    <a href="https://miniproject-app.onrender.com" style="display:inline-block;background:linear-gradient(135deg,#b45309,#d97706);color:#ffffff;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;margin:8px 0">Update Activity &rarr;</a>`
  const text = `Changes have been requested for your activity "${activityTitle}". HOD Feedback: ${reviewerComment} Login at https://miniproject-app.onrender.com`
  await sendEmail({
    to,
    subject,
    html: buildHtml({ title: 'Changes Requested', greeting: `Dear ${facultyName},`, bodyHtml }),
    text
  })
}

/**
 * Notify faculty/club: Appreciation Letter officially issued by HOD
 */
async function sendAppreciationLetterEmail({ to, facultyName, activityTitle, hodName, issuedDate }) {
  const subject = `Official Letter of Appreciation — ${activityTitle}`
  const bodyHtml = `
    <div style="background:linear-gradient(135deg,#fef9c3,#fde68a);border:1px solid #f59e0b;border-radius:8px;padding:20px 16px;margin:16px 0;text-align:center">
      <div style="font-size:36px;margin-bottom:8px">&#127885;</div>
      <div style="color:#78350f;font-weight:800;font-size:18px">Official Letter of Appreciation</div>
      <div style="color:#92400e;font-size:13px;margin-top:4px">Walchand College of Engineering, Sangli</div>
    </div>
    <p style="color:#374151;font-size:14px;line-height:1.7">
      Congratulations! <strong>${hodName}</strong>, Head of Department, Department of Computer Science and Engineering,
      Walchand College of Engineering, Sangli, has officially issued you a <strong>Letter of Appreciation</strong>
      in recognition of your outstanding contribution to:
    </p>
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px;margin:12px 0;text-align:center">
      <div style="color:#166534;font-weight:700;font-size:16px">&ldquo;${activityTitle}&rdquo;</div>
      <div style="color:#15803d;font-size:12px;margin-top:4px">Issued on: ${issuedDate}</div>
    </div>
    <p style="color:#374151;font-size:14px;line-height:1.7">
      Your dedication and hard work have been officially recognised and placed on record by the Department.
      You can now log in to <strong>WCE Prof-Insights</strong> to view and <strong>download your official Letter of Appreciation</strong> as a PDF.
    </p>
    <a href="https://miniproject-app.onrender.com" style="display:inline-block;background:linear-gradient(135deg,#1a365d,#2a4d8f);color:#ffffff;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;margin:8px 0">View &amp; Download Letter &rarr;</a>`
  const text = `Congratulations! Your Letter of Appreciation for "${activityTitle}" has been officially issued by ${hodName} on ${issuedDate}. Login at https://miniproject-app.onrender.com to view and download it.`
  await sendEmail({
    to,
    subject,
    html: buildHtml({ title: 'Letter of Appreciation Awarded', greeting: `Dear ${facultyName},`, bodyHtml }),
    text
  })
}

/**
 * Notify HOD: a faculty/club member has submitted a new activity for review
 */
async function sendNewSubmissionEmailToHod({ to, hodName, facultyName, activityTitle, activityType, submittedAt }) {
  const subject = `New Activity Awaiting Review — ${activityTitle}`
  const bodyHtml = `
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:16px 0">
      <div style="color:#1e40af;font-weight:700;font-size:16px">&#128203; New Activity Submitted for Review</div>
    </div>
    <p style="color:#374151;font-size:14px;line-height:1.7">
      <strong>${facultyName}</strong> has submitted a new activity for your review and approval.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
      <tr style="background:#f8fafc">
        <td style="padding:10px 14px;font-weight:700;color:#475569;border:1px solid #e2e8f0;width:40%">Activity Title</td>
        <td style="padding:10px 14px;color:#0f172a;border:1px solid #e2e8f0">${activityTitle}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;font-weight:700;color:#475569;border:1px solid #e2e8f0">Type</td>
        <td style="padding:10px 14px;color:#0f172a;border:1px solid #e2e8f0">${activityType || 'N/A'}</td>
      </tr>
      <tr style="background:#f8fafc">
        <td style="padding:10px 14px;font-weight:700;color:#475569;border:1px solid #e2e8f0">Submitted By</td>
        <td style="padding:10px 14px;color:#0f172a;border:1px solid #e2e8f0">${facultyName}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;font-weight:700;color:#475569;border:1px solid #e2e8f0">Submitted At</td>
        <td style="padding:10px 14px;color:#0f172a;border:1px solid #e2e8f0">${submittedAt}</td>
      </tr>
    </table>
    <p style="color:#374151;font-size:14px;line-height:1.7">Please log in to <strong>WCE Prof-Insights</strong> to review this submission and take action.</p>
    <a href="https://miniproject-app.onrender.com" style="display:inline-block;background:linear-gradient(135deg,#1a365d,#2a4d8f);color:#ffffff;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;margin:8px 0">Review Now &rarr;</a>`
  const text = `${facultyName} submitted "${activityTitle}" (${activityType || 'N/A'}) for review at ${submittedAt}. Login at https://miniproject-app.onrender.com`
  await sendEmail({
    to,
    subject,
    html: buildHtml({ title: 'New Activity Submission', greeting: `Dear ${hodName},`, bodyHtml }),
    text
  })
}

/**
 * Notify HOD: faculty resubmitted after "Changes Requested"
 */
async function sendResubmissionEmailToHod({ to, hodName, facultyName, activityTitle }) {
  const subject = `Activity Resubmitted — ${activityTitle}`
  const bodyHtml = `
    <p style="color:#374151;font-size:14px;line-height:1.7">
      <strong>${facultyName}</strong> has made the requested changes and resubmitted the activity
      <strong>&ldquo;${activityTitle}&rdquo;</strong> for your review and approval.
    </p>
    <a href="https://miniproject-app.onrender.com" style="display:inline-block;background:linear-gradient(135deg,#1a365d,#2a4d8f);color:#ffffff;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;margin:8px 0">Review Again &rarr;</a>`
  const text = `${facultyName} has resubmitted "${activityTitle}" after making requested changes. Login at https://miniproject-app.onrender.com`
  await sendEmail({
    to,
    subject,
    html: buildHtml({ title: 'Activity Resubmitted for Review', greeting: `Dear ${hodName},`, bodyHtml }),
    text
  })
}

module.exports = {
  sendEmail,
  sendActivityApprovedEmail,
  sendChangesRequestedEmail,
  sendAppreciationLetterEmail,
  sendNewSubmissionEmailToHod,
  sendResubmissionEmailToHod
}
