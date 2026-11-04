BEGIN;

-- Create dedicated System Administrator accounts with password '123'
INSERT INTO users (email, password, name, department, designation, role, is_active)
VALUES
  ('admin@wce', '$2b$10$mr8aFAW1AWjR9Fq65.Sv9.gghdChGzYfNO25tK1fAWbXDP7k1p0T.', 'System Administrator', 'Computer Science and Engineering', 'Portal Administrator', 'Admin', TRUE),
  ('admin@wce.ac.in', '$2b$10$mr8aFAW1AWjR9Fq65.Sv9.gghdChGzYfNO25tK1fAWbXDP7k1p0T.', 'System Administrator', 'Computer Science and Engineering', 'Portal Administrator', 'Admin', TRUE)
ON CONFLICT (email) DO UPDATE
SET password = EXCLUDED.password, role = 'Admin', name = EXCLUDED.name, is_active = TRUE;

COMMIT;
