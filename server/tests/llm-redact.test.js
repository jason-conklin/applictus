const test = require('node:test');
const assert = require('node:assert/strict');
const { redactContent } = require('../src/llm/redact');

test('redactContent removes emails/phones/urls and keeps req ids', () => {
  const input = {
    subject: 'Thank you',
    snippet: 'Please see https://example.com and email me at test@example.com',
    bodyText: 'Hi Jason, call +1 (555) 123-4567. Requisition R-123456.'
  };
  const { redacted } = redactContent({ ...input, maxChars: 500 });
  assert.ok(!redacted.includes('example.com'));
  assert.ok(!redacted.includes('555'));
  assert.ok(!redacted.includes('test@example.com'));
  assert.ok(redacted.includes('<REQ_ID>'));
});
