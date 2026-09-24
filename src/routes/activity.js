const router = require('express').Router()
const pool = require('../db/pool')
const { isLoggedIn } = require('../middleware/auth')
const {
  catalog,
  editableStatuses,
  normalizeActivityPayload,
  validateActivity
} = require('../domain/activity')
const {
  listActivities,
  getActivityById,
  canAccessActivity
} = require('../services/activityService')
const { generateActivitySummaryPdf } = require('../services/reportService')

router.use(isLoggedIn)

const insertAudit = (client, activityId, actorId, action, fromStatus, toStatus, note, snapshot = null) => (
  client.query(
    `INSERT INTO activity_audit
       (activity_id, actor_id, action, from_status, to_status, note, snapshot)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [activityId, actorId, action, fromStatus, toStatus, note || null, snapshot ? JSON.stringify(snapshot) : null]
  )
)

async function insertAttachments(client, activityId, userId, attachments) {
  for (const file of attachments) {
    await client.query(
      `INSERT INTO activity_attachment
         (activity_id, kind, file_name, mime_type, size_bytes, data, sha256, caption, sort_order, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        activityId,
        file.kind,
        file.fileName,
        file.mimeType,
        file.sizeBytes,
        file.data,
        file.sha256,
        file.caption,
        file.sortOrder,
        userId
      ]
    )
  }
}

