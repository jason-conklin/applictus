const test = require('node:test');
const assert = require('node:assert/strict');

const { getGoogleOAuthClient, getGoogleAuthUrl, getGoogleAuthConfig, GOOGLE_SIGNIN_SCOPES } = require('../src/googleAuth');

test('google auth URL requests only identity scopes', () => {
  const prior = {
    GOOGLE_AUTH_CLIENT_ID: process.env.GOOGLE_AUTH_CLIENT_ID,
    GOOGLE_AUTH_CLIENT_SECRET: process.env.GOOGLE_AUTH_CLIENT_SECRET,
    GOOGLE_AUTH_REDIRECT_URI: process.env.GOOGLE_AUTH_REDIRECT_URI
  };

  process.env.GOOGLE_AUTH_CLIENT_ID = 'test-google-auth-client-id';
  process.env.GOOGLE_AUTH_CLIENT_SECRET = 'test-google-auth-client-secret';
  process.env.GOOGLE_AUTH_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback';

  try {
    const cfg = getGoogleAuthConfig();
    assert.ok(cfg);
    const oAuthClient = getGoogleOAuthClient();
    assert.ok(oAuthClient);
    const url = getGoogleAuthUrl(oAuthClient, 'test-state');
    const parsed = new URL(url);
    const scopes = (parsed.searchParams.get('scope') || '')
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);

    assert.deepEqual(scopes, ['openid', 'email', 'profile']);
    assert.deepEqual(GOOGLE_SIGNIN_SCOPES, ['openid', 'email', 'profile']);
    assert.ok(!scopes.some((scope) => /gmail|mail\.google\.com|googleapis\.com\/auth\/gmail/i.test(scope)));
  } finally {
    if (prior.GOOGLE_AUTH_CLIENT_ID === undefined) delete process.env.GOOGLE_AUTH_CLIENT_ID;
    else process.env.GOOGLE_AUTH_CLIENT_ID = prior.GOOGLE_AUTH_CLIENT_ID;
    if (prior.GOOGLE_AUTH_CLIENT_SECRET === undefined) delete process.env.GOOGLE_AUTH_CLIENT_SECRET;
    else process.env.GOOGLE_AUTH_CLIENT_SECRET = prior.GOOGLE_AUTH_CLIENT_SECRET;
    if (prior.GOOGLE_AUTH_REDIRECT_URI === undefined) delete process.env.GOOGLE_AUTH_REDIRECT_URI;
    else process.env.GOOGLE_AUTH_REDIRECT_URI = prior.GOOGLE_AUTH_REDIRECT_URI;
  }
});
