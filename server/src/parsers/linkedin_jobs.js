const { normalizeCompany, normalizeRole } = require('../validateJobFields');

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
  if (/\b(your application was sent|view application|apply now)\b/i.test(text)) {
    return true;
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
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(roleText)) {
    return 'contains_email';
  }
  if (looksLikeLocation(roleText)) {
    return 'location_like';
  }
  if (isMetadataRoleLine(roleText)) {
    return 'metadata_line';
  }
  return null;
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

  if (companyLocation.index >= 0) {
    for (let i = companyLocation.index - 1; i >= 0; i -= 1) {
      const candidateRaw = normalizeLine(lines[i]);
      if (!candidateRaw) {
        continue;
      }
      const cleanedRole = stripTrailingLinkedInRoleId(candidateRaw);
      const rejectionReason = getRoleCandidateRejectionReason(cleanedRole, companyRaw);
      debug.linkedin_role_candidate_raw = candidateRaw || null;
      debug.linkedin_role_candidate_cleaned = cleanedRole || null;
      debug.linkedin_role_rejected_reason = rejectionReason || null;
      if (rejectionReason) {
        notes.push(`role_rejected:line_above_company:${rejectionReason}:${candidateRaw.slice(0, 120)}`);
        continue;
      }

      roleRaw = cleanedRole;
      debug.linkedin_role_source = 'line_above_company';
      debug.linkedin_role_line_detected = candidateRaw || null;
      debug.linkedin_role_cleaned = cleanedRole || null;
      debug.role_source = 'line_above_company';
      candidates.role.push(candidateRaw);
      if (cleanedRole !== candidateRaw) {
        candidates.role.push(cleanedRole);
      }
      break;
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
      const cleanedRole = stripTrailingLinkedInRoleId(line);
      const rejectionReason = getRoleCandidateRejectionReason(cleanedRole, companyRaw);
      if (rejectionReason) {
        if (!debug.linkedin_role_candidate_raw) {
          debug.linkedin_role_candidate_raw = line || null;
          debug.linkedin_role_candidate_cleaned = cleanedRole || null;
          debug.linkedin_role_rejected_reason = rejectionReason || null;
        }
        notes.push(`role_rejected:line_after_company:${rejectionReason}:${line.slice(0, 120)}`);
        continue;
      }
      debug.linkedin_role_candidate_raw = line || null;
      debug.linkedin_role_candidate_cleaned = cleanedRole || null;
      debug.linkedin_role_rejected_reason = null;
      roleRaw = cleanedRole;
      debug.linkedin_role_source = 'line_after_company';
      debug.linkedin_role_line_detected = line || null;
      debug.linkedin_role_cleaned = cleanedRole || null;
      debug.role_source = 'line_after_company';
      candidates.role.push(line);
      if (cleanedRole !== line) {
        candidates.role.push(cleanedRole);
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
      const cleanedRole = stripTrailingLinkedInRoleId(line);
      const rejectionReason = getRoleCandidateRejectionReason(cleanedRole, companyRaw);
      if (rejectionReason) {
        if (!debug.linkedin_role_candidate_raw) {
          debug.linkedin_role_candidate_raw = line || null;
          debug.linkedin_role_candidate_cleaned = cleanedRole || null;
          debug.linkedin_role_rejected_reason = rejectionReason || null;
        }
        continue;
      }
      debug.linkedin_role_candidate_raw = line || null;
      debug.linkedin_role_candidate_cleaned = cleanedRole || null;
      debug.linkedin_role_rejected_reason = null;
      roleRaw = cleanedRole;
      debug.linkedin_role_source = 'fallback_nearest_title';
      debug.linkedin_role_line_detected = line;
      debug.linkedin_role_cleaned = cleanedRole || null;
      debug.role_source = 'fallback_nearest_title';
      candidates.role.push(line);
      if (cleanedRole !== line) {
        candidates.role.push(cleanedRole);
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

  return {
    company,
    role,
    status: 'applied',
    confidence: {
      company: company ? (subjectCompanyMatch ? 96 : 78) : 0,
      role: role ? (debug.role_source === 'line_above_company' ? 96 : companyLineIdx >= 0 ? 92 : 74) : 0,
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
