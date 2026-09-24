INSERT INTO users (email, password, name, department, designation, role, is_active)
VALUES
  ('darshan@123', '$2b$10$HNuki.X1gI.jmoD0lTDD1OJ4fj6a4kw6B4DorIAnI8AdXUp3ORvKa', 'Darshan Atram', 'Computer Science and Engineering', 'Faculty', 'Admin', TRUE),
  ('darshan@gmail.com', '$2b$10$HNuki.X1gI.jmoD0lTDD1OJ4fj6a4kw6B4DorIAnI8AdXUp3ORvKa', 'Darshan Atram', 'Computer Science and Engineering', 'Faculty', 'Admin', TRUE),
  ('darshanatram18@gmail.com', '$2b$10$HNuki.X1gI.jmoD0lTDD1OJ4fj6a4kw6B4DorIAnI8AdXUp3ORvKa', 'Darshan Atram', 'Computer Science and Engineering', 'Faculty', 'Admin', TRUE)
ON CONFLICT (email) DO UPDATE
SET password = EXCLUDED.password, role = 'Admin', is_active = TRUE;
