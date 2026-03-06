const test = require('node:test');
const assert = require('node:assert/strict');

const { parseJobEmail } = require('../src/parseJobEmail');

test('smartrecruiters parser extracts role and company from receipt email', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'jobs@smartrecruitersmail.com',
    fromDomain: 'smartrecruitersmail.com',
    subject: 'Your application has been received for Backend Engineer at Nimbus',
    text: [
      'Your application has been received.',
      'Application for Backend Engineer at Nimbus has been received.'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'smartrecruiters');
  assert.equal(parsed.company, 'Nimbus');
  assert.equal(parsed.role, 'Backend Engineer');
  assert.ok(parsed.confidence.company >= 70);
  assert.ok(parsed.confidence.role >= 70);
});
