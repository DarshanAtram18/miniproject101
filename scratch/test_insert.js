require('dotenv').config();
const pool = require('../src/db/pool');

async function testSubmit() {
  const userRes = await pool.query("SELECT id, department, name FROM users WHERE email = 'darshan@gmail.com'");
  const user = userRes.rows[0];
  console.log('User found:', user);

  const typeRes = await pool.query("SELECT type_id, name FROM type WHERE name = 'Guest Lecture Organized'");
  console.log('Type found:', typeRes.rows[0]);

  const insertRes = await pool.query(
    `INSERT INTO activity (
       staff_id, type_id, mode, acad_year, start_date, end_date, role,
       approved, title, department, scope, host_organisation, venue,
       activity_status, workflow_status, summary, details, submitted_at
     ) VALUES (
       $1, $2, 'Offline', '2026-27', '2026-08-19', '2026-08-21', 'Organizer / Coordinator',
       FALSE, 'Python Workshop', $3, 'National', 'WCE Sangli', 'Tilak Hall',
       'Completed', 'Submitted', 'Organized Python Lecture', '{}'::jsonb, NOW()
     ) RETURNING act_id`,
    [user.id, typeRes.rows[0].type_id, user.department]
  );
  console.log('Successfully inserted test activity act_id:', insertRes.rows[0].act_id);

  await pool.query('DELETE FROM activity WHERE act_id = $1', [insertRes.rows[0].act_id]);
  console.log('Cleaned up test record successfully!');
  process.exit(0);
}

testSubmit().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
