const test = require('node:test');
const assert = require('node:assert/strict');

const { getOAuthClient, getAuthUrl } = require('../src/email');

test('gmail connect auth URL requests only gmail.readonly scope', () => {
  const prior = {
    GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET,
    GMAIL_REDIRECT_URI: process.env.GMAIL_REDIRECT_URI
  };

  process.env.GMAIL_CLIENT_ID = 'test-gmail-client-id';
  process.env.GMAIL_CLIENT_SECRET = 'test-gmail-client-secret';
  process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/api/email/callback';

  try {
    const oAuthClient = getOAuthClient();
    assert.ok(oAuthClient);
    const url = getAuthUrl(oAuthClient, { accessType: 'offline', prompt: 'consent' });
    const parsed = new URL(url);
    const scopes = (parsed.searchParams.get('scope') || '')
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);

    assert.deepEqual(scopes, ['https://www.googleapis.com/auth/gmail.readonly']);
    assert.equal(parsed.searchParams.get('client_id'), 'test-gmail-client-id');
  } finally {
    if (prior.GMAIL_CLIENT_ID === undefined) {
      delete process.env.GMAIL_CLIENT_ID;
    } else {
      process.env.GMAIL_CLIENT_ID = prior.GMAIL_CLIENT_ID;
    }
    if (prior.GMAIL_CLIENT_SECRET === undefined) {
      delete process.env.GMAIL_CLIENT_SECRET;
    } else {
      process.env.GMAIL_CLIENT_SECRET = prior.GMAIL_CLIENT_SECRET;
    }
    if (prior.GMAIL_REDIRECT_URI === undefined) {
      delete process.env.GMAIL_REDIRECT_URI;
    } else {
      process.env.GMAIL_REDIRECT_URI = prior.GMAIL_REDIRECT_URI;
    }
  }
});
