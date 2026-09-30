-- Migration 009: Add HOD digital signature image storage
-- The signature_image column stores a base64-encoded PNG/JPEG string.
-- It is NULL until the HOD uploads their signature via the portal.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS signature_image TEXT;

INSERT INTO schema_migrations (version) VALUES ('009_hod_signature')
ON CONFLICT (version) DO NOTHING;
