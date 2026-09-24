require('dotenv').config();
const pool = require('./src/db/pool');
pool.query('ALTER TABLE activity ADD COLUMN IF NOT EXISTS event_time VARCHAR(50);')
  .then(() => console.log('Column added'))
  .catch(e => console.error(e.message))
  .finally(() => pool.end());
