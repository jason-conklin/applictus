const { normalizeCompany, normalizeRole } = require('../validateJobFields');

function parse({ subject, text }) {
  const notes = [];
  const candidates = { company: [], role: [] };
  const subjectText = String(subject || '').trim();
  const body = String(text || '');

  let companyRaw;
  let roleRaw;

  const subjectCompanyMatch = subjectText.match(/thank you for your interest in\s+(.+)$/i);
  if (subjectCompanyMatch && subjectCompanyMatch[1]) {
    companyRaw = subjectCompanyMatch[1].trim();
    candidates.company.push(companyRaw);
  }

  if (!companyRaw) {
    const bodyCompanyMatch = body.match(/thank you for your interest in\s+(.+?)(?:[\n.]|$)/i);
    if (bodyCompanyMatch && bodyCompanyMatch[1]) {
      companyRaw = bodyCompanyMatch[1].trim();
      candidates.company.push(companyRaw);
    }
  }

  const requisitionTitleMatch = body.match(/requisition(?:\s+title)?\s*[:\-]\s*(.+?)(?:[\n.]|$)/i);
  if (requisitionTitleMatch && requisitionTitleMatch[1]) {
    roleRaw = requisitionTitleMatch[1].trim();
    candidates.role.push(roleRaw);
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
    const applyingForMatch = body.match(/applying for(?:\s+the)?\s+(.+?)(?:\s+position|[\n.]|$)/i);
    if (applyingForMatch && applyingForMatch[1]) {
      roleRaw = applyingForMatch[1].trim();
      candidates.role.push(roleRaw);
      notes.push('role_fallback:applying_for');
    }
  }

  const company = normalizeCompany(companyRaw, { notes });
  const role = normalizeRole(roleRaw, { notes });

  return {
    company,
    role,
    status: 'applied',
    confidence: {
      company: company ? (subjectCompanyMatch ? 94 : 82) : 0,
      role: role ? (requisitionTitleMatch ? 92 : 78) : 0,
      status: 86,
      key: company && role ? 88 : 0
    },
    candidates,
    notes
  };
}

module.exports = {
  parse
};
