const { normalizeCompany, normalizeRole } = require('../validateJobFields');

function lines(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parse({ subject, text }) {
  const notes = [];
  const candidates = { company: [], role: [] };
  const subjectText = String(subject || '').trim();
  const body = String(text || '');
  const bodyLines = lines(body);

  let companyRaw;
  let roleRaw;

  const subjectCompanyMatch = subjectText.match(/thank you for applying to\s+(.+)$/i);
  if (subjectCompanyMatch && subjectCompanyMatch[1]) {
    companyRaw = subjectCompanyMatch[1].trim();
    candidates.company.push(companyRaw);
  }

  if (!companyRaw) {
    const bodyCompanyMatch = body.match(/thank you for applying to\s+(.+?)(?:[\n.]|$)/i);
    if (bodyCompanyMatch && bodyCompanyMatch[1]) {
      companyRaw = bodyCompanyMatch[1].trim();
      candidates.company.push(companyRaw);
    }
  }

  const roleMatch = body.match(
    /application for (?:the )?(.+?)(?:\s+(?:position|role|job))?\s+(?:was|has been)\s+(?:submitted|received)/i
  );
  if (roleMatch && roleMatch[1]) {
    roleRaw = roleMatch[1].trim();
    candidates.role.push(roleRaw);
  }

  if (!roleRaw) {
    const roleOfMatch = body.match(/for the role of\s+(.+?)(?:[\n.]|$)/i);
    if (roleOfMatch && roleOfMatch[1]) {
      roleRaw = roleOfMatch[1].trim();
      candidates.role.push(roleRaw);
    }
  }

  if (!roleRaw) {
    const titleLine = bodyLines.find((line) => /^(position|role|job title)\s*[:\-]\s*/i.test(line));
    if (titleLine) {
      roleRaw = titleLine.replace(/^(position|role|job title)\s*[:\-]\s*/i, '').trim();
      candidates.role.push(roleRaw);
      notes.push('role_fallback:label_line');
    }
  }

  const company = normalizeCompany(companyRaw, { notes });
  const role = normalizeRole(roleRaw, { notes });

  return {
    company,
    role,
    status: 'applied',
    confidence: {
      company: company ? (subjectCompanyMatch ? 94 : 84) : 0,
      role: role ? (roleMatch ? 92 : 80) : 0,
      status: 88,
      key: company && role ? 90 : 0
    },
    candidates,
    notes
  };
}

module.exports = {
  parse
};
