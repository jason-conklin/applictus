const { normalizeCompany, normalizeRole } = require('../validateJobFields');

function parse({ subject, text, fromEmail, fromDomain }) {
  const notes = [];
  const candidates = { company: [], role: [] };
  const body = String(text || '');
  const subj = String(subject || '');

  let roleRaw;
  let companyRaw;

  const roleMatch = body.match(/thank you for applying for the role of\s+(.+?)(?:[\n.]|$)/i);
  if (roleMatch && roleMatch[1]) {
    roleRaw = roleMatch[1].trim();
    candidates.role.push(roleRaw);
  }

  const subjectSplitMatch = subj.match(/thank you for your application to\s+(.+)$/i);
  if (subjectSplitMatch && subjectSplitMatch[1]) {
    const cleaned = subjectSplitMatch[1]
      .replace(/\s*\(.*?\)\s*$/g, '')
      .replace(/\s*\[.*?\]\s*$/g, '')
      .trim();
    const split = cleaned.match(/^(.+?)\s*[-–—|:]\s*(.+)$/);
    if (split && split[1]) {
      companyRaw = split[1].trim();
      candidates.company.push(companyRaw);
      if (!roleRaw && split[2]) {
        roleRaw = split[2].trim();
        candidates.role.push(roleRaw);
      }
    }
  }

  if (!companyRaw) {
    const deptLine = body.match(/\b([A-Z][A-Za-z0-9&.' -]{1,60})\s+(?:recruiting team|recruiting department|careers)\b/i);
    if (deptLine && deptLine[1]) {
      companyRaw = deptLine[1].trim();
      candidates.company.push(companyRaw);
    }
  }

  if (!companyRaw && fromDomain && /myworkday\.com$/i.test(fromDomain)) {
    const domainParts = String(fromDomain).split('.').filter(Boolean);
    const maybe = domainParts.length > 3 ? domainParts[domainParts.length - 3] : null;
    if (maybe && maybe !== 'myworkday') {
      companyRaw = maybe;
      candidates.company.push(companyRaw);
      notes.push('company_fallback:workday_domain');
    }
  }

  if (!companyRaw && fromEmail && /oraclecloud\./i.test(fromEmail)) {
    const oracleDomain = String(fromEmail).split('@')[1] || '';
    const parts = oracleDomain.split('.');
    const idx = parts.findIndex((part) => part.toLowerCase() === 'oraclecloud');
    if (idx >= 0 && parts[idx + 1]) {
      companyRaw = parts[idx + 1];
      candidates.company.push(companyRaw);
      notes.push('company_fallback:oraclecloud_sender_domain');
    }
  }

  const company = normalizeCompany(companyRaw, { notes });
  const role = normalizeRole(roleRaw, { notes });

  return {
    company,
    role,
    status: 'applied',
    confidence: {
      company: company ? (companyRaw ? 85 : 0) : 0,
      role: role ? (roleMatch ? 92 : 76) : 0,
      status: 85,
      key: company && role ? 88 : 0
    },
    candidates,
    notes
  };
}

module.exports = {
  parse
};
