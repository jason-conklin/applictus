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

test('shouldAutoCreate requires high confidence and allowed type', () => {
  const identity = extractThreadIdentity({
    subject: 'Application for Product Designer at Acme',
    sender: 'Careers <jobs@acme.com>'
  });
  const event = { detected_type: 'confirmation', confidence_score: 0.92 };
  assert.equal(shouldAutoCreate(event, identity), true);
});

