const test = require('node:test');
const assert = require('node:assert/strict');

const { initReasonCounters, REASON_KEYS } = require('../src/ingest');

test('sync summary counters include required reason codes', () => {
  const reasons = initReasonCounters();
  assert.deepEqual(Object.keys(reasons).sort(), [...REASON_KEYS].sort());
  for (const key of REASON_KEYS) {
    assert.equal(reasons[key], 0);
  }
});
