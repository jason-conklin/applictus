const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeCompany,
  normalizeRole,
  splitCompanyRoleCombined,
  buildApplicationKey
} = require('../src/normalizeJobFields');

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
