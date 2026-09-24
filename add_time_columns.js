require('dotenv').config();
const pool = require('./src/db/pool');
async function run() {
  try {
    await pool.query('ALTER TABLE activity ADD COLUMN IF NOT EXISTS start_time VARCHAR(50);');
    await pool.query('ALTER TABLE activity ADD COLUMN IF NOT EXISTS end_time VARCHAR(50);');
    console.log('Columns start_time and end_time added successfully');
  } catch (e) {
    console.error(e.message);
  } finally {
    pool.end();
  }
}
run();
