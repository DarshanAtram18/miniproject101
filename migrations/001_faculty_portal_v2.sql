BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version       VARCHAR(100) PRIMARY KEY,
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS designation VARCHAR(120);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(30) NOT NULL DEFAULT 'Faculty';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE users
SET department = COALESCE(NULLIF(department, ''), 'Computer Science and Engineering'),
    designation = COALESCE(NULLIF(designation, ''), 'Faculty')
WHERE department IS NULL OR department = '' OR designation IS NULL OR designation = '';

ALTER TABLE type ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE type ADD COLUMN IF NOT EXISTS group_name VARCHAR(120);
ALTER TABLE type ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 999;

ALTER TABLE value_added_course
  ALTER COLUMN course_code TYPE VARCHAR(100)
  USING course_code::VARCHAR;

UPDATE type
SET is_active = FALSE
WHERE name IN (
  'Value Added Course',
  'FDP/Workshop/Seminar/Webinar',
  'Guest Invitation/Expert Session',
  'Grant Received',
  'Research Published',
  'Book Chapter Published',
  'E-Learning Material',
  'Consultancy Corporate Activity',
  'Recognition',
  'CEP Program',
  'Misc/Other'
);

INSERT INTO type (name, is_active, group_name, sort_order) VALUES
  ('Faculty Development Programme (FDP)', TRUE, 'Faculty development and academic events', 10),
  ('Workshop', TRUE, 'Faculty development and academic events', 20),
  ('Seminar', TRUE, 'Faculty development and academic events', 30),
  ('Webinar', TRUE, 'Faculty development and academic events', 40),
  ('Conference', TRUE, 'Faculty development and academic events', 50),
  ('Training / Certification', TRUE, 'Faculty development and academic events', 60),
  ('Guest Lecture', TRUE, 'Faculty development and academic events', 70),
  ('Industrial Visit', TRUE, 'Faculty development and academic events', 80),
  ('Research Publication', TRUE, 'Research, innovation and recognition', 100),
  ('Book / Book Chapter', TRUE, 'Research, innovation and recognition', 110),
  ('Research Project / Grant', TRUE, 'Research, innovation and recognition', 120),
  ('Patent / Innovation', TRUE, 'Research, innovation and recognition', 130),
  ('Faculty Achievement / Award', TRUE, 'Research, innovation and recognition', 140),
  ('Consultancy / Corporate Training', TRUE, 'Teaching, industry and institutional contribution', 200),
  ('Value-Added Course', TRUE, 'Teaching, industry and institutional contribution', 210),
  ('E-Learning / OER', TRUE, 'Teaching, industry and institutional contribution', 220),
  ('Student Development / CEP', TRUE, 'Teaching, industry and institutional contribution', 230),
  ('Outreach / Extension', TRUE, 'Teaching, industry and institutional contribution', 240),
  ('Professional Membership / Service', TRUE, 'Teaching, industry and institutional contribution', 250),
  ('Partnership / MoU', TRUE, 'Teaching, industry and institutional contribution', 260),
  ('Other', TRUE, 'Other', 900)
ON CONFLICT (name) DO UPDATE SET
  is_active = EXCLUDED.is_active,
  group_name = EXCLUDED.group_name,
  sort_order = EXCLUDED.sort_order;

ALTER TABLE activity ADD COLUMN IF NOT EXISTS title VARCHAR(500);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS department VARCHAR(255);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS event_time VARCHAR(50);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS scope VARCHAR(50);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS host_organisation VARCHAR(500);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS venue VARCHAR(500);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS activity_status VARCHAR(30) NOT NULL DEFAULT 'Completed';
ALTER TABLE activity ADD COLUMN IF NOT EXISTS workflow_status VARCHAR(30) NOT NULL DEFAULT 'Submitted';
ALTER TABLE activity ADD COLUMN IF NOT EXISTS participant_count INT;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS outcomes TEXT;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS evidence_availability VARCHAR(30);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS evidence_note TEXT;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS official_url VARCHAR(1000);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE activity ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE activity ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS reviewed_by INT REFERENCES users(id);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS review_comment TEXT;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE activity ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

