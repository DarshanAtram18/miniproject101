const pool = require('../db/pool')
const { reviewerRoles, safeText } = require('../domain/activity')

const SELECT_FIELDS = `
  a.act_id,
  a.staff_id,
  a.type_id,
  t.name AS type_name,
  t.group_name AS type_group,
  a.title,
  a.department,
  a.mode,
  a.acad_year,
  a.start_date,
  a.end_date,
  a.start_time,
  a.end_time,
  a.role AS faculty_role,
  a.scope,
  a.host_organisation,
  a.venue,
  a.activity_status,
  a.workflow_status,
  a.participant_count,
  a.summary,
  a.outcomes,
  a.evidence_availability,
  a.evidence_note,
  a.official_url,
  a.details,
  a.created_at,
  a.updated_at,
  a.submitted_at,
  a.reviewed_at,
  a.reviewed_by,
  a.review_comment,
  a.version,
  u.name AS staff_name,
  u.email AS staff_email,
  u.designation AS staff_designation,
  reviewer.name AS reviewer_name,
  COALESCE(attachments.items, '[]'::jsonb) AS attachments,
  COALESCE(guests.items, '[]'::jsonb) AS guests
`

const SELECT_JOINS = `
  JOIN type t ON t.type_id = a.type_id
  JOIN users u ON u.id = a.staff_id
  LEFT JOIN users reviewer ON reviewer.id = a.reviewed_by
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', aa.attachment_id,
        'kind', aa.kind,
        'fileName', aa.file_name,
        'mimeType', aa.mime_type,
        'sizeBytes', aa.size_bytes,
        'caption', aa.caption,
        'sortOrder', aa.sort_order,
        'createdAt', aa.created_at
      ) ORDER BY aa.kind, aa.sort_order, aa.attachment_id
    ) AS items
    FROM activity_attachment aa
    WHERE aa.activity_id = a.act_id
  ) attachments ON TRUE
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', ag.guest_id,
        'name', ag.name,
        'designation', ag.designation,
        'organisation', ag.organisation,
        'country', ag.country,
        'guestRole', ag.guest_role,
        'guestType', ag.guest_type,
        'email', ag.email,
        'phone', ag.phone
      ) ORDER BY ag.guest_id
    ) AS items
    FROM activity_guest ag
    WHERE ag.activity_id = a.act_id
  ) guests ON TRUE
`

function buildFilters(user, query = {}, { reports = false } = {}) {
  const clauses = ['a.deleted_at IS NULL']
  const values = []
  const add = (sql, value) => {
    values.push(value)
    clauses.push(sql.replace('?', `$${values.length}`))
  }

  const isReviewer = reviewerRoles.has(user.role)
  const mineOnly = query.mine === 'true' || !isReviewer

  if (mineOnly) {
    add('a.staff_id = ?', user.id)
  } else if (user.role === 'HOD') {
    add('a.department = ?', user.department)
  }

  if (query.facultyId && isReviewer) add('a.staff_id = ?', Number(query.facultyId))
  if (query.department && user.role === 'Admin') add('a.department = ?', safeText(query.department, 255))
  if (query.academicYear) add('a.acad_year = ?', safeText(query.academicYear, 9))
  if (query.type) add('t.name = ?', safeText(query.type, 100))
  if (query.role) add('a.role = ?', safeText(query.role, 255))
  if (query.scope) add('a.scope = ?', safeText(query.scope, 50))
  if (query.mode) add('a.mode = ?', safeText(query.mode, 20))
  if (query.status) add('a.workflow_status = ?', safeText(query.status, 30))
  if (query.activityStatus) add('a.activity_status = ?', safeText(query.activityStatus, 30))
  if (reports && !query.status && query.includePending !== 'true') add('a.workflow_status = ?', 'Approved')

  if (query.from) add('COALESCE(a.end_date, a.start_date) >= ?::date', safeText(query.from, 10))
  if (query.to) add('a.start_date <= ?::date', safeText(query.to, 10))

  if (query.search) {
    values.push(`%${safeText(query.search, 100)}%`)
    const parameter = `$${values.length}`
    clauses.push(`(
      a.title ILIKE ${parameter}
      OR COALESCE(a.host_organisation, '') ILIKE ${parameter}
      OR COALESCE(a.summary, '') ILIKE ${parameter}
      OR u.name ILIKE ${parameter}
    )`)
  }

  return { clauses, values }
}

async function listActivities(user, query = {}, options = {}) {
  const { clauses, values } = buildFilters(user, query, options)
  const where = clauses.join(' AND ')
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM activity a
     JOIN type t ON t.type_id = a.type_id
     JOIN users u ON u.id = a.staff_id
     WHERE ${where}`,
    values
  )

  const pageSize = options.unpaged
    ? Math.min(Number(query.limit || 5000), 5000)
    : Math.min(Math.max(Number(query.pageSize || 25), 1), 100)
  const page = options.unpaged ? 1 : Math.max(Number(query.page || 1), 1)
  const offset = (page - 1) * pageSize
  const dataValues = [...values, pageSize, offset]

  const result = await pool.query(
    `SELECT ${SELECT_FIELDS}
     FROM activity a
     ${SELECT_JOINS}
     WHERE ${where}
     ORDER BY a.start_date DESC NULLS LAST, a.act_id DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    dataValues
  )

  return {
    items: result.rows,
    pagination: {
      page,
      pageSize,
      total: countResult.rows[0].total,
      totalPages: Math.max(Math.ceil(countResult.rows[0].total / pageSize), 1)
    }
  }
}

async function getActivityById(activityId) {
  const result = await pool.query(
    `SELECT ${SELECT_FIELDS},
       COALESCE(audit.items, '[]'::jsonb) AS audit
     FROM activity a
     ${SELECT_JOINS}
     LEFT JOIN LATERAL (
       SELECT jsonb_agg(
         jsonb_build_object(
           'id', au.audit_id,
           'action', au.action,
           'fromStatus', au.from_status,
           'toStatus', au.to_status,
           'note', au.note,
           'actorName', actor.name,
           'createdAt', au.created_at
         ) ORDER BY au.created_at DESC, au.audit_id DESC
       ) AS items
       FROM activity_audit au
       LEFT JOIN users actor ON actor.id = au.actor_id
       WHERE au.activity_id = a.act_id
     ) audit ON TRUE
     WHERE a.act_id = $1 AND a.deleted_at IS NULL`,
    [activityId]
  )
  return result.rows[0] || null
}

function canAccessActivity(user, activity) {
  if (!activity) return false
  if (Number(activity.staff_id) === Number(user.id)) return true
  if (user.role === 'Admin') return true
  return user.role === 'HOD' && activity.department === user.department
}

module.exports = {
  listActivities,
  getActivityById,
  canAccessActivity,
  buildFilters
}