async function replaceGuests(client, activityId, guests) {
  await client.query('DELETE FROM activity_guest WHERE activity_id = $1', [activityId])
  for (const guest of guests) {
    await client.query(
      `INSERT INTO activity_guest
         (activity_id, name, designation, organisation, country, guest_role, guest_type, email, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        activityId,
        guest.name,
        guest.designation,
        guest.organisation,
        guest.country,
        guest.guestRole,
        guest.guestType,
        guest.email,
        guest.phone
      ]
    )
  }
}

async function findTypeId(client, typeName) {
  if (!typeName) return null

  // 1. Exact match
  let result = await client.query(
    'SELECT type_id FROM type WHERE name = $1 AND is_active = TRUE',
    [typeName]
  )
  if (result.rows[0]?.type_id) return result.rows[0].type_id

  // 2. Base alias match (e.g. "Workshop (Attended)" -> "Workshop")
  const baseName = typeName.replace(/\s*\([^)]*\)/g, '').trim()
  if (baseName && baseName !== typeName) {
    result = await client.query(
      'SELECT type_id FROM type WHERE name = $1 AND is_active = TRUE',
      [baseName]
    )
    if (result.rows[0]?.type_id) return result.rows[0].type_id
  }

  // 3. Dynamic insertion if active type exists in catalog
  try {
    const inserted = await client.query(
      `INSERT INTO type (name, group_name, is_active, sort_order)
       VALUES ($1, 'Faculty Activities', TRUE, 50)
       ON CONFLICT (name) DO UPDATE SET is_active = TRUE
       RETURNING type_id`,
      [typeName]
    )
    if (inserted.rows[0]?.type_id) return inserted.rows[0].type_id
  } catch (err) {
    // ignore conflict
  }

  return null
}

async function duplicateExists(client, activity, userId, excludingId = null) {
  if (!activity.title || !activity.startDate || !activity.typeName) return false
  const result = await client.query(
    `SELECT a.act_id
     FROM activity a
     JOIN type t ON t.type_id = a.type_id
     WHERE a.staff_id = $1
       AND LOWER(a.title) = LOWER($2)
       AND a.start_date = $3
       AND t.name = $4
       AND a.deleted_at IS NULL
       AND ($5::int IS NULL OR a.act_id <> $5)
     LIMIT 1`,
    [userId, activity.title, activity.startDate, activity.typeName, excludingId]
  )
  return result.rowCount > 0
}

router.get('/catalog', async (req, res) => {
  const result = await pool.query(
    `SELECT type_id, name, group_name, sort_order
     FROM type
     WHERE is_active = TRUE
     ORDER BY sort_order, name`
  )
  return res.json({ ...catalog, databaseTypes: result.rows })
})

router.get('/types', async (req, res) => {
  const result = await pool.query(
    `SELECT type_id, name, group_name, sort_order
     FROM type
     WHERE is_active = TRUE
     ORDER BY sort_order, name`
  )
  return res.json(result.rows)
})

router.get('/history', async (req, res) => {
  try {
    const result = await listActivities(req.user, req.query)
    return res.json(result)
  } catch (error) {
    console.error('Activity history error:', error)
    return res.status(500).json({ error: 'Unable to load activity records.' })
  }
})

router.get('/:activityId', async (req, res) => {
  try {
    const activity = await getActivityById(req.params.activityId)
    if (!activity) return res.status(404).json({ error: 'Activity not found.' })
    if (!canAccessActivity(req.user, activity)) {
      return res.status(403).json({ error: 'You do not have access to this activity.' })
    }
    return res.json({ activity })
  } catch (error) {
    console.error('Activity detail error:', error)
    return res.status(500).json({ error: 'Unable to load this activity.' })
  }
})

router.post('/', async (req, res) => {
  const saveAsDraft = req.body.saveAsDraft === true
  const targetStatus = saveAsDraft ? 'Draft' : 'Submitted'
  const activity = normalizeActivityPayload(req.body, req.user, targetStatus)
  const errors = validateActivity(activity, { draft: saveAsDraft })

  if (errors.length) return res.status(400).json({ error: errors[0], errors })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const typeId = await findTypeId(client, activity.typeName)
    if (!typeId) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'The selected activity type is not available.' })
    }

    if (!saveAsDraft && !activity.confirmDuplicate && await duplicateExists(client, activity, req.user.id)) {
      await client.query('ROLLBACK')
      return res.status(409).json({
        error: 'A similar activity already exists for this date. Review your records before submitting another copy.',
        code: 'POSSIBLE_DUPLICATE'
      })
    }

    const result = await client.query(
      `INSERT INTO activity (
         staff_id, type_id, mode, acad_year, start_date, end_date, role,
         event_time, start_time, end_time, approved, title, department, scope,
         host_organisation, venue, activity_status, workflow_status,
         participant_count, summary, outcomes, evidence_availability,
         evidence_note, official_url, details, submitted_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, FALSE, $11, $12, $13,
         $14, $15, $16, $17,
         $18, $19, $20, $21,
         $22, $23, $24::jsonb, $25
       ) RETURNING act_id`,
      [
        req.user.id,
        typeId,
        activity.mode,
        activity.academicYear,
        activity.startDate,
        activity.endDate || activity.startDate,
        activity.facultyRole,
        activity.startTime && activity.endTime ? `${activity.startTime} to ${activity.endTime}` : activity.startTime || activity.endTime,
        activity.startTime,
        activity.endTime,
        activity.title || 'Untitled draft',
        activity.department,
        activity.scope,
        activity.hostOrganisation,
        activity.venue,
        activity.activityStatus,
        targetStatus,
        activity.participantCount,
        activity.summary,
        activity.outcomes,
        activity.evidenceAvailability,
        activity.evidenceNote,
        activity.officialUrl,
        JSON.stringify(activity.details),
        saveAsDraft ? null : new Date()
      ]
    )

    const activityId = result.rows[0].act_id
    await replaceGuests(client, activityId, activity.guests)
    await insertAttachments(client, activityId, req.user.id, activity.attachments)
    await insertAudit(
      client,
      activityId,
      req.user.id,
      saveAsDraft ? 'Created draft' : 'Submitted',
      null,
      targetStatus,
      null,
      { title: activity.title, typeName: activity.typeName }
    )
    await client.query('COMMIT')

    return res.status(201).json({ activity: await getActivityById(activityId) })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Activity create error:', error)
    return res.status(500).json({ error: 'Unable to save the activity.' })
  } finally {
    client.release()
  }
})

router.put('/:activityId', async (req, res) => {
  const activityId = Number(req.params.activityId)
  const existing = await getActivityById(activityId)
  if (!existing) return res.status(404).json({ error: 'Activity not found.' })
  if (Number(existing.staff_id) !== Number(req.user.id)) {
    return res.status(403).json({ error: 'Only the submitting faculty member can edit this activity.' })
  }
  if (!editableStatuses.has(existing.workflow_status)) {
    return res.status(409).json({ error: 'Approved or archived activities cannot be edited. Ask the reviewer to return it for correction.' })
  }
  if (req.body.version && Number(req.body.version) !== Number(existing.version)) {
    return res.status(409).json({ error: 'This activity changed after you opened it. Refresh and try again.', code: 'VERSION_CONFLICT' })
  }

  const saveAsDraft = req.body.saveAsDraft === true
  const targetStatus = saveAsDraft ? 'Draft' : 'Submitted'
  const activity = normalizeActivityPayload(req.body, req.user, targetStatus)
  const removeAttachmentIds = Array.isArray(req.body.removeAttachmentIds)
    ? req.body.removeAttachmentIds.map(Number).filter(Number.isInteger)
    : []
  const removedIds = new Set(removeAttachmentIds)
  const existingAttachmentCount = (existing.attachments || [])
    .filter((attachment) => !removedIds.has(Number(attachment.id)))
    .length
  const errors = validateActivity(activity, { draft: saveAsDraft, existingAttachmentCount })
  if (errors.length) return res.status(400).json({ error: errors[0], errors })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const typeId = await findTypeId(client, activity.typeName)
    if (!typeId) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'The selected activity type is not available.' })
    }

    if (!saveAsDraft && !activity.confirmDuplicate && await duplicateExists(client, activity, req.user.id, activityId)) {
      await client.query('ROLLBACK')
      return res.status(409).json({
        error: 'A similar activity already exists for this date.',
        code: 'POSSIBLE_DUPLICATE'
      })
    }

    await client.query(
      `UPDATE activity SET
         type_id = $1,
         mode = $2,
         acad_year = $3,
         start_date = $4,
         end_date = $5,
         role = $6,
         event_time = $7,
         start_time = $8,
         end_time = $9,
         title = $10,
         department = $11,
         scope = $12,
         host_organisation = $13,
         venue = $14,
         activity_status = $15,
         workflow_status = $16,
         participant_count = $17,
         summary = $18,
         outcomes = $19,
         evidence_availability = $20,
         evidence_note = $21,
         official_url = $22,
         details = $23::jsonb,
         submitted_at = CASE WHEN $16::varchar = 'Submitted' THEN NOW() ELSE submitted_at END,
         reviewed_at = CASE WHEN $16::varchar = 'Submitted' THEN NULL ELSE reviewed_at END,
         reviewed_by = CASE WHEN $16::varchar = 'Submitted' THEN NULL ELSE reviewed_by END,
         review_comment = CASE WHEN $16::varchar = 'Submitted' THEN NULL ELSE review_comment END,
         approved = FALSE,
         updated_at = NOW(),
         version = version + 1
       WHERE act_id = $24`,
      [
        typeId,
        activity.mode,
        activity.academicYear,
        activity.startDate,
        activity.endDate || activity.startDate,
        activity.facultyRole,
        activity.startTime && activity.endTime ? `${activity.startTime} to ${activity.endTime}` : activity.startTime || activity.endTime,
        activity.startTime,
        activity.endTime,
        activity.title || 'Untitled draft',
        activity.department,
        activity.scope,
        activity.hostOrganisation,
        activity.venue,
        activity.activityStatus,
        targetStatus,
        activity.participantCount,
        activity.summary,
        activity.outcomes,
        activity.evidenceAvailability,
        activity.evidenceNote,
        activity.officialUrl,
        JSON.stringify(activity.details),
        activityId
      ]
    )

    if (removeAttachmentIds.length) {
      await client.query(
        'DELETE FROM activity_attachment WHERE activity_id = $1 AND attachment_id = ANY($2::bigint[])',
        [activityId, removeAttachmentIds]
      )
    }

    await replaceGuests(client, activityId, activity.guests)
    await insertAttachments(client, activityId, req.user.id, activity.attachments)
    await insertAudit(
      client,
      activityId,
      req.user.id,
      saveAsDraft ? 'Updated draft' : existing.workflow_status === 'Changes Requested' ? 'Resubmitted' : 'Updated submission',
      existing.workflow_status,
      targetStatus,
      null,
      { previousVersion: existing.version }
    )
    await client.query('COMMIT')

    return res.json({ activity: await getActivityById(activityId) })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Activity update error:', error)
    return res.status(500).json({ error: 'Unable to update the activity.' })
  } finally {
    client.release()
  }
})

router.post('/:activityId/recall', async (req, res) => {
  const activityId = Number(req.params.activityId)
  const existing = await getActivityById(activityId)
  if (!existing) return res.status(404).json({ error: 'Activity not found.' })
  if (Number(existing.staff_id) !== Number(req.user.id)) return res.status(403).json({ error: 'You cannot recall this activity.' })
  if (existing.workflow_status !== 'Submitted' || existing.reviewed_at) {
    return res.status(409).json({ error: 'Only an unreviewed submission can be recalled.' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE activity
       SET workflow_status = 'Draft', approved = FALSE, updated_at = NOW(), version = version + 1
       WHERE act_id = $1`,
      [activityId]
    )
    await insertAudit(client, activityId, req.user.id, 'Recalled', 'Submitted', 'Draft', req.body.note)
    await client.query('COMMIT')
    return res.json({ activity: await getActivityById(activityId) })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Activity recall error:', error)
    return res.status(500).json({ error: 'Unable to recall the activity.' })
  } finally {
    client.release()
  }
})

