const test = require('node:test');
const assert = require('node:assert/strict');

test('tests run with in-memory sqlite db', () => {
  assert.equal(process.env.NODE_ENV, 'test');
  const dbPath = process.env.JOBTRACK_DB_PATH;
  assert.ok(dbPath === ':memory:' || (dbPath && dbPath.includes('tmp')), 'JOBTRACK_DB_PATH should be in-memory for tests');
});
