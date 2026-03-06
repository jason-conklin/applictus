const crypto = require('crypto');

function awaitMaybe(value) {
  return value && typeof value.then === 'function' ? value : Promise.resolve(value);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function parseEmailTokens(value) {
  const text = String(value || '');
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(matches.map((token) => normalizeEmail(token)).filter(Boolean)));
}

function extractEmailsFromToFull(toFull) {
  if (!Array.isArray(toFull)) {
    return [];
  }
  const out = [];
  for (const entry of toFull) {
    if (!entry) continue;
    if (typeof entry === 'string') {
      out.push(...parseEmailTokens(entry));
      continue;
    }
    const candidate = entry.Email || entry.email || entry.Address || entry.address || '';
    out.push(...parseEmailTokens(candidate));
  }
  return Array.from(new Set(out));
}

function collectRecipientCandidates(payload) {
  const candidates = [];
  candidates.push(...extractEmailsFromToFull(payload?.ToFull));
  candidates.push(...parseEmailTokens(payload?.To));
  candidates.push(...parseEmailTokens(payload?.OriginalRecipient));
  candidates.push(...parseEmailTokens(payload?.MailboxHash));
  return Array.from(new Set(candidates));
}

function extractInboundRecipient(payload, { inboundDomain = '' } = {}) {
  const candidates = collectRecipientCandidates(payload);
  if (!candidates.length) {
    return null;
  }
  const normalizedDomain = String(inboundDomain || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '');
  if (!normalizedDomain) {
    return candidates[0];
  }
  return (
    candidates.find((email) => email.endsWith(`@${normalizedDomain}`)) ||
    candidates[0]
  );
}

function extractSenderEmail(payload) {
  const fromFull = payload?.FromFull;
  if (fromFull && typeof fromFull === 'object') {
    const candidate = fromFull.Email || fromFull.email || fromFull.Address || fromFull.address;
    const parsed = parseEmailTokens(candidate);
    if (parsed.length) {
      return parsed[0];
    }
  }
  const fallback = parseEmailTokens(payload?.From);
  return fallback.length ? fallback[0] : null;
}

