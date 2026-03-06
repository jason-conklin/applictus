const test = require('node:test');
const assert = require('node:assert/strict');

const { parseJobEmail } = require('../src/parseJobEmail');

test('greenhouse parser extracts company and role from confirmation email', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'no-reply@greenhouse.io',
    fromDomain: 'greenhouse.io',
    subject: 'Thank you for applying to Northstar Labs',
    text: [
      'Your application was submitted.',
      'Application for Senior Backend Engineer has been received.'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'greenhouse');
  assert.equal(parsed.company, 'Northstar Labs');
  assert.equal(parsed.role, 'Senior Backend Engineer');
  assert.ok(parsed.confidence.company >= 70);
  assert.ok(parsed.confidence.role >= 70);
});
