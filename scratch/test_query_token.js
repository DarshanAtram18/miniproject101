require('dotenv').config();
const jwt = require('jsonwebtoken');
const http = require('http');

const token = jwt.sign(
  { id: 3, email: 'darshan@gmail.com', role: 'Faculty', department: 'Computer Science and Engineering' },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
);

function fetchAttach(id) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `http://localhost:3000/api/activity/67/attachments/${id}?disposition=inline&token=${token}`,
      (res) => {
        let chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          console.log(`Status for ${id}:`, res.statusCode, 'Content-Type:', res.headers['content-type'], 'Length:', body.length);
          resolve({ status: res.statusCode, body });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  await fetchAttach(36);
  await fetchAttach(37);
  await fetchAttach(38);
  await fetchAttach(39);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
