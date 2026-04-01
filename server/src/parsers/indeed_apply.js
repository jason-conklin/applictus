const { normalizeCompany, normalizeRole } = require('../validateJobFields');
const {
  lines,
  cleanLine,
  parseCompanyLocationLine,
  detectStatusSignal
} = require('./common');

const IGNORE_LINE_PATTERNS = [
  /^company logo\b/i,
  /^star rating\b/i,
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

function cleanSubjectRole(value) {
  const text = cleanLine(value);
  if (!text) {
    return null;
  }
  return cleanLine(
    text
      .replace(/\s+indeed\s+o['’]clock\b.*$/i, '')
      .replace(/\s+application submitted\b.*$/i, '')
      .replace(/\s+next steps?\b.*$/i, '')
  );
}

function extractCompanyFromSentItemsLine(line) {
  const text = cleanLine(line);
  if (!text) {
    return null;
  }
  const sentToMatch = text.match(/\bthe following items were sent to\s+(.+?)(?:[.!]|$)/i);
  if (!sentToMatch || !sentToMatch[1]) {
    return null;
  }
  return cleanLine(sentToMatch[1]);
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

  const subjectRoleMatch = subjectText.match(
    /indeed application:\s*(.+?)(?:\s+indeed\s+o['’]clock\b|\s+application submitted\b|$)/i
  );
  if (subjectRoleMatch && subjectRoleMatch[1]) {
    roleRaw = cleanSubjectRole(subjectRoleMatch[1]);
    roleSource = 'subject';
    if (roleRaw) {
      candidates.role.push(roleRaw);
    }
  }

  const submittedIdx = bodyLines.findIndex((line) => /application submitted/i.test(line));
  if (submittedIdx >= 0) {
    ignoredSections.push('application_submitted_block');
    let roleLineIndex = -1;

    if (!roleRaw) {
      for (let i = submittedIdx + 1; i < Math.min(bodyLines.length, submittedIdx + 8); i += 1) {
        const candidateLine = bodyLines[i];
        if (!candidateLine) {
          continue;
        }
        if (isIgnorableLine(candidateLine)) {
          rejectedCandidates.push({ field: 'role', value: candidateLine, reason: 'ignored_line' });
          continue;
        }
        if (
          /^the following items were sent to\b/i.test(candidateLine) ||
          /^[•*-]\s*(?:application|resume)\b/i.test(candidateLine)
        ) {
          continue;
        }
        const cleanedRole = cleanSubjectRole(candidateLine);
        if (!cleanedRole) {
          continue;
        }
        roleRaw = cleanedRole;
        roleSource = 'submitted_block';
        roleLineIndex = i;
        candidates.role.push(cleanedRole);
        break;
      }
    }

    if (!companyRaw) {
      for (let i = submittedIdx + 1; i < Math.min(bodyLines.length, submittedIdx + 10); i += 1) {
        const candidateLine = bodyLines[i];
        if (!candidateLine) {
          continue;
        }
        const sentItemsCompany = extractCompanyFromSentItemsLine(candidateLine);
        if (sentItemsCompany) {
          companyRaw = sentItemsCompany;
          companySource = 'sent_items_sentence';
          candidates.company.push(sentItemsCompany);
          break;
        }
      }
    }

    if (!companyRaw) {
      const companySearchStart = roleLineIndex >= 0 ? roleLineIndex + 1 : submittedIdx + 1;
      for (let i = companySearchStart; i < Math.min(bodyLines.length, submittedIdx + 10); i += 1) {
        const candidateLine = bodyLines[i];
        if (!candidateLine || isIgnorableLine(candidateLine)) {
          continue;
        }
        if (/^[•*-]\s*(?:application|resume)\b/i.test(candidateLine)) {
          continue;
        }
        if (
          roleRaw &&
          cleanLine(candidateLine).toLowerCase() === cleanLine(roleRaw).toLowerCase()
        ) {
          continue;
        }
        const companyLine = extractCompanyFromLine(candidateLine, companyRaw);
        if (companyLine) {
          companyRaw = companyLine;
          companySource = 'submitted_block';
          candidates.company.push(companyLine);
          break;
        }
      }
    }
  }

  if (!companyRaw) {
    for (const line of bodyLines) {
      const sentItemsCompany = extractCompanyFromSentItemsLine(line);
      if (sentItemsCompany) {
        companyRaw = sentItemsCompany;
        companySource = 'sent_items_sentence';
        candidates.company.push(sentItemsCompany);
        break;
      }
    }
  }

  if (!companyRaw) {
    for (const line of bodyLines) {
      if (isIgnorableLine(line)) {
        ignoredSections.push(`ignored_line:${line.slice(0, 48)}`);
        continue;
      }
      if (/^[•*-]\s*(?:application|resume)\b/i.test(line)) {
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
