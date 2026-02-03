const test = require('node:test');
const assert = require('node:assert/strict');
const { listMigrationFiles } = require('../src/db');

test('sqlite migrations exclude postgres-only files', () => {
  const files = listMigrationFiles('sqlite');
  assert.ok(files.length > 0);
  assert.ok(!files.some((f) => /_postgres\.sql$/i.test(f)));
  assert.ok(!files.includes('018_email_events_provider_message_id_postgres.sql'));
  assert.ok(!files.includes('019_email_events_dedupe_scope_postgres.sql'));
});

test('postgres migrations only include postgres files', () => {
  const files = listMigrationFiles('postgres');
  assert.ok(files.every((f) => /_postgres\.sql$/i.test(f)));
  assert.ok(files.includes('018_email_events_provider_message_id_postgres.sql'));
  assert.ok(files.includes('019_email_events_dedupe_scope_postgres.sql'));
});
