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
  'talemetry',
  'workday',
  'myworkday',
  'myworkdayjobs',
  'greenhouse',
  'greenhouse-mail',
  'workable',
  'workablemail',
  'lever',
  'smartrecruiters',
  'ashbyhq',
  'successfactors',
  'adp',
  'bamboohr'
]);

const ATS_SENDER_HINTS = new Set([
  'icims',
  'taleo',
  'talemetry',
  'workday',
  'myworkday',
  'myworkdayjobs',
  'greenhouse',
  'greenhouse-mail',
  'workable',
  'workablemail',
  'lever',
  'smartrecruiters',
  'ashbyhq',
  'successfactors',
  'adp',
  'bamboohr'
]);

const PROVIDER_DISPLAY_NAMES = new Set([
  'workable',
  'workablemail',
  'greenhouse',
  'icims',
  'workday',
  'myworkday',
  'myworkdayjobs',
  'lever',
  'smartrecruiters',
  'ashby',
  'ashbyhq',
  'taleo',
  'talemetry',
  'successfactors',
  'adp',
  'bamboohr'
]);

const ATS_LOCALPART_COMPANY_MAP = {
  pru: 'Prudential'
};

const GENERIC_SENDER_NAMES = [
  'no reply',
  'noreply',
  'do not reply',
  'notifications',
  'notification',
  'jobs',
  'careers',
  'recruiting',
  'talent acquisition',
  'talent team',
  'hiring',
  'hiring team',
  'hr',
  'human resources',
  'application',
  'applications',
  'support',
  'info'
];

