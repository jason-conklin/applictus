const test = require('node:test');
const assert = require('node:assert/strict');

const { parseJobEmail } = require('../src/parseJobEmail');

async function parseIndeedApplication({ role, bodyLines, subjectRole = role }) {
  return parseJobEmail({
    fromEmail: 'Indeed Apply <indeedapply@indeed.com>',
    fromDomain: 'indeed.com',
    subject: `Indeed Application: ${subjectRole}`,
    text: bodyLines.join('\n')
  });
}

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

test('indeed parser extracts Black Rocket Productions from Apply confirmation', async () => {
  const parsed = await parseIndeedApplication({
    role: 'Summer Technology Camp Teacher',
    bodyLines: [
      'Application submitted',
      'Summer Technology Camp Teacher',
      'company logo',
      'Black Rocket Productions - Union NJ',
      'The following items were sent to Black Rocket Productions. Good luck!'
    ]
  });

  assert.equal(parsed.providerId, 'indeed_apply');
  assert.equal(parsed.status, 'applied');
  assert.equal(parsed.company, 'Black Rocket Productions');
  assert.equal(parsed.role, 'Summer Technology Camp Teacher');
  assert.equal(parsed.parserDebug?.company_source, 'sent_items_sentence');
});

test('indeed parser extracts Gemco from Apply confirmation', async () => {
  const parsed = await parseIndeedApplication({
    role: 'Operations Coordinator Co-Op',
    bodyLines: [
      'Application submitted',
      'Operations Coordinator Co-Op',
      'company logo',
      'Gemco - Middlesex, NJ, 08846',
      'The following items were sent to Gemco. Good luck!'
    ]
  });

  assert.equal(parsed.providerId, 'indeed_apply');
  assert.equal(parsed.status, 'applied');
  assert.equal(parsed.company, 'Gemco');
  assert.equal(parsed.role, 'Operations Coordinator Co-Op');
  assert.equal(parsed.parserDebug?.company_source, 'sent_items_sentence');
});

test('indeed parser handles company names with commas and hyphens', async () => {
  const commaCompany = await parseIndeedApplication({
    role: 'Data Analyst',
    bodyLines: [
      'Application submitted',
      'Data Analyst',
      'company logo',
      'Smith, Johnson & Co. - New York, NY',
      'The following items were sent to Smith, Johnson & Co. Good luck!'
    ]
  });
  const hyphenCompany = await parseIndeedApplication({
    role: 'Camp Counselor',
    bodyLines: [
      'Application submitted',
      'Camp Counselor',
      'company logo',
      'Bright-Star Learning - Austin, TX',
      'The following items were sent to Bright-Star Learning. Good luck!'
    ]
  });

  assert.equal(commaCompany.company, 'Smith, Johnson & Co');
  assert.equal(commaCompany.role, 'Data Analyst');
  assert.equal(hyphenCompany.company, 'Bright-Star Learning');
  assert.equal(hyphenCompany.role, 'Camp Counselor');
});

test('indeed parser falls back to company/location line when sent-items sentence is missing', async () => {
  const parsed = await parseIndeedApplication({
    role: 'Summer Technology Camp Teacher',
    bodyLines: [
      'Application submitted',
      'Summer Technology Camp Teacher',
      'company logo',
      'Black Rocket Productions - Union NJ',
      'Next steps',
      'The employer or job advertiser may reach out to you about your application.'
    ]
  });

  assert.equal(parsed.providerId, 'indeed_apply');
  assert.equal(parsed.status, 'applied');
  assert.equal(parsed.company, 'Black Rocket Productions');
  assert.equal(parsed.role, 'Summer Technology Camp Teacher');
  assert.equal(parsed.parserDebug?.company_source, 'submitted_block');
});

test('indeed parser does not allow role to become company', async () => {
  const parsed = await parseIndeedApplication({
    role: 'Summer Technology Camp Teacher',
    bodyLines: [
      'Application submitted',
      'Summer Technology Camp Teacher',
      'Next steps',
      'The employer or job advertiser may reach out to you about your application.'
    ]
  });

  assert.equal(parsed.providerId, 'indeed_apply');
  assert.equal(parsed.status, 'applied');
  assert.equal(parsed.role, 'Summer Technology Camp Teacher');
  assert.notEqual(parsed.company, 'Summer Technology Camp Teacher');
});
