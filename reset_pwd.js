require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./src/db/pool');

async function reset() {
  try {
    const hash = await bcrypt.hash('123', 10);
    await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hash, 'darshan@gmail.com']);
    console.log('Password successfully reset to: 123');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
reset();
