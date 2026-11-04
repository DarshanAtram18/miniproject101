BEGIN;

-- 1. Ensure HOD and Darshan accounts exist with password '123'
INSERT INTO users (email, password, name, department, designation, role, is_active)
VALUES
  ('hod.cse@wce.ac.in', '$2b$10$HNuki.X1gI.jmoD0lTDD1OJ4fj6a4kw6B4DorIAnI8AdXUp3ORvKa', 'Dr. A. R. Surve', 'Computer Science and Engineering', 'Professor & HOD', 'HOD', TRUE),
  ('darshan@gmail.com', '$2b$10$HNuki.X1gI.jmoD0lTDD1OJ4fj6a4kw6B4DorIAnI8AdXUp3ORvKa', 'Darshan Atram', 'Computer Science and Engineering', 'Assistant Professor', 'Admin', TRUE),
  ('darshan@123', '$2b$10$HNuki.X1gI.jmoD0lTDD1OJ4fj6a4kw6B4DorIAnI8AdXUp3ORvKa', 'Darshan Atram', 'Computer Science and Engineering', 'Assistant Professor', 'Admin', TRUE)
ON CONFLICT (email) DO UPDATE
SET password = EXCLUDED.password, role = EXCLUDED.role, is_active = TRUE;

-- 2. Seed faculty members from the college catalogue with default password '123'
INSERT INTO users (email, password, name, department, designation, role, is_active)
VALUES
  ('bfmomin@wce.ac.in', '$2b$10$HNuki.X1gI.jmoD0lTDD1OJ4fj6a4kw6B4DorIAnI8AdXUp3ORvKa', 'Dr. B. F. Momin', 'Computer Science and Engineering', 'Professor', 'Faculty', TRUE),
  ('mashah@wce.ac.in', '$2b$10$HNuki.X1gI.jmoD0lTDD1OJ4fj6a4kw6B4DorIAnI8AdXUp3ORvKa', 'Dr. M. A. Shah', 'Computer Science and Engineering', 'Professor', 'Faculty', TRUE),
  ('nlgavankar@wce.ac.in', '$2b$10$HNuki.X1gI.jmoD0lTDD1OJ4fj6a4kw6B4DorIAnI8AdXUp3ORvKa', 'Dr. N. L. Gavankar', 'Computer Science and Engineering', 'Associate Professor', 'Faculty', TRUE),
  ('mkchavan@wce.ac.in', '$2b$10$HNuki.X1gI.jmoD0lTDD1OJ4fj6a4kw6B4DorIAnI8AdXUp3ORvKa', 'Mr. M. K. Chavan', 'Computer Science and Engineering', 'Assistant Professor', 'Faculty', TRUE),
  ('appawar@wce.ac.in', '$2b$10$HNuki.X1gI.jmoD0lTDD1OJ4fj6a4kw6B4DorIAnI8AdXUp3ORvKa', 'Ms. A. P. Pawar', 'Computer Science and Engineering', 'Assistant Professor', 'Faculty', TRUE)
ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password;

COMMIT;
