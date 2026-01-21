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

test('extractJobTitle pulls role from snippet position pattern', () => {
  const result = extractJobTitle({
    subject: 'Thanks for applying!',
    snippet: 'We received your application for the Data Analyst position.',
    bodyText: '',
    companyName: 'Acme'
  });

  assert.equal(result.jobTitle, 'Data Analyst');
  assert.ok(result.confidence >= 0.8);
});

test('extractJobTitle handles Greenhouse application role', () => {
  const result = extractJobTitle({
    subject: 'Thank you for applying to Affirm',
    snippet: 'We have received your application for our Software Engineer, Early Career position.',
    bodyText: '',
    companyName: 'Affirm'
  });

  assert.equal(result.jobTitle, 'Software Engineer, Early Career');
  assert.ok(result.confidence >= 0.9);
});

test('extractJobTitle handles iCIMS application role', () => {
  const result = extractJobTitle({
    subject: 'Thank you for applying to Lord Abbett',
    snippet:
      'We received your application to the Technology Associate Rotational Program, Full-Time - Summer 2026 position.',
    bodyText: '',
    companyName: 'Lord Abbett'
  });

  assert.equal(result.jobTitle, 'Technology Associate Rotational Program, Full-Time - Summer 2026');
  assert.ok(result.confidence >= 0.9);
});

test('extractJobTitle handles Workable application role', () => {
  const result = extractJobTitle({
    subject: 'Thanks for applying to CubX Inc.',
    snippet: 'Your application for the Full Stack Software Developer job was submitted successfully.',
    bodyText: '',
    companyName: 'CubX Inc.'
  });

  assert.equal(result.jobTitle, 'Full Stack Software Developer');
  assert.ok(result.confidence >= 0.9);
});

test('extractJobTitle handles interview subject role', () => {
  const result = extractJobTitle({
    subject: 'Interview: Product Manager',
    snippet: '',
    bodyText: '',
    companyName: 'Acme'
  });

  assert.equal(result.jobTitle, 'Product Manager');
  assert.ok(result.confidence >= 0.85);
});

test('extractJobTitle handles application received dash pattern', () => {
  const result = extractJobTitle({
    subject: 'UX Designer — application received',
    snippet: '',
    bodyText: '',
    companyName: 'Acme'
  });

  assert.equal(result.jobTitle, 'UX Designer');
  assert.ok(result.confidence >= 0.85);
});

test('extractJobTitle uses sender role hints when subject/snippet are generic', () => {
  const result = extractJobTitle({
    subject: 'Application update',
    snippet: '',
    bodyText: '',
    senderName: 'Data Analyst Hiring Team',
    companyName: 'Acme'
  });

  assert.equal(result.jobTitle, 'Data Analyst');
  assert.ok(result.confidence >= 0.7);
});

test('extractJobTitle extracts role from rejection snippet', () => {
  const result = extractJobTitle({
    subject: 'Application update',
    snippet: 'We will not be moving forward with the Senior QA Engineer role.',
    bodyText: '',
    companyName: 'Acme'
  });

  assert.equal(result.jobTitle, 'Senior QA Engineer');
  assert.ok(result.confidence >= 0.8);
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

test('extractJobTitle ignores generic sender name', () => {
  const result = extractJobTitle({
    subject: 'Update',
    snippet: '',
    bodyText: '',
    senderName: 'Careers Team',
    companyName: 'Acme'
  });

  assert.equal(result.jobTitle, null);
});

test('extractJobTitle handles received information opening pattern', () => {
  const snippet = 'We just received your information for our Software Engineer-I opening.';
  const role = extractJobTitle({
    subject: '',
    snippet,
    bodyText: '',
    senderName: '',
    sender: 'recruiting@example.com',
    companyName: 'Mobility Ideal Health'
  });

  assert.equal(role?.jobTitle, 'Software Engineer-I');
});
