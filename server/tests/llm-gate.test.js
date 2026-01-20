const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldInvokeLlm } = require('../src/llmGate');

test('should invoke when missing company', () => {
  const gate = shouldInvokeLlm({
    classification: { detectedType: 'confirmation', confidenceScore: 0.88 },
    extracted: { companyName: null, jobTitle: 'Engineer' },
    matchResult: null,
    reason: null
  });
  assert.equal(gate.invoke, true);
  assert.ok(gate.why.includes('missing_company'));
});

test('should not invoke when strong confirmation', () => {
  const gate = shouldInvokeLlm({
    classification: { detectedType: 'confirmation', confidenceScore: 0.97 },
    extracted: { companyName: 'Acme', jobTitle: 'Engineer' },
    matchResult: null,
    reason: null
  });
  assert.equal(gate.invoke, false);
});
