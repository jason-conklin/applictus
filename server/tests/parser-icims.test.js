const test = require('node:test');
const assert = require('node:assert/strict');

const { parseJobEmail } = require('../src/parseJobEmail');

test('icims parser extracts company and requisition role', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'noreply@talent.icims.com',
    fromDomain: 'talent.icims.com',
    subject: 'Thank you for your interest in Contoso Health',
    text: [
      'Thank you for your interest in Contoso Health.',
      'Requisition Title: Systems Analyst',
      'Requisition ID: 9981'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'icims');
  assert.equal(parsed.company, 'Contoso Health');
  assert.equal(parsed.role, 'Systems Analyst');
  assert.ok(parsed.confidence.company >= 70);
  assert.ok(parsed.confidence.role >= 70);
});
