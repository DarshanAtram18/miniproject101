require('dotenv').config();
const pool = require('../src/db/pool');

async function testFetch() {
  const rows = await pool.query('SELECT attachment_id, file_name, mime_type, size_bytes, data FROM activity_attachment WHERE activity_id = 67');
  for (const r of rows.rows) {
    console.log(`id: ${r.attachment_id}, name: ${r.file_name}, mime: ${r.mime_type}, isBuffer: ${Buffer.isBuffer(r.data)}, len: ${r.data?.length}, size_bytes: ${r.size_bytes}`);
  }
  process.exit(0);
}

testFetch().catch(e => { console.error(e); process.exit(1); });
