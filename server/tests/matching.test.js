const test = require('node:test');
const assert = require('node:assert/strict');

const { extractThreadIdentity, shouldAutoCreate } = require('../src/matching');

test('extractThreadIdentity requires company, role, and matching domain', () => {
  const identity = extractThreadIdentity({
    subject: 'Application for Product Designer at Acme',
    sender: 'Careers <jobs@acme.com>'
  });
  assert.equal(identity.companyName, 'Acme');
  assert.equal(identity.jobTitle, 'Product Designer');
  assert.ok(identity.matchConfidence >= 0.9);
});

test('extractThreadIdentity rejects mismatched domain', () => {
  const identity = extractThreadIdentity({
    subject: 'Application for Product Designer at Acme',
    sender: 'Careers <jobs@otherco.com>'
  });
  assert.ok(identity.matchConfidence < 0.9);
});

test('extractThreadIdentity handles ATS sender without role', () => {
  const identity = extractThreadIdentity({
    subject: 'Thank you for applying to Lord Abbett',
    sender: 'Lord Abbett @ icims <no-reply@icims.com>'
  });
  assert.equal(identity.companyName, 'Lord Abbett');
  assert.equal(identity.jobTitle, null);
  assert.ok(identity.companyConfidence >= 0.9);
  assert.ok(identity.matchConfidence >= 0.9);
  assert.equal(identity.isAtsDomain, true);
});

test('extractThreadIdentity extracts company from Talemetry sender', () => {
  const identity = extractThreadIdentity({
    subject: 'Application Status',
    sender: 'No Reply (Metropolitan Transportation Authority) via Talemetry <noreply@talemetry.com>'
  });
  assert.equal(identity.companyName, 'Metropolitan Transportation Authority');
  assert.ok(identity.companyConfidence >= 0.88);
  assert.ok(identity.matchConfidence >= 0.9);
});

test('shouldAutoCreate requires high confidence and allowed type', () => {
  const identity = extractThreadIdentity({
    subject: 'Application for Product Designer at Acme',
    sender: 'Careers <jobs@acme.com>'
  });
  const event = { detected_type: 'confirmation', confidence_score: 0.92 };
  assert.equal(shouldAutoCreate(event, identity), true);
});

test('shouldAutoCreate allows confirmation with unknown role when company is strong', () => {
  const identity = extractThreadIdentity({
    subject: 'Thank you for applying to Lord Abbett',
    sender: 'Lord Abbett @ icims <no-reply@icims.com>'
  });
  const event = { detected_type: 'confirmation', confidence_score: 0.92 };
  assert.equal(shouldAutoCreate(event, identity), true);
});