router.delete('/:activityId', async (req, res) => {
  const activityId = Number(req.params.activityId)
  const existing = await getActivityById(activityId)
  if (!existing) return res.status(404).json({ error: 'Activity not found.' })
  if (Number(existing.staff_id) !== Number(req.user.id)) {
    return res.status(403).json({ error: 'Only the submitting faculty member can remove this activity.' })
  }
  if (!editableStatuses.has(existing.workflow_status)) {
    return res.status(409).json({ error: 'Approved activities cannot be removed directly. Request a correction from the reviewer.' })
  }

  const note = String(req.body?.note || 'Removed by submitting faculty').trim().slice(0, 1000)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await insertAudit(client, activityId, req.user.id, 'Soft deleted', existing.workflow_status, 'Archived', note)
    await client.query(
      `UPDATE activity
       SET deleted_at = NOW(), workflow_status = 'Archived', approved = FALSE, updated_at = NOW(), version = version + 1
       WHERE act_id = $1`,
      [activityId]
    )
    await client.query('COMMIT')
    return res.json({ message: 'Activity removed from your active records. The audit entry is retained.' })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Activity delete error:', error)
    return res.status(500).json({ error: 'Unable to remove the activity.' })
  } finally {
    client.release()
  }
})

router.get('/:activityId/summary-report', async (req, res) => {
  try {
    const activity = await getActivityById(req.params.activityId)
    if (!activity) return res.status(404).json({ error: 'Activity not found.' })
    if (!canAccessActivity(req.user, activity)) {
      return res.status(403).json({ error: 'You do not have access to this activity report.' })
    }

    const body = await generateActivitySummaryPdf(activity, req.user)
    const safeTitle = String(activity.title || `activity-${activity.act_id}`)
      .replace(/[^a-zA-Z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 80) || `activity-${activity.act_id}`
    const filename = `${safeTitle}-event-summary.pdf`

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Length', body.length)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-store')
    return res.send(body)
  } catch (error) {
    console.error('Activity summary report error:', error)
    return res.status(500).json({ error: 'Unable to generate the activity summary report.' })
  }
})

