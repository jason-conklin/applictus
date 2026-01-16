const test = require('node:test');
const assert = require('node:assert/strict');

const { extractJobTitle } = require('../../shared/matching');

test('extractJobTitle pulls role from body text with position pattern', () => {
  const result = extractJobTitle({
    subject: 'Thank you for applying!',
    snippet: '',
    bodyText:
      'Thank you for expressing interest in the position of Software Engineer (Retirement Strategies), R-122404.',
    companyName: 'Prudential'
  });

  assert.equal(result.jobTitle, 'Software Engineer (Retirement Strategies)');
  assert.ok(result.confidence >= 0.85);
  assert.equal(result.source, 'body');
});

test('extractJobTitle pulls role from subject patterns', () => {
  const result = extractJobTitle({
    subject: 'Application received: Senior Data Analyst',
    snippet: '',
    bodyText: '',
    companyName: 'Acme'
  });

  assert.equal(result.jobTitle, 'Senior Data Analyst');
  assert.ok(result.confidence >= 0.85);
  assert.equal(result.source, 'subject');
});

test('extractJobTitle rejects generic role strings', () => {
  const result = extractJobTitle({
    subject: 'Application received: Position',
    snippet: '',
    bodyText: '',
    companyName: 'Acme'
  });

  assert.equal(result.jobTitle, null);
});
