const { google } = require('googleapis');

const GOOGLE_SCOPES = ['openid', 'email', 'profile'];
const DEFAULT_REDIRECT = 'http://localhost:3000/api/auth/google/callback';

function getGoogleOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return null;
  }
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || DEFAULT_REDIRECT;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getGoogleAuthUrl(oAuthClient, state) {
  return oAuthClient.generateAuthUrl({
    access_type: 'online',
    scope: GOOGLE_SCOPES,
    state,
    prompt: 'select_account'
  });
}

async function getGoogleProfileFromCode(oAuthClient, code) {
  const { tokens } = await oAuthClient.getToken(code);
  if (!tokens) {
    throw new Error('TOKEN_EXCHANGE_FAILED');
  }
  if (tokens.id_token) {
    const ticket = await oAuthClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    return {
      email: payload?.email || null,
      emailVerified: Boolean(payload?.email_verified),
      name: payload?.name || null
    };
  }
  oAuthClient.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: oAuthClient });
  const { data } = await oauth2.userinfo.get();
  return {
    email: data.email || null,
    emailVerified: Boolean(data.verified_email),
    name: data.name || null
  };
}

module.exports = {
  getGoogleOAuthClient,
  getGoogleAuthUrl,
  getGoogleProfileFromCode,
  GOOGLE_SCOPES
};
