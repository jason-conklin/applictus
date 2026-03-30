const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJobEmail } = require('../src/parseJobEmail');

test('LinkedIn applied confirmation stays applied despite CTA', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'jobs-noreply@linkedin.com',
    fromDomain: 'linkedin.com',
    subject: 'Your application was sent to Robert Half',
    text: [
      'Your application was sent to Robert Half',
      'Robert Half',
      'Junior Applications Developer (.NET and Angular (or React))',
      'Robert Half · Morris Plains, NJ (On-site)',
      'Applied on March 28, 2026',
      'Now, take these next steps for more success'
    ].join('\n')
  });
  assert.equal(parsed.status, 'applied');
});

test('iCIMS-style rejection detected with company', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'noreply@talent.icims.com',
    fromDomain: 'talent.icims.com',
    subject: 'Application update',
    text: [
      'Hi Jason,',
      'Thank you for your interest in employment with Lord Abbett.',
      'We have reviewed your resume and, unfortunately, we will not be moving forward with your candidacy at this time.',
      'We appreciate your interest in Lord Abbett and wish you continued career success.'
    ].join('\n')
  });
  assert.equal(parsed.status, 'rejected');
  assert.equal(parsed.company, 'Lord Abbett');
});

test('Explicit interview language still classifies as interview', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'recruiter@example.com',
    subject: 'Next step: schedule your interview',
    text: [
      'Hi Jason,',
      'We would like to schedule a 30-minute interview.',
      'Please select a time slot on our calendar so we can connect.',
      'Looking forward to speaking with you.'
    ].join('\n')
  });
  assert.equal(parsed.status, 'interview_requested');
});

test('Generic CTA does not upgrade to interview', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'jobs-noreply@linkedin.com',
    subject: 'Application received',
    text: [
      'Your application was sent to ExampleCo',
      'Applied on March 1, 2026',
      'View similar jobs for more success'
    ].join('\n')
  });
  assert.equal(parsed.status, 'applied');
});

