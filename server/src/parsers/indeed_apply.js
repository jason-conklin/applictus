const { normalizeCompany, normalizeRole } = require('../validateJobFields');
const {
  lines,
  cleanLine,
  parseCompanyLocationLine,
  detectStatusSignal
} = require('./common');

const IGNORE_LINE_PATTERNS = [
  /^next steps?/i,
  /^view application/i,
  /^apply now/i,
  /^\d+\s+(?:reviews?|ratings?)\b/i,
  /^\d+(?:\.\d+)?\s+stars?\b/i,
  /^salary\b/i,
  /^job type\b/i,
  /^location\b/i,
  /^why join\b/i,
  /^sent from indeed/i,
  /^indeed\b/i
];

function isIgnorableLine(line) {
  const text = cleanLine(line);
  return IGNORE_LINE_PATTERNS.some((pattern) => pattern.test(text));
}

function extractCompanyFromLine(line, expectedCompany) {
  const text = cleanLine(line);
  if (!text) {
    return null;
  }
  const parsedCompanyLocation = parseCompanyLocationLine(text, { expectedCompany });
  if (parsedCompanyLocation?.company) {
    return parsedCompanyLocation.company;
  }
  const split = text.split(/\s*(?:[-–—|:])\s*/);
  return cleanLine(split[0] || null) || null;
}

function parse({ subject, text }) {
  const notes = [];
  const candidates = { company: [], role: [] };
  const rejectedCandidates = [];
  const ignoredSections = [];
  const subjectText = String(subject || '').trim();
  const bodyLines = lines(text);

  let roleRaw = null;
  let roleSource = null;
  let companyRaw = null;
  let companySource = null;

  const subjectRoleMatch = subjectText.match(/indeed application:\s*(.+)$/i);
  if (subjectRoleMatch && subjectRoleMatch[1]) {
    roleRaw = subjectRoleMatch[1].trim();
    roleSource = 'subject';
    candidates.role.push(roleRaw);
  }

  const submittedIdx = bodyLines.findIndex((line) => /application submitted/i.test(line));
  if (submittedIdx >= 0) {
    ignoredSections.push('application_submitted_block');
    const nextRole = bodyLines[submittedIdx + 1];
    const nextCompany = bodyLines[submittedIdx + 2];
    if (!roleRaw && nextRole && !isIgnorableLine(nextRole)) {
      roleRaw = nextRole;
      roleSource = 'submitted_block';
      candidates.role.push(nextRole);
    } else if (!roleRaw && nextRole) {
      rejectedCandidates.push({ field: 'role', value: nextRole, reason: 'ignored_line' });
    }
    if (nextCompany && !isIgnorableLine(nextCompany)) {
      const companyLine = extractCompanyFromLine(nextCompany, companyRaw);
      if (companyLine) {
        companyRaw = companyLine;
        companySource = 'submitted_block';
        candidates.company.push(companyLine);
      }
    } else if (nextCompany) {
      rejectedCandidates.push({ field: 'company', value: nextCompany, reason: 'ignored_line' });
    }
  }

  if (!companyRaw) {
    for (const line of bodyLines) {
      if (isIgnorableLine(line)) {
        ignoredSections.push(`ignored_line:${line.slice(0, 48)}`);
        continue;
      }
      if (/\b(inc\.?|llc|corp\.?|technologies|solutions|systems|labs|group|company)\b/i.test(line)) {
        const maybeCompany = extractCompanyFromLine(line, companyRaw);
        if (maybeCompany) {
          companyRaw = maybeCompany;
          companySource = 'company_location_line';
          candidates.company.push(maybeCompany);
          break;
        }
      }
      const parsedCompanyLocation = parseCompanyLocationLine(line, { expectedCompany: companyRaw });
      if (parsedCompanyLocation?.company) {
        companyRaw = parsedCompanyLocation.company;
        companySource = 'company_location_line';
        candidates.company.push(companyRaw);
        break;
      }
    }
  }

  const statusSignal = detectStatusSignal({
    subject: subjectText,
    text: String(text || ''),
    company: companyRaw,
    role: roleRaw,
    defaultStatus: 'applied'
  });
  const company = normalizeCompany(companyRaw, { notes });
  const role = normalizeRole(roleRaw, { notes });
  const status = statusSignal.status || 'applied';
  if (company && role && company.toLowerCase() === role.toLowerCase()) {
    notes.push('role_rejected:matches_company');
    rejectedCandidates.push({ field: 'role', value: role, reason: 'matches_company' });
  }

  return {
    company,
    role,
    status,
    confidence: {
      company: company ? (companySource === 'submitted_block' ? 90 : 86) : 0,
      role: role ? (roleSource === 'subject' ? 95 : 82) : 0,
      status: Number(statusSignal.confidence || 0),
      key: company && role ? 90 : 0
    },
    candidates,
    notes,
    debug: {
      provider: 'indeed_apply',
      parser_strategy: 'subject_role_then_company_location',
      company_source: companySource || null,
      role_source: roleSource || null,
      status_source: statusSignal.source || null,
      ignored_sections: ignoredSections,
      rejected_candidates: rejectedCandidates,
      chosen_fields: {
        company: company || null,
        role: role || null,
        status
      }
    }
  };
}

module.exports = {
  parse
};
