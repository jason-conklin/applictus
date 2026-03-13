const test = require('node:test');
const assert = require('node:assert/strict');

const { parseJobEmail } = require('../src/parseJobEmail');

test('linkedin parser extracts Dexian quick-apply role with hyphen company/location separator', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'jobs-noreply@linkedin.com',
    fromDomain: 'linkedin.com',
    subject: 'Jason, your application was sent to Dexian',
    text: [
      'Your application was sent to Dexian',
      'Python Developer',
      'Dexian - Jersey City, NJ (Hybrid)',
      'Applied on March 13, 2026'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'linkedin_jobs');
  assert.equal(parsed.company, 'Dexian');
  assert.equal(parsed.role, 'Python Developer');
  assert.equal(parsed.parserDebug?.linkedin_parser_mode, 'anchor_then_following_lines');
  assert.equal(parsed.parserDebug?.linkedin_anchor_line, 'Your application was sent to Dexian');
  assert.deepEqual(parsed.parserDebug?.linkedin_lines_after_anchor, [
    'Python Developer',
    'Dexian - Jersey City, NJ (Hybrid)',
    'Applied on March 13, 2026'
  ]);
  assert.equal(parsed.parserDebug?.linkedin_company_line_detected, 'Dexian - Jersey City, NJ (Hybrid)');
  assert.equal(parsed.parserDebug?.linkedin_role_selected, 'Python Developer');
});

test('linkedin parser selects best role from nearby window when alias lines are present', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'jobs-noreply@linkedin.com',
    fromDomain: 'linkedin.com',
    subject: 'Jason, your application was sent to HMG AMERICA LLC',
    text: [
      'Your application was sent to',
      'HMG AMERICA LLC',
      '',
      'HMG America',
      'Reactjs developer',
      'HMG AMERICA LLC • New Jersey, United States (Hybrid)',
      'Applied on March 13, 2026'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'linkedin_jobs');
  assert.equal(parsed.company, 'HMG AMERICA LLC');
  assert.equal(parsed.role, 'Reactjs developer');
  assert.ok(parsed.confidence.role >= 80);
  assert.equal(parsed.parserDebug?.linkedin_role_source, 'line_after_anchor');
  assert.ok(Array.isArray(parsed.parserDebug?.linkedin_lines_after_anchor));
  assert.ok(parsed.parserDebug.linkedin_lines_after_anchor.includes('HMG AMERICA LLC'));
  assert.ok(parsed.parserDebug.linkedin_lines_after_anchor.includes('HMG America'));
  assert.ok(parsed.parserDebug.linkedin_lines_after_anchor.includes('Reactjs developer'));
  assert.equal(parsed.parserDebug?.linkedin_role_selected, 'Reactjs developer');
  assert.ok(Array.isArray(parsed.parserDebug?.linkedin_role_candidates_scored));
  const aliasCandidate = parsed.parserDebug.linkedin_role_candidates_scored.find(
    (candidate) => candidate.raw === 'HMG America'
  );
  assert.equal(aliasCandidate?.rejected, true);
  assert.equal(aliasCandidate?.reason, 'company_like_alias');
});

test('linkedin parser extracts Node.js role from line above company/location', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'jobs-noreply@linkedin.com',
    fromDomain: 'linkedin.com',
    subject: 'Jason, your application was sent to Iris Software Inc.',
    text: [
      'Your application was sent to Iris Software Inc.',
      '',
      'Node.js Developer',
      'Iris Software Inc. • Princeton, NJ',
      '(On-site)',
      'Applied on March 13, 2026'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'linkedin_jobs');
  assert.equal(parsed.company, 'Iris Software Inc');
  assert.equal(parsed.role, 'Node.js Developer');
  assert.ok(parsed.confidence.role >= 80);
  assert.equal(parsed.parserDebug?.linkedin_company_line, 'Iris Software Inc. • Princeton, NJ');
  assert.equal(parsed.parserDebug?.linkedin_role_candidate_raw, 'Node.js Developer');
  assert.equal(parsed.parserDebug?.linkedin_role_candidate_cleaned, 'Node.js Developer');
  assert.equal(parsed.parserDebug?.linkedin_role_source, 'line_after_anchor');
});

test('linkedin parser strips numeric id suffix from role above company/location', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'jobs-noreply@linkedin.com',
    fromDomain: 'linkedin.com',
    subject: 'Your application was sent to Orion Innovation',
    text: [
      'Your application was sent to Orion Innovation',
      'Programmer Analyst (21243)',
      'Orion Innovation • Edison, NJ (On-site)'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'linkedin_jobs');
  assert.equal(parsed.company, 'Orion Innovation');
  assert.equal(parsed.role, 'Programmer Analyst');
  assert.ok(parsed.confidence.role >= 80);
  assert.equal(parsed.parserDebug?.linkedin_role_source, 'line_after_anchor');
});

test('linkedin parser leaves role empty when line above company is invalid', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'jobs-noreply@linkedin.com',
    fromDomain: 'linkedin.com',
    subject: 'Your application was sent to Orion Innovation',
    text: [
      'View application',
      'Orion Innovation • Edison, NJ (On-site)',
      'Applied on March 13, 2026'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'linkedin_jobs');
  assert.equal(parsed.company, 'Orion Innovation');
  assert.equal(parsed.role, undefined);
  assert.equal(parsed.parserDebug?.linkedin_role_candidate_raw, 'View application');
  assert.equal(parsed.parserDebug?.linkedin_role_rejected_reason, 'metadata_line');
});
