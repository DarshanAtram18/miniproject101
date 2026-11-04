-- Migration: 016_restrict_appreciation_and_faculty_roles.sql
-- Ensure all faculty accounts (including Darshan Atram) have role 'Faculty',
-- and strictly only Dr. A. R. Surve (or designated HOD accounts) have role 'HOD'.
-- This guarantees that faculty and club accounts cannot issue or send appreciation letters.

UPDATE users
SET role = 'Faculty'
WHERE LOWER(email) IN ('darshan@wce', 'darshan@123', 'darshan@gmail.com', 'darshanatram18@gmail.com')
  AND role != 'HOD';

-- Ensure all other accounts that are not HOD or Club are strictly Faculty
UPDATE users
SET role = 'Faculty'
WHERE role NOT IN ('HOD', 'Club', 'Faculty');

-- Explicitly ensure Dr. A. R. Surve has role 'HOD'
UPDATE users
SET role = 'HOD'
WHERE LOWER(email) = 'hod.cse@wce.ac.in';

