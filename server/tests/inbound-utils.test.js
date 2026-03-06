const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractInboundRecipient,
  buildInboundMessageSha256
} = require('../src/inbound');

test('extractInboundRecipient prefers addresses matching configured inbound domain', () => {
  const payload = {
    ToFull: [
      { Email: 'jobs@external.example' },
      { Email: 'U_abc123@mail.applictus.com' }
    ],
    To: 'jobs@external.example, U_abc123@mail.applictus.com'
  };
  const recipient = extractInboundRecipient(payload, { inboundDomain: 'mail.applictus.com' });
  assert.equal(recipient, 'u_abc123@mail.applictus.com');
});

test('extractInboundRecipient falls back to To line when ToFull is absent', () => {
  const payload = {
    To: '"Applictus Forward" <u_fallback@mail.applictus.com>'
  };
  const recipient = extractInboundRecipient(payload, { inboundDomain: 'mail.applictus.com' });
  assert.equal(recipient, 'u_fallback@mail.applictus.com');
});

test('buildInboundMessageSha256 is stable and sensitive to body changes', () => {
  const base = {
    fromEmail: 'jobs@example.com',
    subject: 'Thanks for applying',
    receivedAt: '2026-03-05T12:00:00.000Z',
    textBody: 'Line one\nLine two'
  };
  const hashA = buildInboundMessageSha256(base);
  const hashB = buildInboundMessageSha256({ ...base });
  const hashC = buildInboundMessageSha256({ ...base, textBody: 'Line one\nLine three' });

  assert.equal(hashA, hashB);
  assert.notEqual(hashA, hashC);
  assert.match(hashA, /^[a-f0-9]{64}$/);
});
