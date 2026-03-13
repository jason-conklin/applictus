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

function stripTrailingLinkedInRoleId(value) {
  return normalizeLine(value).replace(/\s*\(\d+\)\s*$/, '').trim();
}

function isInvalidRoleCandidate(roleCandidate, companyCandidate) {
  const roleText = normalizeLine(roleCandidate);
  const companyText = normalizeLine(companyCandidate);
  if (!roleText) {
    return true;
  }
  if (companyText && roleText.toLowerCase() === companyText.toLowerCase()) {
    return true;
  }
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(roleText)) {
    return true;
  }
  if (/\b(your application was sent|view application|apply now)\b/i.test(roleText)) {
    return true;
  }
  return false;
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

function findPreviousNonEmptyLine(lines, startIndex) {
  for (let i = startIndex - 1; i >= 0; i -= 1) {
    const line = normalizeLine(lines[i]);
    if (line) {
      return { index: i, line };
    }
  }
  return { index: -1, line: null };
}

function parse({ subject, text }) {
  const notes = [];
  const candidates = {
    company: [],
    role: []
  };
  const debug = {
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
  if (!companyRaw && companyLocation.inferredCompany) {
    companyRaw = companyLocation.inferredCompany;
    candidates.company.push(companyRaw);
  }

  if (companyLocation.index >= 0) {
    const previous = findPreviousNonEmptyLine(lines, companyLocation.index);
    if (previous.line) {
      const cleanedRole = stripTrailingLinkedInRoleId(previous.line);
      debug.linkedin_role_line_detected = previous.line;
      debug.linkedin_role_cleaned = cleanedRole || null;
      debug.role_source = 'line_above_company';

      if (!isInvalidRoleCandidate(cleanedRole, companyRaw)) {
        roleRaw = cleanedRole;
        candidates.role.push(previous.line);
        if (cleanedRole !== previous.line) {
          candidates.role.push(cleanedRole);
        }
      } else {
        notes.push(`role_rejected:line_above_company:${previous.line.slice(0, 120)}`);
      }
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
      debug.linkedin_role_line_detected = line;
      debug.linkedin_role_cleaned = cleanedRole || null;
      debug.role_source = 'line_after_company';
      if (isInvalidRoleCandidate(cleanedRole, companyRaw)) {
        notes.push(`role_rejected:line_after_company:${line.slice(0, 120)}`);
        continue;
      }
      roleRaw = cleanedRole;
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
      if (isInvalidRoleCandidate(cleanedRole, companyRaw)) {
        continue;
      }
      roleRaw = cleanedRole;
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
  const role = normalizeRole(roleRaw, { notes });

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
