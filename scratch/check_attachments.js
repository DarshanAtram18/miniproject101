require('dotenv').config();
const pool = require('../src/db/pool');

async function checkCols() {
  const res = await pool.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'activity_attachment'"
  );
  console.log('Columns:', res.rows);
  const rows = await pool.query('SELECT * FROM activity_attachment WHERE activity_id = 67');
  console.log('Row count for act_id 67:', rows.rows.length);
  for (let r of rows.rows) {
    console.log({
      id: r.id || r.attachment_id,
      kind: r.kind,
      file_name: r.file_name,
      mime_type: r.mime_type,
      size_bytes: r.size_bytes,
      dataPrefix: String(r.data).slice(0, 50),
      dataLen: r.data?.length
    });
  }
  process.exit(0);
}

checkCols().catch(e => { console.error(e); process.exit(1); });
