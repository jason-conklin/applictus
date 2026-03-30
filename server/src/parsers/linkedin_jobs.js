const { normalizeCompany, normalizeRole } = require('../validateJobFields');
const { detectStatusSignal, lines, parseCompanyLocationLine, normalizeForCompare } = require('./common');
const {
  normalizeLine,
  stripTrailingNumericRoleId,
  extractSentencePatternRoleCandidates,
  evaluateRoleCandidates,
  selectBestRoleCandidate
} = require('./roleCandidates');

function findAnchor(linesArr = []) {
  for (let i = 0; i < linesArr.length; i += 1) {
    const line = linesArr[i];
    const matchInline = line.match(/^your application was sent to\s+(.+)$/i);
    if (matchInline) {
      return { index: i, line, company: normalizeLine(matchInline[1]) };
    }
    if (/^your application was sent to\s*:?$/i.test(line)) {
      const next = linesArr.slice(i + 1).find((l) => normalizeLine(l));
      return { index: i, line, company: next ? normalizeLine(next) : null };
    }
  }
  return null;
}

function companyAliasCheck(candidate, company) {
  const a = normalizeForCompare(candidate);
  const b = normalizeForCompare(company);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

function parse({ subject, text }) {
  const debug = {
    provider: 'linkedin_jobs',
    parser_strategy: 'anchor_then_nearby_window',
    linkedin_parser_mode: 'anchor_then_following_lines',
    linkedin_anchor_line: null,
    linkedin_lines_after_anchor: [],
    linkedin_company_line: null,
    linkedin_company_line_detected: null,
    linkedin_role_window: [],
    linkedin_role_candidates_scored: [],
    linkedin_role_selected: null,
    linkedin_role_candidate_raw: null,
    linkedin_role_candidate_cleaned: null,
    linkedin_role_rejected_reason: null,
    linkedin_role_source: null,
    linkedin_role_line_detected: null,
    linkedin_role_cleaned: null,
    role_source: null,
    status_source: null,
    company_source: null,
    rejected_candidates: [],
    chosen_fields: {}
  };

  const notes = [];
  const candidates = { company: [], role: [] };
  const linesArr = lines(text);
  const subjectMatch = String(subject || '').match(/your application was sent to\s+(.+)$/i);
  let companyRaw = subjectMatch && subjectMatch[1] ? normalizeLine(subjectMatch[1]) : null;
  if (companyRaw) candidates.company.push(companyRaw);

  const anchor = findAnchor(linesArr);
  if (anchor) {
    debug.linkedin_anchor_line = anchor.line;
    if (!companyRaw && anchor.company) {
      companyRaw = anchor.company;
      candidates.company.push(companyRaw);
      debug.company_source = 'anchor_line';
    }
  }

  // detect company/location line
  let companyLineIdx = -1;
  let companyLineValue = null;
  for (let i = 0; i < linesArr.length; i += 1) {
    const parsed = parseCompanyLocationLine(linesArr[i], { expectedCompany: companyRaw || undefined });
    if (parsed) {
      companyLineIdx = i;
      companyLineValue = parsed.line;
      if (!companyRaw) {
        companyRaw = parsed.company;
        candidates.company.push(companyRaw);
        debug.company_source = 'company_location_line';
      }
      break;
    }
  }
  if (companyLineValue) {
    debug.linkedin_company_line = companyLineValue;
    debug.linkedin_company_line_detected = companyLineValue;
  }

  // Collect role candidates
  const roleCandidates = [];

  if (anchor) {
    const following = linesArr.slice(anchor.index + 1).filter((l) => normalizeLine(l)).slice(0, 4);
    debug.linkedin_lines_after_anchor = following;
    following.forEach((line, idx) => {
      roleCandidates.push({ raw: line, source: 'line_after_anchor', distance: idx + 1 });
    });
  }

  if (companyLineIdx >= 0) {
    const above = [];
    for (let i = companyLineIdx - 1; i >= 0 && above.length < 3; i -= 1) {
      const line = normalizeLine(linesArr[i]);
      if (line) above.push(line);
    }
    debug.linkedin_role_window = above.slice();
    above.forEach((line, idx) => {
      roleCandidates.push({ raw: line, source: 'line_above_company', distance: idx + 1 });
    });
    const below = [];
    for (let i = companyLineIdx + 1; i < linesArr.length && below.length < 2; i += 1) {
      const line = normalizeLine(linesArr[i]);
      if (line) below.push(line);
    }
    below.forEach((line, idx) => {
      roleCandidates.push({ raw: line, source: 'line_after_company', distance: idx + 1 });
    });
  }

  // Top standalone lines near start (skip anchor line if present)
  linesArr.slice(0, 4).forEach((line, idx) => {
    const isAnchorLine = anchor && normalizeLine(line) === normalizeLine(anchor.line);
    if (!line || isAnchorLine) return;
    roleCandidates.push({ raw: line, source: 'top_standalone', distance: idx + 1 });
  });

  // Sentence-pattern candidates across body
  extractSentencePatternRoleCandidates(text).forEach((item) => roleCandidates.push(item));

  const evaluated = evaluateRoleCandidates(roleCandidates, {
    company: companyRaw,
    companyAliasCheck
  });
  debug.linkedin_role_candidates_scored = evaluated.map((e) => ({
    raw: e.raw,
    cleaned: e.cleaned,
    rejected: e.rejected,
    reason: e.reason,
    source: e.source,
    distance: e.distance,
    score: e.score
  }));

  const selected = selectBestRoleCandidate(evaluated);
  let roleRaw = selected ? stripTrailingNumericRoleId(selected.cleaned) : undefined;
  if (selected) {
    debug.linkedin_role_selected = selected.cleaned;
    debug.linkedin_role_candidate_raw = selected.raw;
    debug.linkedin_role_candidate_cleaned = selected.cleaned;
    debug.linkedin_role_rejected_reason = selected.rejected ? selected.reason : null;
    debug.linkedin_role_source = selected.source;
    debug.linkedin_role_line_detected = selected.raw;
    debug.linkedin_role_cleaned = selected.cleaned;
    debug.role_source = selected.source;
  } else {
    const firstRejected = evaluated.find((e) => e.rejected);
    if (firstRejected) {
      debug.linkedin_role_candidate_raw = firstRejected.raw;
      debug.linkedin_role_candidate_cleaned = firstRejected.cleaned;
      debug.linkedin_role_rejected_reason = firstRejected.reason;
    } else {
      debug.linkedin_role_rejected_reason = 'no_valid_role_candidate';
    }
  }

  const company = normalizeCompany(companyRaw, { notes });
  let role = normalizeRole(roleRaw, { notes });
  if (company && role && normalizeForCompare(company) === normalizeForCompare(role)) {
    role = undefined;
    debug.linkedin_role_rejected_reason = debug.linkedin_role_rejected_reason || 'matches_company_after_normalize';
    notes.push('role_rejected:matches_company');
  }

  const statusSignal = detectStatusSignal({
    subject: subject || '',
    text: text || '',
    company,
    role,
    defaultStatus: 'applied'
  });
  const status = statusSignal.status || 'applied';
  debug.status_source = statusSignal.source || null;

  debug.chosen_fields = { company: company || null, role: role || null, status };

  const confidence = {
    company: company ? (subjectMatch ? 96 : 80) : 0,
    role: role ? 92 : 0,
    status: Number(statusSignal.confidence || 80),
    key: company && role ? 90 : 0
  };

  const rejectedCandidates = evaluated
    .filter((c) => c.rejected)
    .map((c) => ({ field: 'role', value: c.raw, reason: c.reason, source: c.source }));
  debug.rejected_candidates = rejectedCandidates;

  return {
    company,
    role,
    status,
    confidence,
    candidates,
    notes,
    debug
  };
}

module.exports = { parse };
