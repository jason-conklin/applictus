const test = require('node:test');
const assert = require('node:assert/strict');

const { detectProvider } = require('../src/providers');

test('detectProvider identifies linkedin jobs confirmations', () => {
  const detected = detectProvider({
    fromEmail: 'jobs-noreply@linkedin.com',
    fromDomain: 'linkedin.com',
    subject: 'Jason, your application was sent to EarthCam',
    text: ''
  });
  assert.equal(detected.providerId, 'linkedin_jobs');
});

test('detectProvider identifies linkedin lifecycle rejection updates and ignores social noise', () => {
  const lifecycle = detectProvider({
    fromEmail: 'jobs-noreply@linkedin.com',
    fromDomain: 'linkedin.com',
    subject: 'Update on your application',
    text: 'After careful consideration, we will not be moving forward with your application.'
  });
  assert.equal(lifecycle.providerId, 'linkedin_jobs');

  const socialNoise = detectProvider({
    fromEmail: 'updates@linkedin.com',
    fromDomain: 'linkedin.com',
    subject: 'Top job picks for you',
    text: 'New jobs for you this week'
  });
  assert.notEqual(socialNoise.providerId, 'linkedin_jobs');
});

test('detectProvider identifies workable confirmations', () => {
  const detected = detectProvider({
    fromEmail: 'noreply@candidates.workablemail.com',
    fromDomain: 'candidates.workablemail.com',
    subject: 'Thanks for applying to EarthCam',
    text: 'Your application for the Jr. Python Developer job was submitted successfully.'
  });
  assert.equal(detected.providerId, 'workable_candidates');
});

test('detectProvider identifies indeed apply and workday', () => {
  const indeed = detectProvider({
    fromEmail: 'indeedapply@indeed.com',
    fromDomain: 'indeed.com',
    subject: 'Indeed Application: Full Stack Developer',
    text: ''
  });
  assert.equal(indeed.providerId, 'indeed_apply');

  const indeedLifecycle = detectProvider({
    fromEmail: 'alerts@indeed.com',
    fromDomain: 'indeed.com',
    subject: 'Application update',
    text: 'After careful consideration, we will not be moving forward with your application.'
  });
  assert.equal(indeedLifecycle.providerId, 'indeed_apply');

  const indeedEmailDomainVariant = detectProvider({
    fromEmail: 'noreply@indeedemail.com',
    fromDomain: 'indeedemail.com',
    subject: "Indeed Application: Sr. Analyst, Business Management Indeed o'clock Application submitted",
    text:
      'The following items were sent to Valley National Bank. Good luck! The employer or job advertiser may reach out to you about your application.'
  });
  assert.equal(indeedEmailDomainVariant.providerId, 'indeed_apply');

  const workday = detectProvider({
    fromEmail: 'noreply@myworkday.com',
    fromDomain: 'myworkday.com',
    subject: 'Application update',
    text: 'Thank you for applying for the role of Software Developer.'
  });
  assert.equal(workday.providerId, 'workday');
});

test('detectProvider identifies greenhouse, lever, icims, smartrecruiters, and taleo', () => {
  const greenhouse = detectProvider({
    fromEmail: 'no-reply@greenhouse.io',
    fromDomain: 'greenhouse.io',
    subject: 'Your application was submitted',
    text: 'Thank you for applying to Northstar Labs'
  });
  assert.equal(greenhouse.providerId, 'greenhouse');

  const lever = detectProvider({
    fromEmail: 'noreply@hire.lever.co',
    fromDomain: 'hire.lever.co',
    subject: 'Application confirmation',
    text: 'Thanks for applying to Acme Labs'
  });
  assert.equal(lever.providerId, 'lever');

  const icims = detectProvider({
    fromEmail: 'noreply@talent.icims.com',
    fromDomain: 'talent.icims.com',
    subject: 'Thank you for your interest in Contoso Health',
    text: 'Requisition Title: Systems Analyst'
  });
  assert.equal(icims.providerId, 'icims');

  const smartRecruiters = detectProvider({
    fromEmail: 'jobs@smartrecruitersmail.com',
    fromDomain: 'smartrecruitersmail.com',
    subject: 'Your application has been received',
    text: 'Application for Backend Engineer at Nimbus'
  });
  assert.equal(smartRecruiters.providerId, 'smartrecruiters');

  const taleo = detectProvider({
    fromEmail: 'noreply@company.taleo.net',
    fromDomain: 'company.taleo.net',
    subject: 'Submission status for Intern Hourly',
    text: 'Thank you for applying to Daiichi Sankyo'
  });
  assert.equal(taleo.providerId, 'taleo');
});
