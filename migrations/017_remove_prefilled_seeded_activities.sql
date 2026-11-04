BEGIN;

-- Remove any notifications referencing the seeded dummy activities
DELETE FROM notifications
WHERE activity_id IN (
  SELECT act_id FROM activity
  WHERE title IN (
    'Hands-on Workshop on Full-Stack Development and Cloud Deployment',
    'One-Week National FDP on Advanced Machine Learning and Deep Neural Networks',
    'Automated Evidence Auditing and Faculty Activity Management in Higher Educational Institutions',
    'Expert Session on Scalable Microservices Architecture',
    'Value-Added Certification Course in Enterprise Web Architecture',
    'Departmental Accreditation and Curriculum Benchmarking Summit',
    'Departmental Accreditation and Curriculum Benchmarking Workshop'
  )
);

-- Remove the seeded dummy activities (all foreign-key child tables cascade delete automatically)
DELETE FROM activity
WHERE title IN (
  'Hands-on Workshop on Full-Stack Development and Cloud Deployment',
  'One-Week National FDP on Advanced Machine Learning and Deep Neural Networks',
  'Automated Evidence Auditing and Faculty Activity Management in Higher Educational Institutions',
  'Expert Session on Scalable Microservices Architecture',
  'Value-Added Certification Course in Enterprise Web Architecture',
  'Departmental Accreditation and Curriculum Benchmarking Summit',
  'Departmental Accreditation and Curriculum Benchmarking Workshop'
);

COMMIT;
