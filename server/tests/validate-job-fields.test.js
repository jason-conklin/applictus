const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeRole, validateJobFields } = require('../src/validateJobFields');

test('normalizeRole rejects pronoun-only role value', () => {
  const notes = [];
  const role = normalizeRole('you', { notes });
  assert.equal(role, undefined);
  assert.ok(notes.some((note) => String(note).includes('role_rejected:forbidden')));
});

test('validateJobFields rejects stopword-only role phrase', () => {
  const result = validateJobFields({
    company: 'Guidepost Solutions',
    role: 'your application',
    notes: []
  });
  assert.equal(result.company, 'Guidepost Solutions');
  assert.equal(result.role, undefined);
  assert.ok(result.notes.some((note) => String(note).includes('role_rejected:forbidden_phrase')));
});
