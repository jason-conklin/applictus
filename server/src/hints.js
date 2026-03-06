const crypto = require('crypto');
const { extractExternalReqId } = require('../../shared/matching');

function awaitMaybe(value) {
  return value && typeof value.then === 'function' ? value : Promise.resolve(value);
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDomain(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^@+/, '')
    .trim();
}

function normalizeJobIdToken(value) {
  const token = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '')
    .trim();
  return token || null;
}

function toSubjectPattern(subject) {
  const text = normalizeText(subject).toLowerCase();
  if (!text) {
    return null;
  }

  if (/^thanks for applying to\b/.test(text)) return 'thanks for applying to *';
  if (/^indeed application:/.test(text)) return 'indeed application:*';
  if (/your application was sent to\b/.test(text)) return 'your application was sent to *';
  if (/^thank you for your application to\b/.test(text)) return 'thank you for your application to *';
  if (/^your recent job application for\b/.test(text)) return 'your recent job application for *';
  if (/^thank you for applying for the role of\b/.test(text)) {
    return 'thank you for applying for the role of *';
  }

  const colonIdx = text.indexOf(':');
  if (colonIdx > 0 && colonIdx <= 48) {
    return `${text.slice(0, colonIdx + 1)}*`;
  }

  const tokens = text
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .slice(0, 6);
  if (!tokens.length) {
    return null;
  }
  return `${tokens.join(' ')} *`;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchSubjectPattern(subjectPattern, subject) {
  const pattern = String(subjectPattern || '').trim();
  if (!pattern) {
    return false;
  }
  const text = normalizeText(subject).toLowerCase();
  const regexSource = `^${escapeRegExp(pattern).replace(/\\\*/g, '.*')}$`;
  return new RegExp(regexSource, 'i').test(text);
}

function buildHintFingerprintFromEmail({ providerId, fromDomain, subject, text, parsedJobId } = {}) {
  const provider_id = String(providerId || 'generic').trim().toLowerCase() || 'generic';
  const from_domain = normalizeDomain(fromDomain) || null;
  const normalizedSubject = normalizeText(subject);
  const subject_pattern = toSubjectPattern(normalizedSubject);
  const extractedJob = parsedJobId
    ? { externalReqId: parsedJobId }
    : extractExternalReqId({
      subject: normalizedSubject,
      snippet: text || '',
      bodyText: text || ''
    });
  const job_id_token = normalizeJobIdToken(extractedJob?.externalReqId || null);

  return {
    provider_id,
    from_domain,
    subject_pattern,
    job_id_token,
    subject_text: normalizedSubject || null
  };
}

function normalizeOverrides(overrides = {}) {
  return {
    company_override:
      overrides.company_override !== undefined
        ? String(overrides.company_override || '').trim() || null
        : undefined,
    role_override:
      overrides.role_override !== undefined
        ? String(overrides.role_override || '').trim() || null
        : undefined,
    status_override:
      overrides.status_override !== undefined
        ? String(overrides.status_override || '').trim() || null
        : undefined
  };
}

function fingerprintsEqual(a, b) {
  return (
    String(a?.provider_id || '') === String(b?.provider_id || '') &&
    String(a?.from_domain || '') === String(b?.from_domain || '') &&
    String(a?.subject_pattern || '') === String(b?.subject_pattern || '') &&
    String(a?.job_id_token || '') === String(b?.job_id_token || '')
  );
}

async function upsertUserHint(db, userId, fingerprint, overrides = {}) {
  if (!db || typeof db.prepare !== 'function') {
    throw new Error('DB_REQUIRED');
  }
  if (!userId) {
    throw new Error('USER_ID_REQUIRED');
  }

  const fp = {
    provider_id: String(fingerprint?.provider_id || 'generic').toLowerCase(),
    from_domain: normalizeDomain(fingerprint?.from_domain || null) || null,
    subject_pattern: String(fingerprint?.subject_pattern || '').trim() || null,
    job_id_token: normalizeJobIdToken(fingerprint?.job_id_token || null)
  };

  const normalizedOverrides = normalizeOverrides(overrides);
  const hasOverride =
    normalizedOverrides.company_override !== undefined ||
    normalizedOverrides.role_override !== undefined ||
    normalizedOverrides.status_override !== undefined;
  if (!hasOverride) {
    return null;
  }

  const existingRows = await awaitMaybe(
    db
      .prepare(
        `SELECT *
         FROM user_parse_hints
         WHERE user_id = ?
           AND provider_id = ?`
      )
      .all(userId, fp.provider_id)
  );
  const candidates = Array.isArray(existingRows) ? existingRows : existingRows?.rows || [];
  const existing = candidates.find((row) =>
    fingerprintsEqual(fp, {
      provider_id: row.provider_id,
      from_domain: row.from_domain,
      subject_pattern: row.subject_pattern,
      job_id_token: row.job_id_token
    })
  );

  const now = new Date().toISOString();

  if (existing) {
    const nextCompany =
      normalizedOverrides.company_override !== undefined
        ? normalizedOverrides.company_override
        : existing.company_override;
    const nextRole =
      normalizedOverrides.role_override !== undefined
        ? normalizedOverrides.role_override
        : existing.role_override;
    const nextStatus =
      normalizedOverrides.status_override !== undefined
        ? normalizedOverrides.status_override
        : existing.status_override;

    await awaitMaybe(
      db
        .prepare(
          `UPDATE user_parse_hints
           SET company_override = ?,
               role_override = ?,
               status_override = ?,
               updated_at = ?
           WHERE id = ?`
        )
        .run(nextCompany, nextRole, nextStatus, now, existing.id)
    );

    return {
      ...existing,
      company_override: nextCompany,
      role_override: nextRole,
      status_override: nextStatus,
      updated_at: now
    };
  }

  const id = crypto.randomUUID();
  const row = {
    id,
    user_id: userId,
    ...fp,
    company_override: normalizedOverrides.company_override === undefined ? null : normalizedOverrides.company_override,
    role_override: normalizedOverrides.role_override === undefined ? null : normalizedOverrides.role_override,
    status_override: normalizedOverrides.status_override === undefined ? null : normalizedOverrides.status_override,
    created_at: now,
    updated_at: now,
    hit_count: 0,
    last_hit_at: null
  };

  await awaitMaybe(
    db
      .prepare(
        `INSERT INTO user_parse_hints
         (id, user_id, provider_id, from_domain, subject_pattern, job_id_token,
          company_override, role_override, status_override,
          created_at, updated_at, hit_count, last_hit_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        row.id,
        row.user_id,
        row.provider_id,
        row.from_domain,
        row.subject_pattern,
        row.job_id_token,
        row.company_override,
        row.role_override,
        row.status_override,
        row.created_at,
        row.updated_at,
        row.hit_count,
        row.last_hit_at
      )
  );

  return row;
}

function scoreHintMatch(hint, fingerprint) {
  const fp = fingerprint || {};
  const hintJob = normalizeJobIdToken(hint?.job_id_token || null);
  const fpJob = normalizeJobIdToken(fp?.job_id_token || null);
  const hintDomain = normalizeDomain(hint?.from_domain || null);
  const fpDomain = normalizeDomain(fp?.from_domain || null);
  const hintPattern = String(hint?.subject_pattern || '').trim();
  const fpPattern = String(fp?.subject_pattern || '').trim();
  const subjectText = String(fp?.subject_text || '').trim();

  if (hintJob && fpJob && hintJob === fpJob) {
    return { score: 300, reason: 'exact_job_id_token' };
  }

  const providerMatch = String(hint?.provider_id || '') === String(fp?.provider_id || '');
  if (!providerMatch) {
    return { score: 0, reason: null };
  }

  if (hintDomain && fpDomain && hintDomain === fpDomain) {
    if (hintPattern && (hintPattern === fpPattern || (subjectText && matchSubjectPattern(hintPattern, subjectText)))) {
      return { score: 220, reason: 'provider_domain_subject_pattern' };
    }
    return { score: 160, reason: 'provider_domain' };
  }

  return { score: 0, reason: null };
}

async function findBestHint(db, userId, fingerprint, { touch = false } = {}) {
  if (!db || typeof db.prepare !== 'function' || !userId || !fingerprint?.provider_id) {
    return null;
  }

  const rowsRaw = await awaitMaybe(
    db
      .prepare(
        `SELECT *
         FROM user_parse_hints
         WHERE user_id = ?
           AND provider_id = ?`
      )
      .all(userId, String(fingerprint.provider_id).toLowerCase())
  );
  const rows = Array.isArray(rowsRaw) ? rowsRaw : rowsRaw?.rows || [];
  if (!rows.length) {
    return null;
  }

  const scored = rows
    .map((row) => {
      const result = scoreHintMatch(row, fingerprint);
      return {
        row,
        score: result.score,
        reason: result.reason
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      const leftUpdated = Date.parse(left.row.updated_at || left.row.created_at || '') || 0;
      const rightUpdated = Date.parse(right.row.updated_at || right.row.created_at || '') || 0;
      return rightUpdated - leftUpdated;
    });

  if (!scored.length) {
    return null;
  }

  const best = scored[0];
  if (touch) {
    const now = new Date().toISOString();
    await awaitMaybe(
      db
        .prepare(
          `UPDATE user_parse_hints
           SET hit_count = COALESCE(hit_count, 0) + 1,
               last_hit_at = ?
           WHERE id = ?`
        )
        .run(now, best.row.id)
    );
    best.row.hit_count = Number(best.row.hit_count || 0) + 1;
    best.row.last_hit_at = now;
  }

  return {
    hint: best.row,
    match_reason: best.reason
  };
}

module.exports = {
  buildHintFingerprintFromEmail,
  upsertUserHint,
  findBestHint,
  toSubjectPattern,
  matchSubjectPattern
};
