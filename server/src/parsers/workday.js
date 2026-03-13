const { normalizeCompany, normalizeRole } = require('../validateJobFields');
const { detectStatusSignal } = require('./common');

const METADATA_LINE_PREFIX =
  /^(business process:|subject:|job application:|candidate:|requisition:)/i;

const STRONG_REJECTION_PHRASES = [
  { pattern: /we regret to inform you/i, label: 'we regret to inform you' },
  { pattern: /will not be taking your application further/i, label: 'will not be taking your application further' },
  { pattern: /will not be moving forward/i, label: 'will not be moving forward' },
  { pattern: /not moving forward with your application/i, label: 'not moving forward with your application' },
  { pattern: /we will not be progressing/i, label: 'we will not be progressing' },
  { pattern: /\bunfortunately\b/i, label: 'unfortunately' },
  { pattern: /\bnot selected\b/i, label: 'not selected' }
];

function normalizeLines(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function cleanToken(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMetadataLine(line) {
  return METADATA_LINE_PREFIX.test(String(line || '').trim());
}

function extractCompanyFromFollowUpLine(line) {
  const text = cleanToken(line);
  if (!text || !/follow up$/i.test(text)) {
    return null;
  }
  return cleanToken(text.replace(/\s+follow up$/i, '').replace(/\s*&\s*co\.?$/i, ''));
}

function cleanWorkdayRoleCandidate(value) {
  let role = cleanToken(value);
  if (!role) {
    return null;
  }
  role = role
    .replace(/^job application:\s*/i, '')
    .replace(/^(?:[a-z][\w-]*-\d[\w-]*|\d{5,})\s+/i, '')
    .replace(/\s+on\s+\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b.*$/i, '')
    .replace(/\s*[|:;-]+\s*$/g, '')
    .trim();
  return role || null;
}

function extractRoleFromBusinessProcessLine(line) {
  let text = cleanToken(line).replace(/^business process:\s*/i, '');
  if (!text) {
    return null;
  }
  text = text.replace(/^job application:\s*/i, '');
  const dashIndex = text.indexOf(' - ');
  if (dashIndex >= 0) {
    text = text.slice(dashIndex + 3);
  }
  return cleanWorkdayRoleCandidate(text);
}

function extractRoleFromSubjectMetadataLine(line) {
  let text = cleanToken(line).replace(/^subject:\s*/i, '');
  if (!text) {
    return null;
  }
  const dashIndex = text.indexOf(' - ');
  if (dashIndex >= 0) {
    text = text.slice(dashIndex + 3);
  }
  return cleanWorkdayRoleCandidate(text);
}

function extractRoleFromDirectSubject(subject) {
  const text = String(subject || '').trim();
  if (!text) {
    return null;
  }
  const appSubject = text.match(/your application:\s*(.+)$/i);
  if (appSubject && appSubject[1]) {
    return cleanWorkdayRoleCandidate(appSubject[1]);
  }
  const recentApp = text.match(/your recent job application for\s+(.+?)(?:[|.]|$)/i);
  if (recentApp && recentApp[1]) {
    return cleanWorkdayRoleCandidate(recentApp[1]);
  }
  return null;
}

function parse({ subject, text, fromEmail, fromDomain }) {
  const notes = [];
  const candidates = { company: [], role: [] };
  const rejectedCandidates = [];
  const body = String(text || '');
  const subj = String(subject || '');
  const lines = normalizeLines(body);
  const contentLines = lines.filter((line) => !isMetadataLine(line));
  const ignoredMetadataLines = lines.filter((line) => isMetadataLine(line));

  let roleRaw = null;
  let roleSource = null;
  let companyRaw = null;
  let companySource = null;

  const rejectionMatch = STRONG_REJECTION_PHRASES.find(({ pattern }) =>
    pattern.test(`${subj}\n${body}`)
  );

  const roleSentenceMatch = body.match(
    /thank you for applying for the role of\s+(.+?)(?:[\n.]|$)/i
  );
  if (roleSentenceMatch && roleSentenceMatch[1]) {
    roleRaw = cleanWorkdayRoleCandidate(roleSentenceMatch[1]);
    roleSource = 'role_sentence';
    candidates.role.push(roleSentenceMatch[1].trim());
  }

  if (!roleRaw) {
    const businessProcessLine = lines.find((line) => /^business process:/i.test(line));
    if (businessProcessLine) {
      roleRaw = extractRoleFromBusinessProcessLine(businessProcessLine);
      if (roleRaw) {
        roleSource = 'business_process';
        candidates.role.push(roleRaw);
      }
    }
  }

  if (!roleRaw) {
    const subjectMetadataLine = lines.find((line) => /^subject:/i.test(line));
    if (subjectMetadataLine) {
      roleRaw = extractRoleFromSubjectMetadataLine(subjectMetadataLine);
      if (roleRaw) {
        roleSource = 'subject';
        candidates.role.push(roleRaw);
      }
    }
  }

  if (!roleRaw) {
    const directSubjectRole = extractRoleFromDirectSubject(subj);
    if (directSubjectRole) {
      roleRaw = directSubjectRole;
      roleSource = 'subject';
      candidates.role.push(directSubjectRole);
    }
  }

  if (!roleRaw) {
    const interestPositionMatch = body.match(
      /thank you for your interest in(?: the)?\s+(.+?)\s+position\b/i
    );
    if (interestPositionMatch && interestPositionMatch[1]) {
      roleRaw = cleanWorkdayRoleCandidate(interestPositionMatch[1]);
      if (roleRaw) {
        roleSource = 'interest_phrase';
        candidates.role.push(roleRaw);
      }
    }
  }

  const headerCandidates = [subj, contentLines[0], contentLines[1]].filter(Boolean);
  for (const entry of headerCandidates) {
    const maybeCompany = extractCompanyFromFollowUpLine(entry);
    if (maybeCompany) {
      companyRaw = maybeCompany;
      companySource = 'header';
      candidates.company.push(maybeCompany);
      break;
    }
  }

  if (!companyRaw) {
    const interestMatch = body.match(/thank you for expressing your interest in\s+(.+?)(?:[\n.!?]|$)/i);
    if (interestMatch && interestMatch[1]) {
      companyRaw = cleanToken(interestMatch[1]);
      companySource = 'body_phrase';
      candidates.company.push(companyRaw);
    }
  }

  if (!companyRaw) {
    const deptLine = body.match(
      /\b([A-Z][A-Za-z0-9&.' -]{1,80})\s+(?:recruiting team|recruiting department|talent acquisition(?: team)?|careers)\b/i
    );
    if (deptLine && deptLine[1]) {
      companyRaw = cleanToken(deptLine[1]);
      companySource = 'body_phrase';
      candidates.company.push(companyRaw);
    }
  }

  if (!companyRaw && fromDomain && /myworkday\.com$/i.test(fromDomain)) {
    const domainParts = String(fromDomain).split('.').filter(Boolean);
    const maybe = domainParts.length > 3 ? domainParts[domainParts.length - 3] : null;
    if (maybe && maybe !== 'myworkday') {
      companyRaw = cleanToken(maybe);
      companySource = 'domain';
      candidates.company.push(companyRaw);
      notes.push('company_fallback:workday_domain');
    }
  }

  if (!companyRaw && fromEmail && /oraclecloud\./i.test(fromEmail)) {
    const oracleDomain = String(fromEmail).split('@')[1] || '';
    const parts = oracleDomain.split('.');
    const idx = parts.findIndex((part) => part.toLowerCase() === 'oraclecloud');
    if (idx >= 0 && parts[idx + 1]) {
      companyRaw = cleanToken(parts[idx + 1]);
      companySource = 'domain';
      candidates.company.push(companyRaw);
      notes.push('company_fallback:oraclecloud_sender_domain');
    }
  }

  const statusSignal = detectStatusSignal({
    subject: subj,
    text: body,
    company: companyRaw,
    role: roleRaw,
    defaultStatus: 'applied'
  });

  const company = normalizeCompany(companyRaw, { notes });
  const role = normalizeRole(roleRaw, { notes });
  if (roleRaw && !role) {
    rejectedCandidates.push({ field: 'role', value: roleRaw, reason: 'normalize_failed' });
  }
  if (companyRaw && !company) {
    rejectedCandidates.push({ field: 'company', value: companyRaw, reason: 'normalize_failed' });
  }
  let status = statusSignal.status || 'applied';
  let statusSource = statusSignal.source || 'default';
  let statusConfidence = Number(statusSignal.confidence || 0);
  if (rejectionMatch) {
    status = 'rejected';
    statusSource = `rejection_phrase:${rejectionMatch.label}`;
    statusConfidence = Math.max(statusConfidence, 96);
  }

  const companyConfidenceBySource = {
    header: 92,
    body_phrase: 90,
    domain: 70
  };
  const roleConfidenceBySource = {
    business_process: 93,
    role_sentence: 92,
    subject: 88,
    interest_phrase: 84
  };

  return {
    company,
    role,
    status,
    confidence: {
      company: company ? Number(companyConfidenceBySource[companySource] || 85) : 0,
      role: role ? Number(roleConfidenceBySource[roleSource] || 78) : 0,
      status: statusConfidence || 85,
      key: company && role ? 90 : 0
    },
    candidates,
    notes,
    debug: {
      provider: 'workday',
      parser_strategy: 'body_phrase_plus_metadata_fallbacks',
      rejection_phrase_detected: rejectionMatch?.label || null,
      company_source: companySource || null,
      role_source: roleSource || null,
      status_source: statusSource,
      ignored_metadata_lines: ignoredMetadataLines,
      ignored_sections: ignoredMetadataLines,
      rejected_candidates: rejectedCandidates,
      chosen_fields: {
        company: company || null,
        role: role || null,
        status
      }
    }
  };
}

module.exports = {
  parse
};