router.get("/:activityId/gallery", async (req, res) => {
  try {
    const activity = await getActivityById(req.params.activityId)
    if (!activity) return res.status(404).send("Activity not found.")
    if (!canAccessActivity(req.user, activity)) return res.status(403).send("Access denied.")

    const token = req.query.token ? encodeURIComponent(req.query.token) : ""
    const images = (activity.attachments || []).filter(a => a.kind === "image" || (a.mimeType && a.mimeType.startsWith("image/")))
    if (images.length === 0) return res.status(404).send("No photos attached to this activity.")

    const N   = images.length
    const cur = Math.min(Math.max(0, parseInt(req.query.photo || "0", 10) || 0), N - 1)
    const tok = token ? ("&token=" + token) : ""
    const esc = s => String(s || "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")

    const mkUrl   = img => "/api/activity/" + activity.act_id + "/attachments/" + img.id + "?disposition=inline" + tok
    const mkDlUrl = img => "/api/activity/" + activity.act_id + "/attachments/" + img.id + "?disposition=attachment" + tok
    const mkNav   = n   => "/api/activity/" + activity.act_id + "/gallery?photo=" + n + tok

    const img  = images[cur]
    const name = esc(img.fileName || ("Photo " + (cur + 1)))
    const imgUrl  = mkUrl(img)
    const dlUrl   = mkDlUrl(img)
    const prevUrl = cur > 0     ? mkNav(cur - 1) : null
    const nextUrl = cur < N - 1 ? mkNav(cur + 1) : null

    // Build thumbnail strip
    let thumbs = ""
    for (let i = 0; i < N; i++) {
      const active = i === cur ? "border:2.5px solid #f6d860;opacity:1;transform:scale(1.06)" : "border:2px solid transparent;opacity:0.5"
      thumbs += '<a href="' + mkNav(i) + '" style="display:inline-block;width:58px;height:46px;border-radius:4px;overflow:hidden;' + active + ';flex-shrink:0;background:#0f172a;text-decoration:none"><img src="' + esc(mkUrl(images[i])) + '" style="width:100%;height:100%;object-fit:cover;display:block" loading="lazy"></a>'
    }

    // Build dot strip
    let dots = ""
    for (let i = 0; i < N; i++) {
      const ds = i === cur ? "width:24px;background:#f6d860" : "width:8px;background:rgba(255,255,255,0.3)"
      dots += '<a href="' + mkNav(i) + '" style="display:inline-block;height:8px;' + ds + ';border-radius:4px;transition:all 0.2s;min-width:8px;text-decoration:none"></a>'
    }

    const prevLink = prevUrl
      ? '<a href="' + prevUrl + '" style="position:absolute;left:6px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.25);color:#fff;border-radius:50%;width:52px;height:52px;font-size:36px;font-weight:300;display:flex;align-items:center;justify-content:center;text-decoration:none;z-index:5;line-height:1">&#8249;</a>'
      : '<span style="position:absolute;left:6px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.2);border-radius:50%;width:52px;height:52px;font-size:36px;font-weight:300;display:flex;align-items:center;justify-content:center;z-index:5;line-height:1">&#8249;</span>'
    const nextLink = nextUrl
      ? '<a href="' + nextUrl + '" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.25);color:#fff;border-radius:50%;width:52px;height:52px;font-size:36px;font-weight:300;display:flex;align-items:center;justify-content:center;text-decoration:none;z-index:5;line-height:1">&#8250;</a>'
      : '<span style="position:absolute;right:6px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.2);border-radius:50%;width:52px;height:52px;font-size:36px;font-weight:300;display:flex;align-items:center;justify-content:center;z-index:5;line-height:1">&#8250;</span>'

    const html = "<!DOCTYPE html>\n" +
      "<html lang=en>\n<head>\n" +
      "<meta charset=UTF-8>\n" +
      "<meta name=viewport content='width=device-width,initial-scale=1.0,maximum-scale=5.0'>\n" +
      "<title>Photo " + (cur+1) + " of " + N + "</title>\n" +
      "<style>\n" +
      "*{box-sizing:border-box;margin:0;padding:0}\n" +
      "html,body{height:100%;background:#0b132b;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;flex-direction:column;overflow:hidden}\n" +
      "#top{background:#1a365d;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.12);flex-shrink:0}\n" +
      "#view{flex:1;position:relative;background:#0f172a;display:flex;align-items:center;justify-content:center;min-height:0}\n" +
      "#view img{max-width:calc(100vw - 116px);max-height:calc(100dvh - 188px);object-fit:contain;border-radius:6px;box-shadow:0 12px 30px rgba(0,0,0,.6);background:#fff;display:block}\n" +
      "#dots{display:flex;justify-content:center;align-items:center;gap:6px;padding:8px 12px;background:#0f172a;flex-shrink:0}\n" +
      "#thumbs{background:#1e293b;padding:8px 12px 12px;display:flex;gap:6px;overflow-x:auto;flex-shrink:0;-webkit-overflow-scrolling:touch;border-top:1px solid rgba(255,255,255,.08)}\n" +
      "@media(max-width:600px){#view img{max-width:calc(100vw - 90px)}}\n" +
      "</style>\n</head>\n<body>\n" +
      "<div id=top>\n" +
      "  <div style='flex:1;min-width:0;margin-right:10px'>\n" +
      "    <div style='font-size:15px;font-weight:700;color:#fff'>Photo " + (cur+1) + " / " + N + "</div>\n" +
      "    <div style='font-size:11px;color:#90b4d8;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60vw'>" + name + "</div>\n" +
      "  </div>\n" +
      "  <div style='display:flex;gap:8px;align-items:center;flex-shrink:0'>\n" +
      "    <a href='" + esc(dlUrl) + "' download='" + name + "' style='background:rgba(255,255,255,.16);color:#fff;border-radius:6px;padding:7px 14px;font-size:12px;font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:4px'>&#11015; Save</a>\n" +
      "    <a href='javascript:history.back()' style='background:rgba(255,255,255,.12);color:#fff;border-radius:50%;width:36px;height:36px;font-size:18px;display:flex;align-items:center;justify-content:center;text-decoration:none'>&#10005;</a>\n" +
      "  </div>\n" +
      "</div>\n" +
      "<div id=view>\n" +
      prevLink + "\n" +
      "  <img src='" + esc(imgUrl) + "' alt='" + name + "'>\n" +
      nextLink + "\n" +
      "</div>\n" +
      "<div id=dots>" + dots + "</div>\n" +
      "<div id=thumbs>" + thumbs + "</div>\n" +
      "</body></html>"

    res.setHeader("Content-Type", "text/html; charset=utf-8")
    res.setHeader("Cache-Control", "no-store, no-cache")
    return res.send(html)
  } catch (err) {
    console.error("Gallery error:", err)
    return res.status(500).send("Gallery error.")
  }
})


