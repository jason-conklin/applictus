const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeCompany,
  normalizeRole,
  looksLikeUrlFragment,
  splitCompanyRoleCombined,
  buildApplicationKey
} = require('../src/normalizeJobFields');
const { selectCompanyCandidate } = require('../src/matching');

test('normalizes workday style role prefix', () => {
  const role = normalizeRole('role of Software Developer .');
  assert.equal(role, 'Software Developer');
});

test('splits daiichi combined company-role text', () => {
  const split = splitCompanyRoleCombined('Daiichi Sankyo- Intern Hourly');
  assert.equal(split.company, 'Daiichi Sankyo');
  assert.equal(split.role, 'Intern Hourly');
});

test('rejects company values that are emails/domains', () => {
  assert.equal(normalizeCompany('TalentAcquisition@oraclecloud.verisk.com'), null);
  assert.equal(normalizeCompany('oraclecloud.verisk.com'), null);
});

test('rejects URL fragments as company values', () => {
  for (const value of [
    '<https',
    '"<https',
    'https://example.com/jobs',
    'href="https://example.com/jobs"',
    '&lt;https://example.com/jobs&gt;',
    'www.example.com'
  ]) {
    assert.equal(looksLikeUrlFragment(value), true);
    assert.equal(normalizeCompany(value), null);
  }
  assert.equal(normalizeCompany('Acme Health'), 'Acme Health');
  assert.equal(looksLikeUrlFragment('HTTP Archive'), false);
  assert.equal(normalizeCompany('HTTP Archive'), 'HTTP Archive');
});

test('company candidate selection does not fall back to raw URL fragments', () => {
  assert.equal(
    selectCompanyCandidate({
      companyName: '"<https',
      companyConfidence: 0.95,
      explanation: 'Parsed from email body.'
    }),
    null
  );
});

test('rejects location strings as role candidates', () => {
  assert.equal(normalizeRole('Upper Saddle River, NJ (On-site)'), null);
});

test('buildApplicationKey is deterministic for normalized inputs', () => {
  const left = buildApplicationKey({
    company: ' EarthCam ',
    role: 'Jr. Python Developer'
  });
  const right = buildApplicationKey({
    company: 'earthcam',
    role: 'JR.  Python   Developer'
  });
  assert.ok(left?.key);
  assert.equal(left.key, right.key);
});
