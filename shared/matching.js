const GENERIC_DOMAINS = new Set([
  'gmail',
  'yahoo',
  'outlook',
  'hotmail',
  'protonmail'
]);

const ATS_BASE_DOMAINS = new Set([
  'icims',
  'taleo',
  'workday',
  'myworkday',
  'greenhouse',
  'lever',
  'smartrecruiters',
  'adp',
  'bamboohr',
  'talemetry'
]);

const ATS_SENDER_HINTS = new Set([
  'icims',
  'taleo',
  'workday',
  'greenhouse',
  'lever',
  'smartrecruiters',
  'adp',
  'bamboohr',
  'talemetry'
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

const COMPANY_ONLY_PATTERNS = [
  {
    name: 'thank_you_applying_to',
    regex: /thank you for applying to\s+([A-Z][A-Za-z0-9/&.'\- ]{2,80})/i,
    confidence: 0.92
  },
  {
    name: 'your_application_to',
    regex: /your application (?:to|at|with)\s+([A-Z][A-Za-z0-9/&.'\- ]{2,80})/i,
    confidence: 0.9
  },
  {
    name: 'application_received_to',
    regex: /application (?:received|confirmation|submitted)(?:\s*(?:to|at|with))?\s+([A-Z][A-Za-z0-9/&.'\- ]{2,80})/i,
    confidence: 0.9
  },
  {
    name: 'application_status_company',
    regex: /application status(?: update)?(?:\s*(?:to|at|with))?\s+([A-Z][A-Za-z0-9/&.'\- ]{2,80})/i,
    confidence: 0.88
  },
  {
    name: 'application_update_company',
    regex: /update on your application(?:\s*(?:to|at|with))?\s+([A-Z][A-Za-z0-9/&.'\- ]{2,80})/i,
    confidence: 0.88
  }
];

const SENDER_COMPANY_PATTERNS = [
  {
    name: 'company_at_ats',
    regex: /^(.+?)\s+(?:@|via)\s+([A-Za-z0-9._-]+)$/i,
    confidence: 0.92
  },
  {
    name: 'company_in_parens',
    regex: /\(([^)]+)\)/,
    confidence: 0.9
  },
  {
    name: 'company_careers',
    regex: /^(.+?)\s+(?:careers|jobs|recruiting|talent acquisition|talent team)$/i,
    confidence: 0.88
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

function extractSenderName(sender) {
  const text = normalize(sender);
  if (!text) {
    return null;
  }
  const withoutEmail = text.replace(/<[^>]+>/g, '').replace(/"/g, '').trim();
  return withoutEmail || null;
}

function cleanCompanyCandidate(value) {
  if (!value) {
    return null;
  }
  const cleaned = cleanEntity(value)
    .replace(/\s+for\s+.*$/i, '')
    .replace(/^(?:no[-\s]?reply|noreply|do not reply)\b[: ]*/i, '')
    .trim();
  return cleaned || null;
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

function isAtsDomain(senderDomain) {
  const base = baseDomain(senderDomain);
  if (!base) {
    return false;
  }
  return ATS_BASE_DOMAINS.has(base);
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

function extractCompanyFromSubject(subject) {
  const text = normalize(subject);
  for (const rule of COMPANY_ONLY_PATTERNS) {
    const match = text.match(rule.regex);
    if (!match) {
      continue;
    }
    const company = cleanCompanyCandidate(match[1]);
    if (!company) {
      continue;
    }
    return {
      companyName: company,
      companyConfidence: rule.confidence,
      explanation: `Matched ${rule.name} pattern.`
    };
  }
  return null;
}

function extractCompanyFromSender(sender) {
  const name = extractSenderName(sender);
  if (!name) {
    return null;
  }
  for (const rule of SENDER_COMPANY_PATTERNS) {
    const match = name.match(rule.regex);
    if (!match) {
      continue;
    }
    if (rule.name === 'company_at_ats') {
      const provider = match[2] ? match[2].toLowerCase() : '';
      const baseProvider = provider.split('.')[0];
      if (!ATS_SENDER_HINTS.has(baseProvider)) {
        continue;
      }
    }
    const company = cleanCompanyCandidate(match[1]);
    if (!company) {
      continue;
    }
    return {
      companyName: company,
      companyConfidence: rule.confidence,
      explanation: `Matched ${rule.name} sender pattern.`
    };
  }
  return null;
}

function pickBestCompany(candidates) {
  const available = candidates.filter(Boolean);
  if (!available.length) {
    return null;
  }
  return available.sort((a, b) => (b.companyConfidence || 0) - (a.companyConfidence || 0))[0];
}

function domainConfidence(companyName, senderDomain) {
  if (!companyName || !senderDomain) {
    return { score: 0, isAtsDomain: false };
  }
  const base = baseDomain(senderDomain);
  if (!base || GENERIC_DOMAINS.has(base)) {
    return { score: 0.2, isAtsDomain: false };
  }
  if (ATS_BASE_DOMAINS.has(base)) {
    return { score: 0.9, isAtsDomain: true };
  }
  const companySlug = slugify(companyName);
  const domainSlug = slugify(base);
  if (!companySlug || !domainSlug) {
    return { score: 0.2, isAtsDomain: false };
  }
  if (companySlug.includes(domainSlug) || domainSlug.includes(companySlug)) {
    return { score: 0.95, isAtsDomain: false };
  }
  return { score: 0.4, isAtsDomain: false };
}

function extractThreadIdentity({ subject, sender }) {
  const roleMatch = extractCompanyRole(subject);
  const subjectCompany = extractCompanyFromSubject(subject);
  const senderCompany = extractCompanyFromSender(sender);
  const companyMatch = pickBestCompany([
    roleMatch.companyName
      ? {
          companyName: roleMatch.companyName,
          companyConfidence: roleMatch.companyConfidence,
          explanation: roleMatch.explanation
        }
      : null,
    subjectCompany,
    senderCompany
  ]);

  const companyName = companyMatch?.companyName || null;
  const jobTitle = roleMatch.jobTitle || null;
  const companyConfidence = companyMatch?.companyConfidence || 0;
  const roleConfidence = jobTitle ? roleMatch.roleConfidence : null;
  const senderDomain = extractSenderDomain(sender);
  const domainResult = domainConfidence(companyName, senderDomain);
  const baseConfidence = Math.min(companyConfidence || 0, domainResult.score || 0);
  const matchConfidence = jobTitle
    ? Math.min(baseConfidence, roleConfidence || 0)
    : baseConfidence;
  const explanationParts = [];
  if (companyMatch?.explanation) {
    explanationParts.push(companyMatch.explanation);
  }
  if (jobTitle && roleMatch.explanation) {
    explanationParts.push(roleMatch.explanation);
  }
  if (domainResult.isAtsDomain) {
    explanationParts.push('ATS domain detected.');
  }

  return {
    companyName,
    jobTitle,
    senderDomain,
    companyConfidence,
    roleConfidence,
    domainConfidence: domainResult.score,
    matchConfidence,
    isAtsDomain: domainResult.isAtsDomain,
    explanation: explanationParts.length ? explanationParts.join(' ') : 'No identity match.'
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
