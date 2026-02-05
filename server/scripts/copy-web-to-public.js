const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..');
const webDir = path.join(rootDir, 'web');
const publicDir = path.join(rootDir, 'public');

const files = [
  'index.html',
  'app.js',
  'styles.css',
  'favicon.ico',
  'favicon.png',
  'Applictus_logo.png',
  'jason.png',
  'shane.png'
];

fs.mkdirSync(publicDir, { recursive: true });

let copied = 0;
let skipped = 0;

for (const file of files) {
  const src = path.join(webDir, file);
  const dest = path.join(publicDir, file);
  if (!fs.existsSync(src)) {
    skipped += 1;
    continue;
  }
  fs.copyFileSync(src, dest);
  copied += 1;
}

// eslint-disable-next-line no-console
console.log(`[copy:web] copied ${copied} file(s), skipped ${skipped} missing file(s).`);