function extractHeaderValue(headers, targetName) {
  const list = Array.isArray(headers) ? headers : [];
  const wanted = String(targetName || '').trim().toLowerCase();
  if (!wanted) {
    return null;
  }
  for (const header of list) {
    const name = String(header?.Name || header?.name || '').trim().toLowerCase();
    if (!name || name !== wanted) {
      continue;
    }
    const value = header?.Value ?? header?.value;
    if (value === undefined || value === null) {
      continue;
    }
    const normalized = String(value).trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function extractMessageIdHeader(payload) {
  const fromHeader = extractHeaderValue(payload?.Headers, 'Message-ID');
  if (fromHeader) {
    return fromHeader;
  }
  const providerMessageId = payload?.MessageID ? String(payload.MessageID).trim() : '';
  return providerMessageId || null;
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripHtml(value) {
  return normalizeText(
    String(value || '')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  );
}

function toIsoDate(value) {
  if (!value) {
    return new Date().toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

function buildInboundMessageSha256({
  fromEmail,
  subject,
  receivedAt,
  textBody,
  htmlBody
}) {
  const sender = normalizeEmail(fromEmail);
  const normalizedSubject = normalizeText(subject).toLowerCase();
  const received = toIsoDate(receivedAt);
  const normalizedTextBody = normalizeText(textBody);
  const normalizedHtmlBody = normalizeText(htmlBody);
  const bodySnippet = (normalizedTextBody || stripHtml(normalizedHtmlBody || '')).slice(0, 512);
  const source = ['postmark', sender, normalizedSubject, received, bodySnippet].join('|');
  return crypto.createHash('sha256').update(source).digest('hex');
}

function formatInboundDomain(inboundDomain) {
  return String(inboundDomain || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '');
}

function generateInboundAddressLocal() {
  return `u_${crypto.randomBytes(10).toString('hex')}`;
}

function boolBind(db, value, isAsyncMode = null) {
  const asyncMode = typeof isAsyncMode === 'boolean' ? isAsyncMode : Boolean(db && db.isAsync);
  if (asyncMode) {
    return Boolean(value);
  }
  return value ? 1 : 0;
}

function normalizeDbBool(value) {
  return value === true || value === 1 || value === '1';
}

function isUniqueViolation(err) {
  const code = String(err?.code || '').toUpperCase();
  if (code === '23505' || code.startsWith('SQLITE_CONSTRAINT')) {
    return true;
  }
  return /unique|duplicate/i.test(String(err?.message || ''));
}

function normalizeInboundAddressRow(row) {
  if (!row) {
    return null;
  }
  return {
    ...row,
    is_active: normalizeDbBool(row.is_active)
  };
}

async function getActiveInboundAddress(db, userId, { includeInactive = false, isAsyncMode } = {}) {
  const activeBind = boolBind(db, true, isAsyncMode);
  const row = await awaitMaybe(
    db
      .prepare(
        includeInactive
          ? `SELECT id, user_id, address_local, address_email, is_active, created_at, rotated_at, confirmed_at, last_received_at
             FROM inbound_addresses
             WHERE user_id = ?
             ORDER BY is_active DESC, created_at DESC
             LIMIT 1`
          : `SELECT id, user_id, address_local, address_email, is_active, created_at, rotated_at, confirmed_at, last_received_at
             FROM inbound_addresses
             WHERE user_id = ? AND is_active = ?
             ORDER BY created_at DESC
             LIMIT 1`
      )
      .get(...(includeInactive ? [userId] : [userId, activeBind]))
  );
  return normalizeInboundAddressRow(row);
}

async function createInboundAddress(db, userId, { inboundDomain = process.env.INBOUND_DOMAIN, isAsyncMode } = {}) {
  const domain = formatInboundDomain(inboundDomain);
  if (!domain) {
    const err = new Error('INBOUND_DOMAIN_REQUIRED');
    err.code = 'INBOUND_DOMAIN_REQUIRED';
    throw err;
  }

  const activeBind = boolBind(db, true, isAsyncMode);
  let lastErr = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const addressLocal = generateInboundAddressLocal();
    const addressEmail = `${addressLocal}@${domain}`;
    try {
      await awaitMaybe(
        db
          .prepare(
            `INSERT INTO inbound_addresses
             (id, user_id, address_local, address_email, is_active, created_at, rotated_at, confirmed_at, last_received_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(id, userId, addressLocal, addressEmail, activeBind, createdAt, null, null, null)
      );
      return {
        id,
        user_id: userId,
        address_local: addressLocal,
        address_email: addressEmail,
        is_active: true,
        created_at: createdAt,
        rotated_at: null,
        confirmed_at: null,
        last_received_at: null
      };
    } catch (err) {
      if (isUniqueViolation(err)) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  if (lastErr) {
    throw lastErr;
  }
  throw new Error('INBOUND_ADDRESS_CREATE_FAILED');
}

async function getOrCreateInboundAddress(db, userId, { inboundDomain = process.env.INBOUND_DOMAIN } = {}) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('DB_REQUIRED');
  }
  if (!userId) {
    throw new Error('USER_ID_REQUIRED');
  }
  const existing = await getActiveInboundAddress(db, userId, { includeInactive: false });
  if (existing) {
    return existing;
  }
  return createInboundAddress(db, userId, { inboundDomain });
}

async function rotateInboundAddress(db, userId, { inboundDomain = process.env.INBOUND_DOMAIN } = {}) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('DB_REQUIRED');
  }
  if (!userId) {
    throw new Error('USER_ID_REQUIRED');
  }
  const normalizedDomain = formatInboundDomain(inboundDomain);
  if (!normalizedDomain) {
    const err = new Error('INBOUND_DOMAIN_REQUIRED');
    err.code = 'INBOUND_DOMAIN_REQUIRED';
    throw err;
  }

  const isAsyncMode = Boolean(db && db.isAsync);
  const activeTrue = boolBind(db, true, isAsyncMode);
  const activeFalse = boolBind(db, false, isAsyncMode);
  const rotatedAt = new Date().toISOString();

  if (isAsyncMode && typeof db.transaction === 'function') {
    return db.transaction(async (tx) => {
      await awaitMaybe(
        tx
          .prepare(
            `UPDATE inbound_addresses
             SET is_active = ?, rotated_at = ?
             WHERE user_id = ? AND is_active = ?`
          )
          .run(activeFalse, rotatedAt, userId, activeTrue)
      );
      return createInboundAddress(tx, userId, {
        inboundDomain: normalizedDomain,
        isAsyncMode: true
      });
    });
  }

  if (!isAsyncMode && typeof db.transaction === 'function') {
    const tx = db.transaction((targetUserId, domain) => {
      db.prepare(
        `UPDATE inbound_addresses
         SET is_active = ?, rotated_at = ?
         WHERE user_id = ? AND is_active = ?`
      ).run(activeFalse, rotatedAt, targetUserId, activeTrue);

      const activeBind = boolBind(db, true, false);
      let lastErr = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        const addressLocal = generateInboundAddressLocal();
        const addressEmail = `${addressLocal}@${domain}`;
        try {
          db.prepare(
            `INSERT INTO inbound_addresses
             (id, user_id, address_local, address_email, is_active, created_at, rotated_at, confirmed_at, last_received_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(id, targetUserId, addressLocal, addressEmail, activeBind, createdAt, null, null, null);
          return {
            id,
            user_id: targetUserId,
            address_local: addressLocal,
            address_email: addressEmail,
            is_active: true,
            created_at: createdAt,
            rotated_at: null,
            confirmed_at: null,
            last_received_at: null
          };
        } catch (err) {
          if (isUniqueViolation(err)) {
            lastErr = err;
            continue;
          }
          throw err;
        }
      }
      if (lastErr) {
        throw lastErr;
      }
      throw new Error('INBOUND_ADDRESS_CREATE_FAILED');
    });
    return tx(userId, normalizedDomain);
  }

  await awaitMaybe(
    db
      .prepare(
        `UPDATE inbound_addresses
         SET is_active = ?, rotated_at = ?
         WHERE user_id = ? AND is_active = ?`
      )
      .run(activeFalse, rotatedAt, userId, activeTrue)
  );
  return createInboundAddress(db, userId, { inboundDomain: normalizedDomain, isAsyncMode });
}

module.exports = {
  normalizeEmail,
  parseEmailTokens,
  extractInboundRecipient,
  extractSenderEmail,
  extractHeaderValue,
  extractMessageIdHeader,
  toIsoDate,
  normalizeText,
  stripHtml,
  buildInboundMessageSha256,
  generateInboundAddressLocal,
  getActiveInboundAddress,
  createInboundAddress,
  getOrCreateInboundAddress,
  rotateInboundAddress
};
