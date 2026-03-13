const { normalizeCompany, normalizeRole } = require('../validateJobFields');
const { cleanLine, detectStatusSignal } = require('./common');

const STOP_BLOCK_PATTERNS = [
  /here['’]s a copy of your application data/i,
  /^personal information/i,
  /^education/i,
  /^work experience/i
];

function topBlock(text) {
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => cleanLine(line))
    .filter(Boolean);
  const out = [];
  const ignoredSections = [];
  for (const line of lines) {
    if (STOP_BLOCK_PATTERNS.some((pattern) => pattern.test(line))) {
      ignoredSections.push(line);
      break;
    }
    out.push(line);
  }
  return {
    lines: out,
    ignoredSections
  };
}

function parse({ subject, text }) {
  const notes = [];
  const candidates = { company: [], role: [] };
  const rejectedCandidates = [];
  const body = String(text || '');
  const subjectText = String(subject || '').trim();

  let companyRaw = null;
  let companySource = null;
  let roleRaw = null;
  let roleSource = null;

  const subjectCompanyMatch = subjectText.match(/^thanks for applying to\s+(.+)$/i);
  if (subjectCompanyMatch && subjectCompanyMatch[1]) {
    companyRaw = subjectCompanyMatch[1].trim();
    companySource = 'subject';
    candidates.company.push(companyRaw);
  }

  const { lines: block, ignoredSections } = topBlock(body);
  if (!companyRaw && block.length) {
    companyRaw = block[0];
    companySource = 'top_block_heading';
    candidates.company.push(companyRaw);
  }

  const roleMatch = block.join('\n').match(
    /your application for (?:the )?(.+?)\s+job was submitted successfully/i
  );
  if (roleMatch && roleMatch[1]) {
    roleRaw = roleMatch[1].trim();
    roleSource = 'confirmation_sentence';
    candidates.role.push(roleRaw);
  }

  if (!roleRaw) {
    const fallbackRoleLine = block.find((line) =>
      /(application for|applied for|role)\b/i.test(line) &&
      !/personal information|education|work experience/i.test(line)
    );
    if (fallbackRoleLine) {
      const extracted = fallbackRoleLine.match(/(?:application for|applied for|role)\s+(?:the\s+)?(.+?)(?:\s+job\b|$)/i);
      if (extracted && extracted[1]) {
        roleRaw = extracted[1].trim();
        roleSource = 'top_block_fallback';
        candidates.role.push(roleRaw);
      } else {
        rejectedCandidates.push({ field: 'role', value: fallbackRoleLine, reason: 'unparsed_role_line' });
      }
    }
  }

  const statusSignal = detectStatusSignal({
    subject: subjectText,
    text: block.join('\n'),
    company: companyRaw,
    role: roleRaw,
    defaultStatus: 'applied'
  });

  const company = normalizeCompany(companyRaw, { notes });
  const role = normalizeRole(roleRaw, { notes });
  const status = statusSignal.status || 'applied';
  if (company && role && company.toLowerCase() === role.toLowerCase()) {
    rejectedCandidates.push({ field: 'role', value: role, reason: 'matches_company' });
    notes.push('role_rejected:matches_company');
  }

  return {
    company,
    role,
    status,
    confidence: {
      company: company ? (companySource === 'subject' ? 95 : 85) : 0,
      role: role ? (roleSource === 'confirmation_sentence' ? 95 : 82) : 0,
      status: Number(statusSignal.confidence || 0),
      key: company && role ? 92 : 0
    },
    candidates,
    notes,
    debug: {
      provider: 'workable_candidates',
      parser_strategy: 'top_confirmation_block',
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