const INVALID_COMPANY_TERMS = new Set([
  'hi',
  'hello',
  'dear',
  'hey',
  'thanks',
  'thank you',
  'regards',
  'best regards',
  'kind regards',
  'sincerely',
  'team',
  'recruiting',
  'recruiting team',
  'hiring team',
  'talent team',
  'talent acquisition',
  'careers',
  'applications',
  'application',
  'candidate',
  'candidates',
  'opportunity',
  'position',
  'job',
  'hr',
  'human resources'
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

const BODY_COMPANY_PATTERNS = [
  {
    name: 'body_thank_you_applying_to',
    regex: /thank you for applying to\s+([A-Z][A-Za-z0-9/&.'\- ]{2,80})/i,
    confidence: 0.9
  },
  {
    name: 'body_thanks_for_applying_to',
    regex: /thanks for applying to\s+([A-Z][A-Za-z0-9/&.'\- ]{2,80})/i,
    confidence: 0.9
  },
  {
    name: 'body_applying_to',
    regex: /applying to\s+([A-Z][A-Za-z0-9/&.'\- ]{2,80})/i,
    confidence: 0.86
  }
];

const COMPANY_ONLY_PATTERNS = [
  {
    name: 'thank_you_applying_to',
    regex: /thank you for applying to\s+([A-Z][A-Za-z0-9/&.'\- ]{2,80})/i,
    confidence: 0.92
  },
  {
    name: 'thanks_for_applying_to',
    regex: /thanks for applying to\s+([A-Z][A-Za-z0-9/&.'\- ]{2,80})/i,
    confidence: 0.92
  },
  {
    name: 'applying_to_company',
    regex: /applying to\s+([A-Z][A-Za-z0-9/&.'\- ]{2,80})/i,
    confidence: 0.88
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

const ROLE_PATTERNS = [
  {
    name: 'thank_you_applying_for_role',
    regex: /thank you for applying(?:\s+to\s+[^,.\n]+)?\s+for\s+([^.\n]+)/i,
    confidence: 0.92
  },
  {
    name: 'application_for_role_position',
    regex: /application for (?:our|the)?\s*(.+?)\s+position\b/i,
    confidence: 0.96
  },
  {
    name: 'application_for_role_job',
    regex: /application for (?:the )?\s*(.+?)\s+job\b/i,
    confidence: 0.96
  },
  {
    name: 'application_to_role_position',
    regex: /application to (?:the )?\s*(.+?)\s+position\b/i,
    confidence: 0.95
  },
  {
    name: 'submitting_application_to_role_position',
    regex: /submitting your application to (?:the )?\s*(.+?)\s+position\b/i,
    confidence: 0.95
  },
  {
    name: 'position_of',
    regex: /position of\s+([^.\n]+)/i,
    confidence: 0.92
  },
  {
    name: 'interest_in_position_of',
    regex: /interest in the position of\s+([^.\n]+)/i,
    confidence: 0.9
  },
  {
    name: 'role_of',
    regex: /role of\s+([^.\n]+)/i,
    confidence: 0.9
  },
  {
    name: 'for_role_position',
    regex: /for the\s+([^.\n]+?)\s+position/i,
    confidence: 0.9
  },
  {
    name: 'applied_for_role',
    regex: /applied for the\s+([^.\n]+?)\s+role/i,
    confidence: 0.9
  },
  {
    name: 'moving_forward_with_role',
    regex: /with (?:the )?([^.\n]+?)\s+role/i,
    confidence: 0.86
  },
  {
    name: 'applied_for_position_of',
    regex: /applied for the position of\s+([^.\n]+)/i,
    confidence: 0.9
  },
  {
    name: 'application_for_role',
    regex: /application for\s+([^.\n]+?)(?:\s+(?:at|with)\s+[A-Z].*)?$/i,
    confidence: 0.9
  },
  {
    name: 'application_received_role',
    regex: /application received[:\-]\s*([^.\n]+)/i,
    confidence: 0.88
  },
  {
    name: 'application_received_dash_role',
    regex: /([^.\n]+)\s+[-–—]\s+application received/i,
    confidence: 0.9
  },
  {
    name: 're_role_application',
    regex: /re:\s*([^.\n]+?)\s+application/i,
    confidence: 0.92
  },
  {
    name: 'interview_for_role',
    regex: /interview (?:for|with)\s+([^.\n]+)/i,
    confidence: 0.88
  },
  {
    name: 'interview_role',
    regex: /interview[:\-]\s*([^.\n]+)/i,
    confidence: 0.9
  },
  {
    name: 'next_steps_role',
    regex: /next steps[:\-]\s*([^.\n]+)/i,
    confidence: 0.86
  },
  {
    name: 'position_label',
    regex: /position[:\-]\s*([^.\n]+)/i,
    confidence: 0.88
  },
  {
    name: 'role_label',
    regex: /role[:\-]\s*([^.\n]+)/i,
    confidence: 0.86
  },
  {
    name: 'position_title_role',
    regex: /position title[:\-]\s*([^.\n]+)/i,
    confidence: 0.88
  },
  {
    name: 'for_role_requisition',
    regex: /for\s+([^.\n]+?)\s*\((?:job|requisition|req)\b/i,
    confidence: 0.88
  }
];

const GENERIC_ROLE_TERMS = new Set([
  'position',
  'role',
  'opportunity',
  'application',
  'career',
  'candidate',
  'opening',
  'job',
  'requisition'
]);

function normalize(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function escapeRegExp(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function slugify(text) {
  return normalize(text).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isProviderName(name) {
  const slug = slugify(name);
  if (!slug) {
    return false;
  }
  for (const provider of PROVIDER_DISPLAY_NAMES) {
    if (!provider) {
      continue;
    }
    if (slug === provider || slug.startsWith(provider) || slug.includes(provider)) {
      return true;
    }
  }
  return false;
}

function isInvalidCompanyCandidate(value) {
  const text = normalize(value);
  if (!text) {
    return true;
  }
  if (text.length < 3) {
    return true;
  }
  if (!/[A-Za-z]/.test(text)) {
    return true;
  }
  const lower = text.toLowerCase();
  if (/^(hi|hello|dear|hey)\b/.test(lower)) {
    return true;
  }
  if (/^(thanks|thank you)\b/.test(lower)) {
    return true;
  }
  if (/unsubscribe|view in browser/i.test(lower)) {
    return true;
  }
  if (INVALID_COMPANY_TERMS.has(lower)) {
    return true;
  }
  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length && words.every((word) => INVALID_COMPANY_TERMS.has(word))) {
    return true;
  }
  return false;
}

function cleanEntity(value) {
  return normalize(value)
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s+\(.*\)$/, '')
    .replace(/\s+\[.*\]$/, '')
    .trim();
}

function cleanRoleEntity(value) {
  return normalize(value).replace(/\s+\[.*\]$/, '').trim();
}

function extractSenderName(sender) {
  const text = normalize(sender);
  if (!text) {
    return null;
  }
  const withoutEmail = text.replace(/<[^>]+>/g, '').replace(/"/g, '').trim();
  if (!withoutEmail) {
    return null;
  }
  if (withoutEmail.includes('@') && !text.includes('<')) {
    return null;
  }
  return withoutEmail || null;
}

function isGenericSenderName(name) {
  const text = normalize(name).toLowerCase();
  if (!text) {
    return true;
  }
  return GENERIC_SENDER_NAMES.some((term) => text === term || text.startsWith(`${term} `));
}

function companyFromDomain(senderDomain) {
  const base = baseDomain(senderDomain);
  if (!base || GENERIC_DOMAINS.has(base) || ATS_BASE_DOMAINS.has(base)) {
    return null;
  }
  const words = base
    .split(/[-_.]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
  const candidate = cleanCompanyCandidate(words.join(' '));
  return candidate || null;
}

function cleanCompanyCandidate(value) {
  if (!value) {
    return null;
  }
  const cleaned = cleanEntity(value)
    .replace(/\b(?:and|&)\s+its\s+affiliates\b/i, '')
    .replace(/\s+(?:inc|inc\.|llc|llc\.|ltd|ltd\.|corp|corp\.|corporation|co|co\.)$/i, '')
    .replace(/\s+for\s+.*$/i, '')
    .replace(
      /\s+(?:careers|jobs|recruiting|hiring|hiring team|talent acquisition|talent team|hr|human resources|applications?)$/i,
      ''
    )
    .replace(/^(?:no[-\s]?reply|noreply|do not reply)\b[: ]*/i, '')
    .replace(/[,:;|]+$/g, '')
    .trim();
  if (!cleaned || isProviderName(cleaned) || isInvalidCompanyCandidate(cleaned)) {
    return null;
  }
  return cleaned || null;
}

function stripSignatureNoise(line) {
  if (!line) {
    return '';
  }
  let text = String(line);
  text = text.replace(/^(best regards|kind regards|regards|sincerely|cheers)[,:\s-]*/i, '');
  text = text.replace(/^(thanks|thank you)[,:\s-]*/i, '');
  text = text.replace(/^(hi|hello|dear|hey)[,:\s-]*/i, '');
  text = text.replace(
    /\b(recruiting team|talent acquisition|talent team|hiring team|people team|recruiting)\b/gi,
    ''
  );
  return normalize(text);
}

function isSignatureNoise(line) {
  const text = normalize(line).toLowerCase();
  if (!text) {
    return true;
  }
  const stripped = stripSignatureNoise(text);
  if (!stripped) {
    return true;
  }
  if (text.includes('unsubscribe') || text.includes('view in browser')) {
    return true;
  }
  if (INVALID_COMPANY_TERMS.has(text)) {
    return true;
  }
  return false;
}

function extractCompanyFromBodyText(bodyText) {
  const raw = String(bodyText || '');
  if (!raw.trim()) {
    return null;
  }
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const scan = lines.slice(-20);
  for (let i = scan.length - 1; i >= 0; i -= 1) {
    const line = scan[i];
    if (isSignatureNoise(line)) {
      const stripped = stripSignatureNoise(line);
      if (!stripped) {
        continue;
      }
    }
    let candidate = stripSignatureNoise(line);
    if (!candidate) {
      continue;
    }
    candidate = candidate.replace(/\b(?:and|&)\s+its\s+affiliates\b/i, '');
    const teamMatch = candidate.match(
      /^(.+?)\s+(?:recruiting|recruiting team|hiring team|talent acquisition|talent team|careers)$/i
    );
    if (teamMatch) {
      candidate = teamMatch[1];
    }
    candidate = cleanCompanyCandidate(candidate);
    if (!candidate) {
      continue;
    }
    return {
      companyName: candidate,
      companyConfidence: 0.88,
      explanation: 'Derived company from email signature.'
    };
  }
  return null;
}

function extractCompanyFromBodyPatterns(bodyText) {
  const text = normalize(bodyText);
  if (!text) {
    return null;
  }
  for (const rule of BODY_COMPANY_PATTERNS) {
    const match = text.match(rule.regex);
    if (!match) {
      continue;
    }
    const company = cleanCompanyCandidate(match[1]);
    if (!company) {
      continue;
    }
    if (/\b(position|role|job)\b/i.test(company)) {
      continue;
    }
    return {
      companyName: company,
      companyConfidence: rule.confidence,
      explanation: `Matched ${rule.name} pattern in body.`
    };
  }
  return null;
}

function normalizeRoleCandidate(value, companyName) {
  if (!value) {
    return null;
  }
  let text = cleanRoleEntity(value);
  text = text.replace(/\b(?:req(?:uisition)?|job id|job)\s*#?:?\s*[A-Z]*-?\d+\b/gi, '');
  text = text.replace(/\bR-\d+\b/gi, '');
  text = text.replace(/\s*[,;|]\s*R-\d+$/i, '');
  if (companyName) {
    const escaped = companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`\\s+(?:at|with|for)\\s+${escaped}.*$`, 'i'), '');
    text = text.replace(new RegExp(`\\s+-\\s+${escaped}.*$`, 'i'), '');
  }
  text = text.replace(/\s+(?:position|role|opportunity|job)\b$/i, '');
  text = text.replace(/[\s,:;\-|]+$/g, '');
  text = normalize(text);
  return text || null;
}

function isGenericRole(value) {
  const text = normalize(value).toLowerCase();
  if (!text) {
    return true;
  }
  if (/^(hi|hello|dear|hey)\b/.test(text)) {
    return true;
  }
  if (/^(thanks|thank you)\b/.test(text)) {
    return true;
  }
  if (GENERIC_ROLE_TERMS.has(text)) {
    return true;
  }
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return true;
  }
  return words.every((word) => GENERIC_ROLE_TERMS.has(word));
}

function scoreForSource(base, source) {
  if (source === 'subject') {
    return base;
  }
  if (source === 'snippet') {
    return Math.max(0, base - 0.04);
  }
  if (source === 'body') {
    return Math.max(0, base - 0.06);
  }
  if (source === 'sender') {
    return Math.max(0, base - 0.08);
  }
  return base;
}

function extractRoleFromSenderName(senderName, companyName) {
  const text = normalize(senderName);
  if (!text) {
    return null;
  }
  const match = text.match(
    /^(.+?)\s+(?:hiring team|recruiting|recruiting team|talent acquisition|talent team|careers)$/i
  );
  if (!match) {
    return null;
  }
  const candidate = normalizeRoleCandidate(match[1], companyName);
  if (!candidate || isGenericRole(candidate)) {
    return null;
  }
  return candidate;
}

function extractJobTitle({ subject, snippet, bodyText, senderName, sender, companyName }) {
  const sources = [
    { label: 'subject', text: normalize(subject) },
    { label: 'snippet', text: normalize(snippet) },
    { label: 'body', text: normalize(bodyText) }
  ];

  const candidates = [];

  for (const source of sources) {
    if (!source.text) {
      continue;
    }
    for (const pattern of ROLE_PATTERNS) {
      const match = source.text.match(pattern.regex);
      if (!match) {
        continue;
      }
      const candidate = normalizeRoleCandidate(match[1], companyName);
      if (!candidate) {
        continue;
      }
      if (candidate.length < 3) {
        continue;
      }
      if (isGenericRole(candidate)) {
        continue;
      }
      if (candidate.length > 90 && !candidate.includes('(')) {
        continue;
      }
      if (companyName) {
        const companySlug = slugify(companyName);
        const roleSlug = slugify(candidate);
        if (companySlug && roleSlug && companySlug === roleSlug) {
          continue;
        }
      }
      candidates.push({
        jobTitle: candidate,
        confidence: scoreForSource(pattern.confidence, source.label),
        source: source.label,
        explanation: `Matched ${pattern.name} pattern in ${source.label}.`
      });
    }
  }

  const resolvedSender = senderName || extractSenderName(sender);
  const senderCandidate = extractRoleFromSenderName(resolvedSender, companyName);
  if (senderCandidate) {
    candidates.push({
      jobTitle: senderCandidate,
      confidence: scoreForSource(0.78, 'sender'),
      source: 'sender',
      explanation: 'Derived role from sender display name.'
    });
  }

  if (candidates.length) {
    candidates.sort((a, b) => {
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }
      const order = { subject: 3, snippet: 2, body: 1, sender: 0 };
      return (order[b.source] || 0) - (order[a.source] || 0);
    });
    return candidates[0];
  }

  return {
    jobTitle: null,
    confidence: 0,
    source: 'none',
    explanation: 'No role pattern matched.'
  };
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

function extractSenderLocalPart(sender) {
  const email = extractEmailAddress(sender);
  if (!email) {
    return null;
  }
  const parts = email.split('@');
  if (parts.length !== 2) {
    return null;
  }
  return parts[0] || null;
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
    const company = cleanCompanyCandidate(match[rule.companyIndex]);
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
  if (!isGenericSenderName(name)) {
    const company = cleanCompanyCandidate(name);
    if (company) {
      return {
        companyName: company,
        companyConfidence: 0.9,
        explanation: 'Used sender display name as company.'
      };
    }
  }
  return null;
}

function extractCompanyFromSenderLocalPart(sender, bodyText) {
  const localPart = extractSenderLocalPart(sender);
  if (!localPart) {
    return null;
  }
  const key = localPart.toLowerCase();
  const mapped = ATS_LOCALPART_COMPANY_MAP[key];
  if (!mapped) {
    return null;
  }
  const candidate = cleanCompanyCandidate(mapped);
  if (!candidate) {
    return null;
  }
  const body = String(bodyText || '');
  const matchesBody = body
    ? new RegExp(`\\b${escapeRegExp(candidate)}\\b`, 'i').test(body)
    : false;
  if (body.trim() && !matchesBody) {
    return null;
  }
  return {
    companyName: candidate,
    companyConfidence: matchesBody ? 0.9 : 0.86,
    explanation: matchesBody
      ? 'Derived company from sender alias confirmed in body.'
      : 'Derived company from sender alias.'
  };
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

function extractThreadIdentity({ subject, sender, snippet, bodyText }) {
  const subjectText = normalize(subject);
  const snippetText = normalize(snippet);
  const bodyTextRaw = String(bodyText || '');
  const senderName = extractSenderName(sender);
  const roleMatch = extractCompanyRole(subjectText);
  const subjectCompany =
    extractCompanyFromSubject(subjectText) || extractCompanyFromSubject(snippetText);
  const senderCompany = extractCompanyFromSender(sender);
  const senderDomain = extractSenderDomain(sender);
  const providerSender = senderName ? isProviderName(senderName) : false;
  const atsSender = isAtsDomain(senderDomain);
  const bodySignatureCompany =
    bodyTextRaw && (atsSender || providerSender)
      ? extractCompanyFromBodyText(bodyTextRaw)
      : null;
  const bodyPatternCompany =
    bodyTextRaw && (atsSender || providerSender)
      ? extractCompanyFromBodyPatterns(bodyTextRaw)
      : null;
  const localPartCompany =
    atsSender || providerSender ? extractCompanyFromSenderLocalPart(sender, bodyTextRaw) : null;
  const bodyCompany = bodySignatureCompany || bodyPatternCompany;
  const domainCompany = companyFromDomain(senderDomain)
    ? {
        companyName: companyFromDomain(senderDomain),
        companyConfidence: 0.85,
        explanation: 'Derived company from sender domain.'
      }
    : null;
  const companyMatch = pickBestCompany([
    roleMatch.companyName
      ? {
          companyName: roleMatch.companyName,
          companyConfidence: roleMatch.companyConfidence,
          explanation: roleMatch.explanation
        }
      : null,
    subjectCompany,
    senderCompany,
    bodyCompany,
    localPartCompany,
    domainCompany
  ]);

  const companyName = companyMatch?.companyName || null;
  const jobTitle = roleMatch.jobTitle || null;
  const companyConfidence = companyMatch?.companyConfidence || 0;
  const roleConfidence = jobTitle ? roleMatch.roleConfidence : null;
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
    isPlatformEmail: providerSender || atsSender,
    bodyTextAvailable: Boolean(bodyTextRaw && bodyTextRaw.trim()),
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
  extractJobTitle,
  buildMatchKey,
  isProviderName,
  isInvalidCompanyCandidate,
  extractCompanyFromBodyText
};
