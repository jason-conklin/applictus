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
  pru: 'Prudential',
  prudential: 'Prudential'
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
  'thank you so much',
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

const SYSTEM_INBOX_COMPANY_TERMS = new Set([
  'talentacquisition',
  'talent',
  'recruiting',
  'recruitment',
  'careers',
  'career',
  'jobs',
  'noreply',
  'noreplyteam',
  'donotreply',
  'no-reply',
  'no_reply',
  'notifications',
  'notification',
  'support'
]);

const ROLE_COMPANY_PATTERNS = [
  {
    name: 'profile_submitted_subject',
    regex: /\bprofile submitted to\s+([A-Z][A-Za-z0-9&.'\- ]{2,80})\s+for\s+([A-Z][A-Za-z0-9&.'\- ]{2,80})(?:\s*[\/|]\s*#?[A-Za-z0-9-]{3,})?\s*$/i,
    roleIndex: 2,
    companyIndex: 1,
    confidence: 0.93
  },
  {
    name: 'subject_update_from_company',
    regex: /update on your application from\s+([A-Z][A-Za-z0-9/&.'\- ]{2,80})/i,
    roleIndex: null,
    companyIndex: 1,
    confidence: 0.9
  },
  {
    name: 'applying_to_role_position_at_company',
    regex: /\bapplying to (?:the )?([A-Z][A-Za-z0-9/&.'\- ]{2,80})\s+position\s+at\s+([A-Z][A-Za-z0-9&.'\- ]{2,80}?)(?:[.,\n]|$|\s+has\s+|\s+have\s+)/i,
    roleIndex: 1,
    companyIndex: 2,
    confidence: 0.96
  },
  {
    name: 'application_to_role_position_at_company',
    regex: /\bapplication to (?:the )?([A-Z][A-Za-z0-9/&.'\- ]{2,80})\s+position\s+at\s+([A-Z][A-Za-z0-9&.'\- ]{2,80}?)(?:[.,\n]|$|\s+has\s+|\s+have\s+)/i,
    roleIndex: 1,
    companyIndex: 2,
    confidence: 0.95
  },
  {
    name: 'company_dash_role',
    regex: /^([A-Z][A-Za-z0-9&.'\- ]{2,80})\s+[-–—]\s+([A-Z][A-Za-z0-9/&.'\- ]{2,80})$/i,
    roleIndex: 2,
    companyIndex: 1,
    confidence: 0.93
  },
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

const EXTERNAL_REQ_PATTERNS = [
  {
    name: 'workday_r_code',
    regex: /\bR-\d{4,}\b/i,
    confidence: 0.95
  },
  {
    name: 'requisition_id',
    regex: /\b(?:requisition|req(?:uisition)?)\s*(?:id)?[:#\s-]*([A-Z0-9-]{3,})\b/i,
    confidence: 0.9
  },
  {
    name: 'job_id',
    regex: /\bjob\s*id[:#\s-]*([A-Z0-9-]{3,})\b/i,
    confidence: 0.9
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
  },
  {
    name: 'moved_to_next_step_company',
    regex: /([A-Z][A-Za-z0-9&.'\- ]{2,80}) has moved to the next step in (?:their )?hiring process/i,
    confidence: 0.9
  },
  {
    name: 'recruiting_thank_you_applying',
    regex: /^([A-Z][A-Za-z0-9&.'\- ]{2,80})\s+recruiting\s+[-–—]\s+thank you for applying/i,
    confidence: 0.93
  },
  {
    name: 'subject_company_dash_role',
    regex: /^([A-Z][A-Za-z0-9&.'\- ]{2,80})\s+[-–—]\s+[A-Z][A-Za-z0-9/&.'\- ]{2,80}$/i,
    confidence: 0.93
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
    name: 'your_application_colon_role',
    regex: /your application:\s*(.+)$/i,
    confidence: 0.94
  },
  {
    name: 'recent_job_application_for_role',
    regex: /your recent job application for\s+([^.\n]+)/i,
    confidence: 0.95
  },
  {
    name: 'thank_you_applying_for_role_tail',
    regex: /thank you for applying for\s+(?:the\s+)?(.+?)\s+role\b/i,
    confidence: 0.95
  },
  {
    name: 'thank_you_application_to_our_role',
    regex: /thank you for your application\s+(?:to|for)\s+(?:our\s+|the\s+)?(.+?)\s+(?:role|position|job|opening)\b/i,
    confidence: 0.95
  },
  {
    name: 'thank_you_applying_for_role',
    regex: /thank you for applying(?:\s+to\s+[^,.\n]+)?\s+for\s+([^.\n]+)/i,
    confidence: 0.92
  },
  {
    name: 'thank_you_applying_to_role',
    regex: /thank you for applying to\s+(?:the\s+)?(.+?)(?:\s+position|\s+role|[.,]|$)/i,
    confidence: 0.9
  },
  {
    name: 'received_information_for_opening',
    regex: /received your (?:information|application)\s+for\s+(?:our\s+|the\s+)?(.+?)\s+(?:opening|position|role)\b/i,
    confidence: 0.93
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
    name: 'application_for_role_at_company',
    regex: /application for\s+([A-Z][A-Za-z0-9/&.'\- ]{2,80})\s+at\s+[A-Z][A-Za-z0-9&.'\- ]{2,80}\b/i,
    confidence: 0.9
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
    name: 'interest_in_role_position',
    regex: /interest in the\s+([^.\n]+?)\s+position\b/i,
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
    name: 'applying_to_role_position',
    regex: /applying to (?:the )?([^.\n]+?)\s+position\b/i,
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
  'requisition',
  'the'
]);

function normalize(text) {
  let value = String(text || '');
  if (!value) {
    return '';
  }
  if (typeof value.normalize === 'function') {
    value = value.normalize('NFKC');
  }
  return value
    .replace(/[\u00a0\u1680\u180e\u2000-\u200d\u202f\u205f\u3000]/g, ' ')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeJobIdentity(value) {
  let text = normalize(value);
  if (!text) {
    return null;
  }

  text = text
    .replace(/\s+[·•|]\s+.*$/g, '')
    .replace(/\s*[,-]\s*(?:remote|hybrid|on[- ]site|onsite)\b.*$/i, '')
    .replace(/\s*[,-]\s*[A-Za-z .'-]+,\s*[A-Z]{2}\b.*$/i, '')
    .replace(/\s*\((?:remote|hybrid|on[- ]site|onsite)[^)]*\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  return text || null;
}

function escapeRegExp(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function slugify(text) {
  return normalize(text).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeRoleTokens(title) {
  if (!title) return [];
  let text = sanitizeJobTitle(title) || '';
  text = text
    .replace(/\bjr\.?\b/gi, 'junior')
    .replace(/\bsr\.?\b/gi, 'senior')
    .replace(/\bswe\b/gi, 'software engineer')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = text
    .toLowerCase()
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !['job', 'role', 'position', 'opening', 'program'].includes(t));
  return tokens;
}

function roleStrength(tokens) {
  if (!tokens || !tokens.length) {
    return { weak: true, strong: false };
  }
  const meaningful = tokens.filter(
    (t) => !['junior', 'jr', 'senior', 'sr', 'intern', 'internship', 'graduate', 'grad'].includes(t)
  );
  const specialization = new Set([
    'data',
    'cloud',
    'full',
    'stack',
    'frontend',
    'backend',
    'ios',
    'android',
    'ml',
    'ai',
    'security',
    'devops',
    'qa',
    'sre',
    'analytics',
    'analyst'
  ]);
  const hasSpec = tokens.some((t) => specialization.has(t));
  const strong = meaningful.length >= 3 || hasSpec;
  const weak = meaningful.length < 2 && !hasSpec;
  return { weak, strong };
}

function extractRoleTail(title) {
  if (!title) return { tail: null, tailTokens: [], fullTokens: normalizeRoleTokens(title) };
  const parts = String(title).split(/[-–—:\/]+/);
  const tail = parts.length > 1 ? parts[parts.length - 1].trim() : null;
  const tailTokens = tail ? normalizeRoleTokens(tail) : [];
  return { tail, tailTokens, fullTokens: normalizeRoleTokens(title) };
}

const PROGRAM_TAIL_STOPWORDS = new Set([
  'program',
  'development',
  'technology',
  'technical',
  'early',
  'career',
  'track',
  'rotation',
  'rotational',
  'academy',
  'fellowship',
  'internship',
  'intern',
  'graduate',
  'grad',
  'role',
  'position',
  'opening'
]);

const STRONG_REJECTION_PATTERNS = [
  /unable to move forward/i,
  /we are unable to move forward/i,
  /not move forward with your application/i,
  /decided to pursue other candidates/i,
  /we(?:'| )?ve decided to pursue other candidates/i,
  /moving forward with other candidates/i,
  /(will not|won't) be moving forward/i,
  /not selected/i,
  /regret to inform/i,
  /position has been filled/i,
  /after careful consideration[, ]+(?:we )?(?:are )?(?:not|unable|declined|declining|will not)/i,
  /unfortunately[, ]+(?:we )?(?:are )?(?:not|unable|declined|declining|will not|can(?:not|'t) move forward|pursue other candidates)/i
];

function isProgramRole(text) {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  return (
    lower.includes('program') ||
    lower.includes('early career') ||
    lower.includes('development program') ||
    lower.includes('rotational') ||
    lower.includes('academy') ||
    lower.includes('track')
  );
}

function extractProgramTail(title) {
  if (!title) return { tailSlug: null, tailTokens: [], tailStrength: false };
  const parts = String(title).split(/[-–—:|\/]+/);
  const tail = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const tokens = normalizeRoleTokens(tail).filter((t) => !PROGRAM_TAIL_STOPWORDS.has(t));
  const tailStrength = tokens.length >= 2;
  const tailSlug = tokens.join(' ');
  return { tailSlug, tailTokens: tokens, tailStrength };
}

function tailSimilarity(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const setA = new Set(aTokens.filter((t) => !PROGRAM_TAIL_STOPWORDS.has(t)));
  const setB = new Set(bTokens.filter((t) => !PROGRAM_TAIL_STOPWORDS.has(t)));
  if (!setA.size || !setB.size) return 0;
  let intersect = 0;
  for (const t of setA) {
    if (setB.has(t)) intersect++;
  }
  const union = setA.size + setB.size - intersect;
  if (!union) return 0;
  return intersect / union;
}

function normalizeExternalReqId(value) {
  const text = normalize(value);
  if (!text) {
    return null;
  }
  const cleaned = text.replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
  return cleaned || null;
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

function looksLikeEmailOrDomain(value) {
  const text = normalize(value).toLowerCase();
  if (!text) {
    return false;
  }
  if (text.includes('@')) {
    return true;
  }
  if (/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i.test(text)) {
    return true;
  }
  if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(text)) {
    return true;
  }
  if (/\boraclecloud\.[a-z0-9.-]+\.[a-z]{2,}\b/i.test(text)) {
    return true;
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
  if (looksLikeEmailOrDomain(text)) {
    return true;
  }
  const lower = text.toLowerCase();
  const compact = lower.replace(/[^a-z]/g, '');
  if (SYSTEM_INBOX_COMPANY_TERMS.has(compact)) {
    return true;
  }
  if (/^(hi|hello|dear|hey)\b/.test(lower)) {
    return true;
  }
  if (/^(thanks|thank you)\b/.test(lower)) {
    return true;
  }
  if (/^(your|our|this|that|these|those|my)\b/.test(lower)) {
    return true;
  }
  if (/^[A-Za-z]{2,40},/.test(text) || /,\s*thank you/i.test(lower)) {
    return true;
  }
  if (lower.includes('thank you') && lower.split(/\s+/).length <= 6) {
    return true;
  }
  if (/\bjoining us\b/i.test(lower) || /\bwe appreciate\b/i.test(lower) || /\bthank you so much\b/i.test(lower)) {
    return true;
  }
  if (/^(we|i|you)\b/.test(lower)) {
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

const ROLE_PREFIX_PATTERNS = [
  /^role of\s+/i,
  /^position of\s+/i,
  /^job application:\s*/i,
  /^application:\s*/i,
  /^re:\s*/i,
  /^your application to\s+/i,
  /^application to\s+/i,
  /^applying for\s+/i,
  /^applied for\s+/i,
  /^for\s+(?:the\s+)?role of\s+/i,
  /^for\s+(?:the\s+)?position of\s+/i,
  /^(?:the\s+)?role of\s+/i,
  /^(?:the\s+)?position of\s+/i
];

const ROLE_BOILERPLATE_PATTERNS = [
  /^thank you for/i,
  /^we regret to inform/i,
  /^after careful consideration/i,
  /^unfortunately/i,
  /time and effort you put into applying/i,
  /we (?:will not|won't) be moving forward/i
];

function isBoilerplateRoleCandidate(value) {
  const text = normalize(value).toLowerCase();
  if (!text) {
    return true;
  }
  if (ROLE_BOILERPLATE_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }
  if (text.length > 80 && /\b(thank you|we regret|after careful consideration|unfortunately|time and effort)\b/i.test(text)) {
    return true;
  }
  return false;
}

function normalizeRole(raw) {
  let text = normalize(raw);
  if (!text) {
    return null;
  }

  text = text.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();

  let previous = null;
  while (text && text !== previous) {
    previous = text;
    for (const pattern of ROLE_PREFIX_PATTERNS) {
      text = text.replace(pattern, '');
    }
    text = text.replace(/^(?:the|a|an)\s+/i, '').trim();
    text = normalize(text);
  }

  text = text.replace(/[.!,;:]+$/g, '').trim();
  text = normalize(text);
  if (isBoilerplateRoleCandidate(text)) {
    return null;
  }
  return text || null;
}

function normalizeCompany(raw) {
  let text = normalize(raw);
  if (!text) {
    return null;
  }

  text = text.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  text = text.replace(/\s+(?:Recruiting Department|Talent Acquisition Team|Department)\s*$/i, '');
  text = text.replace(/[.!,;:]+$/g, '').trim();
  text = normalize(text);
  return text || null;
}

function normalizeDisplayTitle(title) {
  if (title === null || title === undefined) return null;
  let text = String(title).trim();
  text = text.replace(/\s+(role|position|opening)\s*$/i, '').trim();
  return text || null;
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
    .replace(/^(?:unfortunately|regretfully|sadly)[,:\s-]*/i, '')
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
  const normalizedCompany = normalizeCompany(cleaned);
  const lower = String(normalizedCompany || '').toLowerCase();
  const stopPhrases = [
    'taking the time to apply',
    'thank you for your interest',
    'thank you so much',
    'interest in',
    'we have received',
    'we received',
    'daily digest',
    'opportunities',
    'notifications',
    'joining us'
  ];
  if (!normalizedCompany || normalizedCompany.length > 60) {
    return null;
  }
  if (stopPhrases.some((p) => lower.includes(p))) {
    return null;
  }
  if (/\b(apply|applying|apply)\b/i.test(normalizedCompany)) {
    return null;
  }
  if (/^(hi|hello|dear|hey)\b/i.test(normalizedCompany)) {
    return null;
  }
  if (
    !normalizedCompany ||
    isProviderName(normalizedCompany) ||
    isInvalidCompanyCandidate(normalizedCompany)
  ) {
    return null;
  }
  return normalizedCompany || null;
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

function extractExternalReqId({ subject, snippet, bodyText }) {
  const sources = [
    { label: 'subject', text: normalize(subject) },
    { label: 'snippet', text: normalize(snippet) },
    { label: 'body', text: normalize(bodyText) }
  ];

  for (const source of sources) {
    if (!source.text) {
      continue;
    }
    for (const pattern of EXTERNAL_REQ_PATTERNS) {
      const match = source.text.match(pattern.regex);
      if (!match) {
        continue;
      }
      const raw = match[1] || match[0];
      const externalReqId = normalizeExternalReqId(raw);
      if (!externalReqId) {
        continue;
      }
      return {
        externalReqId,
        source: source.label,
        confidence: pattern.confidence,
        explanation: `Matched ${pattern.name} pattern in ${source.label}.`
      };
    }
  }

  return {
    externalReqId: null,
    source: 'none',
    confidence: 0,
    explanation: 'No requisition id pattern matched.'
  };
}

function normalizeRoleCandidate(value, companyName) {
  if (!value) {
    return null;
  }
  let text = normalizeRole(cleanRoleEntity(value));
  if (!text) {
    return null;
  }
  text = text.replace(/\s*\|\s*-\s*#?\d{2,}\s*$/i, '');
  text = text.replace(/\s+(?:-|–|—|\|)\s*(?:req(?:uisition)?\s*(?:id)?\s*)?#?\d{2,}\s*$/i, '');
  text = text.replace(/\b(?:req(?:uisition)?|job id|job)\s*#?:?\s*[A-Z]*-?\d+\b/gi, '');
  text = text.replace(/\bR-\d+\b/gi, '');
  text = text.replace(/\s*[,;|]\s*R-\d+$/i, '');
  if (companyName) {
    const escaped = companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`\\s+(?:at|with|for)\\s+${escaped}.*$`, 'i'), '');
    text = text.replace(new RegExp(`\\s+-\\s+${escaped}.*$`, 'i'), '');
  }
  text = text.replace(/\s+(?:position|role|opportunity|job)\b$/i, '');
  text = text.replace(
    /\b(?:best regards|kind regards|regards|sincerely|cheers|recruiting team|hiring team|talent acquisition|talent team|people team)\b.*$/i,
    ''
  );
  text = text.replace(/[\s,:;\-|]+$/g, '');
  text = normalizeRole(sanitizeJobTitle(text));
  if (isBoilerplateRoleCandidate(text)) {
    return null;
  }
  return text || null;
}

function sanitizeJobTitle(title) {
  if (!title) return null;
  let text = normalize(title);
  text = text.replace(/^(?:our|the|a|an|this|that|your|my)\s+/i, '');
  if (text.length > 120) {
    text = text.slice(0, 120);
  }
  text = text.replace(/^["']+|["']+$/g, '');
  text = text.replace(/[\\/|]+$/g, '');
  const clauseStops = [
    ', and',
    ', but',
    ', while',
    ' we are ',
    " we're ",
    ' we will ',
    ' thank you ',
    ' sincerely ',
    '.',
    '!',
    '?',
    '\n'
  ];
  for (const stop of clauseStops) {
    const idx = text.toLowerCase().indexOf(stop.trim().toLowerCase());
    if (idx > 0) {
      text = text.slice(0, idx).trim();
    }
  }
  return text || null;
}

function trimTrailingLocation(title) {
  if (!title) return title;
  const cleaned = normalize(title);
  const locationPattern =
    /\s*[–-]\s*(?:St\.?|San|Los|New|Jersey|Petersburg|City|Houston|Austin|Boston|Chicago|Dallas|Denver|Seattle|Tampa|Florida|Texas|California|FL|NJ|NY)\b.*$/i;
  return cleaned.replace(locationPattern, '').trim() || cleaned;
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

const INDEED_APPLY_COMPANY_DENYLIST = new Set([
  'indeed',
  'indeed apply',
  'unknown',
  'application submitted'
]);

const INDEED_APPLY_IGNORED_LINE_PATTERNS = [
  /^application submitted\b/i,
  /^next steps?\b/i,
  /^good luck\b/i,
  /^indeed\b/i,
  /^view (?:application|job)\b/i,
  /^manage (?:preferences|alerts)\b/i,
  /^the following items were sent to\b/i,
  /^this information was sent to\b/i
];

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

function extractWorkdayStructuredRole(bodyText) {
  const text = String(bodyText || '').replace(/\u2013/g, '-');
  const rolePatterns = [
    /Business Process:\s*Job Application:\s*[^\n-]*-\s*[A-Z0-9-]{3,}\s+([A-Z0-9][A-Za-z0-9/&.'\- )(]+?)(?:\s+on\s+\d{1,2}\/\d{1,2}\/\d{2,4}|$)/i,
    /Subject:\s*.*-\s*[A-Z0-9-]{3,}\s+([A-Z0-9][A-Za-z0-9/&.'\- )(]+?)(?:\s+on\s+\d{1,2}\/\d{1,2}\/\d{2,4}|$)/i
  ];
  for (const pattern of rolePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let candidate = normalize(match[1]);
      candidate = trimTrailingLocation(candidate);
      if (candidate && candidate.length > 2 && !isGenericRole(candidate)) {
        return candidate;
      }
    }
  }
  return null;
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
  const workdayStructured = extractWorkdayStructuredRole(bodyText);
  const candidates = [];
  if (workdayStructured) {
    const candidate = normalizeRoleCandidate(workdayStructured, companyName);
    if (candidate && !isGenericRole(candidate) && candidate.length >= 3) {
      candidates.push({
        jobTitle: candidate,
        confidence: 0.95,
        source: 'body',
        explanation: 'Matched Workday structured role.'
      });
    }
  }
  const sources = [
    { label: 'subject', text: normalize(subject) },
    { label: 'snippet', text: normalize(snippet) },
    { label: 'body', text: normalize(bodyText) }
  ];

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
        jobTitleRaw: match[1] ? match[1].trim() : candidate,
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
      jobTitleRaw: senderCandidate,
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

function extractCompanyRole(text) {
  const normalized = normalize(text);
  if (!normalized) {
    return null;
  }
  for (const rule of ROLE_COMPANY_PATTERNS) {
    const match = normalized.match(rule.regex);
    if (!match) {
      continue;
    }
    const role =
      typeof rule.roleIndex === 'number' && rule.roleIndex >= 0
        ? cleanRoleEntity(match[rule.roleIndex])
        : null;
    const company = cleanCompanyCandidate(match[rule.companyIndex]);
    if (!company) {
      continue;
    }
    return {
      companyName: company,
      jobTitle: role,
      companyConfidence: rule.confidence,
      roleConfidence: role ? rule.confidence : 0,
      explanation: `Matched ${rule.name} pattern.`
    };
  }
  return null;
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

function extractCompanyFromSignatureLines(bodyText) {
  const text = String(bodyText || '');
  if (!text) return null;
  const tailLines = text.split(/\n+/).slice(-12).map((l) => l.trim()).filter(Boolean);
  const patterns = [
    /^(?:best regards|regards|sincerely|thanks|thank you)[,]?\s*([A-Z][A-Za-z&.'\- ]{2,80})\s+(?:talent acquisition|recruiting|careers)(?: team)?$/i,
    /^([A-Z][A-Za-z&.'\- ]{2,80})\s+(?:talent acquisition|recruiting|careers)(?: team)?$/i
  ];
  for (const line of tailLines) {
    for (const pattern of patterns) {
      const m = line.match(pattern);
      if (m && m[1]) {
        const candidate = cleanCompanyCandidate(m[1]);
        if (candidate) {
          return {
            companyName: candidate,
            companyConfidence: 0.96,
            explanation: 'Matched signature company line.'
          };
        }
      }
    }
    const atMatch = line.match(/in\s+([A-Z][A-Za-z&.'\- ]{2,80})\b\.?$/i);
    if (atMatch && atMatch[1]) {
      const candidate = cleanCompanyCandidate(atMatch[1]);
      if (candidate) {
        return {
          companyName: candidate,
          companyConfidence: 0.88,
          explanation: 'Matched company from closing sentence.'
        };
      }
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
  const body = String(bodyText || '');
  const mapped = ATS_LOCALPART_COMPANY_MAP[key];

  // Workday tenant style: foo@myworkday.com -> company "Foo"
  const isWorkdaySender = /@(?:my)?workday\.com$/i.test(sender || '');
  if (isWorkdaySender) {
    const workdayCandidate = cleanCompanyCandidate(key);
    if (workdayCandidate && !isInvalidCompanyCandidate(workdayCandidate)) {
      const matchesBody = body
        ? new RegExp(`\\b${escapeRegExp(workdayCandidate)}\\b`, 'i').test(body)
        : false;
      return {
        companyName: workdayCandidate,
        companyConfidence: matchesBody ? 0.92 : 0.88,
        explanation: matchesBody
          ? 'Derived company from Workday sender local part confirmed in body.'
          : 'Derived company from Workday sender local part.'
      };
    }
  }

  if (!mapped) {
    return null;
  }
  const candidate = cleanCompanyCandidate(mapped);
  if (!candidate) {
    return null;
  }
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

function sanitizeCompanyCandidate(candidate) {
  if (!candidate || !candidate.companyName) return null;
  const name = candidate.companyName;
  if (isInvalidCompanyCandidate(name)) {
    return null;
  }
  if (/\b(engineer|developer|analyst|program|track)\b/i.test(name)) {
    return null;
  }
  return candidate;
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

function isOracleCloudSender(sender) {
  const senderEmail = extractEmailAddress(sender) || '';
  const senderDomain = extractSenderDomain(sender) || '';
  return /oraclecloud\./i.test(senderEmail) || /oraclecloud\./i.test(senderDomain);
}

function normalizeOracleCompany(value) {
  if (!value) {
    return null;
  }
  let candidate = normalize(value)
    .replace(/\s*[|]\s*.*$/g, '')
    .replace(/\s+(?:careers|recruiting team)\s*$/i, '')
    .replace(/[.!,;:]+$/g, '')
    .trim();
  candidate = normalizeCompany(candidate);
  if (!candidate || isInvalidCompanyCandidate(candidate)) {
    return null;
  }
  return candidate;
}

function extractOracleCloudIdentity({ subject, snippet, bodyText, sender }) {
  if (!isOracleCloudSender(sender)) {
    return null;
  }
  const normalizedSubject = normalize(subject);
  const bodySource = `${String(bodyText || '')}\n${String(snippet || '')}`.replace(/\r\n/g, '\n');
  const lines = bodySource
    .split(/\r?\n/)
    .map((line) => normalize(line))
    .filter(Boolean);

  const subjectRoleMatch = normalizedSubject.match(/your recent job application for\s+(.+?)(?:[.!?]|$)/i);
  const joiningMatch =
    bodySource.match(/thanks? for your interest in joining\s+(.+?)\s+for\s+(.+?)(?:[.\n]|$)/i) ||
    bodySource.match(/joining\s+(.+?)\s+for\s+(.+?)(?:[.\n]|$)/i);
  const applyingMatch = bodySource.match(
    /applying for (?:the )?(.+?)\s+(?:\|\s*)?position\s+to\s+(.+?)(?:[.\n]|$)/i
  );

  let companyName = null;
  let companySource = 'none';
  if (joiningMatch) {
    const candidate = normalizeOracleCompany(joiningMatch[1]);
    if (candidate) {
      companyName = candidate;
      companySource = 'joining_for';
    }
  }
  if (!companyName && applyingMatch) {
    const candidate = normalizeOracleCompany(applyingMatch[2]);
    if (candidate) {
      companyName = candidate;
      companySource = 'position_to';
    }
  }
  if (!companyName) {
    for (const line of lines) {
      const careersMatch = line.match(/^(.+?)\s+careers(?:\s*[|:-]\s*(.+))?$/i);
      if (careersMatch) {
        const rightCandidate = normalizeOracleCompany(careersMatch[2] || '');
        const leftCandidate = normalizeOracleCompany(careersMatch[1]);
        const candidate = rightCandidate || leftCandidate;
        if (candidate) {
          companyName = candidate;
          companySource = 'signature_careers';
          break;
        }
      }
      const recruitingMatch = line.match(/^(.+?)\s+recruiting team$/i);
      if (recruitingMatch) {
        const candidate = normalizeOracleCompany(recruitingMatch[1]);
        if (candidate) {
          companyName = candidate;
          companySource = 'signature_recruiting';
          break;
        }
      }
    }
  }

  const roleRaw =
    (subjectRoleMatch && subjectRoleMatch[1] && normalize(subjectRoleMatch[1])) ||
    (joiningMatch && joiningMatch[2] && normalize(joiningMatch[2])) ||
    (applyingMatch && applyingMatch[1] && normalize(applyingMatch[1])) ||
    null;
  const jobTitle = normalizeRoleCandidate(roleRaw, companyName);
  if (!companyName && !jobTitle) {
    return null;
  }

  const senderDomain = extractSenderDomain(sender);
  const domainResult = domainConfidence(companyName, senderDomain);
  const companyConfidence =
    companySource === 'joining_for' || companySource === 'position_to'
      ? 0.95
      : companySource === 'signature_careers' || companySource === 'signature_recruiting'
      ? 0.9
      : 0;
  const roleConfidence = jobTitle
    ? subjectRoleMatch
      ? 0.95
      : joiningMatch || applyingMatch
      ? 0.92
      : 0.88
    : null;
  const matchConfidence = companyName
    ? jobTitle
      ? Math.min(companyConfidence, roleConfidence || companyConfidence)
      : companyConfidence
    : 0;

  return {
    providerHint: 'oracle_cloud',
    companyName: companyName || null,
    jobTitle: jobTitle || null,
    senderDomain,
    companyConfidence,
    roleConfidence,
    domainConfidence: domainResult.score,
    matchConfidence,
    isAtsDomain: domainResult.isAtsDomain,
    isPlatformEmail: true,
    bodyTextAvailable: Boolean(String(bodyText || '').trim()),
    explanation: `Oracle Cloud parser (${companySource || 'none'} company).`
  };
}

function stripTrailingBracketedSegments(value) {
  let text = normalize(value);
  if (!text) {
    return '';
  }
  let previous = null;
  while (text && text !== previous) {
    previous = text;
    text = text
      .replace(/\s*\([^()]*\)\s*$/g, '')
      .replace(/\s*\[[^\[\]]*]\s*$/g, '')
      .trim();
  }
  return text;
}

function splitApplicationToTarget(target) {
  const separators = [' - ', ' – ', ' — ', ' | ', ' : '];
  for (const separator of separators) {
    const index = target.indexOf(separator);
    if (index <= 0) {
      continue;
    }
    const left = target.slice(0, index).trim();
    const right = target.slice(index + separator.length).trim();
    if (!left || !right) {
      continue;
    }
    return { left, right, separator };
  }
  const compactHyphen = target.match(/^(.+?)\s*-\s*(.+)$/);
  if (compactHyphen && compactHyphen[1] && compactHyphen[2]) {
    return {
      left: compactHyphen[1].trim(),
      right: compactHyphen[2].trim(),
      separator: '-'
    };
  }
  return null;
}

function extractApplicationToSubjectIdentity({ subject, sender }) {
  const subjectText = stripTrailingBracketedSegments(subject);
  if (!subjectText) {
    return null;
  }
  const targetMatch =
    subjectText.match(/^thank you for your application to\s+(.+)$/i) ||
    subjectText.match(/\byour application to\s+(.+)$/i) ||
    subjectText.match(/\bapplication submitted to\s+(.+)$/i);
  if (!targetMatch || !targetMatch[1]) {
    return null;
  }

  const target = normalize(targetMatch[1]).replace(/[.!?]+$/g, '').trim();
  if (!target) {
    return null;
  }

  const split = splitApplicationToTarget(target);
  const companyName = normalizeCompany(split ? split.left : target);
  let jobTitle = split ? normalizeRole(split.right) : null;
  if (jobTitle && isGenericRole(jobTitle)) {
    jobTitle = null;
  }

  if (!companyName || isInvalidCompanyCandidate(companyName)) {
    return null;
  }

  const senderDomain = extractSenderDomain(sender);
  const senderName = extractSenderName(sender);
  const isPlatformSender = senderName ? isProviderName(senderName) : false;
  const domainResult = domainConfidence(companyName, senderDomain);
  const companyConfidence = split ? 0.93 : 0.9;
  const roleConfidence = jobTitle ? 0.92 : null;
  const matchConfidence = jobTitle
    ? Math.min(companyConfidence, roleConfidence || companyConfidence)
    : companyConfidence;

  return {
    providerHint: 'application_to_subject',
    companyName,
    jobTitle,
    senderDomain,
    companyConfidence,
    roleConfidence,
    domainConfidence: domainResult.score,
    matchConfidence,
    isAtsDomain: domainResult.isAtsDomain,
    isPlatformEmail: isPlatformSender || domainResult.isAtsDomain,
    bodyTextAvailable: false,
    explanation: split
      ? `Parsed application-to subject using ${split.separator} separator.`
      : 'Parsed application-to subject without explicit role separator.'
  };
}

function isIndeedApplyApplicationSubmittedEmail({ subject, sender, snippet, bodyText }) {
  const senderEmail = extractEmailAddress(sender) || String(sender || '');
  if (!/indeedapply@indeed\.com/i.test(senderEmail)) {
    return false;
  }
  const normalizedSubject = normalize(subject);
  const combinedText = `${normalize(snippet)}\n${normalize(bodyText)}`;
  return /indeed application:/i.test(normalizedSubject) || /application submitted/i.test(combinedText);
}

function isIndeedApplyIgnoredLine(value) {
  const text = normalize(value);
  if (!text) {
    return true;
  }
  return INDEED_APPLY_IGNORED_LINE_PATTERNS.some((pattern) => pattern.test(text));
}

function normalizeIndeedApplyRole(value) {
  const text = normalize(value);
  if (!text || isIndeedApplyIgnoredLine(text)) {
    return null;
  }
  if (/\bsent to\b/i.test(text)) {
    return null;
  }
  if ((text.match(/[.!?]/g) || []).length > 1) {
    return null;
  }
  if (text.split(/\s+/).length > 14 && /[.!?]/.test(text)) {
    return null;
  }
  let normalizedRole = text
    .replace(/^(?:role|position|title)\s*[:\-]\s*/i, '')
    .replace(/\s+[·•|]\s+.*$/g, '')
    .replace(/\s+\((?:remote|hybrid|on[- ]site)\)\s*$/i, '')
    .trim();
  normalizedRole = normalizedRole.replace(/[;|]+$/g, '').trim();
  normalizedRole = normalizedRole.replace(/[.!?]+$/g, '').trim();
  if (!normalizedRole || normalizedRole.length > 120 || isGenericRole(normalizedRole)) {
    return null;
  }
  if (/\b(?:indeed|application submitted|next steps?)\b/i.test(normalizedRole)) {
    return null;
  }
  return normalizedRole;
}

function normalizeIndeedApplyCompany(value) {
  const text = normalize(value);
  if (!text || isIndeedApplyIgnoredLine(text)) {
    return null;
  }
  let candidate = text
    .replace(/^(?:company|employer)\s*[:\-]\s*/i, '')
    .replace(/^(?:to|at)\s+/i, '')
    .replace(/\s+[·•|]\s+.*$/g, '')
    .replace(/[,:;]+$/g, '')
    .trim();
  if (!candidate) {
    return null;
  }
  const locationSplit = candidate.split(/\s+-\s+/);
  if (locationSplit.length > 1) {
    candidate = locationSplit[0].trim();
  }
  candidate = candidate.replace(/[.!?]+$/g, '').trim();
  if (!candidate) {
    return null;
  }
  if (INDEED_APPLY_COMPANY_DENYLIST.has(candidate.toLowerCase())) {
    return null;
  }
  if (isProviderName(candidate) || isInvalidCompanyCandidate(candidate)) {
    return null;
  }
  return candidate;
}

function extractIndeedApplyIdentity({ subject, snippet, bodyText, sender }) {
  if (!isIndeedApplyApplicationSubmittedEmail({ subject, sender, snippet, bodyText })) {
    return null;
  }

  const normalizedSubject = normalize(subject);
  const combinedText = `${String(bodyText || '')}\n${String(snippet || '')}`.replace(/\r\n/g, '\n');
  const lines = combinedText
    .split(/\r?\n/)
    .map((line) => normalize(line))
    .filter(Boolean);

  const subjectRoleMatch = normalizedSubject.match(/indeed application:\s*(.+)$/i);
  const subjectRole = subjectRoleMatch ? normalizeIndeedApplyRole(subjectRoleMatch[1]) : null;

  const applicationSubmittedIndex = lines.findIndex((line) => /application submitted/i.test(line));
  const scanStart = applicationSubmittedIndex >= 0 ? applicationSubmittedIndex + 1 : 0;
  const scanEnd = Math.min(lines.length, scanStart + 12);

  let bodyRole = null;
  let roleLineIndex = -1;
  for (let i = scanStart; i < scanEnd; i += 1) {
    const roleCandidate = normalizeIndeedApplyRole(lines[i]);
    if (!roleCandidate) {
      continue;
    }
    bodyRole = roleCandidate;
    roleLineIndex = i;
    break;
  }

  const jobTitle = subjectRole || bodyRole || null;
  const roleSource = subjectRole ? 'subject' : bodyRole ? 'body' : 'none';

  let companyName = null;
  let companySource = 'none';
  const companyScanStart = roleLineIndex >= 0 ? roleLineIndex + 1 : scanStart;
  const companyScanEnd = Math.min(lines.length, companyScanStart + 8);
  for (let i = companyScanStart; i < companyScanEnd; i += 1) {
    const companyCandidate = normalizeIndeedApplyCompany(lines[i]);
    if (!companyCandidate) {
      continue;
    }
    companyName = companyCandidate;
    companySource = 'body_adjacent';
    break;
  }

  if (!companyName) {
    const sentToMatch =
      combinedText.match(/the following items were sent to\s+(.+?)\.\s*good luck!?/i) ||
      combinedText.match(/\bsent to\s+(.+?)\.\s*good luck!?/i) ||
      combinedText.match(/\bsent to\s+(.+?)(?:[.!?]|$)/i);
    if (sentToMatch && sentToMatch[1]) {
      const sentenceCompany = normalizeIndeedApplyCompany(sentToMatch[1]);
      if (sentenceCompany) {
        companyName = sentenceCompany;
        companySource = 'sent_to_sentence';
      }
    }
  }

  if (!companyName && !jobTitle) {
    return null;
  }

  const senderDomain = extractSenderDomain(sender);
  const companyConfidence = companyName
    ? companySource === 'body_adjacent'
      ? 0.93
      : 0.9
    : 0;
  const roleConfidence = jobTitle ? (roleSource === 'subject' ? 0.95 : 0.9) : null;
  const domainResult = domainConfidence(companyName, senderDomain);
  const matchConfidence = companyName
    ? jobTitle
      ? Math.min(companyConfidence, roleConfidence || companyConfidence)
      : companyConfidence
    : 0;

  return {
    providerHint: 'indeed_apply',
    companyName: companyName || null,
    jobTitle,
    senderDomain,
    companyConfidence,
    roleConfidence,
    domainConfidence: domainResult.score,
    matchConfidence,
    isAtsDomain: domainResult.isAtsDomain,
    isPlatformEmail: true,
    bodyTextAvailable: Boolean(String(bodyText || '').trim()),
    explanation: `Indeed Apply parser (${roleSource} role, ${companySource} company).`
  };
}

function extractLinkedInApplicationIdentity({ subject, snippet, bodyText, sender }) {
  const senderDomain = extractSenderDomain(sender);
  const isLinkedInJobsSender = /jobs-noreply@linkedin\.com/i.test(String(sender || ''));
  if (!isLinkedInJobsSender) {
    return null;
  }

  const normalizeLinkedInCompany = (value) => {
    if (!value) {
      return null;
    }
    let candidate = cleanEntity(value)
      .replace(/\s+[·•|]\s+.*$/g, '')
      .replace(/\s+\((?:remote|hybrid|on[- ]site|[A-Za-z.\s]{2,30})\)\s*$/i, '')
      .replace(/\s+(?:remote|hybrid|on[- ]site)\b.*$/i, '')
      .replace(/^\s*(?:your update from)\s+/i, '')
      .replace(/[,:;|]+$/g, '')
      .trim();
    if (!candidate || candidate.length > 80 || isProviderName(candidate) || isInvalidCompanyCandidate(candidate)) {
      return null;
    }
    return candidate;
  };

  const normalizeLinkedInRole = (value, normalizedCompany) => {
    if (!value) {
      return null;
    }
    let candidate = cleanRoleEntity(value)
      .replace(/^\s*(?:your application was sent to|your update from)\s+/i, '')
      .replace(/\s+\((?:remote|hybrid|on[- ]site)\)\s*$/i, '')
      .replace(/\s+(?:remote|hybrid|on[- ]site)\b.*$/i, '')
      .replace(/\s+[·•|]\s+.*$/g, '')
      .replace(/\s+applied on\s+.+$/i, '')
      .replace(/[,:;|]+$/g, '')
      .trim();
    if (normalizedCompany) {
      const escapedCompany = escapeRegExp(normalizedCompany);
      candidate = candidate
        .replace(new RegExp(`^${escapedCompany}\\s+`, 'i'), '')
        .replace(new RegExp(`\\s+${escapedCompany}$`, 'i'), '')
        .trim();
    }
    candidate = trimTrailingLocation(sanitizeJobTitle(candidate));
    if (!candidate || candidate.length < 3 || candidate.length > 120) {
      return null;
    }
    if (/your application was sent to/i.test(candidate) || /your update from/i.test(candidate)) {
      return null;
    }
    if (isGenericRole(candidate)) {
      return null;
    }
    if (normalizedCompany) {
      const normalizedRoleIdentity = normalizeJobIdentity(candidate);
      const normalizedCompanyIdentity = normalizeJobIdentity(normalizedCompany);
      if (
        normalizedRoleIdentity &&
        normalizedCompanyIdentity &&
        normalizedRoleIdentity === normalizedCompanyIdentity
      ) {
        return null;
      }
    }
    return candidate;
  };

  const normalizedSubject = String(subject || '').trim();
  const text = [String(snippet || ''), String(bodyText || '')].filter(Boolean).join('\n');
  const body = text.replace(/\r\n/g, '\n');
  const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);

  let companyName = null;
  let jobTitle = null;
  let matchedRejectionTemplate = false;
  let matchedConfirmationTemplate = false;
  const rejectionSubjectTail = normalizedSubject.match(/^your application to\s+(.+)$/i);
  const confirmationSubjectMatch = normalizedSubject.match(
    /^(?:.+,\s*)?your application was sent to\s+(.+?)(?:\.|$)/i
  );
  if (rejectionSubjectTail && rejectionSubjectTail[1]) {
    const tail = rejectionSubjectTail[1].trim();
    const splitIdx = tail.toLowerCase().lastIndexOf(' at ');
    if (splitIdx > 0) {
      matchedRejectionTemplate = true;
      jobTitle = tail.slice(0, splitIdx).trim();
      companyName = tail.slice(splitIdx + 4).trim();
    }
  }

  if (!companyName && confirmationSubjectMatch && confirmationSubjectMatch[1]) {
    matchedConfirmationTemplate = true;
    companyName = confirmationSubjectMatch[1].trim();
  }

  const rejectionCompanyMatch =
    body.match(/your update from\s+([^\n]+?)(?:[.!?\n]|$)/i) ||
    normalizedSubject.match(/\byour update from\s+(.+?)(?:[.!?]|$)/i);
  if (rejectionCompanyMatch && rejectionCompanyMatch[1]) {
    companyName = rejectionCompanyMatch[1].trim();
  }

  const subjectCompanyMatch = normalizedSubject.match(/application was sent to\s+(.+?)\.?$/i);
  if (!companyName && subjectCompanyMatch && subjectCompanyMatch[1]) {
    matchedConfirmationTemplate = true;
    companyName = subjectCompanyMatch[1].trim();
  }

  if (!companyName) {
    const lineWithCompany = lines.find((line) => /application was sent to/i.test(line));
    if (lineWithCompany) {
      const m = lineWithCompany.match(/application was sent to\s+(.+?)\.?$/i);
      if (m) {
        companyName = m[1].trim();
      }
    }
  }

  let companyLineIndex = -1;
  lines.forEach((line, idx) => {
    if (companyLineIndex === -1 && /application was sent to/i.test(line)) {
      companyLineIndex = idx;
    }
  });

  for (let i = 0; i < lines.length; i++) {
    if (jobTitle) break;
    const line = lines[i];
    if (line.includes('·')) {
      const parts = line.split('·').map((p) => p.trim()).filter(Boolean);
      if (parts.length) {
        const roleCandidate = parts[0];
        const companyCandidate = parts[1];
        if (!jobTitle && roleCandidate) {
          const normalizedRole = normalizeLinkedInRole(roleCandidate, companyName);
          if (normalizedRole) {
            jobTitle = normalizedRole;
          }
        }
        if (!companyName && companyCandidate) {
          companyName = companyCandidate;
        }
      }
    }
  }

  if (!jobTitle && companyLineIndex >= 0) {
    for (let j = companyLineIndex + 1; j < lines.length; j++) {
      const candidate = lines[j];
      if (!candidate) continue;
      if (/^applied on\b/i.test(candidate)) {
        break;
      }
      const roleCandidate = candidate.split('·')[0]?.trim();
      if (roleCandidate) {
        const normalizedRole = normalizeLinkedInRole(roleCandidate, companyName);
        if (normalizedRole) {
          jobTitle = normalizedRole;
          break;
        }
      }
    }
  }

  if (!companyName) {
    return null;
  }

  const normalizedCompany = normalizeLinkedInCompany(companyName);
  if (!normalizedCompany) {
    return null;
  }

  const sanitizedCompany = sanitizeCompanyCandidate({
    companyName: normalizedCompany,
    companyConfidence: 0.9,
    explanation: 'LinkedIn application sent template'
  });
  if (!sanitizedCompany) {
    return null;
  }
  companyName = sanitizedCompany.companyName;
  const companyConfidence = sanitizedCompany.companyConfidence || 0.9;

  // For LinkedIn "application sent" emails, parse role from body context, not subject.
  if (!matchedRejectionTemplate) {
    const companySlug = slugify(companyName);
    const indexedCompanyLine = lines.findIndex((line) => {
      const left = line.split(/[·•|]/)[0]?.trim();
      return slugify(left || line) === companySlug;
    });
    if (!jobTitle && indexedCompanyLine >= 0) {
      for (let i = indexedCompanyLine + 1; i < lines.length; i += 1) {
        const line = lines[i];
        if (!line || /^applied on\b/i.test(line)) {
          break;
        }
        const left = line.split(/[·•|]/)[0]?.trim();
        const normalizedRole = normalizeLinkedInRole(left || line, companyName);
        if (normalizedRole) {
          jobTitle = normalizedRole;
          break;
        }
      }
    }

    if (!jobTitle) {
      const compactBody = `${String(bodyText || '')}\n${String(snippet || '')}`
        .replace(/\r\n/g, '\n')
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (compactBody) {
        const escapedCompany = escapeRegExp(companyName);
        const betweenMatch = compactBody.match(
          new RegExp(`${escapedCompany}\\s+(.{3,120}?)\\s+${escapedCompany}\\s*[·•|]`, 'i')
        );
        if (betweenMatch && betweenMatch[1]) {
          const candidate = normalizeLinkedInRole(betweenMatch[1], companyName);
          if (candidate) {
            jobTitle = candidate;
          }
        }
      }
    }
  }

  const jobTitleRaw = jobTitle ? jobTitle.trim() : null;
  if (jobTitle) {
    jobTitle = normalizeLinkedInRole(jobTitle, companyName);
  }

  const roleConfidence = jobTitle ? (matchedRejectionTemplate ? 0.88 : 0.9) : null;
  const domainResult = domainConfidence(companyName, senderDomain);
  const matchConfidence = jobTitle
    ? Math.min(companyConfidence, roleConfidence || companyConfidence, domainResult.score || companyConfidence)
    : Math.min(companyConfidence, domainResult.score || companyConfidence);

  return {
    companyName,
    jobTitle,
    senderDomain,
    companyConfidence,
    roleConfidence,
    jobTitleRaw,
    domainConfidence: domainResult.score,
    matchConfidence,
    isAtsDomain: domainResult.isAtsDomain,
    isPlatformEmail: true,
    bodyTextAvailable: Boolean(body && body.trim()),
    explanation: matchedRejectionTemplate
      ? 'LinkedIn rejection update template'
      : matchedConfirmationTemplate
      ? 'LinkedIn application sent template'
      : 'LinkedIn jobs update template'
  };
}

function extractThreadIdentity({ subject, sender, snippet, bodyText }) {
  const subjectText = normalize(subject);
  const snippetText = normalize(snippet);
  const bodyTextRaw = String(bodyText || '');
  const indeedApplyIdentity = extractIndeedApplyIdentity({
    subject: subjectText,
    snippet: snippetText,
    bodyText: bodyTextRaw,
    sender
  });
  if (indeedApplyIdentity) {
    return indeedApplyIdentity;
  }
  const linkedInIdentity = extractLinkedInApplicationIdentity({
    subject: subjectText,
    snippet: snippetText,
    bodyText: bodyTextRaw,
    sender
  });
  if (linkedInIdentity) {
    return linkedInIdentity;
  }
  const digestIdentity = extractWorkdayDigestIdentity({ subject: subjectText, bodyText: bodyTextRaw, sender });
  if (digestIdentity) {
    return digestIdentity;
  }
  const oracleCloudIdentity = extractOracleCloudIdentity({
    subject: subjectText,
    snippet: snippetText,
    bodyText: bodyTextRaw,
    sender
  });
  if (oracleCloudIdentity) {
    return oracleCloudIdentity;
  }
  const applicationToSubjectIdentity = extractApplicationToSubjectIdentity({
    subject: subjectText,
    sender
  });
  if (applicationToSubjectIdentity) {
    return applicationToSubjectIdentity;
  }
  const senderName = extractSenderName(sender);
  const roleMatch =
    extractCompanyRole(subjectText) ||
    extractCompanyRole(snippetText) ||
    extractCompanyRole(bodyTextRaw) || {
      companyName: null,
      jobTitle: null,
      companyConfidence: 0,
      roleConfidence: 0,
      explanation: 'No strict role/company pattern matched.'
    };
  const subjectCompany =
    sanitizeCompanyCandidate(extractCompanyFromSubject(subjectText)) ||
    sanitizeCompanyCandidate(extractCompanyFromSubject(snippetText));
  const senderCompany = sanitizeCompanyCandidate(extractCompanyFromSender(sender));
  const senderDomain = extractSenderDomain(sender);
  const providerSender = senderName ? isProviderName(senderName) : false;
  const atsSender = isAtsDomain(senderDomain);
  const signatureCompany = sanitizeCompanyCandidate(extractCompanyFromSignatureLines(bodyTextRaw));
  const bodySignatureCompany =
    bodyTextRaw && (atsSender || providerSender)
      ? sanitizeCompanyCandidate(extractCompanyFromBodyText(bodyTextRaw))
      : null;
  const bodyPatternCompany =
    bodyTextRaw && (atsSender || providerSender)
      ? sanitizeCompanyCandidate(extractCompanyFromBodyPatterns(bodyTextRaw))
      : null;
  const localPartCompany =
    atsSender || providerSender
      ? sanitizeCompanyCandidate(extractCompanyFromSenderLocalPart(sender, bodyTextRaw))
      : null;
  const bodyCompany = bodySignatureCompany || bodyPatternCompany;
  const domainCompany = companyFromDomain(senderDomain)
    ? sanitizeCompanyCandidate({
        companyName: companyFromDomain(senderDomain),
        companyConfidence: 0.85,
        explanation: 'Derived company from sender domain.'
      })
    : null;
  const companyMatch = pickBestCompany([
    signatureCompany,
    subjectCompany,
    senderCompany,
    bodyCompany,
    localPartCompany,
    domainCompany,
    roleMatch.companyName &&
    !isInvalidCompanyCandidate(roleMatch.companyName) &&
    !/\b(program|engineer|developer|track|analyst|software|technology)\b/i.test(roleMatch.companyName) &&
    !/\d{4}/.test(roleMatch.companyName)
      ? {
          companyName: roleMatch.companyName,
          companyConfidence: roleMatch.companyConfidence,
          explanation: roleMatch.explanation
        }
      : null
  ]);

  const companyName = companyMatch?.companyName || null;
  let jobTitle = roleMatch.jobTitle || null;
  const jobTitleDisplay = roleMatch.jobTitleRaw
    ? normalizeDisplayTitle(roleMatch.jobTitleRaw)
    : jobTitle
    ? normalizeDisplayTitle(jobTitle)
    : null;
  const companyConfidence = companyMatch?.companyConfidence || 0;
  let roleConfidence = jobTitle ? roleMatch.roleConfidence : null;
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

  if (!jobTitle && companyName) {
    const roleOnly = extractJobTitle({
      subject: subjectText,
      snippet: snippetText,
      bodyText: bodyTextRaw,
      senderName,
      sender,
      companyName
    });
    if (roleOnly?.jobTitle) {
      jobTitle = roleOnly.jobTitle;
      roleConfidence = roleOnly.confidence || roleOnly.roleConfidence || null;
      if (roleOnly.explanation) {
        explanationParts.push(roleOnly.explanation);
      }
    }
  }

  return {
    companyName,
    jobTitle,
    jobTitleRaw: jobTitleDisplay,
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

function extractWorkdayDigestIdentity({ subject, bodyText, sender }) {
  const lowerSubject = String(subject || '').toLowerCase();
  if (!lowerSubject.includes('daily digest')) {
    return null;
  }
  const text = String(bodyText || '').replace(/\u2013/g, '-');
  if (!/Business Process:\s*Job Application/i.test(text) && !/Subject:\s*.*-\s*[A-Z0-9-]{3,}/i.test(text)) {
    return null;
  }
  let companyCandidate = null;
  const talentLine = text.match(/([A-Z][A-Za-z&.'\- ]{2,80})\s+Talent Acquisition/i);
  if (talentLine && talentLine[1]) {
    companyCandidate = cleanCompanyCandidate(talentLine[1]);
  }
  if (!companyCandidate) {
    const atLine = text.match(/\bAt\s+([A-Z][A-Za-z&.'\- ]{2,80})\b/);
    if (atLine && atLine[1]) {
      companyCandidate = cleanCompanyCandidate(atLine[1]);
    }
  }
  if (!companyCandidate) {
    const domainGuess = companyFromDomain(extractSenderDomain(sender));
    if (domainGuess) {
      companyCandidate = domainGuess;
    }
  }
  if (companyCandidate && /daily digest/i.test(companyCandidate)) {
    companyCandidate = null;
  }

  const interestRole = text.match(/interest in the\s+([A-Z0-9][A-Za-z0-9/&.'\- )(]+?)\s+position/i);
  let role =
    (interestRole && interestRole[1] && normalize(interestRole[1])) || extractWorkdayStructuredRole(text);
  if (!role) {
    // Try parsing the subject line for req/role combos
    const subjRole = String(subject || '')
      .replace(/\u2013/g, '-')
      .match(/-\s*[A-Z0-9-]{3,}\s+([A-Za-z0-9/&.'\- )(]+)$/);
    if (subjRole && subjRole[1]) {
      role = normalize(subjRole[1]);
    }
  }
  if (role) {
    role = trimTrailingLocation(role);
    role = sanitizeJobTitle(role);
  }

  let externalReqId = null;
  const reqMatch =
    text.match(/(R-\d{4,})/i) ||
    String(subject || '').match(/(R-\d{4,})/i);
  if (reqMatch && reqMatch[1]) {
    externalReqId = normalizeExternalReqId(reqMatch[1]);
  }

  if (!companyCandidate && !role) {
    return null;
  }

  return {
    companyName: companyCandidate || '',
    jobTitle: role || '',
    senderDomain: extractSenderDomain(sender),
    companyConfidence: companyCandidate ? 0.9 : 0,
    roleConfidence: role ? 0.9 : null,
    domainConfidence: 0.5,
    matchConfidence: companyCandidate && role ? 0.88 : 0.75,
    externalReqId,
    isAtsDomain: true,
    isPlatformEmail: true,
    bodyTextAvailable: Boolean(text && text.trim()),
    explanation: 'Parsed Workday digest wrapper.'
  };
}

module.exports = {
  extractThreadIdentity,
  extractJobTitle,
  extractExternalReqId,
  buildMatchKey,
  normalizeJobIdentity,
  isProviderName,
  isInvalidCompanyCandidate,
  extractCompanyFromBodyText,
  normalizeExternalReqId,
  sanitizeJobTitle,
  normalizeRole,
  normalizeCompany,
  normalizeRoleTokens,
  roleStrength,
  extractRoleTail,
  extractProgramTail,
  isProgramRole,
  tailSimilarity,
  STRONG_REJECTION_PATTERNS
};
