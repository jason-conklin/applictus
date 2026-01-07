const GENERIC_DOMAINS = new Set([
  'gmail',
  'yahoo',
  'outlook',
  'hotmail',
  'protonmail'
]);

const ROLE_COMPANY_PATTERNS = [
  {
    name: 'for_role_at_company',
    regex: /\bfor\s+([A-Z][A-Za-z0-9/&.'\- ]{2,80})\s+(?:at|with|from)\s+([A-Z][A-Za-z0-9&.'\- ]{2,60})\b/,
    roleIndex: 1,
    companyIndex: 2,
    confidence: 0.95
  },
  {
    name: 'position_role_at_company',
    regex: /\bposition[: ]+([A-Z][A-Za-z0-9/&.'\- ]{2,80})\s+(?:at|with|from)\s+([A-Z][A-Za-z0-9&.'\- ]{2,60})\b/,
    roleIndex: 1,
    companyIndex: 2,
    confidence: 0.93
  },
  {
    name: 'role_at_company',
    regex: /\brole[: ]+([A-Z][A-Za-z0-9/&.'\- ]{2,80})\s+(?:at|with|from)\s+([A-Z][A-Za-z0-9&.'\- ]{2,60})\b/,
    roleIndex: 1,
    companyIndex: 2,
    confidence: 0.93
  }
];

function normalize(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function slugify(text) {
  return normalize(text).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cleanEntity(value) {
  return normalize(value)
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s+\(.*\)$/, '')
    .replace(/\s+\[.*\]$/, '')
    .trim();
}

function extractEmailAddress(sender) {
  const text = normalize(sender);
  const bracket = text.match(/<([^>]+)>/);
  if (bracket && bracket[1]) {
    return bracket[1];
  }
  const direct = text.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  return direct ? direct[1] : null;
}

function extractSenderDomain(sender) {
  const email = extractEmailAddress(sender);
  if (!email) {
    return null;
  }
  const parts = email.split('@');
  if (parts.length !== 2) {
    return null;
  }
  return parts[1].toLowerCase();
}

function baseDomain(domain) {
  if (!domain) {
    return null;
  }
  const parts = domain.split('.').filter(Boolean);
  if (parts.length < 2) {
    return domain;
  }
  return parts[parts.length - 2];
}

function extractCompanyRole(subject) {
  const text = normalize(subject);
  for (const rule of ROLE_COMPANY_PATTERNS) {
    const match = text.match(rule.regex);
    if (!match) {
      continue;
    }
    const role = cleanEntity(match[rule.roleIndex]);
    const company = cleanEntity(match[rule.companyIndex]);
    if (!role || !company) {
      continue;
    }
    return {
      companyName: company,
      jobTitle: role,
      companyConfidence: rule.confidence,
      roleConfidence: rule.confidence,
      explanation: `Matched ${rule.name} pattern.`
    };
  }
  return {
    companyName: null,
    jobTitle: null,
    companyConfidence: 0,
    roleConfidence: 0,
    explanation: 'No strict role/company pattern matched.'
  };
}

function domainConfidence(companyName, senderDomain) {
  if (!companyName || !senderDomain) {
    return 0;
  }
  const base = baseDomain(senderDomain);
  if (!base || GENERIC_DOMAINS.has(base)) {
    return 0.2;
  }
  const companySlug = slugify(companyName);
  const domainSlug = slugify(base);
  if (!companySlug || !domainSlug) {
    return 0.2;
  }
  if (companySlug.includes(domainSlug) || domainSlug.includes(companySlug)) {
    return 0.95;
  }
  return 0.4;
}

function extractThreadIdentity({ subject, sender }) {
  const { companyName, jobTitle, companyConfidence, roleConfidence, explanation } =
    extractCompanyRole(subject);
  const senderDomain = extractSenderDomain(sender);
  const domainScore = domainConfidence(companyName, senderDomain);
  const matchConfidence = Math.min(companyConfidence, roleConfidence, domainScore);

  return {
    companyName,
    jobTitle,
    senderDomain,
    companyConfidence,
    roleConfidence,
    domainConfidence: domainScore,
    matchConfidence,
    explanation
  };
}

function buildMatchKey({ companyName, jobTitle, senderDomain }) {
  if (!companyName || !jobTitle || !senderDomain) {
    return null;
  }
  return `${slugify(companyName)}|${slugify(jobTitle)}|${slugify(senderDomain)}`;
}

module.exports = {
  extractThreadIdentity,
  buildMatchKey
};
