const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function listJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

test('server SQL avoids boolean=int comparisons for archived/user_override', () => {
  const srcDir = path.join(__dirname, '..', 'src');
  const files = listJsFiles(srcDir);
  const offenders = [];

  // These patterns crash Postgres when the column is boolean.
  const patterns = [/\barchived\s*=\s*[01]\b/, /\buser_override\s*=\s*[01]\b/];

  for (const file of files) {
    const contents = fs.readFileSync(file, 'utf8');
    if (patterns.some((p) => p.test(contents))) {
      offenders.push(path.relative(srcDir, file));
    }
  }

  assert.deepEqual(offenders, []);
});

