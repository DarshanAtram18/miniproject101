require('dotenv').config();
const pool = require('../src/db/pool');
const catalog = require('../shared/activity-catalog.json');

async function seed() {
  const types = catalog.typeGroups.flatMap(g => g.types.map(t => ({ name: t.name, group: g.label })));
  console.log('Seeding', types.length, 'types into database...');
  for (const t of types) {
    await pool.query(
      `INSERT INTO type (name, group_name, is_active, sort_order)
       VALUES ($1, $2, TRUE, 10)
       ON CONFLICT (name) DO UPDATE SET group_name = EXCLUDED.group_name, is_active = TRUE`,
      [t.name, t.group]
    );
  }
  const result = await pool.query('SELECT COUNT(*) FROM type');
  console.log('Total types now in DB:', result.rows[0].count);
  process.exit(0);
}

seed().catch(err => {
  console.error('Error seeding types:', err);
  process.exit(1);
});
