BEGIN;

WITH type_mapping (legacy_name, canonical_name) AS (
  VALUES
    ('Value Added Course', 'Value-Added Course'),
    ('FDP/Workshop/Seminar/Webinar', 'Workshop'),
    ('Guest Invitation/Expert Session', 'Guest Lecture'),
    ('Grant Received', 'Research Project / Grant'),
    ('Research Published', 'Research Publication'),
    ('Book Chapter Published', 'Book / Book Chapter'),
    ('E-Learning Material', 'E-Learning / OER'),
    ('Consultancy Corporate Activity', 'Consultancy / Corporate Training'),
    ('Recognition', 'Faculty Achievement / Award'),
    ('CEP Program', 'Student Development / CEP'),
    ('Misc/Other', 'Other')
)
UPDATE activity AS a
SET type_id = canonical.type_id,
    details = COALESCE(a.details, '{}'::jsonb)
      || jsonb_build_object('legacyOriginalType', legacy.name),
    updated_at = NOW()
FROM type AS legacy
JOIN type_mapping AS mapping ON mapping.legacy_name = legacy.name
JOIN type AS canonical ON canonical.name = mapping.canonical_name
WHERE a.type_id = legacy.type_id;

COMMIT;
