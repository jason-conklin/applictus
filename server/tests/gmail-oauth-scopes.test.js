const test = require('node:test');
const assert = require('node:assert/strict');

const { getOAuthClient, getAuthUrl, getOAuthClientConfig } = require('../src/email');

test('gmail connect auth URL uses GOOGLE_AUTH client and only gmail.readonly scope', () => {
  const prior = {
    GOOGLE_AUTH_CLIENT_ID: process.env.GOOGLE_AUTH_CLIENT_ID,
    GOOGLE_AUTH_CLIENT_SECRET: process.env.GOOGLE_AUTH_CLIENT_SECRET,
    GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET,
    GMAIL_REDIRECT_URI: process.env.GMAIL_REDIRECT_URI
  };

  process.env.GOOGLE_AUTH_CLIENT_ID = 'test-google-auth-client-id';
  process.env.GOOGLE_AUTH_CLIENT_SECRET = 'test-google-auth-client-secret';
  process.env.GMAIL_CLIENT_ID = 'legacy-gmail-client-id';
  process.env.GMAIL_CLIENT_SECRET = 'legacy-gmail-client-secret';
  process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/api/email/callback';

  try {
    const cfg = getOAuthClientConfig();
    assert.equal(cfg?.source, 'GOOGLE_AUTH_CLIENT_ID');
    const oAuthClient = getOAuthClient();
    assert.ok(oAuthClient);
    const url = getAuthUrl(oAuthClient, { accessType: 'offline', prompt: 'consent' });
    const parsed = new URL(url);
    const scopes = (parsed.searchParams.get('scope') || '')
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);

    assert.deepEqual(scopes, ['https://www.googleapis.com/auth/gmail.readonly']);
    assert.equal(parsed.searchParams.get('client_id'), 'test-google-auth-client-id');
    assert.equal(parsed.searchParams.get('redirect_uri'), 'http://localhost:3000/api/email/callback');
  } finally {
    if (prior.GOOGLE_AUTH_CLIENT_ID === undefined) {
      delete process.env.GOOGLE_AUTH_CLIENT_ID;
    } else {
      process.env.GOOGLE_AUTH_CLIENT_ID = prior.GOOGLE_AUTH_CLIENT_ID;
    }
    if (prior.GOOGLE_AUTH_CLIENT_SECRET === undefined) {
      delete process.env.GOOGLE_AUTH_CLIENT_SECRET;
    } else {
      process.env.GOOGLE_AUTH_CLIENT_SECRET = prior.GOOGLE_AUTH_CLIENT_SECRET;
    }
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

test('gmail connect falls back to legacy GMAIL client when GOOGLE_AUTH is missing', () => {
  const prior = {
    GOOGLE_AUTH_CLIENT_ID: process.env.GOOGLE_AUTH_CLIENT_ID,
    GOOGLE_AUTH_CLIENT_SECRET: process.env.GOOGLE_AUTH_CLIENT_SECRET,
    GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET,
    GMAIL_REDIRECT_URI: process.env.GMAIL_REDIRECT_URI
  };

  delete process.env.GOOGLE_AUTH_CLIENT_ID;
  delete process.env.GOOGLE_AUTH_CLIENT_SECRET;
  process.env.GMAIL_CLIENT_ID = 'legacy-only-gmail-client-id';
  process.env.GMAIL_CLIENT_SECRET = 'legacy-only-gmail-client-secret';
  process.env.GMAIL_REDIRECT_URI = 'http://localhost:3000/api/email/callback';

  try {
    const cfg = getOAuthClientConfig();
    assert.equal(cfg?.source, 'GMAIL_CLIENT_ID');
    const oAuthClient = getOAuthClient();
    assert.ok(oAuthClient);
    const parsed = new URL(getAuthUrl(oAuthClient));
    assert.equal(parsed.searchParams.get('client_id'), 'legacy-only-gmail-client-id');
  } finally {
    if (prior.GOOGLE_AUTH_CLIENT_ID === undefined) {
      delete process.env.GOOGLE_AUTH_CLIENT_ID;
    } else {
      process.env.GOOGLE_AUTH_CLIENT_ID = prior.GOOGLE_AUTH_CLIENT_ID;
    }
    if (prior.GOOGLE_AUTH_CLIENT_SECRET === undefined) {
      delete process.env.GOOGLE_AUTH_CLIENT_SECRET;
    } else {
      process.env.GOOGLE_AUTH_CLIENT_SECRET = prior.GOOGLE_AUTH_CLIENT_SECRET;
    }
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
