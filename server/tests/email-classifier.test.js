const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyEmail } = require('../../shared/emailClassifier');

test('classifyEmail rejects newsletters via denylist', () => {
  const result = classifyEmail({
    subject: 'Weekly newsletter',
    snippet: 'Unsubscribe here'
  });
  assert.equal(result.isJobRelated, false);
});

test('classifyEmail detects application confirmation', () => {
  const result = classifyEmail({
    subject: 'Application received',
    snippet: 'Thank you for applying to Acme'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'confirmation');
  assert.ok(result.confidenceScore >= 0.85);
});

test('classifyEmail detects generic thanks for applying', () => {
  const result = classifyEmail({
    subject: 'Thank you for applying!',
    snippet: ''
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'confirmation');
});

test('classifyEmail detects interview request', () => {
  const result = classifyEmail({
    subject: 'Interview invitation',
    snippet: 'Please select a time for an interview'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'interview');
});

test('classifyEmail detects under review updates', () => {
  const result = classifyEmail({
    subject: 'Application status: Under review',
    snippet: 'Your application is under review.'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'under_review');
});

test('classifyEmail detects under consideration updates', () => {
  const result = classifyEmail({
    subject: 'Application update',
    snippet: 'Your application is under consideration.'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'under_review');
});

test('classifyEmail detects rejection', () => {
  const result = classifyEmail({
    subject: 'Application update',
    snippet: 'We regret to inform you that the position has been filled.'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'rejection');
});

test('classifyEmail detects rejection via moving forward language', () => {
  const result = classifyEmail({
    subject: 'Application update',
    snippet: 'We will not be moving forward with your application.'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'rejection');
});

test('classifyEmail detects offer', () => {
  const result = classifyEmail({
    subject: 'Offer letter',
    snippet: 'We are pleased to offer you the role.'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'offer');
});

test('classifyEmail detects recruiter outreach', () => {
  const result = classifyEmail({
    subject: 'Recruiter from Acme',
    snippet: 'Reaching out about a new opportunity'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'recruiter_outreach');
});

test('classifyEmail detects other job related signals', () => {
  const result = classifyEmail({
    subject: 'Application status update',
    snippet: 'Check the candidate portal for your application.'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'other_job_related');
});

test('classifyEmail denylist overrides allowlist', () => {
  const result = classifyEmail({
    subject: 'Application received newsletter',
    snippet: 'Unsubscribe from updates'
  });
  assert.equal(result.isJobRelated, false);
});

test('classifyEmail stays conservative with neutral content', () => {
  const result = classifyEmail({
    subject: 'Hello there',
    snippet: 'Just checking in'
  });
  assert.equal(result.isJobRelated, false);
});
