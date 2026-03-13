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

function normalizeInboundAddressLocal(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return normalized || null;
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

async function getInboundAddressByLocal(
  db,
  userId,
  addressLocal,
  { includeInactive = true, isAsyncMode } = {}
) {
  const normalizedLocal = normalizeInboundAddressLocal(addressLocal);
  if (!normalizedLocal) {
    return null;
  }
  const activeBind = boolBind(db, true, isAsyncMode);
  const row = await awaitMaybe(
    db
      .prepare(
        includeInactive
          ? `SELECT id, user_id, address_local, address_email, is_active, created_at, rotated_at, confirmed_at, last_received_at
             FROM inbound_addresses
             WHERE user_id = ? AND lower(address_local) = ?
             ORDER BY is_active DESC, created_at DESC
             LIMIT 1`
          : `SELECT id, user_id, address_local, address_email, is_active, created_at, rotated_at, confirmed_at, last_received_at
             FROM inbound_addresses
             WHERE user_id = ? AND lower(address_local) = ? AND is_active = ?
             ORDER BY created_at DESC
             LIMIT 1`
      )
      .get(...(includeInactive ? [userId, normalizedLocal] : [userId, normalizedLocal, activeBind]))
  );
  return normalizeInboundAddressRow(row);
}

async function getUserInboxUsername(db, userId) {
  if (!db || typeof db.prepare !== 'function' || !userId) {
    return null;
  }
  const row = await awaitMaybe(
    db
      .prepare(
        `SELECT inbox_username
         FROM users
         WHERE id = ?
         LIMIT 1`
      )
      .get(userId)
  );
  return normalizeInboundAddressLocal(row?.inbox_username);
}

async function setActiveInboundAddressById(db, userId, addressId, { isAsyncMode } = {}) {
  if (!userId || !addressId) {
    return null;
  }
  const activeTrue = boolBind(db, true, isAsyncMode);
  await awaitMaybe(
    db
      .prepare('UPDATE inbound_addresses SET is_active = ?, rotated_at = NULL WHERE id = ?')
      .run(activeTrue, addressId)
  );
  const row = await awaitMaybe(
    db
      .prepare(
        `SELECT id, user_id, address_local, address_email, is_active, created_at, rotated_at, confirmed_at, last_received_at
         FROM inbound_addresses
         WHERE id = ? AND user_id = ?
         LIMIT 1`
      )
      .get(addressId, userId)
  );
  return normalizeInboundAddressRow(row);
}

async function createInboundAddress(
  db,
  userId,
  {
    inboundDomain = process.env.INBOUND_DOMAIN,
    isAsyncMode,
    preferredLocal = null,
    allowFallbackRandom = true
  } = {}
) {
  const domain = formatInboundDomain(inboundDomain);
  if (!domain) {
    const err = new Error('INBOUND_DOMAIN_REQUIRED');
    err.code = 'INBOUND_DOMAIN_REQUIRED';
    throw err;
  }

  const activeBind = boolBind(db, true, isAsyncMode);
  const preferred = normalizeInboundAddressLocal(preferredLocal);
  const candidateLocals = preferred ? [preferred] : [];
  let lastErr = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const addressLocal =
      candidateLocals.length > 0 ? candidateLocals.shift() : generateInboundAddressLocal();
    if (!addressLocal) {
      continue;
    }
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
        if (!allowFallbackRandom && preferred && addressLocal === preferred) {
          err.code = 'INBOUND_ADDRESS_LOCAL_CONFLICT';
          throw err;
        }
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
  const preferredLocal = await getUserInboxUsername(db, userId);
  if (preferredLocal) {
    const existingPreferred = await getInboundAddressByLocal(db, userId, preferredLocal, {
      includeInactive: true
    });
    if (existingPreferred) {
      if (existingPreferred.is_active) {
        return existingPreferred;
      }
      return setActiveInboundAddressById(db, userId, existingPreferred.id, {});
    }
    return createInboundAddress(db, userId, {
      inboundDomain,
      preferredLocal,
      allowFallbackRandom: false
    });
  }

  const existing = await getActiveInboundAddress(db, userId, { includeInactive: false });
  if (existing) {
    return existing;
  }
  return createInboundAddress(db, userId, {
    inboundDomain
  });
}

async function rotateInboundAddress(
  db,
  userId,
  {
    inboundDomain = process.env.INBOUND_DOMAIN,
    preferredLocal = null,
    allowFallbackRandom = true
  } = {}
) {
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
  const normalizedPreferredLocal = normalizeInboundAddressLocal(preferredLocal);

  const currentActive = await getActiveInboundAddress(db, userId, {
    includeInactive: false,
    isAsyncMode
  });
  if (
    currentActive &&
    normalizedPreferredLocal &&
    normalizeInboundAddressLocal(currentActive.address_local) === normalizedPreferredLocal
  ) {
    return currentActive;
  }

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
      if (normalizedPreferredLocal) {
        const existingPreferred = await awaitMaybe(
          tx
            .prepare(
              `SELECT id, user_id, address_local, address_email, is_active, created_at, rotated_at, confirmed_at, last_received_at
               FROM inbound_addresses
               WHERE user_id = ? AND lower(address_local) = ?
               ORDER BY created_at DESC
               LIMIT 1`
            )
            .get(userId, normalizedPreferredLocal)
        );
        if (existingPreferred) {
          await awaitMaybe(
            tx
              .prepare('UPDATE inbound_addresses SET is_active = ?, rotated_at = NULL WHERE id = ?')
              .run(activeTrue, existingPreferred.id)
          );
          return {
            ...existingPreferred,
            is_active: true,
            rotated_at: null
          };
        }
      }
      return createInboundAddress(tx, userId, {
        inboundDomain: normalizedDomain,
        isAsyncMode: true,
        preferredLocal: normalizedPreferredLocal,
        allowFallbackRandom
      });
    });
  }

  if (!isAsyncMode && typeof db.transaction === 'function') {
    const tx = db.transaction((targetUserId, domain, preferredLocalInput, fallbackRandom) => {
      db.prepare(
        `UPDATE inbound_addresses
         SET is_active = ?, rotated_at = ?
         WHERE user_id = ? AND is_active = ?`
      ).run(activeFalse, rotatedAt, targetUserId, activeTrue);

      const preferredExisting = preferredLocalInput
        ? normalizeInboundAddressRow(
            db
              .prepare(
                `SELECT id, user_id, address_local, address_email, is_active, created_at, rotated_at, confirmed_at, last_received_at
                 FROM inbound_addresses
                 WHERE user_id = ? AND lower(address_local) = ?
                 ORDER BY created_at DESC
                 LIMIT 1`
              )
              .get(targetUserId, preferredLocalInput)
          )
        : null;
      if (preferredExisting) {
        db.prepare('UPDATE inbound_addresses SET is_active = ?, rotated_at = NULL WHERE id = ?').run(
          activeTrue,
          preferredExisting.id
        );
        return {
          ...preferredExisting,
          is_active: true,
          rotated_at: null
        };
      }

      const activeBind = boolBind(db, true, false);
      let lastErr = null;
      const candidateLocals = preferredLocalInput ? [preferredLocalInput] : [];
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        const addressLocal =
          candidateLocals.length > 0 ? candidateLocals.shift() : generateInboundAddressLocal();
        if (!addressLocal) {
          continue;
        }
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
            if (!fallbackRandom && preferredLocalInput && addressLocal === preferredLocalInput) {
              err.code = 'INBOUND_ADDRESS_LOCAL_CONFLICT';
              throw err;
            }
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
    return tx(userId, normalizedDomain, normalizedPreferredLocal, allowFallbackRandom);
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
  if (normalizedPreferredLocal) {
    const preferredExisting = await getInboundAddressByLocal(db, userId, normalizedPreferredLocal, {
      includeInactive: true,
      isAsyncMode
    });
    if (preferredExisting) {
      await awaitMaybe(
        db
          .prepare('UPDATE inbound_addresses SET is_active = ?, rotated_at = NULL WHERE id = ?')
          .run(activeTrue, preferredExisting.id)
      );
      return {
        ...preferredExisting,
        is_active: true,
        rotated_at: null
      };
    }
  }
  return createInboundAddress(db, userId, {
    inboundDomain: normalizedDomain,
    isAsyncMode,
    preferredLocal: normalizedPreferredLocal,
    allowFallbackRandom
  });
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
  normalizeInboundAddressLocal,
  getUserInboxUsername,
  getActiveInboundAddress,
  getInboundAddressByLocal,
  createInboundAddress,
  getOrCreateInboundAddress,
  rotateInboundAddress
};
