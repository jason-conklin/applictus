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

test('lever parser extracts company and role from next-step assessment email', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'Veeva Systems <no-reply@hire.lever.co>',
    subject: 'Jason Conklin - Next Steps for your Consultant Development Program Application',
    text: [
      'For the next step in your interview process, you will take the Rembrandt Personality Assessment.',
      'You will have 3 business days to complete the assessment.',
      'The assessment takes about 25 minutes to complete and must be completed in one sitting.',
      'When ready to begin, click on the following link to take the assessment.'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'lever');
  assert.equal(parsed.company, 'Veeva Systems');
  assert.equal(parsed.role, 'Consultant Development Program');
  assert.equal(parsed.status, 'interview_requested');
  assert.equal(parsed.actionNeeded, true);
  assert.ok(parsed.confidence.company >= 90);
  assert.ok(parsed.confidence.role >= 90);
  assert.ok(parsed.confidence.status >= 90);
  assert.equal(parsed.parserDebug?.company_source, 'sender_display');
  assert.equal(parsed.parserDebug?.role_source, 'subject_next_steps_application');
  assert.equal(parsed.parserDebug?.status_signal?.decision_reason, 'assessment_interview_stage_signals');
});
