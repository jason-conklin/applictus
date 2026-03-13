const INBOX_USERNAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INBOX_USERNAME_MIN_LENGTH = 3;
const INBOX_USERNAME_MAX_LENGTH = 30;
const RESERVED_INBOX_USERNAMES = new Set([
  'support',
  'admin',
  'hello',
  'postmaster',
  'root',
  'mail',
  'noreply',
  'no-reply',
  'security',
  'billing'
]);

function normalizeInboxUsername(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return normalized || null;
}

function validateInboxUsername(value, { allowEmpty = true } = {}) {
  const normalized = normalizeInboxUsername(value);
  if (!normalized) {
    if (allowEmpty) {
      return { ok: true, value: null };
    }
    return {
      ok: false,
      code: 'INBOX_USERNAME_REQUIRED',
      value: null
    };
  }

  if (
    normalized.length < INBOX_USERNAME_MIN_LENGTH ||
    normalized.length > INBOX_USERNAME_MAX_LENGTH
  ) {
    return {
      ok: false,
      code: 'INBOX_USERNAME_INVALID',
      value: normalized
    };
  }

  if (!INBOX_USERNAME_PATTERN.test(normalized)) {
    return {
      ok: false,
      code: 'INBOX_USERNAME_INVALID',
      value: normalized
    };
  }

  if (RESERVED_INBOX_USERNAMES.has(normalized)) {
    return {
      ok: false,
      code: 'INBOX_USERNAME_RESERVED',
      value: normalized
    };
  }

  return {
    ok: true,
    value: normalized
  };
}

module.exports = {
  INBOX_USERNAME_MIN_LENGTH,
  INBOX_USERNAME_MAX_LENGTH,
  RESERVED_INBOX_USERNAMES,
  normalizeInboxUsername,
  validateInboxUsername
};
