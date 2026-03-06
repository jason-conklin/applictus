const test = require('node:test');
const assert = require('node:assert/strict');

const { parseJobEmail } = require('../src/parseJobEmail');

test('workday parser normalizes Azenta company and role', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'recruiting@azenta.myworkday.com',
    fromDomain: 'azenta.myworkday.com',
    subject: 'Application update',
    text: [
      'Thank you for applying for the role of Software Developer .',
      'Azenta Recruiting Department'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'workday');
  assert.equal(parsed.company, 'Azenta');
  assert.equal(parsed.role, 'Software Developer');
  assert.ok(parsed.confidence.company >= 70);
  assert.ok(parsed.confidence.role >= 70);
});