UPDATE activity
SET workflow_status = CASE WHEN approved THEN 'Approved' ELSE 'Submitted' END,
    submitted_at = COALESCE(submitted_at, created_at),
    department = COALESCE(
      NULLIF(department, ''),
      (SELECT u.department FROM users u WHERE u.id = activity.staff_id),
      'Computer Science and Engineering'
    )
WHERE workflow_status IS NULL
   OR department IS NULL
   OR department = ''
   OR submitted_at IS NULL;

UPDATE activity a
SET title = COALESCE(NULLIF(a.title, ''), v.course_name),
    details = CASE WHEN a.details = '{}'::jsonb THEN jsonb_strip_nulls(to_jsonb(v) - 'act_id') ELSE a.details END
FROM value_added_course v
WHERE a.act_id = v.act_id;

UPDATE activity a
SET title = COALESCE(NULLIF(a.title, ''), f.event_name),
    host_organisation = COALESCE(NULLIF(a.host_organisation, ''), f.collab_entity),
    details = CASE WHEN a.details = '{}'::jsonb THEN jsonb_strip_nulls(to_jsonb(f) - 'act_id') ELSE a.details END
FROM fdp_workshop f
WHERE a.act_id = f.act_id;

UPDATE activity a
SET title = COALESCE(NULLIF(a.title, ''), g.event_name),
    details = CASE WHEN a.details = '{}'::jsonb THEN jsonb_strip_nulls(to_jsonb(g) - 'act_id') ELSE a.details END
FROM guest_session g
WHERE a.act_id = g.act_id;

UPDATE activity a
SET title = COALESCE(NULLIF(a.title, ''), r.name),
    host_organisation = COALESCE(NULLIF(a.host_organisation, ''), r.fund_agency),
    details = CASE WHEN a.details = '{}'::jsonb THEN jsonb_strip_nulls(to_jsonb(r) - 'act_id') ELSE a.details END
FROM grant_received r
WHERE a.act_id = r.act_id;

UPDATE activity a
SET title = COALESCE(NULLIF(a.title, ''), r.paper_title),
    host_organisation = COALESCE(NULLIF(a.host_organisation, ''), r.journal),
    official_url = COALESCE(NULLIF(a.official_url, ''), r.ugc_link),
    details = CASE WHEN a.details = '{}'::jsonb THEN jsonb_strip_nulls(to_jsonb(r) - 'act_id') ELSE a.details END
FROM research_published r
WHERE a.act_id = r.act_id;

UPDATE activity a
SET title = COALESCE(NULLIF(a.title, ''), b.book_chap_title),
    host_organisation = COALESCE(NULLIF(a.host_organisation, ''), b.publisher),
    details = CASE WHEN a.details = '{}'::jsonb THEN jsonb_strip_nulls(to_jsonb(b) - 'act_id') ELSE a.details END
FROM book_chapter b
WHERE a.act_id = b.act_id;

UPDATE activity a
SET title = COALESCE(NULLIF(a.title, ''), e.name),
    host_organisation = COALESCE(NULLIF(a.host_organisation, ''), e.platform),
    details = CASE WHEN a.details = '{}'::jsonb THEN jsonb_strip_nulls(to_jsonb(e) - 'act_id') ELSE a.details END
FROM elearning e
WHERE a.act_id = e.act_id;

UPDATE activity a
SET title = COALESCE(NULLIF(a.title, ''), c.act_name),
    host_organisation = COALESCE(NULLIF(a.host_organisation, ''), c.client_org),
    participant_count = COALESCE(a.participant_count, c.headcount),
    details = CASE WHEN a.details = '{}'::jsonb THEN jsonb_strip_nulls(to_jsonb(c) - 'act_id') ELSE a.details END
FROM consultancy c
WHERE a.act_id = c.act_id;

UPDATE activity a
SET title = COALESCE(NULLIF(a.title, ''), r.act_name),
    host_organisation = COALESCE(NULLIF(a.host_organisation, ''), r.awarding),
    details = CASE WHEN a.details = '{}'::jsonb THEN jsonb_strip_nulls(to_jsonb(r) - 'act_id') ELSE a.details END
FROM recognition r
WHERE a.act_id = r.act_id;

UPDATE activity a
SET title = COALESCE(NULLIF(a.title, ''), c.act_name),
    participant_count = COALESCE(a.participant_count, c.num_students),
    details = CASE WHEN a.details = '{}'::jsonb THEN jsonb_strip_nulls(to_jsonb(c) - 'act_id') ELSE a.details END
