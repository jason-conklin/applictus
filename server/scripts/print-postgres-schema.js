try {
  require('dotenv').config();
} catch (err) {
  // ignore if dotenv is not installed; production already has envs
}
const fs = require('fs');
const path = require('path');

function main() {
  const root = path.join(__dirname, '..', 'migrations', '001_init_postgres.sql');
  if (!fs.existsSync(root)) {
    console.error('Migration file not found:', root);
    process.exit(1);
  }
  const sql = fs.readFileSync(root, 'utf8');
  process.stdout.write(sql);
}

main();
