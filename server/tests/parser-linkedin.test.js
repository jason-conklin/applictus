const test = require('node:test');
const assert = require('node:assert/strict');

const { parseJobEmail } = require('../src/parseJobEmail');

test('linkedin parser extracts role from line above company/location and strips numeric id suffix', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'jobs-noreply@linkedin.com',
    fromDomain: 'linkedin.com',
    subject: 'Jason, your application was sent to Orion Innovation',
    text: [
      'Your application was sent to Orion Innovation',
      '',
      'Programmer Analyst (21243)',
      'Orion Innovation · Edison, NJ (On-site)'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'linkedin_jobs');
  assert.equal(parsed.company, 'Orion Innovation');
  assert.equal(parsed.role, 'Programmer Analyst');
  assert.ok(parsed.confidence.role >= 80);
  assert.equal(parsed.parserDebug?.role_source, 'line_above_company');
  assert.equal(parsed.parserDebug?.linkedin_role_line_detected, 'Programmer Analyst (21243)');
  assert.equal(parsed.parserDebug?.linkedin_role_cleaned, 'Programmer Analyst');
});

test('linkedin parser extracts role from line above company/location without id suffix', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'jobs-noreply@linkedin.com',
    fromDomain: 'linkedin.com',
    subject: 'Your application was sent to CompanyName',
    text: [
      'Software Engineer',
      'CompanyName · New York, NY'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'linkedin_jobs');
  assert.equal(parsed.company, 'CompanyName');
  assert.equal(parsed.role, 'Software Engineer');
  assert.ok(parsed.confidence.role >= 80);
  assert.equal(parsed.parserDebug?.role_source, 'line_above_company');
});

test('linkedin parser does not treat company location line as role', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'jobs-noreply@linkedin.com',
    fromDomain: 'linkedin.com',
    subject: 'Your application was sent to Orion Innovation',
    text: [
      'Your application was sent to Orion Innovation',
      'Orion Innovation · Edison, NJ (On-site)',
      'View application'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'linkedin_jobs');
  assert.equal(parsed.company, 'Orion Innovation');
  assert.ok(!parsed.role || parsed.role !== 'Orion Innovation');
});
