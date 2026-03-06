const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldSuppressEmail } = require('../src/suppressEmail');

test('suppresses Glassdoor Tech Buzz digest messages', () => {
  const decision = shouldSuppressEmail({
    from: 'Glassdoor Community <community@glassdoor.com>',
    subject: 'Tech Buzz: General strike and hiring trends',
    text: 'View more posts\nread more\ncomments\nunsubscribe',
    headers: [{ Name: 'List-Unsubscribe', Value: '<mailto:unsubscribe@glassdoor.com>' }]
  });
  assert.equal(decision.suppress, true);
  assert.equal(decision.reason, 'bulk_digest');
});

test('suppresses outbound user replies', () => {
  const decision = shouldSuppressEmail({
    from: 'Jason Conklin <jasonconklin.dev@gmail.com>',
    subject: 'Re: Interview availability',
    text: 'Tuesday at 4pm works for me.',
    userEmail: 'jasonconklin.dev@gmail.com',
    userName: 'Jason Conklin'
  });
  assert.equal(decision.suppress, true);
  assert.equal(decision.reason, 'outbound_user');
});

test('suppresses gmail forwarding verification messages', () => {
  const decision = shouldSuppressEmail({
    from: 'forwarding-noreply@google.com',
    subject: 'Gmail Forwarding Confirmation - Receive Mail from your account',
    text: 'Gmail Forwarding Confirmation Code: 123456'
  });
  assert.equal(decision.suppress, true);
  assert.equal(decision.reason, 'gmail_forwarding_verification');
});

test('does not suppress normal application confirmation', () => {
  const decision = shouldSuppressEmail({
    from: 'jobs-noreply@linkedin.com',
    subject: 'Your application was sent to EarthCam',
    text: 'EarthCam\nJr. Python Developer'
  });
  assert.equal(decision.suppress, false);
});
