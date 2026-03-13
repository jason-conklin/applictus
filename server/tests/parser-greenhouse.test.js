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

test('greenhouse parser detects rejection with clear phrasing', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'no-reply@greenhouse.io',
    fromDomain: 'greenhouse.io',
    subject: 'Application update from Northstar Labs',
    text: [
      'Thank you for applying to Northstar Labs.',
      'After careful consideration, we will not be moving forward with your application.'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'greenhouse');
  assert.equal(parsed.company, 'Northstar Labs');
  assert.equal(parsed.status, 'rejected');
  assert.equal(parsed.parserDebug?.provider, 'greenhouse');
});

test('greenhouse parser detects interview requested signals', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'no-reply@greenhouse.io',
    fromDomain: 'greenhouse.io',
    subject: 'Interview request for Senior Backend Engineer',
    text: [
      'Thank you for applying to Northstar Labs.',
      "We'd like to schedule an interview for the Senior Backend Engineer role.",
      'Are you available for a phone screen this week?'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'greenhouse');
  assert.equal(parsed.status, 'interview_requested');
  assert.ok(parsed.confidence.status >= 80);
});
