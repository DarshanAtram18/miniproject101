-- Migration: 015_rename_darshan_username.sql
-- Update darshan@gmail.com username/email to darshan@wce

UPDATE users
SET email = 'darshan@wce'
WHERE LOWER(email) = 'darshan@gmail.com';
