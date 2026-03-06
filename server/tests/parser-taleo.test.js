const test = require('node:test');
const assert = require('node:assert/strict');

const { parseJobEmail } = require('../src/parseJobEmail');

test('taleo parser extracts submission status role and company', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'noreply@company.taleo.net',
    fromDomain: 'company.taleo.net',
    subject: 'Submission status for Intern Hourly',
    text: [
      'Thank you for applying to Daiichi Sankyo.',
      'Position Title: Intern Hourly'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'taleo');
  assert.equal(parsed.company, 'Daiichi Sankyo');
  assert.equal(parsed.role, 'Intern Hourly');
  assert.ok(parsed.confidence.company >= 70);
  assert.ok(parsed.confidence.role >= 70);
});
