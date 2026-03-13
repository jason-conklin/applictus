const { normalizeCompany, normalizeRole } = require('../validateJobFields');

const COMPANY_LEGAL_SUFFIXES = new Set([
  'llc',
  'inc',
  'incorporated',
  'corp',
  'corporation',
  'co',
  'company',
  'ltd',
  'limited',
  'llp',
  'plc',
  'gmbh',
  'sa',
  'bv'
]);

const ROLE_KEYWORD_PATTERN =
  /\b(developer|engineer|analyst|architect|intern|manager|specialist|consultant|designer|administrator|scientist|qa|test(?:er|ing)?|sdet|devops|sre|full[- ]?stack|front[- ]?end|back[- ]?end|mobile|ios|android)\b/i;
const TECH_TOKEN_PATTERN =
  /\b(node\.?js|react(?:js)?|javascript|typescript|python|java|c#|c\+\+|\.net|go(?:lang)?|ruby|php|swift|kotlin)\b/i;

function compactLines(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function looksLikeLocation(line) {
  const value = String(line || '');
  return /\b(remote|hybrid|on[- ]?site)\b/i.test(value) || /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2}\b/.test(value);
}

function normalizeLine(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeCompare(value) {
  return normalizeLine(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenizeComparable(value, { dropCompanySuffix = false } = {}) {
  const normalized = normalizeCompare(value);
  if (!normalized) {
    return [];
  }
  const tokens = normalized.split(' ').filter(Boolean);
  if (!dropCompanySuffix) {
    return tokens;
  }
  return tokens.filter((token) => !COMPANY_LEGAL_SUFFIXES.has(token));
}

function stripTrailingLinkedInRoleId(value) {
  return normalizeLine(value).replace(/\s*\(\d+\)\s*$/, '').trim();
}

function isMetadataRoleLine(value) {
  const text = normalizeLine(value);
  if (!text) {
    return true;
  }
  if (/^(on[- ]?site|remote|hybrid)$/i.test(text)) {
    return true;
  }
  if (/^applied on\b/i.test(text)) {
    return true;
  }
  if (/\b(your application was sent|view application|apply now|take these next steps)\b/i.test(text)) {
    return true;
  }
  return false;
}

function isCompanyLikeAlias(candidate, company) {
  const candidateNormalized = normalizeCompare(candidate);
  const companyNormalized = normalizeCompare(company);
  if (!candidateNormalized || !companyNormalized) {
    return false;
  }
  if (candidateNormalized === companyNormalized) {
    return true;
  }

  const candidateCoreTokens = tokenizeComparable(candidateNormalized, { dropCompanySuffix: true });
  const companyCoreTokens = tokenizeComparable(companyNormalized, { dropCompanySuffix: true });
  const candidateCore = candidateCoreTokens.join(' ');
  const companyCore = companyCoreTokens.join(' ');

  if (candidateCore && companyCore) {
    if (candidateCore === companyCore) {
      return true;
    }
    if (candidateCore.length >= 6 && companyCore.includes(candidateCore)) {
      return true;
    }
    if (companyCore.length >= 6 && candidateCore.includes(companyCore)) {
      return true;
    }
  }

  if (candidateCoreTokens.length >= 2 && companyCoreTokens.length >= 2) {
    const companyTokenSet = new Set(companyCoreTokens);
    const overlapCount = candidateCoreTokens.filter((token) => companyTokenSet.has(token)).length;
    const overlapRatio = overlapCount / Math.min(candidateCoreTokens.length, companyCoreTokens.length);
    if (overlapRatio >= 0.8) {
      return true;
    }
  }

  return false;
}

function getRoleCandidateRejectionReason(roleCandidate, companyCandidate) {
  const roleText = normalizeLine(roleCandidate);
  const roleCompare = normalizeCompare(roleText);
  const companyCompare = normalizeCompare(companyCandidate);
  if (!roleText) {
    return 'empty';
  }
  if (companyCompare && roleCompare && roleCompare === companyCompare) {
    return 'matches_company';
  }
  if (isCompanyLikeAlias(roleText, companyCandidate)) {
    return 'company_like_alias';
  }
  if (!/[a-z]/i.test(roleText)) {
    return 'missing_letters';
  }
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(roleText)) {
    return 'contains_email';
  }
  if (looksLikeLocation(roleText)) {
    return 'location_like';
  }
  if (isMetadataRoleLine(roleText)) {
    return 'metadata_line';
  }
  if (roleText.length < 2 || roleText.length > 90) {
    return 'length_out_of_bounds';
  }
  return null;
}

function scoreRoleCandidate(cleanedRole, { distance = 1 } = {}) {
  const text = normalizeLine(cleanedRole);
  if (!text) {
    return 0;
  }
  let score = 35;
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  if (ROLE_KEYWORD_PATTERN.test(text)) {
    score += 30;
  }
  if (TECH_TOKEN_PATTERN.test(text)) {
    score += 20;
  }
  if (wordCount >= 1 && wordCount <= 6) {
    score += 8;
  } else if (wordCount > 10) {
    score -= 8;
  }
  if (/^(senior|sr\.?|junior|jr\.?|lead|principal|staff)\b/i.test(text)) {
    score += 4;
  }

  // Favor closer lines above the company/location anchor.
  const proximityBonus = Math.max(0, 4 - Number(distance || 0)) * 3;
  score += proximityBonus;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function evaluateRoleCandidate(rawLine, { company, source, distance }) {
  const raw = normalizeLine(rawLine);
  const cleaned = stripTrailingLinkedInRoleId(raw);
  const rejectionReason = getRoleCandidateRejectionReason(cleaned, company);
  const rejected = Boolean(rejectionReason);
  return {
    raw,
    cleaned,
    source,
    distance,
    rejected,
    reason: rejectionReason || null,
    score: rejected ? 0 : scoreRoleCandidate(cleaned, { distance })
  };
}

function selectBestRoleCandidate(evaluations = []) {
  const valid = evaluations.filter((item) => item && !item.rejected);
  if (!valid.length) {
    return null;
  }
  return valid.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return Number(a.distance || 0) - Number(b.distance || 0);
  })[0];
}

function findCompanyLocationLine(lines, companyRaw) {
  const targetCompany = normalizeLine(companyRaw);
  if (!Array.isArray(lines) || !lines.length) {
    return { index: -1, companyLine: null, inferredCompany: null };
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = normalizeLine(lines[i]);
    const companyLocationMatch = line.match(/^(.+?)\s+[·•]\s+(.+)$/);
    if (!companyLocationMatch) {
      continue;
    }
    const lineCompany = normalizeLine(companyLocationMatch[1]);
    const lineLocation = normalizeLine(companyLocationMatch[2]);
    if (!looksLikeLocation(lineLocation)) {
      continue;
    }
    if (targetCompany && lineCompany.toLowerCase() !== targetCompany.toLowerCase()) {
      continue;
    }
    return {
      index: i,
      companyLine: line,
      inferredCompany: lineCompany || null
    };
  }

  return { index: -1, companyLine: null, inferredCompany: null };
}

function parse({ subject, text }) {
  const notes = [];
  const candidates = {
    company: [],
    role: []
  };
  const debug = {
    linkedin_company_line: null,
    linkedin_role_window: [],
    linkedin_role_candidates_scored: [],
    linkedin_role_selected: null,
    linkedin_role_candidate_raw: null,
    linkedin_role_candidate_cleaned: null,
    linkedin_role_rejected_reason: null,
    linkedin_role_source: null,
    linkedin_role_line_detected: null,
    linkedin_role_cleaned: null,
    role_source: null
  };

  const subjectText = String(subject || '').trim();
  const body = String(text || '');
  const lines = compactLines(body);

  let companyRaw;
  let roleRaw;

  const subjectCompanyMatch = subjectText.match(/^(?:.+,\s*)?your application was sent to\s+(.+)$/i);
  if (subjectCompanyMatch && subjectCompanyMatch[1]) {
    companyRaw = subjectCompanyMatch[1].trim();
    candidates.company.push(companyRaw);
  }

  const companyLocation = findCompanyLocationLine(lines, companyRaw);
  debug.linkedin_company_line = companyLocation.companyLine || null;
  if (!companyRaw && companyLocation.inferredCompany) {
    companyRaw = companyLocation.inferredCompany;
    candidates.company.push(companyRaw);
  }

  let selectedEvaluation = null;
  const scoredCandidates = [];

  if (companyLocation.index >= 0) {
    const aboveWindow = [];
    for (let i = companyLocation.index - 1; i >= 0 && aboveWindow.length < 3; i -= 1) {
      const line = normalizeLine(lines[i]);
      if (line) {
        aboveWindow.push(line);
      }
    }
    debug.linkedin_role_window = aboveWindow.slice();

    const aboveEvaluations = aboveWindow.map((line, idx) =>
      evaluateRoleCandidate(line, {
        company: companyRaw,
        source: 'line_above_company',
        distance: idx + 1
      })
    );
    const anchorEvaluations = [...aboveEvaluations];
    scoredCandidates.push(...aboveEvaluations);
    selectedEvaluation = selectBestRoleCandidate(aboveEvaluations);

    if (!selectedEvaluation) {
      const belowWindow = [];
      for (let i = companyLocation.index + 1; i < lines.length && belowWindow.length < 1; i += 1) {
        const line = normalizeLine(lines[i]);
        if (line) {
          belowWindow.push(line);
        }
      }
      if (belowWindow.length) {
        debug.linkedin_role_window.push(...belowWindow);
        const belowEvaluations = belowWindow.map((line, idx) =>
          evaluateRoleCandidate(line, {
            company: companyRaw,
            source: 'line_below_company',
            distance: idx + 1
          })
        );
        anchorEvaluations.push(...belowEvaluations);
        scoredCandidates.push(...belowEvaluations);
        selectedEvaluation = selectBestRoleCandidate(belowEvaluations);
      }
    }

    if (selectedEvaluation) {
      roleRaw = selectedEvaluation.cleaned;
      debug.linkedin_role_candidate_raw = selectedEvaluation.raw || null;
      debug.linkedin_role_candidate_cleaned = selectedEvaluation.cleaned || null;
      debug.linkedin_role_rejected_reason = null;
      debug.linkedin_role_source = selectedEvaluation.source || 'line_above_company';
      debug.linkedin_role_line_detected = selectedEvaluation.raw || null;
      debug.linkedin_role_cleaned = selectedEvaluation.cleaned || null;
      debug.role_source = debug.linkedin_role_source;
      candidates.role.push(selectedEvaluation.raw);
      if (selectedEvaluation.cleaned !== selectedEvaluation.raw) {
        candidates.role.push(selectedEvaluation.cleaned);
      }
    } else if (anchorEvaluations.length) {
      const firstRejected = anchorEvaluations[0];
      debug.linkedin_role_candidate_raw = firstRejected.raw || null;
      debug.linkedin_role_candidate_cleaned = firstRejected.cleaned || null;
      debug.linkedin_role_rejected_reason = firstRejected.reason || null;
    }
  }

  const companyLineIdx = companyRaw
    ? lines.findIndex((line) => line.toLowerCase() === companyRaw.toLowerCase())
    : -1;
  if (!roleRaw && companyLineIdx >= 0) {
    for (let i = companyLineIdx + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line || looksLikeLocation(line)) {
        continue;
      }
      if (companyRaw && line.toLowerCase() === companyRaw.toLowerCase()) {
        continue;
      }
      const evaluation = evaluateRoleCandidate(line, {
        company: companyRaw,
        source: 'line_after_company',
        distance: i - companyLineIdx
      });
      scoredCandidates.push(evaluation);
      if (evaluation.rejected) {
        if (!debug.linkedin_role_candidate_raw) {
          debug.linkedin_role_candidate_raw = evaluation.raw || null;
          debug.linkedin_role_candidate_cleaned = evaluation.cleaned || null;
          debug.linkedin_role_rejected_reason = evaluation.reason || null;
        }
        notes.push(`role_rejected:line_after_company:${evaluation.reason}:${line.slice(0, 120)}`);
        continue;
      }
      debug.linkedin_role_candidate_raw = evaluation.raw || null;
      debug.linkedin_role_candidate_cleaned = evaluation.cleaned || null;
      debug.linkedin_role_rejected_reason = null;
      roleRaw = evaluation.cleaned;
      debug.linkedin_role_source = 'line_after_company';
      debug.linkedin_role_line_detected = evaluation.raw || null;
      debug.linkedin_role_cleaned = evaluation.cleaned || null;
      debug.role_source = 'line_after_company';
      candidates.role.push(evaluation.raw);
      if (evaluation.cleaned !== evaluation.raw) {
        candidates.role.push(evaluation.cleaned);
      }
      break;
    }
  }

  if (!roleRaw) {
    for (const line of lines) {
      if (looksLikeLocation(line)) {
        continue;
      }
      if (companyRaw && line.toLowerCase() === companyRaw.toLowerCase()) {
        continue;
      }
      if (/\b(application|sent|linkedin|jobs)\b/i.test(line)) {
        continue;
      }
      const evaluation = evaluateRoleCandidate(line, {
        company: companyRaw,
        source: 'fallback_nearest_title',
        distance: 99
      });
      scoredCandidates.push(evaluation);
      if (evaluation.rejected) {
        if (!debug.linkedin_role_candidate_raw) {
          debug.linkedin_role_candidate_raw = evaluation.raw || null;
          debug.linkedin_role_candidate_cleaned = evaluation.cleaned || null;
          debug.linkedin_role_rejected_reason = evaluation.reason || null;
        }
        continue;
      }
      debug.linkedin_role_candidate_raw = evaluation.raw || null;
      debug.linkedin_role_candidate_cleaned = evaluation.cleaned || null;
      debug.linkedin_role_rejected_reason = null;
      roleRaw = evaluation.cleaned;
      debug.linkedin_role_source = 'fallback_nearest_title';
      debug.linkedin_role_line_detected = evaluation.raw;
      debug.linkedin_role_cleaned = evaluation.cleaned || null;
      debug.role_source = 'fallback_nearest_title';
      candidates.role.push(evaluation.raw);
      if (evaluation.cleaned !== evaluation.raw) {
        candidates.role.push(evaluation.cleaned);
      }
      break;
    }
    if (roleRaw) {
      notes.push('role_fallback:nearest_title_line');
    }
  }

  const company = normalizeCompany(companyRaw, { notes });
  let role = normalizeRole(roleRaw, { notes });
  if (company && role && normalizeCompare(company) === normalizeCompare(role)) {
    notes.push('role_rejected:matches_company_after_normalize');
    debug.linkedin_role_rejected_reason = debug.linkedin_role_rejected_reason || 'matches_company_after_normalize';
    role = undefined;
  }

  debug.linkedin_role_candidates_scored = scoredCandidates.map((candidate) => ({
    raw: candidate.raw,
    score: candidate.score,
    rejected: Boolean(candidate.rejected),
    reason: candidate.reason || null,
    source: candidate.source || null
  }));
  debug.linkedin_role_selected = role || null;

  return {
    company,
    role,
    status: 'applied',
    confidence: {
      company: company ? (subjectCompanyMatch ? 96 : 78) : 0,
      role: role
        ? debug.role_source === 'line_above_company'
          ? 96
          : debug.role_source === 'line_below_company' || debug.role_source === 'line_after_company'
            ? 88
            : 80
        : 0,
      status: 92,
      key: company && role ? 90 : 0
    },
    candidates,
    notes,
    debug
  };
}

module.exports = {
  parse
};
