BEGIN;

UPDATE activity_attachment
SET file_name = regexp_replace(file_name, '\.bin$', '.pdf', 'i'),
    mime_type = 'application/pdf'
WHERE mime_type = 'application/octet-stream'
  AND substring(data FROM 1 FOR 5) = decode('255044462d', 'hex');

UPDATE activity_attachment
SET file_name = regexp_replace(file_name, '\.bin$', '.docx', 'i'),
    mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
WHERE mime_type = 'application/octet-stream'
  AND substring(data FROM 1 FOR 4) = decode('504b0304', 'hex')
  AND position(convert_to('word/document.xml', 'UTF8') IN data) > 0;

COMMIT;
