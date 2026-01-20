const test = require('node:test');
const assert = require('node:assert/strict');

const llmClient = require('../src/llmClient');

test('llmClient exposes runLlmExtraction', () => {
  assert.equal(typeof llmClient.runLlmExtraction, 'function');
});
