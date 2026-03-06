const { normalizeCompany, normalizeRole } = require('../validateJobFields');

function compactLines(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function looksLikeLocation(line) {
  const value = String(line || '');
  return /\b(remote|hybrid|on[- ]?site)\b/i.test(value) || /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2}\b/.test(value);
}

function parse({ subject, text }) {
  const notes = [];
  const candidates = {
    company: [],
    role: []
  };

  const subjectText = String(subject || '').trim();
  const body = String(text || '');
  const lines = compactLines(body);

  let companyRaw;
  let roleRaw;

  const subjectCompanyMatch = subjectText.match(/^(?:.+,\s*)?your application was sent to\s+(.+)$/i);
  if (subjectCompanyMatch && subjectCompanyMatch[1]) {
    companyRaw = subjectCompanyMatch[1].trim();
    candidates.company.push(companyRaw);
  }

  const companyLineIdx = companyRaw
    ? lines.findIndex((line) => line.toLowerCase() === companyRaw.toLowerCase())
    : -1;
  if (companyLineIdx >= 0) {
    for (let i = companyLineIdx + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line || looksLikeLocation(line)) {
        continue;
      }
      if (companyRaw && line.toLowerCase() === companyRaw.toLowerCase()) {
        continue;
      }
      roleRaw = line;
      candidates.role.push(line);
      break;
    }
  }

  if (!roleRaw) {
    for (const line of lines) {
      if (looksLikeLocation(line)) {
        continue;
      }
      if (companyRaw && line.toLowerCase() === companyRaw.toLowerCase()) {
        continue;
      }
      if (/\b(application|sent|linkedin|jobs)\b/i.test(line)) {
        continue;
      }
      roleRaw = line;
      candidates.role.push(line);
      break;
    }
    if (roleRaw) {
      notes.push('role_fallback:nearest_title_line');
    }
  }

  const company = normalizeCompany(companyRaw, { notes });
  const role = normalizeRole(roleRaw, { notes });

  return {
    company,
    role,
    status: 'applied',
    confidence: {
      company: company ? (subjectCompanyMatch ? 96 : 78) : 0,
      role: role ? (companyLineIdx >= 0 ? 92 : 74) : 0,
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
