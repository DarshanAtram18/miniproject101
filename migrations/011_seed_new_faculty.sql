BEGIN;

-- Add new faculty accounts with password '123'
-- abdur@wce, abhay@wce, hemant@wce
INSERT INTO users (email, password, name, department, designation, role, is_active)
VALUES
  ('abdur@wce',  '$2b$10$mr8aFAW1AWjR9Fq65.Sv9.gghdChGzYfNO25tK1fAWbXDP7k1p0T.', 'Abdur Rahman',    'Computer Science and Engineering', 'Assistant Professor', 'Faculty', TRUE),
  ('abhay@wce',  '$2b$10$mr8aFAW1AWjR9Fq65.Sv9.gghdChGzYfNO25tK1fAWbXDP7k1p0T.', 'Abhay Kulkarni',  'Computer Science and Engineering', 'Assistant Professor', 'Faculty', TRUE),
  ('hemant@wce', '$2b$10$mr8aFAW1AWjR9Fq65.Sv9.gghdChGzYfNO25tK1fAWbXDP7k1p0T.', 'Hemant Patil',    'Computer Science and Engineering', 'Assistant Professor', 'Faculty', TRUE)
ON CONFLICT (email) DO UPDATE
SET password = EXCLUDED.password,
    name     = EXCLUDED.name,
    role     = 'Faculty',
    is_active = TRUE;

COMMIT;
