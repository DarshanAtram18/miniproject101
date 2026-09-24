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

-- 3. Seed realistic historical activities for Darshan Atram and HOD if not already present
DO $$
DECLARE
  v_darshan_id INT;
  v_hod_id INT;
  v_type_workshop INT;
  v_type_fdp INT;
  v_type_research INT;
  v_type_guest INT;
  v_type_course INT;
BEGIN
  SELECT id INTO v_darshan_id FROM users WHERE LOWER(email) = 'darshan@gmail.com' LIMIT 1;
  SELECT id INTO v_hod_id FROM users WHERE LOWER(email) = 'hod.cse@wce.ac.in' LIMIT 1;

  SELECT type_id INTO v_type_workshop FROM type WHERE name LIKE '%Workshop%' LIMIT 1;
  SELECT type_id INTO v_type_fdp FROM type WHERE name LIKE '%Faculty Development%' LIMIT 1;
  SELECT type_id INTO v_type_research FROM type WHERE name LIKE '%Research%' LIMIT 1;
  SELECT type_id INTO v_type_guest FROM type WHERE name LIKE '%Guest Lecture%' LIMIT 1;
  SELECT type_id INTO v_type_course FROM type WHERE name LIKE '%Value%Added%' LIMIT 1;

  IF v_darshan_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM activity WHERE staff_id = v_darshan_id) THEN
    -- Activity 1: Workshop Organized
    INSERT INTO activity (
      staff_id, type_id, mode, acad_year, start_date, end_date, role,
      approved, title, department, scope, host_organisation, venue,
      activity_status, workflow_status, summary, details, submitted_at, reviewed_at, reviewed_by
    ) VALUES (
      v_darshan_id, COALESCE(v_type_workshop, 1), 'Offline', '2025-26', '2025-09-10', '2025-09-12', 'Organizer / Coordinator',
      TRUE, 'Hands-on Workshop on Full-Stack Development and Cloud Deployment',
      'Computer Science and Engineering', 'National', 'Walchand College of Engineering, Sangli', 'CCF Lab 1',
      'Completed', 'Approved', 'Three-day hands-on workshop covering modern web technologies, Docker, and cloud architectures for engineering students.',
      '{"duration_days": 3, "participants": 65, "collab_entity": "WCE ACM Student Chapter"}'::jsonb,
      NOW() - INTERVAL '120 days', NOW() - INTERVAL '115 days', v_hod_id
    );

    -- Activity 2: FDP Attended
    INSERT INTO activity (
      staff_id, type_id, mode, acad_year, start_date, end_date, role,
      approved, title, department, scope, host_organisation, venue,
      activity_status, workflow_status, summary, details, submitted_at, reviewed_at, reviewed_by
    ) VALUES (
      v_darshan_id, COALESCE(v_type_fdp, 2), 'Online', '2025-26', '2025-11-04', '2025-11-09', 'Participant / Attendee',
      TRUE, 'One-Week National FDP on Advanced Machine Learning and Deep Neural Networks',
      'Computer Science and Engineering', 'National', 'AICTE-ATAL Academy / IIT Bombay', 'Online Platform',
      'Completed', 'Approved', 'Intensive faculty development programme focusing on transformer models, LLMs, and computer vision architectures.',
      '{"funding_agency": "AICTE-ATAL", "certificate_issued": true}'::jsonb,
      NOW() - INTERVAL '60 days', NOW() - INTERVAL '55 days', v_hod_id
    );

    -- Activity 3: Research Publication
    INSERT INTO activity (
      staff_id, type_id, mode, acad_year, start_date, end_date, role,
      approved, title, department, scope, host_organisation, venue,
      activity_status, workflow_status, summary, details, submitted_at, reviewed_at, reviewed_by
    ) VALUES (
      v_darshan_id, COALESCE(v_type_research, 3), 'Online', '2025-26', '2026-01-15', '2026-01-15', 'Author / Researcher',
      TRUE, 'Automated Evidence Auditing and Faculty Activity Management in Higher Educational Institutions',
      'Computer Science and Engineering', 'International', 'IEEE Transactions on Learning Technologies', 'IEEE Xplore',
      'Completed', 'Approved', 'Published research paper on streamlining academic credential verification and faculty reporting frameworks.',
      '{"journal": "IEEE Access", "issn": "2169-3536", "ugc_care": true}'::jsonb,
      NOW() - INTERVAL '30 days', NOW() - INTERVAL '25 days', v_hod_id
    );

    -- Activity 4: Guest Session Delivered
    INSERT INTO activity (
      staff_id, type_id, mode, acad_year, start_date, end_date, role,
      approved, title, department, scope, host_organisation, venue,
      activity_status, workflow_status, summary, details, submitted_at, reviewed_at, reviewed_by
    ) VALUES (
      v_darshan_id, COALESCE(v_type_guest, 4), 'Hybrid', '2026-27', '2026-08-14', '2026-08-14', 'Speaker / Resource Person',
      TRUE, 'Expert Session on Scalable Microservices Architecture',
      'Computer Science and Engineering', 'State', 'Government College of Engineering, Karad', 'Main Auditorium & Zoom',
      'Completed', 'Approved', 'Delivered two-hour invited technical lecture for final year undergraduate students.',
      '{"audience_size": 120, "topic": "Microservices with Node.js and PostgreSQL"}'::jsonb,
      NOW() - INTERVAL '10 days', NOW() - INTERVAL '5 days', v_hod_id
    );

    -- Activity 5: Value Added Course
    INSERT INTO activity (
      staff_id, type_id, mode, acad_year, start_date, end_date, role,
      approved, title, department, scope, host_organisation, venue,
      activity_status, workflow_status, summary, details, submitted_at, reviewed_at, reviewed_by
    ) VALUES (
      v_darshan_id, COALESCE(v_type_course, 5), 'Offline', '2026-27', '2026-08-20', '2026-09-05', 'Course Coordinator / Instructor',
      TRUE, 'Value-Added Certification Course in Enterprise Web Architecture',
      'Computer Science and Engineering', 'Institute / Local', 'WCE Sangli', 'Department Lab 2',
      'Completed', 'Approved', '30-hour value added course for 3rd year CSE students with practical assessments and grading.',
      '{"course_code": "VAC-CSE-04", "enrolled_students": 52}'::jsonb,
      NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', v_hod_id
    );
  END IF;

  -- Ensure HOD also has an activity if none
  IF v_hod_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM activity WHERE staff_id = v_hod_id) THEN
    INSERT INTO activity (
      staff_id, type_id, mode, acad_year, start_date, end_date, role,
      approved, title, department, scope, host_organisation, venue,
      activity_status, workflow_status, summary, details, submitted_at, reviewed_at
    ) VALUES (
      v_hod_id, COALESCE(v_type_fdp, 2), 'Offline', '2025-26', '2025-10-12', '2025-10-14', 'Convenor / Head',
      TRUE, 'Departmental Accreditation and Curriculum Benchmarking Summit',
      'Computer Science and Engineering', 'State', 'Walchand College of Engineering', 'Senate Hall',
      'Completed', 'Approved', 'Convened multi-institute academic council summit on outcome-based education and NBA accreditation criteria.',
      '{"convenor": "Dr. A. R. Surve", "departments_participated": 6}'::jsonb,
      NOW() - INTERVAL '90 days', NOW() - INTERVAL '85 days'
    );
  END IF;
END $$;

COMMIT;
