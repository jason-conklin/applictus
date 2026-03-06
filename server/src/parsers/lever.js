const { normalizeCompany, normalizeRole } = require('../validateJobFields');

function parse({ subject, text }) {
  const notes = [];
  const candidates = { company: [], role: [] };
  const subjectText = String(subject || '').trim();
  const body = String(text || '');

  let companyRaw;
  let roleRaw;

  const subjectCompanyMatch = subjectText.match(/thanks for applying to\s+(.+)$/i);
  if (subjectCompanyMatch && subjectCompanyMatch[1]) {
    companyRaw = subjectCompanyMatch[1].trim();
    candidates.company.push(companyRaw);
  }

  const bodyCompanyMatch = body.match(/thanks for applying to\s+(.+?)(?:[\n.]|$)/i);
  if (!companyRaw && bodyCompanyMatch && bodyCompanyMatch[1]) {
    companyRaw = bodyCompanyMatch[1].trim();
    candidates.company.push(companyRaw);
  }

  const roleAtMatch = body.match(/application (?:for|to)\s+(.+?)\s+at\s+([A-Z][A-Za-z0-9&.' -]{1,80})/i);
  if (roleAtMatch && roleAtMatch[1]) {
    roleRaw = roleAtMatch[1].trim();
    candidates.role.push(roleRaw);
    if (!companyRaw && roleAtMatch[2]) {
      companyRaw = roleAtMatch[2].trim();
      candidates.company.push(companyRaw);
    }
  }

  if (!roleRaw) {
    const roleMatch = body.match(/application (?:for|to)\s+(.+?)(?:\s+has been|\s+was|\.)/i);
    if (roleMatch && roleMatch[1]) {
      roleRaw = roleMatch[1].trim();
      candidates.role.push(roleRaw);
    }
  }

  if (!roleRaw) {
    const titleMatch = body.match(/(?:role|position|job title)\s*[:\-]\s*(.+?)(?:[\n.]|$)/i);
    if (titleMatch && titleMatch[1]) {
      roleRaw = titleMatch[1].trim();
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
      company: company ? (subjectCompanyMatch || bodyCompanyMatch ? 92 : 80) : 0,
      role: role ? (roleAtMatch ? 92 : 80) : 0,
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
