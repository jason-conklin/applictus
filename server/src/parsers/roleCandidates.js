const { cleanLine, normalizeForCompare, parseCompanyLocationLine, isLocationLike } = require('./common');

const ROLE_KEYWORD_PATTERN =
  /\b(developer|engineer|analyst|architect|intern|manager|specialist|consultant|designer|administrator|scientist|qa|test(?:er|ing)?|sdet|devops|sre|full[- ]?stack|front[- ]?end|back[- ]?end|mobile|ios|android)\b/i;
const TECH_TOKEN_PATTERN =
  /\b(node\.?js|react(?:js)?|javascript|typescript|python|java|c#|c\+\+|\.net|go(?:lang)?|ruby|php|swift|kotlin)\b/i;

const CTA_OR_METADATA_PATTERNS = [
  { pattern: /^view job\b/i, reason: 'cta_view_job' },
  { pattern: /\bview job\b/i, reason: 'cta_view_job' },
  { pattern: /^view application\b/i, reason: 'metadata_line' },
  { pattern: /\bview application\b/i, reason: 'metadata_line' },
  { pattern: /^applied on\b/i, reason: 'metadata_applied_on' },
  { pattern: /\bnow,?\s*take these next steps\b/i, reason: 'metadata_next_steps' },
  { pattern: /\bview similar jobs\b/i, reason: 'metadata_view_similar' },
  { pattern: /\byour application was sent\b/i, reason: 'metadata_application_sent' },
  { pattern: /^on[- ]?site$/i, reason: 'metadata_work_mode' },
  { pattern: /^remote$/i, reason: 'metadata_work_mode' },
  { pattern: /^hybrid$/i, reason: 'metadata_work_mode' }
];

function normalizeLine(value) {
  return cleanLine(value);
}

function stripTrailingNumericRoleId(value) {
  return normalizeLine(value).replace(/\s*\(\d+\)\s*$/, '').trim();
}

function extractSentencePatternRoleCandidates(text) {
  const corpus = String(text || '');
  if (!corpus.trim()) {
    return [];
  }
  const out = [];
  const patterns = [
    /application for (?:the\s+)?(.+?)\s+job\b/gi,
    /role of\s+(.+?)(?:[.\n]|$)/gi,
    /position of\s+(.+?)(?:[.\n]|$)/gi
  ];
  for (const regex of patterns) {
    let match = regex.exec(corpus);
    while (match) {
      const candidate = normalizeLine(match[1] || '');
      if (candidate) {
        out.push({
          raw: candidate,
          source: 'sentence_pattern',
          distance: 6
        });
      }
      match = regex.exec(corpus);
    }
  }
  return out;
}

function rejectRoleCandidate(rawValue, { company = null, companyAliasCheck = null, expectedCompany = null } = {}) {
  const cleaned = stripTrailingNumericRoleId(rawValue);
  const normalized = normalizeLine(cleaned);
  const normalizedCompare = normalizeForCompare(normalized);
  const companyCompare = normalizeForCompare(company || '');

  if (!normalized) {
    return { rejected: true, reason: 'empty', cleaned };
  }
  if (!/[a-z]/i.test(normalized)) {
    return { rejected: true, reason: 'missing_letters', cleaned };
  }
  if (/https?:\/\//i.test(normalized) || /\bwww\./i.test(normalized)) {
    return { rejected: true, reason: 'contains_url', cleaned };
  }
  if (/\blinkedin\.com\b/i.test(normalized)) {
    return { rejected: true, reason: 'contains_linkedin_url', cleaned };
  }
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(normalized)) {
    return { rejected: true, reason: 'contains_email', cleaned };
  }
  for (const rule of CTA_OR_METADATA_PATTERNS) {
    if (rule.pattern.test(normalized)) {
      return { rejected: true, reason: rule.reason, cleaned };
    }
  }
  if (/^[A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4}$/i.test(normalized)) {
    return { rejected: true, reason: 'metadata_date_only', cleaned };
  }
  if (parseCompanyLocationLine(normalized, expectedCompany ? { expectedCompany } : undefined)) {
    return { rejected: true, reason: 'company_location_line', cleaned };
  }
  if (isLocationLike(normalized)) {
    return { rejected: true, reason: 'location_like', cleaned };
  }
  if (companyCompare && normalizedCompare && normalizedCompare === companyCompare) {
    return { rejected: true, reason: 'matches_company', cleaned };
  }
  if (typeof companyAliasCheck === 'function' && companyAliasCheck(normalized, company)) {
    return { rejected: true, reason: 'company_like_alias', cleaned };
  }
  if (normalized.length < 2 || normalized.length > 120) {
    return { rejected: true, reason: 'length_out_of_bounds', cleaned };
  }
  return { rejected: false, reason: null, cleaned };
}

function scoreRoleCandidate(candidate, { source = '', distance = 99 } = {}) {
  const text = normalizeLine(candidate);
  if (!text) {
    return 0;
  }
  let score = 30;
  if (ROLE_KEYWORD_PATTERN.test(text)) {
    score += 28;
  }
  if (TECH_TOKEN_PATTERN.test(text)) {
    score += 16;
  }
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 2 && wordCount <= 8) {
    score += 10;
  } else if (wordCount === 1) {
    score += 2;
  } else if (wordCount > 12) {
    score -= 10;
  }
  if (/^(senior|sr\.?|junior|jr\.?|lead|principal|staff)\b/i.test(text)) {
    score += 4;
  }
  if (source === 'line_after_anchor') {
    score += 22;
  } else if (source === 'line_above_company') {
    score += 19;
  } else if (source === 'sentence_pattern') {
    score += 14;
  } else if (source === 'line_after_company') {
    score += 10;
  } else if (source === 'top_standalone') {
    score += 8;
  }
  const distanceNumber = Number.isFinite(Number(distance)) ? Number(distance) : 99;
  const proximityBonus = Math.max(0, 6 - distanceNumber) * 2;
  score += proximityBonus;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function evaluateRoleCandidates(candidates = [], options = {}) {
  const evaluated = [];
  for (const candidate of candidates) {
    const raw = normalizeLine(candidate?.raw || candidate?.line || candidate || '');
    const source = candidate?.source || 'unknown';
    const distance = candidate?.distance;
    const rejection = rejectRoleCandidate(raw, options);
    const score = rejection.rejected ? 0 : scoreRoleCandidate(rejection.cleaned, { source, distance });
    evaluated.push({
      raw,
      cleaned: rejection.cleaned,
      source,
      distance: Number.isFinite(Number(distance)) ? Number(distance) : null,
      rejected: rejection.rejected,
      reason: rejection.reason,
      score
    });
  }
  return evaluated;
}

function selectBestRoleCandidate(evaluated = []) {
  const valid = evaluated.filter((item) => item && !item.rejected);
  if (!valid.length) {
    return null;
  }
  return valid.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const sourceRank = {
      line_after_anchor: 5,
      line_above_company: 4,
      sentence_pattern: 3,
      line_after_company: 2,
      top_standalone: 1,
      unknown: 0
    };
    const aRank = sourceRank[a.source] || 0;
    const bRank = sourceRank[b.source] || 0;
    if (bRank !== aRank) return bRank - aRank;
    return Number(a.distance || 999) - Number(b.distance || 999);
  })[0];
}

module.exports = {
  normalizeLine,
  stripTrailingNumericRoleId,
  extractSentencePatternRoleCandidates,
  rejectRoleCandidate,
  evaluateRoleCandidates,
  selectBestRoleCandidate
};
