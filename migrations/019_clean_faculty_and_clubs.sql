BEGIN;

-- 1. Correct faculty names for group members:
UPDATE users
SET name = 'Abdur Shaikh', salutation = 'Prof.'
WHERE email = 'abdur@wce';

UPDATE users
SET name = 'Hemant Jangale', salutation = 'Prof.'
WHERE email = 'hemant@wce';

UPDATE users
SET name = 'Abhay Somkuwar', salutation = 'Prof.'
WHERE email = 'abhay@wce';

UPDATE users
SET name = 'Darshan Atram', salutation = 'Prof.'
WHERE email = 'darshan@wce';

-- 2. Remove salutation from all clubs and admin accounts (so NO "Prof." is prepended)
UPDATE users
SET salutation = NULL
WHERE role IN ('Club', 'Admin');

-- Normalize Dr. Surve's name
UPDATE users
SET name = 'Dr. A. R. Surve', salutation = NULL
WHERE email = 'hod.cse@wce.ac.in';

-- 3. Delete unneeded faculty accounts and duplicate accounts
UPDATE activity SET reviewed_by = NULL WHERE reviewed_by IN (SELECT id FROM users WHERE email IN ('darshan@123', 'admin@college.com', 'darshanatram18@gmail.com', 'bfmomin@wce.ac.in', 'mashah@wce.ac.in', 'nlgavankar@wce.ac.in', 'mkchavan@wce.ac.in', 'appawar@wce.ac.in'));
UPDATE activity_attachment SET uploaded_by = NULL WHERE uploaded_by IN (SELECT id FROM users WHERE email IN ('darshan@123', 'admin@college.com', 'darshanatram18@gmail.com', 'bfmomin@wce.ac.in', 'mashah@wce.ac.in', 'nlgavankar@wce.ac.in', 'mkchavan@wce.ac.in', 'appawar@wce.ac.in'));
UPDATE activity_audit SET actor_id = NULL WHERE actor_id IN (SELECT id FROM users WHERE email IN ('darshan@123', 'admin@college.com', 'darshanatram18@gmail.com', 'bfmomin@wce.ac.in', 'mashah@wce.ac.in', 'nlgavankar@wce.ac.in', 'mkchavan@wce.ac.in', 'appawar@wce.ac.in'));

-- Delete their activities (cascades to attachments, details, email_jobs, guests)
DELETE FROM activity WHERE staff_id IN (SELECT id FROM users WHERE email IN ('darshan@123', 'admin@college.com', 'darshanatram18@gmail.com', 'bfmomin@wce.ac.in', 'mashah@wce.ac.in', 'nlgavankar@wce.ac.in', 'mkchavan@wce.ac.in', 'appawar@wce.ac.in'));

-- Delete the users
DELETE FROM users WHERE email IN ('darshan@123', 'admin@college.com', 'darshanatram18@gmail.com', 'bfmomin@wce.ac.in', 'mashah@wce.ac.in', 'nlgavankar@wce.ac.in', 'mkchavan@wce.ac.in', 'appawar@wce.ac.in');

INSERT INTO schema_migrations (version) VALUES ('019_clean_faculty_and_clubs.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
