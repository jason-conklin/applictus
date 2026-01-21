const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeJobTitle } = require('../../shared/matching');
const { classifyEmail } = require('../../shared/emailClassifier');
const { extractJobTitle } = require('../../shared/matching');

test('sanitizeJobTitle trims trailing clause', () => {
  const raw = 'Early Career, Software Engineer (2026) , and we are delighted to move forward.';
  const cleaned = sanitizeJobTitle(raw);
  assert.equal(cleaned, 'Early Career, Software Engineer (2026)');
});

test('sanitizeJobTitle removes leading determiners', () => {
  assert.equal(sanitizeJobTitle('our Technology Analyst'), 'Technology Analyst');
  assert.equal(sanitizeJobTitle('the Software Engineer I'), 'Software Engineer I');
});

test('Verisk confirmation classified correctly', () => {
  const subject = 'Thanks for your interest';
  const snippet =
    'Thanks for your interest for Software Engineer | - 2708. Talent Acquisition will review your resume.';
  const classification = classifyEmail({ subject, snippet, sender: 'verisk@example.com' });
  assert.equal(classification.detectedType, 'confirmation');
  assert.ok(classification.confidenceScore >= 0.85);
});

test('PURE confirmation classified correctly and role extracted', () => {
  const subject = 'Thank you for your application';
  const snippet = 'Thank you for your application to our Technology Analyst position.';
  const classification = classifyEmail({ subject, snippet, sender: 'pure@example.com' });
  assert.equal(classification.detectedType, 'confirmation');
  assert.ok(classification.confidenceScore >= 0.85);
  const role = extractJobTitle({
    subject,
    snippet,
    bodyText: '',
    senderName: '',
    sender: 'pure@example.com',
    companyName: 'PURE'
  });
  assert.equal(role?.jobTitle, 'Technology Analyst');
});
