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

test('smartrecruiters parser resolves role-company dash subject with body anchors', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'notifications@smartrecruitersmail.com',
    fromDomain: 'smartrecruitersmail.com',
    subject: 'Quantitative Trading and Operations - Viewline Ventures',
    text: [
      'Thank you for applying to the Quantitative Trading and Operations role.',
      'We appreciate your interest in joining the Viewline Ventures team.',
      'Our hiring team has received your application and will be in touch.',
      'Powered by SmartRecruiters'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'smartrecruiters');
  assert.equal(parsed.status, 'applied');
  assert.equal(parsed.company, 'Viewline Ventures');
  assert.equal(parsed.role, 'Quantitative Trading and Operations');
});
