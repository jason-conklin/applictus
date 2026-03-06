const { normalizeCompany, normalizeRole } = require('../validateJobFields');

function parse({ subject, text }) {
  const notes = [];
  const candidates = { company: [], role: [] };
  const subjectText = String(subject || '').trim();
  const body = String(text || '');

  let companyRaw;
  let roleRaw;

  const subjectRoleMatch = subjectText.match(/submission status(?: for)?\s+(.+)$/i);
  if (subjectRoleMatch && subjectRoleMatch[1]) {
    roleRaw = subjectRoleMatch[1].trim();
    candidates.role.push(roleRaw);
  }

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

  if (!roleRaw) {
    const positionTitleMatch = body.match(/(?:position|job)\s+title\s*[:\-]\s*(.+?)(?:[\n.]|$)/i);
    if (positionTitleMatch && positionTitleMatch[1]) {
      roleRaw = positionTitleMatch[1].trim();
      candidates.role.push(roleRaw);
      notes.push('role_fallback:position_title');
    }
  }

  if (!roleRaw) {
    const roleOfMatch = body.match(/role of\s+(.+?)(?:[\n.]|$)/i);
    if (roleOfMatch && roleOfMatch[1]) {
      roleRaw = roleOfMatch[1].trim();
      candidates.role.push(roleRaw);
      notes.push('role_fallback:role_of');
    }
  }

  const company = normalizeCompany(companyRaw, { notes });
  const role = normalizeRole(roleRaw, { notes });

  return {
    company,
    role,
    status: 'applied',
    confidence: {
      company: company ? (subjectCompanyMatch ? 90 : 78) : 0,
      role: role ? (subjectRoleMatch ? 90 : 78) : 0,
      status: 84,
      key: company && role ? 86 : 0
    },
    candidates,
    notes
  };
}

module.exports = {
  parse
};
