const test = require('node:test');
const assert = require('node:assert/strict');

const { parseJobEmail } = require('../src/parseJobEmail');

test('lever parser extracts company and role from application confirmation', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'noreply@hire.lever.co',
    fromDomain: 'hire.lever.co',
    subject: 'Application confirmation',
    text: [
      'Thanks for applying to Acme Labs.',
      'We received your application for Senior Product Designer at Acme Labs.'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'lever');
  assert.equal(parsed.company, 'Acme Labs');
  assert.equal(parsed.role, 'Senior Product Designer');
  assert.ok(parsed.confidence.company >= 70);
  assert.ok(parsed.confidence.role >= 70);
});
