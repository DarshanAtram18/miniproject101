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

-- 3. Delete unneeded faculty accounts and duplicate accounts
DELETE FROM activity_attachments WHERE activity_id IN (SELECT act_id FROM activity WHERE staff_id IN (SELECT id FROM users WHERE email IN ('darshan@123', 'admin@college.com', 'darshanatram18@gmail.com', 'bfmomin@wce.ac.in', 'mashah@wce.ac.in', 'nlgavankar@wce.ac.in', 'mkchavan@wce.ac.in', 'appawar@wce.ac.in')));
DELETE FROM activity_reviews WHERE activity_id IN (SELECT act_id FROM activity WHERE staff_id IN (SELECT id FROM users WHERE email IN ('darshan@123', 'admin@college.com', 'darshanatram18@gmail.com', 'bfmomin@wce.ac.in', 'mashah@wce.ac.in', 'nlgavankar@wce.ac.in', 'mkchavan@wce.ac.in', 'appawar@wce.ac.in')));
DELETE FROM activity WHERE staff_id IN (SELECT id FROM users WHERE email IN ('darshan@123', 'admin@college.com', 'darshanatram18@gmail.com', 'bfmomin@wce.ac.in', 'mashah@wce.ac.in', 'nlgavankar@wce.ac.in', 'mkchavan@wce.ac.in', 'appawar@wce.ac.in'));
DELETE FROM users WHERE email IN ('darshan@123', 'admin@college.com', 'darshanatram18@gmail.com', 'bfmomin@wce.ac.in', 'mashah@wce.ac.in', 'nlgavankar@wce.ac.in', 'mkchavan@wce.ac.in', 'appawar@wce.ac.in');

INSERT INTO schema_migrations (version) VALUES ('019_clean_faculty_and_clubs.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
