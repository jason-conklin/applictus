const test = require('node:test');
const assert = require('node:assert/strict');

const { applyFieldUpdate } = require('../src/safeFieldUpdate');

test('parser cannot overwrite user value', () => {
  const result = applyFieldUpdate({
    existingValue: 'Verisk',
    existingConfidence: 100,
    existingSource: 'user',
    newValue: 'EarthCam',
    newConfidence: 92,
    newSource: 'parser'
  });

  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'locked_user');
  assert.equal(result.value, 'Verisk');
  assert.equal(result.source, 'user');
  assert.equal(result.confidence, 100);
});

test('hint overrides parser', () => {
  const result = applyFieldUpdate({
    existingValue: 'Software Engineer',
    existingConfidence: 72,
    existingSource: 'parser',
    newValue: 'Jr. Python Developer',
    newConfidence: 95,
    newSource: 'hint'
  });

  assert.equal(result.accepted, true);
  assert.equal(result.reason, 'source_priority');
  assert.equal(result.value, 'Jr. Python Developer');
  assert.equal(result.source, 'hint');
  assert.equal(result.confidence, 95);
});

test('higher confidence parser replaces weaker parser', () => {
  const result = applyFieldUpdate({
    existingValue: 'Software Developer',
    existingConfidence: 71,
    existingSource: 'parser',
    newValue: 'Software Engineer',
    newConfidence: 84,
    newSource: 'parser'
  });

  assert.equal(result.accepted, true);
  assert.equal(result.reason, 'confidence_upgrade');
  assert.equal(result.value, 'Software Engineer');
  assert.equal(result.source, 'parser');
  assert.equal(result.confidence, 84);
});

test('lower confidence parser is rejected', () => {
  const result = applyFieldUpdate({
    existingValue: 'Software Engineer',
    existingConfidence: 90,
    existingSource: 'parser',
    newValue: 'Software Engineer I',
    newConfidence: 64,
    newSource: 'parser'
  });

  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'rejected_lower_priority');
  assert.equal(result.value, 'Software Engineer');
  assert.equal(result.source, 'parser');
  assert.equal(result.confidence, 90);
});

test('system fallback works when existing value is empty', () => {
  const result = applyFieldUpdate({
    existingValue: null,
    existingConfidence: 0,
    existingSource: 'parser',
    newValue: 'Direct Outreach',
    newConfidence: 35,
    newSource: 'system'
  });

  assert.equal(result.accepted, true);
  assert.equal(result.reason, 'confidence_upgrade');
  assert.equal(result.value, 'Direct Outreach');
  assert.equal(result.source, 'system');
  assert.equal(result.confidence, 35);
});
