const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.join(__dirname, '..', '..');
const testsDir = path.join(rootDir, 'server', 'tests');

function collectTests(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTests(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.test.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

const testFiles = collectTests(testsDir);

if (!testFiles.length) {
  console.error(`No test files found under ${testsDir}`);
  process.exit(1);
}

const proc = spawn(
  process.execPath,
  ['--test', ...testFiles],
  {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: process.env.FORCE_POSTGRES === '1' ? process.env.DATABASE_URL : '',
      FORCE_POSTGRES: process.env.FORCE_POSTGRES === '1' ? '1' : '',
      JOBTRACK_DB_PATH: ':memory:',
      JOBTRACK_LOG_LEVEL: process.env.JOBTRACK_LOG_LEVEL || 'error'
    }
  }
);

proc.on('exit', (code) => {
  if (process.env.DEBUG_HANDLES === '1') {
    // eslint-disable-next-line no-console
    console.log('Active handles:', process._getActiveHandles().length);
    // eslint-disable-next-line no-console
    console.log('Active requests:', process._getActiveRequests().length);
  }
  process.exit(code ?? 1);
});
