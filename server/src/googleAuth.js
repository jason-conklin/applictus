const { google } = require('googleapis');

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

const GOOGLE_SIGNIN_SCOPES = [
  'openid',
  'email',
  'profile'
];
const GOOGLE_GMAIL_SCOPES = [GMAIL_READONLY_SCOPE];
const DEFAULT_REDIRECT = `${process.env.APP_API_BASE_URL || 'http://localhost:3000'}/api/auth/google/callback`;

function getGoogleAuthConfig() {
  const clientId = process.env.GOOGLE_AUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_AUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return null;
  }
  const redirectUri =
    process.env.GOOGLE_AUTH_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI || DEFAULT_REDIRECT;
  return { clientId, clientSecret, redirectUri };
}

function getGoogleOAuthClient() {
  const config = getGoogleAuthConfig();
  if (!config) {
    return null;
  }
  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
}

function getGoogleAuthUrl(oAuthClient, state, options = {}) {
  const prompt = options.prompt || 'select_account';
  const accessType = options.accessType || 'online';
  const scopes =
    Array.isArray(options.scopes) && options.scopes.length
      ? options.scopes
      : GOOGLE_SIGNIN_SCOPES;
  return oAuthClient.generateAuthUrl({
    access_type: accessType,
    include_granted_scopes: true,
    scope: scopes,
    state,
    prompt
  });
}

async function getGoogleProfileFromCode(oAuthClient, code) {
  const { tokens } = await oAuthClient.getToken(code);
  if (!tokens) {
    throw new Error('TOKEN_EXCHANGE_FAILED');
  }
  if (tokens.id_token) {
    const config = getGoogleAuthConfig();
    const ticket = await oAuthClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: config ? config.clientId : undefined
    });
    const payload = ticket.getPayload();
    return {
      email: payload?.email || null,
      emailVerified: Boolean(payload?.email_verified),
      name: payload?.name || null,
      tokens
    };
  }
  oAuthClient.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: oAuthClient });
  const { data } = await oauth2.userinfo.get();
  return {
    email: data.email || null,
    emailVerified: Boolean(data.verified_email),
    name: data.name || null,
    tokens
  };
}

module.exports = {
  getGoogleAuthConfig,
  getGoogleOAuthClient,
  getGoogleAuthUrl,
  getGoogleProfileFromCode,
  GOOGLE_SIGNIN_SCOPES,
  GOOGLE_GMAIL_SCOPES,
  GMAIL_READONLY_SCOPE
};
