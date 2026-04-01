const test = require('node:test');
const assert = require('node:assert/strict');

const { parseJobEmail } = require('../src/parseJobEmail');

test('indeed parser extracts CubX Inc and full stack role', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'indeedapply@indeed.com',
    subject: 'Indeed Application: Full Stack Developer - Node.JS, Typescript, React',
    text: [
      'Application submitted',
      'Full Stack Developer - Node.JS, Typescript, React',
      'CubX Inc. - Freehold, NJ 07728',
      'Next steps'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'indeed_apply');
  assert.equal(parsed.company, 'CubX Inc');
  assert.equal(parsed.role, 'Full Stack Developer - Node.JS, Typescript, React');
  assert.ok(parsed.confidence.company >= 70);
  assert.ok(parsed.confidence.role >= 70);
});

test('indeed parser extracts Visual Computer Solutions and Mobile Developer', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'indeedapply@indeed.com',
    subject: 'Indeed Application: Mobile Developer',
    text: [
      'Application submitted',
      'Mobile Developer',
      'Visual Computer Solutions - Freehold, NJ 07728',
      'Next steps'
    ].join('\n')
  });

  assert.equal(parsed.company, 'Visual Computer Solutions');
  assert.equal(parsed.role, 'Mobile Developer');
  assert.ok(parsed.confidence.company >= 70);
  assert.ok(parsed.confidence.role >= 70);
});

test('indeed parser detects rejection and never sets company to Indeed', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'indeedapply@indeed.com',
    fromDomain: 'indeed.com',
    subject: 'Indeed Application: Mobile Developer',
    text: [
      'Application submitted',
      'Mobile Developer',
      'Visual Computer Solutions - Freehold, NJ 07728',
      'After careful consideration, we will not be moving forward with your application.'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'indeed_apply');
  assert.equal(parsed.company, 'Visual Computer Solutions');
  assert.notEqual(parsed.company, 'Indeed');
  assert.equal(parsed.role, 'Mobile Developer');
  assert.equal(parsed.status, 'rejected');
  assert.equal(parsed.parserDebug?.provider, 'indeed_apply');
  assert.equal(parsed.parserDebug?.status_source?.startsWith('rejection_phrase:'), true);
});

test('indeed parser detects interview requested with job context', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'indeedapply@indeed.com',
    fromDomain: 'indeed.com',
    subject: 'Indeed Application: Mobile Developer',
    text: [
      'We would like to schedule an interview for the Mobile Developer position at Visual Computer Solutions.',
      'Are you available this week for a quick phone screen?'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'indeed_apply');
  assert.equal(parsed.status, 'interview_requested');
  assert.ok(parsed.confidence.status >= 80);
});

test("indeed parser keeps o'clock confirmation as applied with correct company and role", async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'Indeed Apply <indeedapply@indeed.com>',
    fromDomain: 'indeed.com',
    subject: "Indeed Application: Sr. Analyst, Business Management Indeed o'clock Application submitted",
    text: [
      'Sr. Analyst, Business Management',
      'company logo',
      'Valley National Bank - New Jersey United States',
      'star rating 3.2 602 reviews',
      'The following items were sent to Valley National Bank. Good luck!',
      '• Application',
      '• Resume',
      'Next steps',
      '• The employer or job advertiser may reach out to you about your application.'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'indeed_apply');
  assert.equal(parsed.status, 'applied');
  assert.equal(parsed.company, 'Valley National Bank');
  assert.equal(parsed.role, 'Sr. Analyst, Business Management');
  assert.equal(parsed.parserDebug?.company_source, 'sent_items_sentence');
});

test('indeed parser extracts company from sent-items sentence in confirmation templates', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'indeedapply@indeed.com',
    fromDomain: 'indeed.com',
    subject: 'Indeed Application: Business Analyst',
    text: [
      'Application submitted',
      'Business Analyst',
      'company logo',
      'The following items were sent to Acme Financial Group. Good luck!',
      '• Application',
      '• Resume',
      'Next steps',
      '• The employer may reach out to you about your application.'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'indeed_apply');
  assert.equal(parsed.status, 'applied');
  assert.equal(parsed.company, 'Acme Financial Group');
  assert.equal(parsed.role, 'Business Analyst');
  assert.equal(parsed.parserDebug?.company_source, 'sent_items_sentence');
});
