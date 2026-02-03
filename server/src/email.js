const { google } = require('googleapis');
const { encryptText, decryptText, isEncryptionReady } = require('./crypto');

const DEFAULT_REDIRECT = 'http://localhost:3000/api/email/callback';
const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

function getOAuthClient() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI || DEFAULT_REDIRECT;

  if (!clientId || !clientSecret) {
    return null;
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getAuthUrl(oAuthClient) {
  return oAuthClient.generateAuthUrl({
    access_type: 'offline',
    scope: GMAIL_SCOPES,
    prompt: 'consent'
  });
}

async function getStoredRow(db, userId) {
  const rowOrPromise = db
    .prepare('SELECT * FROM oauth_tokens WHERE provider = ? AND user_id = ?')
    .get('gmail', userId);
  return rowOrPromise && typeof rowOrPromise.then === 'function' ? await rowOrPromise : rowOrPromise;
}

async function upsertTokens(db, userId, tokens, connectedEmail) {
  if (!isEncryptionReady()) {
    throw new Error('TOKEN_ENC_KEY_REQUIRED');
  }
  const now = new Date().toISOString();
  const existing = await getStoredRow(db, userId);

  const accessTokenEnc = tokens.access_token
    ? encryptText(tokens.access_token)
    : existing?.access_token_enc || (existing?.access_token ? encryptText(existing.access_token) : null);
  const refreshTokenEnc = tokens.refresh_token
    ? encryptText(tokens.refresh_token)
    : existing?.refresh_token_enc || (existing?.refresh_token ? encryptText(existing.refresh_token) : null);
  const scope = tokens.scope || existing?.scope || null;
  const expiryDate = tokens.expiry_date || existing?.expiry_date || null;
  const email = connectedEmail || existing?.connected_email || null;

  const result = db.prepare(
    `INSERT INTO oauth_tokens
      (provider, user_id, access_token_enc, refresh_token_enc, scope, expiry_date, connected_email, created_at, updated_at)
     VALUES ('gmail', ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider, user_id)
     DO UPDATE SET access_token_enc = excluded.access_token_enc,
                   refresh_token_enc = excluded.refresh_token_enc,
                   scope = excluded.scope,
                   expiry_date = excluded.expiry_date,
                   connected_email = excluded.connected_email,
      updated_at = excluded.updated_at`
  ).run(userId, accessTokenEnc, refreshTokenEnc, scope, expiryDate, email, now, now);
  if (result && typeof result.then === 'function') {
    await result;
  }
}

async function getStoredTokens(db, userId) {
  const stored = await getStoredRow(db, userId);
  if (!stored) {
    return null;
  }
  const access = stored.access_token_enc
    ? decryptText(stored.access_token_enc)
    : stored.access_token || null;
  const refresh = stored.refresh_token_enc
    ? decryptText(stored.refresh_token_enc)
    : stored.refresh_token || null;
  // Optional one-time backfill from plaintext to encrypted storage
  if (!stored.access_token_enc && stored.access_token && isEncryptionReady()) {
    try {
      await upsertTokens(
        db,
        userId,
        { access_token: stored.access_token, refresh_token: stored.refresh_token },
        stored.connected_email
      );
    } catch (_) {
      /* ignore backfill errors */
    }
  }
  return {
    access_token: access,
    refresh_token: refresh,
    scope: stored.scope || undefined,
    // pg returns BIGINT as string by default; epoch ms fits safely in JS Number.
    expiry_date: stored.expiry_date ? Number(stored.expiry_date) : undefined,
    connected_email: stored.connected_email || null
  };
}

async function getAuthorizedClient(db, userId) {
  const oAuthClient = getOAuthClient();
  if (!oAuthClient) {
    return null;
  }
  const stored = await getStoredTokens(db, userId);
  if (!stored) {
    return null;
  }
  oAuthClient.setCredentials({
    access_token: stored.access_token || undefined,
    refresh_token: stored.refresh_token || undefined,
    scope: stored.scope || undefined,
    expiry_date: stored.expiry_date || undefined
  });

  oAuthClient.on('tokens', (tokens) => {
    if (tokens && tokens.access_token) {
      upsertTokens(db, userId, tokens).catch(() => {});
    }
  });

  return oAuthClient;
}

async function fetchConnectedEmail(authClient) {
  const gmail = google.gmail({ version: 'v1', auth: authClient });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  return profile.data.emailAddress || null;
}

module.exports = {
  GMAIL_SCOPES,
  getOAuthClient,
  getAuthUrl,
  getStoredTokens,
  upsertTokens,
  getAuthorizedClient,
  fetchConnectedEmail,
  isEncryptionReady
};
