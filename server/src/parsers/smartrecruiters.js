const { normalizeCompany, normalizeRole } = require('../validateJobFields');

function parse({ subject, text }) {
  const notes = [];
  const candidates = { company: [], role: [] };
  const subjectText = String(subject || '').trim();
  const body = String(text || '');

  let companyRaw;
  let roleRaw;
  let bodyRoleMatch = null;
  let subjectRoleCompanyDashMatch = null;

  const subjectRoleCompanyMatch = subjectText.match(
    /your application has been received(?: for)?\s+(.+?)\s+at\s+([A-Z][A-Za-z0-9&.' -]{1,80})/i
  );
  if (subjectRoleCompanyMatch && subjectRoleCompanyMatch[1]) {
    roleRaw = subjectRoleCompanyMatch[1].trim();
    companyRaw = subjectRoleCompanyMatch[2].trim();
    candidates.role.push(roleRaw);
    candidates.company.push(companyRaw);
  }

  if (!roleRaw || !companyRaw) {
    const dashMatch = subjectText.match(
      /^([A-Z][A-Za-z0-9/&.' -]{2,120})\s+[-–—]\s+([A-Z][A-Za-z0-9&.' -]{1,80})$/i
    );
    const bodyRoleAnchor = body.match(/thank you for applying to\s+(?:the\s+)?(.+?)\s+(?:role|position)\b/i);
    const bodyCompanyAnchor = body.match(
      /\b(?:joining|join)\s+(?:the\s+)?([A-Z][A-Za-z0-9&.' -]{1,80}?)\s+(?:team|hiring team|recruiting team)\b/i
    );
    if (dashMatch && bodyRoleAnchor && bodyRoleAnchor[1] && bodyCompanyAnchor && bodyCompanyAnchor[1]) {
      const subjectRoleCandidate = dashMatch[1].trim();
      const subjectCompanyCandidate = dashMatch[2].trim();
      const anchoredRoleCandidate = bodyRoleAnchor[1].trim().replace(/[.!,;:]+$/g, '');
      const anchoredCompanyCandidate = bodyCompanyAnchor[1].trim().replace(/[.!,;:]+$/g, '');
      if (
        anchoredRoleCandidate &&
        anchoredCompanyCandidate &&
        anchoredRoleCandidate.toLowerCase() === subjectRoleCandidate.toLowerCase() &&
        anchoredCompanyCandidate.toLowerCase() === subjectCompanyCandidate.toLowerCase()
      ) {
        roleRaw = anchoredRoleCandidate;
        companyRaw = anchoredCompanyCandidate;
        subjectRoleCompanyDashMatch = dashMatch;
        candidates.role.push(roleRaw);
        candidates.company.push(companyRaw);
        notes.push('subject_role_company_dash_with_body_anchors');
      }
    }
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

  if (!roleRaw) {
    const thankYouRoleMatch = body.match(/thank you for applying to\s+(?:the\s+)?(.+?)\s+(?:role|position)\b/i);
    if (thankYouRoleMatch && thankYouRoleMatch[1]) {
      roleRaw = thankYouRoleMatch[1].trim().replace(/[.!,;:]+$/g, '');
      candidates.role.push(roleRaw);
      notes.push('role_phrase:thank_you_for_applying_to_role');
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

  if (!companyRaw) {
    const joiningTeamMatch = body.match(
      /\b(?:joining|join)\s+(?:the\s+)?([A-Z][A-Za-z0-9&.' -]{1,80}?)\s+(?:team|hiring team|recruiting team)\b/i
    );
    if (joiningTeamMatch && joiningTeamMatch[1]) {
      companyRaw = joiningTeamMatch[1].trim().replace(/[.!,;:]+$/g, '');
      candidates.company.push(companyRaw);
      notes.push('company_phrase:joining_team');
    }
  }

  const company = normalizeCompany(companyRaw, { notes });
  const role = normalizeRole(roleRaw, { notes });

  return {
    company,
    role,
    status: 'applied',
    confidence: {
      company: company ? (subjectRoleCompanyMatch || subjectRoleCompanyDashMatch ? 92 : 80) : 0,
      role: role ? (subjectRoleCompanyMatch || subjectRoleCompanyDashMatch || bodyRoleMatch ? 90 : 0) : 0,
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
