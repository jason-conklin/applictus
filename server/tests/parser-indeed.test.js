const test = require('node:test');
const assert = require('node:assert/strict');

const { parseJobEmail } = require('../src/parseJobEmail');

test('indeed parser extracts CubX Inc and full stack role', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'indeedapply@indeed.com',
    subject: 'Indeed Application: Full Stack Developer - Node.JS, Typescript, React',
    text: [
      'Application submitted',
      'Full Stack Developer - Node.JS, Typescript, React',
      'CubX Inc. - Freehold, NJ 07728',
      'Next steps'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'indeed_apply');
  assert.equal(parsed.company, 'CubX Inc');
  assert.equal(parsed.role, 'Full Stack Developer - Node.JS, Typescript, React');
  assert.ok(parsed.confidence.company >= 70);
  assert.ok(parsed.confidence.role >= 70);
});

test('indeed parser extracts Visual Computer Solutions and Mobile Developer', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'indeedapply@indeed.com',
    subject: 'Indeed Application: Mobile Developer',
    text: [
      'Application submitted',
      'Mobile Developer',
      'Visual Computer Solutions - Freehold, NJ 07728',
      'Next steps'
    ].join('\n')
  });

  assert.equal(parsed.company, 'Visual Computer Solutions');
  assert.equal(parsed.role, 'Mobile Developer');
  assert.ok(parsed.confidence.company >= 70);
  assert.ok(parsed.confidence.role >= 70);
});
