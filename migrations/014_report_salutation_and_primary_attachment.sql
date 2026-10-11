-- Migration 014: Report Salutation and Primary Attachment Visibility
-- Adds user salutation (Mr./Mrs./Ms./Dr./Prof.) and attachment flags for report embedding

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS salutation VARCHAR(20) DEFAULT 'Prof.';

-- Set reasonable default salutations for existing seeded users
UPDATE users
SET salutation = 'Dr.'
WHERE name LIKE 'Dr.%' OR name LIKE 'Dr %';

UPDATE users
SET salutation = 'Prof.'
WHERE salutation IS NULL;

ALTER TABLE activity_attachment
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT FALSE;

ALTER TABLE activity_attachment
  ADD COLUMN IF NOT EXISTS is_report_visible BOOLEAN DEFAULT TRUE;

-- By default, hide raw attendance files from public reports while keeping certificates & photos visible
UPDATE activity_attachment
SET is_report_visible = FALSE
WHERE kind = 'attendance';

-- Mark existing certificate files as primary for their activity if no primary exists
UPDATE activity_attachment aa
SET is_primary = TRUE
WHERE aa.attachment_id IN (
  SELECT DISTINCT ON (activity_id) attachment_id
  FROM activity_attachment
  WHERE (kind = 'evidence' OR file_name ILIKE '%cert%' OR mime_type LIKE 'image/%')
    AND is_report_visible = TRUE
  ORDER BY activity_id, (CASE WHEN file_name ILIKE '%cert%' THEN 0 WHEN kind = 'evidence' THEN 1 ELSE 2 END), attachment_id
);

INSERT INTO schema_migrations (version) VALUES ('014_report_salutation_and_primary_attachment.sql')
ON CONFLICT (version) DO NOTHING;
