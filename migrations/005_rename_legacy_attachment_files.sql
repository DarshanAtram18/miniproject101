BEGIN;

UPDATE activity_attachment aa
SET file_name = CONCAT(
  COALESCE(
    NULLIF(trim(BOTH '-' FROM regexp_replace(lower(a.title), '[^a-z0-9]+', '-', 'g')), ''),
    'activity-' || a.act_id
  ),
  CASE aa.kind
    WHEN 'report' THEN '-activity-report'
    ELSE '-supporting-evidence'
  END,
  CASE aa.mime_type
    WHEN 'application/pdf' THEN '.pdf'
    WHEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' THEN '.docx'
    ELSE '.bin'
  END
)
FROM activity a
WHERE a.act_id = aa.activity_id
  AND aa.legacy_key IN ('cert', 'report')
  AND aa.file_name LIKE 'legacy-%';

COMMIT;
