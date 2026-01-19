#!/usr/bin/env node
/* eslint-disable no-console */

const path = require('path');

const MIN_NODE_MAJOR = 20;
const MAX_NODE_MAJOR_EXCLUSIVE = 23;

function fail(message, detail) {
  console.error('\n[preflight] Environment check failed:');
  console.error(`  ${message}`);
  if (detail) {
    console.error(`  Detail: ${detail}`);
  }
  console.error('\nSuggested fixes:');
  console.error('  1) Use Node 20 LTS (nvm use 20)');
  console.error('  2) Delete node_modules and package-lock.json, then npm install');
  console.error('  3) If needed: npm rebuild better-sqlite3 --build-from-source');
  console.error('  4) Set SKIP_PREFLIGHT=1 to bypass (not recommended)');
  process.exit(1);
}

function checkNodeVersion() {
  const [major] = process.versions.node.split('.').map((v) => parseInt(v, 10));
  if (Number.isNaN(major)) {
    return;
  }
  if (major < MIN_NODE_MAJOR || major >= MAX_NODE_MAJOR_EXCLUSIVE) {
    fail(
      `Unsupported Node version ${process.versions.node}.`,
      `Use Node ${MIN_NODE_MAJOR}.x for native module compatibility.`
    );
  }
}

function checkBetterSqlite() {
  try {
    const betterSqlite3 = require('better-sqlite3'); // eslint-disable-line global-require
    // Sanity check open/close to surface ABI issues early.
    const db = new betterSqlite3(':memory:');
    db.close();
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    const common =
      err?.code === 'ERR_DLOPEN_FAILED' ||
      message.includes('not a valid Win32 application') ||
      message.includes('invalid ELF header');
    const hint = common
      ? 'Native module failed to load (ABI mismatch for better-sqlite3).'
      : 'Failed to load better-sqlite3.';
    fail(hint, message);
  }
}

function main() {
  if (process.env.SKIP_PREFLIGHT === '1') {
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  checkNodeVersion();
  checkBetterSqlite();
  const resolved = path.resolve(__dirname, '..', '..');
  console.log(`[preflight] Environment OK for ${resolved} (Node ${process.versions.node})`);
}

main();
