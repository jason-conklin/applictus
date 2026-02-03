const test = require('node:test');
const assert = require('node:assert/strict');

test('coalesceTimestamps casts timestamps for postgres', () => {
  const savedDb = process.env.DATABASE_URL;
  const savedEnv = process.env.NODE_ENV;
  process.env.DATABASE_URL = 'postgres://example';
  process.env.NODE_ENV = 'development';
  delete require.cache[require.resolve('../src/sqlHelpers')];
  const { coalesceTimestamps } = require('../src/sqlHelpers');
  const expr = coalesceTimestamps(['last_activity_at', 'updated_at']);
  assert.match(expr, /last_activity_at::timestamptz/);
  assert.match(expr, /updated_at::timestamptz/);
  process.env.DATABASE_URL = savedDb;
  process.env.NODE_ENV = savedEnv;
});

test('coalesceTimestamps keeps sqlite-friendly syntax when no DATABASE_URL', () => {
  const savedDb = process.env.DATABASE_URL;
  const savedEnv = process.env.NODE_ENV;
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = 'test';
  delete require.cache[require.resolve('../src/sqlHelpers')];
  const { coalesceTimestamps } = require('../src/sqlHelpers');
  const expr = coalesceTimestamps(['last_activity_at', 'updated_at']);
  assert.equal(expr, 'COALESCE(last_activity_at, updated_at)');
  process.env.DATABASE_URL = savedDb;
  process.env.NODE_ENV = savedEnv;
});
