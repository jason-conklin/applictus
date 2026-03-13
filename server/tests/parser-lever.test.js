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

test('lever parser detects rejection from lifecycle update', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'noreply@hire.lever.co',
    fromDomain: 'hire.lever.co',
    subject: 'Application update',
    text: [
      'Thanks for applying to Acme Labs.',
      'After careful consideration, we are not moving forward with your application for Senior Product Designer.'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'lever');
  assert.equal(parsed.company, 'Acme Labs');
  assert.equal(parsed.status, 'rejected');
  assert.equal(parsed.parserDebug?.provider, 'lever');
});

test('lever parser detects interview request with role context', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'noreply@hire.lever.co',
    fromDomain: 'hire.lever.co',
    subject: 'Application confirmation',
    text: [
      'Thanks for applying to Acme Labs.',
      "We'd like to schedule an interview for Senior Product Designer.",
      'Please send two time slots that work for you.'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'lever');
  assert.equal(parsed.status, 'interview_requested');
  assert.ok(parsed.confidence.status >= 80);
});
