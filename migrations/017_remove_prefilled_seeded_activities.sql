BEGIN;

-- 1. Clean up child records for seeded dummy activities
DELETE FROM activity_attachment
WHERE activity_id IN (
  SELECT act_id FROM activity
  WHERE title IN (
    'Hands-on Workshop on Full-Stack Development and Cloud Deployment',
    'One-Week National FDP on Advanced Machine Learning and Deep Neural Networks',
    'Automated Evidence Auditing and Faculty Activity Management in Higher Educational Institutions',
    'Expert Session on Scalable Microservices Architecture',
    'Value-Added Certification Course in Enterprise Web Architecture',
    'Departmental Accreditation and Curriculum Benchmarking Workshop'
  )
);

DELETE FROM activity_audit
WHERE activity_id IN (
  SELECT act_id FROM activity
  WHERE title IN (
    'Hands-on Workshop on Full-Stack Development and Cloud Deployment',
    'One-Week National FDP on Advanced Machine Learning and Deep Neural Networks',
    'Automated Evidence Auditing and Faculty Activity Management in Higher Educational Institutions',
    'Expert Session on Scalable Microservices Architecture',
    'Value-Added Certification Course in Enterprise Web Architecture',
    'Departmental Accreditation and Curriculum Benchmarking Workshop'
  )
);

DELETE FROM activity_guest
WHERE activity_id IN (
  SELECT act_id FROM activity
  WHERE title IN (
    'Hands-on Workshop on Full-Stack Development and Cloud Deployment',
    'One-Week National FDP on Advanced Machine Learning and Deep Neural Networks',
    'Automated Evidence Auditing and Faculty Activity Management in Higher Educational Institutions',
    'Expert Session on Scalable Microservices Architecture',
    'Value-Added Certification Course in Enterprise Web Architecture',
    'Departmental Accreditation and Curriculum Benchmarking Workshop'
  )
);

DELETE FROM appreciation_email_queue
WHERE activity_id IN (
  SELECT act_id FROM activity
  WHERE title IN (
    'Hands-on Workshop on Full-Stack Development and Cloud Deployment',
    'One-Week National FDP on Advanced Machine Learning and Deep Neural Networks',
    'Automated Evidence Auditing and Faculty Activity Management in Higher Educational Institutions',
    'Expert Session on Scalable Microservices Architecture',
    'Value-Added Certification Course in Enterprise Web Architecture',
    'Departmental Accreditation and Curriculum Benchmarking Workshop'
  )
);

DELETE FROM notifications
WHERE activity_id IN (
  SELECT act_id FROM activity
  WHERE title IN (
    'Hands-on Workshop on Full-Stack Development and Cloud Deployment',
    'One-Week National FDP on Advanced Machine Learning and Deep Neural Networks',
    'Automated Evidence Auditing and Faculty Activity Management in Higher Educational Institutions',
    'Expert Session on Scalable Microservices Architecture',
    'Value-Added Certification Course in Enterprise Web Architecture',
    'Departmental Accreditation and Curriculum Benchmarking Workshop'
  )
);

-- 2. Remove the seeded dummy activities
DELETE FROM activity
WHERE title IN (
  'Hands-on Workshop on Full-Stack Development and Cloud Deployment',
  'One-Week National FDP on Advanced Machine Learning and Deep Neural Networks',
  'Automated Evidence Auditing and Faculty Activity Management in Higher Educational Institutions',
  'Expert Session on Scalable Microservices Architecture',
  'Value-Added Certification Course in Enterprise Web Architecture',
  'Departmental Accreditation and Curriculum Benchmarking Workshop'
);

COMMIT;
