const { normalizeCompany, normalizeRole } = require('../validateJobFields');
const { lines, cleanLine, detectStatusSignal } = require('./common');

const IGNORED_LINE_PATTERNS = [
  /^privacy policy/i,
  /^equal opportunity/i,
  /^view in browser/i,
  /^manage preferences/i,
  /^greenhouse software/i,
  /^unsubscribe/i
];

function isIgnoredLine(line) {
  const value = cleanLine(line);
  return IGNORED_LINE_PATTERNS.some((pattern) => pattern.test(value));
}

function parse({ subject, text }) {
  const notes = [];
  const candidates = { company: [], role: [] };
  const ignoredSections = [];
  const rejectedCandidates = [];
  const subjectText = String(subject || '').trim();
  const body = String(text || '');
  const bodyLines = lines(body);

  let companyRaw = null;
  let companySource = null;
  let roleRaw = null;
  let roleSource = null;

  const subjectCompanyMatch = subjectText.match(/thank you for applying to\s+(.+)$/i);
  if (subjectCompanyMatch && subjectCompanyMatch[1]) {
    companyRaw = subjectCompanyMatch[1].trim();
    companySource = 'subject';
    candidates.company.push(companyRaw);
  }

  if (!companyRaw) {
    const bodyCompanyMatch = body.match(/thank you for applying to\s+(.+?)(?:[\n.]|$)/i);
    if (bodyCompanyMatch && bodyCompanyMatch[1]) {
      companyRaw = bodyCompanyMatch[1].trim();
      companySource = 'body_phrase';
      candidates.company.push(companyRaw);
    }
  }

  const roleMatch = body.match(
    /application for (?:the )?(.+?)(?:\s+(?:position|role|job))?\s+(?:was|has been)\s+(?:submitted|received)/i
  );
  if (roleMatch && roleMatch[1]) {
    roleRaw = roleMatch[1].trim();
    roleSource = 'application_sentence';
    candidates.role.push(roleRaw);
  }

  if (!roleRaw) {
    const roleOfMatch = body.match(/for the role of\s+(.+?)(?:[\n.]|$)/i);
    if (roleOfMatch && roleOfMatch[1]) {
      roleRaw = roleOfMatch[1].trim();
      roleSource = 'role_of_sentence';
      candidates.role.push(roleRaw);
    }
  }

  if (!roleRaw) {
    const titleLine = bodyLines.find((line) => /^(position|role|job title)\s*[:\-]\s*/i.test(line));
    if (titleLine) {
      roleRaw = titleLine.replace(/^(position|role|job title)\s*[:\-]\s*/i, '').trim();
      roleSource = 'label_line';
      candidates.role.push(roleRaw);
      notes.push('role_fallback:label_line');
    }
  }

  if (!roleRaw) {
    const topRoleLine = bodyLines.find((line) => {
      if (isIgnoredLine(line)) {
        ignoredSections.push(line);
        return false;
      }
      if (/^thank you|^your application|^application\b/i.test(line)) {
        return false;
      }
      return /\b(developer|engineer|analyst|manager|designer|specialist|intern)\b/i.test(line);
    });
    if (topRoleLine) {
      roleRaw = topRoleLine;
      roleSource = 'top_title_line';
      candidates.role.push(roleRaw);
    }
  }

  for (const line of bodyLines) {
    if (isIgnoredLine(line)) {
      ignoredSections.push(line);
      continue;
    }
    if (/^https?:\/\//i.test(line)) {
      rejectedCandidates.push({ field: 'any', value: line, reason: 'url_line' });
    }
  }

  const statusSignal = detectStatusSignal({
    subject: subjectText,
    text: body,
    company: companyRaw,
    role: roleRaw,
    defaultStatus: 'applied'
  });

  const company = normalizeCompany(companyRaw, { notes });
  const role = normalizeRole(roleRaw, { notes });
  const status = statusSignal.status || 'applied';

  return {
    company,
    role,
    status,
    confidence: {
      company: company ? (companySource === 'subject' ? 94 : 84) : 0,
      role: role ? (roleSource === 'application_sentence' ? 92 : 80) : 0,
      status: Number(statusSignal.confidence || 0),
      key: company && role ? 90 : 0
    },
    candidates,
    notes,
    debug: {
      provider: 'greenhouse',
      parser_strategy: 'company_phrase_plus_role_lines',
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
