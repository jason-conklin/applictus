const { normalizeCompany, normalizeRole } = require('../validateJobFields');
const { lines, cleanLine, detectStatusSignal } = require('./common');

const IGNORED_LINE_PATTERNS = [
  /^privacy policy/i,
  /^terms of service/i,
  /^help center/i,
  /^unsubscribe/i,
  /^view in browser/i
];

function isIgnoredLine(line) {
  return IGNORED_LINE_PATTERNS.some((pattern) => pattern.test(cleanLine(line)));
}

function senderDisplayName({ fromName, sender, fromEmail } = {}) {
  const explicit = cleanLine(fromName);
  if (explicit) {
    return explicit;
  }
  const rawSender = cleanLine(sender);
  if (rawSender && rawSender.includes('<')) {
    return rawSender.replace(/<[^<>]+>/g, '').replace(/^["']+|["']+$/g, '').trim();
  }
  const rawEmail = cleanLine(fromEmail);
  if (rawEmail && rawEmail.includes('<')) {
    return rawEmail.replace(/<[^<>]+>/g, '').replace(/^["']+|["']+$/g, '').trim();
  }
  return '';
}

function isGenericLeverDisplayName(value) {
  const text = cleanLine(value).toLowerCase();
  if (!text) {
    return true;
  }
  return /^(?:lever|no[- ]?reply|noreply|do not reply|hiring team|recruiting team|talent team|careers|jobs|notifications?)$/.test(
    text
  );
}

function parse({ subject, text, fromName, sender, fromEmail }) {
  const notes = [];
  const candidates = { company: [], role: [] };
  const ignoredSections = [];
  const rejectedCandidates = [];
  const subjectText = String(subject || '').trim();
  const body = String(text || '');
  const bodyLines = lines(body);

  let companyRaw = null;
  let companySource = null;
  let roleRaw = null;
  let roleSource = null;

  const displayCompany = senderDisplayName({ fromName, sender, fromEmail });
  if (displayCompany && !isGenericLeverDisplayName(displayCompany)) {
    companyRaw = displayCompany;
    companySource = 'sender_display';
    candidates.company.push(companyRaw);
  }

  const nextStepsRoleSubjectMatch = subjectText.match(/\bnext steps? for your\s+(.+?)\s+application\b/i);
  if (nextStepsRoleSubjectMatch && nextStepsRoleSubjectMatch[1]) {
    roleRaw = nextStepsRoleSubjectMatch[1].trim();
    roleSource = 'subject_next_steps_application';
    candidates.role.push(roleRaw);
  }

  const subjectCompanyMatch = subjectText.match(/thanks for applying to\s+(.+)$/i);
  if (!companyRaw && subjectCompanyMatch && subjectCompanyMatch[1]) {
    companyRaw = subjectCompanyMatch[1].trim();
    companySource = 'subject';
    candidates.company.push(companyRaw);
  }

  const bodyCompanyMatch = body.match(/thanks for applying to\s+(.+?)(?:[\n.]|$)/i);
  if (!companyRaw && bodyCompanyMatch && bodyCompanyMatch[1]) {
    companyRaw = bodyCompanyMatch[1].trim();
    companySource = 'body_phrase';
    candidates.company.push(companyRaw);
  }

  const roleAtMatch = body.match(/application (?:for|to)\s+(.+?)\s+at\s+([A-Z][A-Za-z0-9&.' -]{1,80})/i);
  if (!roleRaw && roleAtMatch && roleAtMatch[1]) {
    roleRaw = roleAtMatch[1].trim();
    roleSource = 'application_at_sentence';
    candidates.role.push(roleRaw);
  }
  if (!companyRaw && roleAtMatch && roleAtMatch[2]) {
    companyRaw = roleAtMatch[2].trim();
    companySource = 'application_at_sentence';
    candidates.company.push(companyRaw);
  }

  if (!roleRaw) {
    const roleMatch = body.match(/application (?:for|to)\s+(.+?)(?:\s+has been|\s+was|\.)/i);
    if (roleMatch && roleMatch[1]) {
      roleRaw = roleMatch[1].trim();
      roleSource = 'application_sentence';
      candidates.role.push(roleRaw);
    }
  }

  if (!roleRaw) {
    const titleMatch = body.match(/(?:role|position|job title)\s*[:\-]\s*(.+?)(?:[\n.]|$)/i);
    if (titleMatch && titleMatch[1]) {
      roleRaw = titleMatch[1].trim();
      roleSource = 'label_line';
      candidates.role.push(roleRaw);
      notes.push('role_fallback:label_line');
    }
  }

  if (!roleRaw) {
    const topRoleLine = bodyLines.find((line) => {
      if (isIgnoredLine(line)) {
        ignoredSections.push(line);
        return false;
      }
      if (/^(thanks|thank you|we received your application|application confirmation)/i.test(line)) {
        return false;
      }
      return /\b(developer|engineer|analyst|manager|designer|specialist|intern|coordinator)\b/i.test(line);
    });
    if (topRoleLine) {
      roleRaw = topRoleLine;
      roleSource = 'top_title_line';
      candidates.role.push(roleRaw);
    }
  }

  for (const line of bodyLines) {
    if (isIgnoredLine(line)) {
      ignoredSections.push(line);
      continue;
    }
    if (/^https?:\/\//i.test(line)) {
      rejectedCandidates.push({ field: 'any', value: line, reason: 'url_line' });
    }
  }

  const statusSignal = detectStatusSignal({
    subject: subjectText,
    text: body,
    company: companyRaw,
    role: roleRaw,
    defaultStatus: 'applied'
  });

  const company = normalizeCompany(companyRaw, { notes });
  const role = normalizeRole(roleRaw, { notes });
  const status = statusSignal.status || 'applied';

  return {
    company,
    role,
    status,
    confidence: {
      company: company ? (companySource === 'subject' || companySource === 'sender_display' ? 92 : 84) : 0,
      role: role ? (roleSource === 'application_at_sentence' || roleSource === 'subject_next_steps_application' ? 92 : 80) : 0,
      status: Number(statusSignal.confidence || 0),
      key: company && role ? 90 : 0
    },
    candidates,
    notes,
    debug: {
      provider: 'lever',
      parser_strategy: 'application_sentence_plus_company_phrase',
      company_source: companySource || null,
      role_source: roleSource || null,
      status_source: statusSignal.source || null,
      ignored_sections: ignoredSections,
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
