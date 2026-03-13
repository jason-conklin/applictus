const test = require('node:test');
const assert = require('node:assert/strict');

const { parseJobEmail } = require('../src/parseJobEmail');

test('workday parser normalizes Azenta company and role', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'recruiting@azenta.myworkday.com',
    fromDomain: 'azenta.myworkday.com',
    subject: 'Application update',
    text: [
      'Thank you for applying for the role of Software Developer .',
      'Azenta Recruiting Department'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'workday');
  assert.equal(parsed.company, 'Azenta');
  assert.equal(parsed.role, 'Software Developer');
  assert.ok(parsed.confidence.company >= 70);
  assert.ok(parsed.confidence.role >= 70);
});

test('workday parser marks strong rejection language as rejected', async () => {
  const body = [
    'Brown Brothers Harriman & Co. Follow up',
    '',
    'Dear Jason Conklin,',
    '',
    'Thank you for expressing your interest in Brown Brothers Harriman.',
    '',
    'We regret to inform you that we will not be taking your application further at this time.',
    '',
    'Business Process: Job Application: Jason Conklin - 69073 Junior Full Stack Java Developer on 01/19/2026',
    'Subject: Jason Conklin - 69073 Junior Full Stack Java Developer'
  ].join('\n');
  const parsed = await parseJobEmail({
    fromEmail: 'bbh@myworkday.com',
    fromDomain: 'myworkday.com',
    subject: 'Brown Brothers Harriman & Co. Follow up',
    text: body
  });

  assert.equal(parsed.providerId, 'workday');
  assert.equal(parsed.status, 'rejected');
  assert.ok(parsed.confidence.status >= 90);
});

test('workday parser extracts role from Business Process metadata safely', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'bbh@myworkday.com',
    fromDomain: 'myworkday.com',
    subject: 'Application update',
    text:
      'Business Process: Job Application: Jason Conklin - 69073 Junior Full Stack Java Developer on 01/19/2026'
  });

  assert.equal(parsed.providerId, 'workday');
  assert.equal(parsed.role, 'Junior Full Stack Java Developer');
  assert.ok(parsed.confidence.role >= 80);
});

test('workday parser extracts company from expressing interest phrase', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'bbh@myworkday.com',
    fromDomain: 'myworkday.com',
    subject: 'Application update',
    text: 'Thank you for expressing your interest in Brown Brothers Harriman.'
  });

  assert.equal(parsed.providerId, 'workday');
  assert.equal(parsed.company, 'Brown Brothers Harriman');
});

test('workday parser avoids metadata token company and returns BBH rejection identity', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'bbh@myworkday.com',
    fromDomain: 'myworkday.com',
    subject: 'Brown Brothers Harriman & Co. Follow up',
    text: [
      'Brown Brothers Harriman & Co. Follow up',
      'Thank you for expressing your interest in Brown Brothers Harriman.',
      'We regret to inform you that we will not be taking your application further at this time.',
      'Business Process: Job Application: Jason Conklin - 69073 Junior Full Stack Java Developer on 01/19/2026',
      'Subject: Jason Conklin - 69073 Junior Full Stack Java Developer'
    ].join('\n')
  });

  assert.equal(parsed.company, 'Brown Brothers Harriman');
  assert.equal(parsed.role, 'Junior Full Stack Java Developer');
  assert.equal(parsed.status, 'rejected');
  assert.notEqual(parsed.company, 'on 01/19/2026');
  assert.equal(parsed.parserDebug?.provider, 'workday');
  assert.equal(parsed.parserDebug?.company_source, 'header');
  assert.equal(parsed.parserDebug?.role_source, 'business_process');
  assert.ok(Array.isArray(parsed.parserDebug?.ignored_metadata_lines));
});

test('workday parser detects interview requested from scheduling language', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'bbh@myworkday.com',
    fromDomain: 'myworkday.com',
    subject: 'Brown Brothers Harriman & Co. Follow up',
    text: [
      'Thank you for expressing your interest in Brown Brothers Harriman.',
      "We'd like to schedule an interview for the Junior Full Stack Java Developer role.",
      'Please share your availability and time slots this week.',
      'Business Process: Job Application: Jason Conklin - 69073 Junior Full Stack Java Developer on 01/19/2026'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'workday');
  assert.equal(parsed.company, 'Brown Brothers Harriman');
  assert.equal(parsed.role, 'Junior Full Stack Java Developer');
  assert.equal(parsed.status, 'interview_requested');
  assert.ok(parsed.confidence.status >= 80);
  assert.equal(parsed.parserDebug?.provider, 'workday');
});
