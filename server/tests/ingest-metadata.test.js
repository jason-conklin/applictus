const test = require('node:test');
const assert = require('node:assert/strict');

const { extractMessageMetadata } = require('../src/ingest');

test('extractMessageMetadata tolerates missing headers/snippet/body', () => {
  const details = {
    payload: {
      headers: [
        { name: 'From', value: 'Workday <pru@myworkday.com>' },
        { name: 'Subject', value: 'Thank you for applying!' }
      ]
    }
  };
  const result = extractMessageMetadata(details);
  assert.equal(result.sender, 'Workday <pru@myworkday.com>');
  assert.equal(result.subject, 'Thank you for applying!');
  assert.equal(result.rfcMessageId, null);
  assert.equal(result.snippet, '');
  assert.equal(result.bodyText, '');
});
