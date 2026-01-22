const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SYSTEM_MESSAGE,
  OUTPUT_SCHEMA,
  EXAMPLES,
  buildPrompt,
  validateOrThrow
} = require('../src/llm/promptTemplate');

test('SYSTEM_MESSAGE enforces JSON only', () => {
  assert.ok(SYSTEM_MESSAGE.toLowerCase().includes('json'));
  assert.ok(SYSTEM_MESSAGE.toLowerCase().includes('never guess'));
});

test('buildPrompt includes schema and examples', () => {
  const prompt = buildPrompt({
    from: 'test@example.com',
    subject: 'Hello',
    snippet: 'Thanks for applying',
    bodyText: 'Body'
  });
  assert.equal(prompt[0].role, 'system');
  assert.equal(prompt[1].role, 'user');
  const userContent = prompt[1].content;
  assert.ok(userContent.includes('Use the following schema'));
  assert.ok(userContent.includes(JSON.stringify(OUTPUT_SCHEMA, null, 2)));
  assert.ok(userContent.includes('Examples:'));
});

test('examples conform to schema', () => {
  for (const ex of EXAMPLES) {
    const text = JSON.stringify(ex.output);
    const validated = validateOrThrow(text);
    assert.ok(validated);
  }
});

test('validateOrThrow rejects non-json wrapper', () => {
  assert.throws(() => validateOrThrow('```json\n{"is_job_related":true}\n```'));
});

test('validateOrThrow rejects wrong enum', () => {
  const bad = { ...EXAMPLES[0].output, event_type: 'invalid' };
  const parsed = validateOrThrow(JSON.stringify(bad));
  assert.equal(parsed.event_type, 'other_job_related');
});

test('validateOrThrow rejects confidence out of range', () => {
  const bad = { ...EXAMPLES[0].output, confidence: 2 };
  assert.throws(() => validateOrThrow(JSON.stringify(bad)));
});
