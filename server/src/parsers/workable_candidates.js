const { normalizeCompany, normalizeRole } = require('../validateJobFields');

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
    .map((line) => line.trim())
    .filter(Boolean);
  const out = [];
  for (const line of lines) {
    if (STOP_BLOCK_PATTERNS.some((pattern) => pattern.test(line))) {
      break;
    }
    out.push(line);
  }
  return out;
}

function parse({ subject, text }) {
  const notes = [];
  const candidates = { company: [], role: [] };
  const body = String(text || '');
  const subjectText = String(subject || '').trim();

  let companyRaw;
  let roleRaw;

  const subjectCompanyMatch = subjectText.match(/^thanks for applying to\s+(.+)$/i);
  if (subjectCompanyMatch && subjectCompanyMatch[1]) {
    companyRaw = subjectCompanyMatch[1].trim();
    candidates.company.push(companyRaw);
  }

  const block = topBlock(body);
  if (!companyRaw && block.length) {
    companyRaw = block[0];
    candidates.company.push(companyRaw);
  }

  const roleMatch = body.match(/your application for (?:the )?(.+?)\s+job was submitted successfully/i);
  if (roleMatch && roleMatch[1]) {
    roleRaw = roleMatch[1].trim();
    candidates.role.push(roleRaw);
  }

  const company = normalizeCompany(companyRaw, { notes });
  const role = normalizeRole(roleRaw, { notes });

  return {
    company,
    role,
    status: 'applied',
    confidence: {
      company: company ? (subjectCompanyMatch ? 95 : 82) : 0,
      role: role ? (roleMatch ? 95 : 0) : 0,
      status: 90,
      key: company && role ? 92 : 0
    },
    candidates,
    notes
  };
}

module.exports = {
  parse
};
