require('dotenv').config();
const pool = require('./src/db/pool');

const payload = {
  type_id: 2,
  mode: 'Offline',
  acad_year: '2025-26',
  start_date: '2026-08-04',
  end_date: '2026-08-10',
  role: 'Attended',
  event_name: 'aiml',
  type: 'Attended',
  collab_entity: 'na',
  duration: 7,
  fees: null,
  fees_funded: false,
  fund_agency: 'na'
};

async function test() {
  try {
    const actResult = await pool.query(
      `INSERT INTO activity
        (staff_id, type_id, mode, acad_year, start_date, end_date, role, img, cert, report, approved)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING act_id`,
      [1, payload.type_id, payload.mode, payload.acad_year, payload.start_date, payload.end_date, payload.role, null, null, null, false]
    );
    const act_id = actResult.rows[0].act_id;
    await pool.query(
      `INSERT INTO fdp_workshop
         (act_id, event_name, type, collab_entity, duration, fees, fees_funded, fund_agency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [act_id, payload.event_name, payload.type, payload.collab_entity, payload.duration, payload.fees, payload.fees_funded, payload.fund_agency]
    );
    console.log('Success! ID:', act_id);
  } catch (err) {
    console.error('DB Error:', err.message);
  } finally {
    pool.end();
  }
}
test();
