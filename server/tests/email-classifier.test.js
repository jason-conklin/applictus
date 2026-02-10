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

test('classifyEmail detects detailed rejection template with job context', () => {
  const result = classifyEmail({
    subject: 'Application update',
    snippet:
      'Thank you for applying to the Outreach Coordinator/Marketer position at Embrace Psychiatric Wellness Center. Unfortunately, Embrace Psychiatric Wellness Center has moved to the next step in their hiring process, and your application was not selected at this time.'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'rejection');
  assert.ok(result.confidenceScore >= 0.95);
});

test('classifyEmail detects Indeed-style rejection', () => {
  const result = classifyEmail({
    subject: 'An update on your application from Embrace Psychiatric Wellness Center',
    snippet:
      'Thank you for applying to the Outreach Coordinator/Marketer position at Embrace Psychiatric Wellness Center. Unfortunately, your application was not selected at this time.'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'rejection');
  assert.ok(result.confidenceScore >= 0.9);
});

test('classifyEmail detects Breezy rejection', () => {
  const result = classifyEmail({
    subject: '[Job Title] Application Update',
    snippet:
      'Thank you for your interest in the Recruiter position. After reviewing your application, we have decided to move forward with candidates.'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'rejection');
  assert.ok(result.confidenceScore >= 0.9);
});

test('classifyEmail detects applytojob rejection', () => {
  const result = classifyEmail({
    subject: 'Brilliant Agency - Social Media Manager',
    snippet: 'At this time, we have decided to go in a different direction.'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'rejection');
  assert.ok(result.confidenceScore >= 0.9);
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

test('LinkedIn social notification is not interview (share their thoughts)', () => {
  const result = classifyEmail({
    subject: 'Ronald A. Brokenshire, PE, SE and others share their thoughts on LinkedIn',
    snippet: 'See their reaction and join the conversation',
    sender: 'notifications@linkedin.com'
  });
  assert.notEqual(result.detectedType, 'interview');
});

test('LinkedIn social notification reacted to post is not interview', () => {
  const result = classifyEmail({
    subject: 'Alex reacted to this post',
    snippet: 'View Alex’s post and your next steps',
    sender: 'notifications-noreply@linkedin.com'
  });
  assert.notEqual(result.detectedType, 'interview');
});

test('Phone screen invite with scheduling context stays interview', () => {
  const result = classifyEmail({
    subject: 'Phone screen availability',
    snippet: 'Please select a time for a phone screen with our recruiter',
    sender: 'recruiter@company.com',
    body: 'We would like to schedule a phone screen. Please share your availability or use Calendly.'
  });
  assert.equal(result.detectedType, 'interview');
});

test('classifyEmail denylist overrides allowlist', () => {
  const result = classifyEmail({
    subject: 'Application received newsletter',
    snippet: 'Unsubscribe from updates'
  });
  assert.equal(result.isJobRelated, false);
});

test('classifyEmail does not treat unsubscribe-only as rejection', () => {
  const result = classifyEmail({
    subject: 'Not moving forward',
    snippet: 'Unsubscribe'
  });
  assert.equal(result.isJobRelated, false);
});

test('classifyEmail avoids rejection when no job context', () => {
  const result = classifyEmail({
    subject: 'Selection update',
    snippet: 'You were not selected for the giveaway.'
  });
  assert.notEqual(result.detectedType, 'rejection');
});

test('classifyEmail captures job id signals', () => {
  const result = classifyEmail({
    subject: 'Job ID 12345',
    snippet: ''
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'other_job_related');
});

test('classifyEmail stays conservative with neutral content', () => {
  const result = classifyEmail({
    subject: 'Hello there',
    snippet: 'Just checking in'
  });
  assert.equal(result.isJobRelated, false);
});

test('classifyEmail detects LinkedIn Easy Apply confirmation', () => {
  const result = classifyEmail({
    subject: 'Jason, your application was sent to BeaconFire Inc.',
    snippet: 'Your application was sent to BeaconFire Inc. Applied on January 23, 2026.',
    sender: 'jobs-noreply@linkedin.com'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'confirmation');
  assert.ok(result.confidenceScore >= 0.92);
});

test('classifyEmail detects LinkedIn rejection update (Concorde Research Technologies)', () => {
  const result = classifyEmail({
    subject: 'Your application to Software Engineer at Concorde Research Technologies',
    snippet:
      'Your update from Concorde Research Technologies. Unfortunately, we will not be moving forward with your application at this time.',
    sender: 'jobs-noreply@linkedin.com'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'rejection');
  assert.ok(result.confidenceScore >= 0.95);
});

test('classifyEmail detects LinkedIn rejection update (Tata Consultancy Services)', () => {
  const result = classifyEmail({
    subject: 'Your application to Data Analyst at Tata Consultancy Services',
    snippet:
      'Your update from Tata Consultancy Services. We will not be moving forward with your application.',
    sender: 'jobs-noreply@linkedin.com'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'rejection');
  assert.ok(result.confidenceScore >= 0.95);
});

test('classifyEmail keeps LinkedIn newsletter/social notices out of rejection', () => {
  const result = classifyEmail({
    subject: 'Top jobs this week on LinkedIn',
    snippet: 'Unsubscribe from these updates at any time.',
    sender: 'notifications-noreply@linkedin.com'
  });
  assert.notEqual(result.detectedType, 'rejection');
});

test('classifyEmail rejection wins when body contains rejection cues', () => {
  const result = classifyEmail({
    subject: 'Application Update',
    snippet: 'Thank you for applying for the Full Stack role',
    body: 'We appreciate your interest. Unfortunately we are unable to move forward with your application at this time.'
  });
  assert.equal(result.detectedType, 'rejection');
});

test('classifyEmail stays confirmation when no rejection cues present', () => {
  const result = classifyEmail({
    subject: 'Application Update',
    snippet: 'Thank you for applying for the Backend Engineer role',
    body: 'We received your application and will review soon.'
  });
  assert.equal(result.detectedType, 'confirmation');
});

test('classifyEmail does not misclassify conditional not selected in receipts', () => {
  const result = classifyEmail({
    subject: 'Thank you for your application to Figma',
    snippet: 'We received your application for the Product Engineer role.',
    body: 'If you are not selected for this position, we will keep your information on file. Thank you for applying.'
  });
  assert.equal(result.detectedType, 'confirmation');
});

test('classifyEmail still rejects decisive not selected wording', () => {
  const result = classifyEmail({
    subject: 'Application update',
    snippet: 'Your application was not selected.',
    body: 'After careful consideration, your application was not selected for this role.'
  });
  assert.equal(result.detectedType, 'rejection');
});

test('classifyEmail detects profile submitted confirmation', () => {
  const subject = 'Profile submitted to Vertafore for Software Engineer I / #606810';
  const body =
    'We have received the profile you submitted for the Software Engineer I position. If your profile matches the requirements of the position, a member of the recruiting team will contact you.';
  const result = classifyEmail({
    subject,
    snippet: 'Profile submitted to Vertafore for Software Engineer I / #606810',
    body
  });
  assert.equal(result.detectedType, 'confirmation');
  assert.ok(result.confidenceScore >= 0.85);
});
