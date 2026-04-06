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

test('Workday polite rejection phrasing is classified as rejected', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'arch@myworkday.com',
    fromDomain: 'myworkday.com',
    subject: 'Application Update',
    text: [
      'Hello Jason,',
      '',
      'Thank you for your interest in Arch and taking the time to submit your application for the Data Quality Analyst, Statistical Reporting, Workers Compensation position.',
      '',
      'We have carefully reviewed your application. At this time we have decided to pursue other candidates who we believe most closely meet the current needs of Arch at this time.',
      '',
      'If you have applied for other positions, please note that this message is only in reference to the Data Quality Analyst, Statistical Reporting, Workers Compensation position.',
      '',
      'We wish you all the best and hope you consider Arch for future career opportunities.',
      '',
      'All the best,',
      'Arch Talent Acquisition Team'
    ].join('\n')
  });
  assert.equal(parsed.status, 'rejected');
  assert.equal(parsed.company, 'Arch');
  assert.match(String(parsed.role || ''), /Data Quality Analyst/i);
  assert.ok(Array.isArray(parsed.parserDebug?.status_signal?.rejection_matches));
  assert.ok(Array.isArray(parsed.parserDebug?.status_signal?.applied_matches));
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

test('application receipt with conditional interview phrasing stays applied and does not emit pronoun role', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'noreply@adp.com',
    fromDomain: 'adp.com',
    subject: 'Thank you for your submission',
    text: [
      'Thank you for your submission.',
      'We have received your application.',
      'You will be contacted if we need additional information or wish to schedule an interview with you.',
      'We look forward to reviewing your application and will be in touch soon.',
      'Guidepost Solutions Talent Acquisition'
    ].join('\n')
  });
  assert.equal(parsed.status, 'applied');
  assert.ok(parsed.role === null || parsed.role === undefined);
  assert.notEqual(String(parsed.role || '').toLowerCase(), 'you');
  assert.ok(Array.isArray(parsed.parserDebug?.status_signal?.applied_matches));
  assert.ok(parsed.parserDebug.status_signal.applied_matches.includes('received_your_application'));
});
