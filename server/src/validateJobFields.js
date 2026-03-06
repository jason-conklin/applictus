const normalizeJobFields = require('./normalizeJobFields');

const FORBIDDEN_COMPANY_VALUES = new Set([
  'indeed',
  'linkedin',
  'workday',
  'workable',
  'glassdoor',
  'recruitingteam',
  'talentacquisitionteam',
  'department'
]);

const LOCATION_ONLY_ROLE_PATTERN =
  /^(?:[a-z .'-]+,\s*[a-z]{2}(?:\s+\d{5}(?:-\d{4})?)?(?:\s*\([^)]*\))?|remote|hybrid|on[- ]?site)$/i;

function normalizeForbiddenToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function isMostlyPunctuation(value) {
  const source = String(value || '').trim();
  if (!source) {
    return true;
  }
  const letters = source.replace(/[^a-z0-9]/gi, '');
  return letters.length < 2;
}

function pushNote(notes, message) {
  if (!Array.isArray(notes)) {
    return;
  }
  notes.push(message);
}

function normalizeCompany(value, { notes } = {}) {
  const normalized = normalizeJobFields.normalizeCompany(value);
  if (!normalized) {
    if (value) {
      pushNote(notes, `company_rejected:invalid:${String(value).slice(0, 120)}`);
    }
    return undefined;
  }
  if (normalizeJobFields.looksLikeEmailOrDomain(normalized)) {
    pushNote(notes, `company_rejected:email_or_domain:${normalized}`);
    return undefined;
  }
  if (isMostlyPunctuation(normalized)) {
    pushNote(notes, `company_rejected:mostly_punctuation:${normalized}`);
    return undefined;
  }
  const token = normalizeForbiddenToken(normalized);
  if (FORBIDDEN_COMPANY_VALUES.has(token)) {
    pushNote(notes, `company_rejected:forbidden:${normalized}`);
    return undefined;
  }
  return normalized;
}

function normalizeRole(value, { notes } = {}) {
  let text = String(value || '').trim();
  if (!text) {
    return undefined;
  }

  text = text
    .replace(/^role of\s+/i, '')
    .replace(/^application to\s+/i, '')
    .replace(/^applying for\s+/i, '')
    .replace(/^your recent job application for\s+/i, '');

  if (/(?:19|20)\d{2}\s*[-–—]\s*(?:19|20)\d{2}/.test(text)) {
    pushNote(notes, `role_rejected:year_range:${text.slice(0, 120)}`);
    return undefined;
  }

  const normalized = normalizeJobFields.normalizeRole(text);
  if (!normalized) {
    pushNote(notes, `role_rejected:invalid:${text.slice(0, 120)}`);
    return undefined;
  }

  if (LOCATION_ONLY_ROLE_PATTERN.test(normalized) || normalizeJobFields.isLikelyLocationRole(normalized)) {
    pushNote(notes, `role_rejected:location_like:${normalized}`);
    return undefined;
  }

  return normalized;
}

function validateJobFields({ company, role, notes } = {}) {
  const outNotes = Array.isArray(notes) ? notes : [];
  const normalizedCompany = normalizeCompany(company, { notes: outNotes });
  const normalizedRole = normalizeRole(role, { notes: outNotes });
  return {
    company: normalizedCompany,
    role: normalizedRole,
    notes: outNotes
  };
}

module.exports = {
  FORBIDDEN_COMPANY_VALUES,
  normalizeCompany,
  normalizeRole,
  validateJobFields,
  stripNoiseTokens: normalizeJobFields.stripNoiseTokens
};
