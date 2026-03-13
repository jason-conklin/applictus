const test = require('node:test');
const assert = require('node:assert/strict');

const { parseJobEmail } = require('../src/parseJobEmail');

test('workable parser extracts company and role from top confirmation block', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'noreply@candidates.workablemail.com',
    fromDomain: 'candidates.workablemail.com',
    subject: 'Thanks for applying to EarthCam',
    text: [
      'EarthCam',
      'Your application for the Jr. Python Developer job was submitted successfully.',
      "Here's a copy of your application data...",
      'Personal information',
      'Operations & Logistics Assistant'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'workable_candidates');
  assert.equal(parsed.company, 'EarthCam');
  assert.equal(parsed.role, 'Jr. Python Developer');
  assert.equal(parsed.status, 'applied');
  assert.equal(parsed.parserDebug?.provider, 'workable_candidates');
  assert.ok(Array.isArray(parsed.parserDebug?.ignored_sections));
});

test('workable parser detects rejection and ignores resume/application-data sections', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'noreply@candidates.workablemail.com',
    fromDomain: 'candidates.workablemail.com',
    subject: 'Thanks for applying to EarthCam',
    text: [
      'EarthCam',
      'Your application for the Jr. Python Developer job was submitted successfully.',
      'After careful consideration, we will not be moving forward with your application.',
      "Here's a copy of your application data...",
      'Personal information',
      'Operations & Logistics Assistant',
      'Education'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'workable_candidates');
  assert.equal(parsed.company, 'EarthCam');
  assert.equal(parsed.role, 'Jr. Python Developer');
  assert.equal(parsed.status, 'rejected');
  assert.equal(parsed.parserDebug?.status_source?.startsWith('rejection_phrase:'), true);
});

test('workable parser detects interview requested from scheduling language', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'noreply@candidates.workablemail.com',
    fromDomain: 'candidates.workablemail.com',
    subject: 'Thanks for applying to EarthCam',
    text: [
      'EarthCam',
      'Your application for the Jr. Python Developer job was submitted successfully.',
      "We'd like to schedule an interview and discuss next steps.",
      'Are you available for a phone screen this week?'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'workable_candidates');
  assert.equal(parsed.status, 'interview_requested');
  assert.ok(parsed.confidence.status >= 80);
});
