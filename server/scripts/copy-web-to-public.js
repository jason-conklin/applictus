const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..');
const webDir = path.join(rootDir, 'web');
const publicDir = path.join(rootDir, 'public');

const files = [
  { src: 'home.html', dest: 'index.html' },
  { src: 'index.html', dest: path.join('app', 'index.html') },
  { src: 'app.js', dest: 'app.js' },
  { src: 'home.js', dest: 'home.js' },
  { src: 'animated-background.js', dest: 'animated-background.js' },
  { src: 'styles.css', dest: 'styles.css' },
  { src: 'favicon.ico', dest: 'favicon.ico' },
  { src: 'favicon.png', dest: 'favicon.png' },
  { src: 'Applictus_logo.png', dest: 'Applictus_logo.png' },
  { src: 'jason.png', dest: 'jason.png' },
  { src: 'shane.png', dest: 'shane.png' }
];

fs.mkdirSync(publicDir, { recursive: true });

let copied = 0;
let skipped = 0;

for (const file of files) {
  const src = path.join(webDir, file.src);
  const dest = path.join(publicDir, file.dest);
  if (!fs.existsSync(src)) {
    skipped += 1;
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  copied += 1;
}

// eslint-disable-next-line no-console
console.log(`[copy:web] copied ${copied} file(s), skipped ${skipped} missing file(s).`);
