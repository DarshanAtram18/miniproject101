BEGIN;

-- Add official Club accounts with password '123'
INSERT INTO users (email, password, name, department, designation, role, is_active)
VALUES
  ('acm@wce', '$2b$10$mr8aFAW1AWjR9Fq65.Sv9.gghdChGzYfNO25tK1fAWbXDP7k1p0T.', 'ACM Student Chapter', 'Computer Science and Engineering', 'Student Chapter', 'Club', TRUE),
  ('acses@wce', '$2b$10$mr8aFAW1AWjR9Fq65.Sv9.gghdChGzYfNO25tK1fAWbXDP7k1p0T.', 'ACSES (Association of Computer Science & Engg Students)', 'Computer Science and Engineering', 'Student Association', 'Club', TRUE),
  ('wlug@wce', '$2b$10$mr8aFAW1AWjR9Fq65.Sv9.gghdChGzYfNO25tK1fAWbXDP7k1p0T.', 'Walchand Linux Users Group (WLUG)', 'Computer Science and Engineering', 'Open Source Community', 'Club', TRUE),
  ('sait@wce', '$2b$10$mr8aFAW1AWjR9Fq65.Sv9.gghdChGzYfNO25tK1fAWbXDP7k1p0T.', 'SAIT (Students Association of Information Technology)', 'Information Technology', 'Student Association', 'Club', TRUE),
  ('cesa@wce', '$2b$10$mr8aFAW1AWjR9Fq65.Sv9.gghdChGzYfNO25tK1fAWbXDP7k1p0T.', 'CESA (Civil Engineering Students Association)', 'Civil Engineering', 'Student Association', 'Club', TRUE),
  ('elesa@wce', '$2b$10$mr8aFAW1AWjR9Fq65.Sv9.gghdChGzYfNO25tK1fAWbXDP7k1p0T.', 'ELESA (Electronics Engineering Students Association)', 'Electronics Engineering', 'Student Association', 'Club', TRUE),
  ('mlsc@wce', '$2b$10$mr8aFAW1AWjR9Fq65.Sv9.gghdChGzYfNO25tK1fAWbXDP7k1p0T.', 'Microsoft Learn Student Chapter (MLSC WCE)', 'Computer Science and Engineering', 'Student Chapter', 'Club', TRUE),
  ('rotaract@wce', '$2b$10$mr8aFAW1AWjR9Fq65.Sv9.gghdChGzYfNO25tK1fAWbXDP7k1p0T.', 'Rotaract Club of WCE Sangli', 'Institutional / Student Activities', 'Youth Service Club', 'Club', TRUE),
  ('gdg@wce', '$2b$10$mr8aFAW1AWjR9Fq65.Sv9.gghdChGzYfNO25tK1fAWbXDP7k1p0T.', 'Google Developer Groups on Campus (GDG WCE)', 'Computer Science and Engineering', 'Developer Community', 'Club', TRUE)
ON CONFLICT (email) DO UPDATE
SET password = EXCLUDED.password, role = 'Club', name = EXCLUDED.name, is_active = TRUE;

COMMIT;
