const { normalizeCompany, normalizeRole } = require('../validateJobFields');

function lines(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractCompanyFromLine(line) {
  const text = String(line || '').trim();
  if (!text) {
    return null;
  }
  const split = text.split(/\s+-\s+/);
  return split[0] || null;
}

function parse({ subject, text }) {
  const notes = [];
  const candidates = { company: [], role: [] };
  const subjectText = String(subject || '').trim();
  const bodyLines = lines(text);

  let roleRaw;
  let companyRaw;

  const subjectRoleMatch = subjectText.match(/indeed application:\s*(.+)$/i);
  if (subjectRoleMatch && subjectRoleMatch[1]) {
    roleRaw = subjectRoleMatch[1].trim();
    candidates.role.push(roleRaw);
  }

  const submittedIdx = bodyLines.findIndex((line) => /application submitted/i.test(line));
  if (submittedIdx >= 0) {
    const nextRole = bodyLines[submittedIdx + 1];
    const nextCompany = bodyLines[submittedIdx + 2];
    if (!roleRaw && nextRole) {
      roleRaw = nextRole;
      candidates.role.push(nextRole);
    }
    if (nextCompany) {
      const companyLine = extractCompanyFromLine(nextCompany);
      if (companyLine) {
        companyRaw = companyLine;
        candidates.company.push(companyLine);
      }
    }
  }

  if (!companyRaw) {
    for (const line of bodyLines) {
      if (/\b(inc\.?|llc|corp\.?|technologies|solutions|systems|labs|group|company)\b/i.test(line)) {
        const maybeCompany = extractCompanyFromLine(line);
        if (maybeCompany) {
          companyRaw = maybeCompany;
          candidates.company.push(maybeCompany);
          break;
        }
      }
    }
  }

  const company = normalizeCompany(companyRaw, { notes });
  const role = normalizeRole(roleRaw, { notes });

  return {
    company,
    role,
    status: 'applied',
    confidence: {
      company: company ? (companyRaw ? 88 : 0) : 0,
      role: role ? (subjectRoleMatch ? 95 : 80) : 0,
      status: 92,
      key: company && role ? 90 : 0
    },
    candidates,
    notes
  };
}

module.exports = {
  parse
};