FROM cep_program c
WHERE a.act_id = c.act_id;

UPDATE activity a
SET title = COALESCE(NULLIF(a.title, ''), LEFT(m.description, 500)),
    summary = COALESCE(NULLIF(a.summary, ''), m.description),
    details = CASE WHEN a.details = '{}'::jsonb THEN jsonb_build_object('description', m.description) ELSE a.details END
FROM misc m
WHERE a.act_id = m.act_id;

UPDATE activity a
SET title = COALESCE(NULLIF(a.title, ''), t.name, 'Faculty Activity')
FROM type t
WHERE a.type_id = t.type_id AND (a.title IS NULL OR a.title = '');

CREATE TABLE IF NOT EXISTS activity_attachment (
  attachment_id BIGSERIAL PRIMARY KEY,
  activity_id    INT NOT NULL REFERENCES activity(act_id) ON DELETE CASCADE,
  kind           VARCHAR(30) NOT NULL,
  file_name      VARCHAR(255) NOT NULL,
  mime_type      VARCHAR(150) NOT NULL,
  size_bytes     INT NOT NULL CHECK (size_bytes >= 0),
  data           BYTEA NOT NULL,
  caption        VARCHAR(500),
  sort_order     INT NOT NULL DEFAULT 0,
  sha256         VARCHAR(64),
  visibility     VARCHAR(30) NOT NULL DEFAULT 'Private',
  uploaded_by    INT REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  legacy_key     VARCHAR(30),
  UNIQUE (activity_id, legacy_key)
);

INSERT INTO activity_attachment
  (activity_id, kind, file_name, mime_type, size_bytes, data, sort_order, uploaded_by, legacy_key)
SELECT act_id, 'image', 'legacy-image-' || act_id || '.jpg', 'image/jpeg', octet_length(img), img, 0, staff_id, 'img'
FROM activity
WHERE img IS NOT NULL
ON CONFLICT (activity_id, legacy_key) DO NOTHING;

INSERT INTO activity_attachment
  (activity_id, kind, file_name, mime_type, size_bytes, data, sort_order, uploaded_by, legacy_key)
SELECT act_id, 'evidence', 'legacy-evidence-' || act_id || '.bin', 'application/octet-stream', octet_length(cert), cert, 0, staff_id, 'cert'
FROM activity
WHERE cert IS NOT NULL
ON CONFLICT (activity_id, legacy_key) DO NOTHING;

INSERT INTO activity_attachment
  (activity_id, kind, file_name, mime_type, size_bytes, data, sort_order, uploaded_by, legacy_key)
SELECT act_id, 'report', 'legacy-report-' || act_id || '.bin', 'application/octet-stream', octet_length(report), report, 0, staff_id, 'report'
FROM activity
WHERE report IS NOT NULL
ON CONFLICT (activity_id, legacy_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS activity_guest (
  guest_id       BIGSERIAL PRIMARY KEY,
  activity_id    INT NOT NULL REFERENCES activity(act_id) ON DELETE CASCADE,
  name           VARCHAR(255) NOT NULL,
  designation    VARCHAR(255),
  organisation   VARCHAR(500) NOT NULL,
  country        VARCHAR(120),
  guest_role     VARCHAR(120),
  guest_type     VARCHAR(30) DEFAULT 'External',
  email          VARCHAR(255),
  phone          VARCHAR(50),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_audit (
  audit_id       BIGSERIAL PRIMARY KEY,
  activity_id    INT NOT NULL REFERENCES activity(act_id) ON DELETE CASCADE,
  actor_id       INT REFERENCES users(id),
  action         VARCHAR(50) NOT NULL,
  from_status    VARCHAR(30),
  to_status      VARCHAR(30),
  note           TEXT,
  snapshot       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_staff_date
  ON activity (staff_id, start_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_activity_department_status
  ON activity (department, workflow_status, start_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_activity_type_date
  ON activity (type_id, start_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attachment_activity_kind
  ON activity_attachment (activity_id, kind, sort_order);
CREATE INDEX IF NOT EXISTS idx_audit_activity_created
  ON activity_audit (activity_id, created_at DESC);

COMMIT;
