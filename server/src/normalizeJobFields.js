const { buildApplicationKey: buildStructuredApplicationKey } = require('./applicationKey');

const ROLE_KEYWORD_PATTERN =
  /\b(intern|engineer|developer|analyst|manager|specialist|designer|scientist|associate|coordinator|architect|administrator|consultant|technician|officer|lead|director|representative|qa|sre)\b/i;

const COMPANY_SUFFIX_NOISE_PATTERN =
  /\s+(careers|recruiting team|recruiting department|talent acquisition team|department)$/i;

const ROLE_PREFIX_PATTERNS = [
  /^role of\s+/i,
  /^position of\s+/i,
  /^job application:\s*/i,
  /^application:\s*/i,
  /^re:\s*/i,
  /^your application to\s+/i,
  /^application to\s+/i,
  /^applying for\s+/i,
  /^applied for\s+/i,
  /^your recent job application for\s+/i,
  /^thank you for applying for the role of\s+/i,
  /^thank you for applying for\s+/i
];

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripWrappingQuotes(value) {
  const text = String(value || '').trim();
  return text.replace(/^["'`]+|["'`]+$/g, '').trim();
}

function stripNoiseTokens(value) {
  return normalizeWhitespace(String(value || '').replace(/[\u200b-\u200f\uFEFF]/g, ''));
}

function looksLikeEmailOrDomain(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) {
    return false;
  }
  if (text.includes('@')) {
    return true;
  }
  if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(text)) {
    return true;
  }
  return /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i.test(text);
}

function trimTrailingPunctuation(value) {
  return String(value || '')
    .replace(/\s*[,:;.!]+$/g, '')
    .trim();
}

function stripTrailingLocationFragment(value) {
  let text = String(value || '').trim();
  if (!text) {
    return '';
  }
  text = text.replace(
    /\s*[·|]\s*[A-Za-z .'-]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?(?:\s*\([^)]*\))?\s*$/g,
    ''
  );
  text = text.replace(
    /\s*-\s*[A-Za-z .'-]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?(?:\s*\([^)]*\))?\s*$/g,
    ''
  );
  text = text.replace(/\s*-\s*(remote|hybrid|on[- ]?site)\b.*$/gi, '');
  text = text.replace(/\s*,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/g, '');
  return trimTrailingPunctuation(text);
}

function stripCompanySuffixNoise(value) {
  let text = String(value || '').trim();
  while (COMPANY_SUFFIX_NOISE_PATTERN.test(text)) {
    text = text.replace(COMPANY_SUFFIX_NOISE_PATTERN, '').trim();
  }
  return text;
}

function splitCompanyRoleCombined(value) {
  const text = normalizeWhitespace(value);
  if (!text) {
    return { company: null, role: null };
  }
  const match = text.match(/^(.+?)\s*[-–—|:]\s*(.+)$/);
  if (!match) {
    return { company: text, role: null };
  }
  const left = normalizeWhitespace(match[1]);
  const right = normalizeWhitespace(match[2]);
  if (!right || !ROLE_KEYWORD_PATTERN.test(right)) {
    return { company: text, role: null };
  }
  return { company: left, role: right };
}

function normalizeCompany(name) {
  if (!name) {
    return null;
  }
  let text = stripNoiseTokens(name);
  text = stripWrappingQuotes(text);
  text = stripTrailingLocationFragment(text);
  const split = splitCompanyRoleCombined(text);
  text = split.company || text;
  text = stripCompanySuffixNoise(text);
  text = trimTrailingPunctuation(text);
  if (!text || text.length < 2 || text.length > 60) {
    return null;
  }
  if (looksLikeEmailOrDomain(text)) {
    return null;
  }
  const compact = text.toLowerCase().replace(/[^a-z]/g, '');
  if (
    compact === 'indeed' ||
    compact === 'indeedapply' ||
    compact === 'unknown' ||
    compact === 'applicationsubmitted' ||
    compact === 'talentacquisition' ||
    compact === 'noreply' ||
    compact === 'careers'
  ) {
    return null;
  }
  return text;
}

function stripRequisitionTail(value) {
  let text = String(value || '').trim();
  text = text.replace(/\s*(?:\||-|–|—)\s*-\s*[A-Za-z0-9-]{2,}\s*$/g, '');
  text = text.replace(
    /\s*(?:\||-|–|—|:)?\s*(?:job\s*)?(?:requisition|req(?:uisition)?)\s*(?:id|#)?\s*[:#-]?\s*[A-Za-z0-9-]+\s*$/gi,
    ''
  );
  return text.trim();
}

function stripRoleLocationSuffix(value) {
  let text = String(value || '').trim();
  text = text.replace(/\s*(?:\||·|-|–|—)\s*(remote|hybrid|on[- ]?site)\b.*$/gi, '');
  text = text.replace(/\s*(?:\||·|-|–|—)\s*[A-Za-z .'-]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?\s*$/g, '');
  text = text.replace(/\s*\([^)]*(remote|hybrid|on[- ]?site)[^)]*\)\s*$/gi, '');
  return text.trim();
}

function isLikelyLocationRole(value) {
  const text = normalizeWhitespace(value);
  if (!text) {
    return false;
  }
  if (ROLE_KEYWORD_PATTERN.test(text)) {
    return false;
  }
  if (/\b(remote|hybrid|on[- ]?site)\b/i.test(text)) {
    return true;
  }
  if (/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2}\b/.test(text)) {
    return true;
  }
  if (/\b\d{5}(?:-\d{4})?\b/.test(text)) {
    return true;
  }
  const commaParts = text.split(',').map((part) => part.trim()).filter(Boolean);
  if (commaParts.length >= 2 && commaParts.every((part) => part.length <= 24)) {
    return true;
  }
  return false;
}

function normalizeRole(title) {
  if (!title) {
    return null;
  }
  let text = stripNoiseTokens(title);
  text = stripWrappingQuotes(text);
  for (const pattern of ROLE_PREFIX_PATTERNS) {
    text = text.replace(pattern, '');
  }
  text = stripRequisitionTail(text);
  text = stripRoleLocationSuffix(text);
  text = trimTrailingPunctuation(text);
  text = normalizeWhitespace(text);
  if (!text || text.length < 2 || text.length > 80) {
    return null;
  }
  if (isLikelyLocationRole(text)) {
    return null;
  }
  if (
    /^(thank you for|we regret to inform|after careful consideration|time and effort you put)/i.test(text)
  ) {
    return null;
  }
  return text;
}

function normalizeForKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildApplicationKey({ company, role }) {
  const payload = buildStructuredApplicationKey({
    company: normalizeCompany(company) || company,
    role: normalizeRole(role) || role
  });
  if (!payload) {
    return null;
  }
  return {
    key: payload.key,
    normalizedCompany: payload.normalizedCompany || normalizeForKey(normalizeCompany(company) || company),
    normalizedRole: payload.normalizedRole || normalizeForKey(normalizeRole(role) || role),
    raw: payload.raw
  };
}

module.exports = {
  stripNoiseTokens,
  looksLikeEmailOrDomain,
  splitCompanyRoleCombined,
  normalizeCompany,
  normalizeRole,
  isLikelyLocationRole,
  buildApplicationKey
};