router.get('/:activityId/attachments/:attachmentId', async (req, res) => {
  try {
    const activity = await getActivityById(req.params.activityId)
    if (!activity) return res.status(404).json({ error: 'Activity not found.' })
    if (!canAccessActivity(req.user, activity)) {
      return res.status(403).json({ error: 'You do not have access to this attachment.' })
    }

    const result = await pool.query(
      `SELECT attachment_id, file_name, mime_type, size_bytes, data
       FROM activity_attachment
       WHERE attachment_id = $1 AND activity_id = $2`,
      [req.params.attachmentId, req.params.activityId]
    )
    const attachment = result.rows[0]
    if (!attachment) return res.status(404).json({ error: 'Attachment not found.' })

    const disposition = req.query.disposition === 'inline' ? 'inline' : 'attachment'
    const encoded = encodeURIComponent(attachment.file_name)
    res.setHeader('Content-Type', attachment.mime_type)
    res.setHeader('Content-Length', attachment.size_bytes)
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encoded}`)
    res.setHeader('Cache-Control', 'private, max-age=300')
    return res.send(attachment.data)
  } catch (error) {
    console.error('Attachment download error:', error)
    return res.status(500).json({ error: 'Unable to download the attachment.' })
  }
})

router.get('/:activityId/summary-report', async (req, res) => {
  try {
    const activity = await getActivityById(req.params.activityId)
    if (!activity) return res.status(404).json({ error: 'Activity not found.' })
    if (!canAccessActivity(req.user, activity)) {
      return res.status(403).json({ error: 'You do not have permission to download this report.' })
    }
    const pdfBuffer = await generateActivitySummaryPdf(activity, req.user)
    const safeName = String(activity.title || 'activity')
      .replace(/[^a-zA-Z0-9 -]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase()
      .slice(0, 60)
    const filename = `activity-${req.params.activityId}-${safeName}-summary.pdf`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-store')
    return res.send(pdfBuffer)
  } catch (error) {
    console.error('Summary report error:', error)
    return res.status(500).json({ error: 'Unable to generate the activity summary report.' })
  }
})

module.exports = router
