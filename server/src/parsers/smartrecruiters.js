const { normalizeCompany, normalizeRole } = require('../validateJobFields');

function parse({ subject, text }) {
  const notes = [];
  const candidates = { company: [], role: [] };
  const subjectText = String(subject || '').trim();
  const body = String(text || '');

  let companyRaw;
  let roleRaw;
  let bodyRoleMatch = null;

  const subjectRoleCompanyMatch = subjectText.match(
    /your application has been received(?: for)?\s+(.+?)\s+at\s+([A-Z][A-Za-z0-9&.' -]{1,80})/i
  );
  if (subjectRoleCompanyMatch && subjectRoleCompanyMatch[1]) {
    roleRaw = subjectRoleCompanyMatch[1].trim();
    companyRaw = subjectRoleCompanyMatch[2].trim();
    candidates.role.push(roleRaw);
    candidates.company.push(companyRaw);
  }

  if (!companyRaw) {
    const subjectCompanyMatch = subjectText.match(/your application has been received by\s+(.+)$/i);
    if (subjectCompanyMatch && subjectCompanyMatch[1]) {
      companyRaw = subjectCompanyMatch[1].trim();
      candidates.company.push(companyRaw);
    }
  }

  if (!roleRaw) {
    bodyRoleMatch = body.match(/application (?:for|to)\s+(.+?)(?:\s+at\s+|\s+has been|[\n.]|$)/i);
    if (bodyRoleMatch && bodyRoleMatch[1]) {
      roleRaw = bodyRoleMatch[1].trim();
      candidates.role.push(roleRaw);
    }
  }

  if (!companyRaw) {
    const bodyCompanyMatch = body.match(/(?:at|with)\s+([A-Z][A-Za-z0-9&.' -]{1,80})(?:[\n.]|$)/);
    if (bodyCompanyMatch && bodyCompanyMatch[1]) {
      companyRaw = bodyCompanyMatch[1].trim();
      candidates.company.push(companyRaw);
      notes.push('company_fallback:body_at_with');
    }
  }

  const company = normalizeCompany(companyRaw, { notes });
  const role = normalizeRole(roleRaw, { notes });

  return {
    company,
    role,
    status: 'applied',
    confidence: {
      company: company ? (subjectRoleCompanyMatch ? 92 : 80) : 0,
      role: role ? (subjectRoleCompanyMatch || bodyRoleMatch ? 90 : 0) : 0,
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
