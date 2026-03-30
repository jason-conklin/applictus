const { detectProvider } = require('./providers');
const { validateJobFields } = require('./validateJobFields');
const { buildApplicationKey } = require('./applicationKey');
const { extractExternalReqId } = require('../../shared/matching');
const { buildHintFingerprintFromEmail, findBestHint } = require('./hints');
const { detectStatusSignal } = require('./parsers/common');

const linkedinParser = require('./parsers/linkedin_jobs');
const workableParser = require('./parsers/workable_candidates');
const indeedParser = require('./parsers/indeed_apply');
const workdayParser = require('./parsers/workday');
const greenhouseParser = require('./parsers/greenhouse');
const leverParser = require('./parsers/lever');
const icimsParser = require('./parsers/icims');
const smartRecruitersParser = require('./parsers/smartrecruiters');
const taleoParser = require('./parsers/taleo');

const PARSER_MAP = {
  linkedin_jobs: linkedinParser,
  workable_candidates: workableParser,
  indeed_apply: indeedParser,
  workday: workdayParser,
  greenhouse: greenhouseParser,
  lever: leverParser,
  icims: icimsParser,
  smartrecruiters: smartRecruitersParser,
  taleo: taleoParser
};

function toProviderInput(payload = {}) {
  const fromEmail = String(payload.fromEmail || payload.sender || '').toLowerCase();
  const fromDomain = payload.fromDomain
    ? String(payload.fromDomain).toLowerCase()
    : fromEmail.includes('@')
      ? fromEmail.split('@')[1]
      : '';
  return {
    fromEmail,
    fromDomain,
    subject: String(payload.subject || ''),
    text: String(payload.text || payload.bodyText || ''),
    html: String(payload.html || ''),
    headers: Array.isArray(payload.headers) ? payload.headers : []
  };
}

function parseGeneric({ subject, text }) {
  const notes = [];
  const candidates = { company: [], role: [] };
  let companyRaw;
  let roleRaw;

  const subj = String(subject || '');
  const body = String(text || '');

  const thankYouToMatch = subj.match(/thank you for your application to\s+(.+)$/i);
  if (thankYouToMatch && thankYouToMatch[1]) {
    const cleaned = thankYouToMatch[1]
      .replace(/\s*\(.*?\)\s*$/g, '')
      .replace(/\s*\[.*?\]\s*$/g, '')
      .trim();
    const split = cleaned.match(/^(.+?)\s*[-–—|:]\s*(.+)$/);
    if (split) {
      companyRaw = split[1].trim();
      roleRaw = split[2].trim();
      candidates.company.push(companyRaw);
      candidates.role.push(roleRaw);
    } else {
      companyRaw = cleaned;
      candidates.company.push(companyRaw);
    }
  }

  if (!roleRaw) {
    const roleOfMatch = body.match(/(?:thank you for applying for the role of|role of)\s+(.+?)(?:[\n.]|$)/i);
    if (roleOfMatch && roleOfMatch[1]) {
      roleRaw = roleOfMatch[1].trim();
      candidates.role.push(roleRaw);
    }
  }

  if (!companyRaw) {
    const applyingTo = body.match(/(?:position\s+to|joining)\s+([A-Z][A-Za-z0-9&.' -]{1,80})(?:[\n.]|$)/i);
    if (applyingTo && applyingTo[1]) {
      companyRaw = applyingTo[1].trim();
      candidates.company.push(companyRaw);
    }
  }

  // Phrase-based company extraction for rejection-style emails
  if (!companyRaw) {
    const interestMatch = body.match(/interest in (?:employment with|employment at|joining|with)\s+([A-Z][A-Za-z0-9&.' -]{1,80})(?=[.,\n]|$)/i);
    if (interestMatch && interestMatch[1]) {
      companyRaw = interestMatch[1].trim();
      candidates.company.push(companyRaw);
      notes.push('company_phrase:interest_in_employment');
    }
  }

  if (companyRaw) {
    companyRaw = companyRaw.replace(/^employment with\s+/i, '').replace(/^with\s+/i, '').trim();
  }

  const statusSignal = detectStatusSignal({
    subject: subj,
    text: body,
    company: companyRaw,
    role: roleRaw,
    defaultStatus: 'applied'
  });
  const normalized = validateJobFields({ company: companyRaw, role: roleRaw, notes });
  return {
    company: normalized.company,
    role: normalized.role,
    status: statusSignal.status,
    confidence: {
      company: normalized.company ? 74 : 0,
      role: normalized.role ? 74 : 0,
      status: Number(statusSignal.confidence || 70),
      key: normalized.company && normalized.role ? 82 : 0
    },
    candidates,
    notes,
    debug: {
      provider: 'generic',
      parser_strategy: 'generic_subject_body_heuristics',
      company_source: normalized.company ? 'heuristic' : null,
      role_source: normalized.role ? 'heuristic' : null,
      status_source: statusSignal.source || null,
      ignored_sections: [],
      rejected_candidates: [],
      chosen_fields: {
        company: normalized.company || null,
        role: normalized.role || null,
        status: statusSignal.status || null
      }
    }
  };
}

async function parseJobEmail(payload = {}) {
  const input = toProviderInput(payload);
  const provider = detectProvider(input);
  const externalReq = extractExternalReqId({
    subject: input.subject,
    snippet: input.text,
    bodyText: input.text
  });
  const hintFingerprint = buildHintFingerprintFromEmail({
    providerId: provider.providerId,
    fromDomain: input.fromDomain,
    subject: input.subject,
    text: input.text,
    parsedJobId: externalReq?.externalReqId || null
  });
  const hintResult =
    payload?.db && payload?.userId
      ? await findBestHint(payload.db, payload.userId, hintFingerprint, { touch: true })
      : null;
  const matchedHint = hintResult?.hint || null;

  const parser = PARSER_MAP[provider.providerId];
  const parsed = parser && typeof parser.parse === 'function'
    ? parser.parse(input)
    : parseGeneric(input);

  const notes = Array.isArray(parsed?.notes) ? [...parsed.notes] : [];
  let companyCandidate = parsed?.company;
  let roleCandidate = parsed?.role;

  const subjectCompanySuffixMatch = input.subject.match(/^.+\s[-–—|:]\s+([A-Z][A-Za-z0-9&.' -]{1,60})$/);
  const bodyCompanyLogoMatch = input.text.match(
    /\b([A-Z][A-Za-z0-9&.' -]{1,60})\s+(?:company logo|careers|recruiting team|recruiting department)\b/i
  );
  if (subjectCompanySuffixMatch && bodyCompanyLogoMatch && bodyCompanyLogoMatch[1]) {
    companyCandidate = bodyCompanyLogoMatch[1].trim();
    notes.push('company_preferred:body_logo_line');
  }

  const statusSignal = detectStatusSignal({
    subject: input.subject,
    text: input.text,
    company: companyCandidate,
    role: roleCandidate,
    defaultStatus: 'applied'
  });

  if (!parsed?.debug || typeof parsed.debug !== 'object') {
    parsed.debug = {};
  }

  // Status priority and safety overrides
  const currentStatus = parsed?.status;
  if (statusSignal.status === 'rejected' && currentStatus !== 'rejected') {
    parsed.status = 'rejected';
    parsed.debug.status_override_reason = 'rejection_phrase_override';
    parsed.debug.status_source = statusSignal.source || parsed.debug.status_source || 'rejection_phrase';
  } else if (
    currentStatus === 'interview_requested' &&
    statusSignal.status === 'applied'
  ) {
    // Prevent false interview upgrades when strong applied signals are present.
    parsed.status = 'applied';
    parsed.debug.status_override_reason = 'applied_phrase_preferred';
    parsed.debug.status_source = statusSignal.source || parsed.debug.status_source || 'applied_phrase';
  } else if (!currentStatus) {
    parsed.status = statusSignal.status;
    parsed.debug.status_source = statusSignal.source || parsed.debug.status_source || 'fallback';
  }

  if (matchedHint?.company_override) {
    companyCandidate = matchedHint.company_override;
    notes.push('hint_override:company');
  }
  if (matchedHint?.role_override) {
    roleCandidate = matchedHint.role_override;
    notes.push('hint_override:role');
  }
  if (matchedHint?.status_override) {
    parsed.status = String(matchedHint.status_override).trim().toLowerCase();
    notes.push('hint_override:status');
  }

  const validation = validateJobFields({
    company: companyCandidate,
    role: roleCandidate,
    notes
  });
  if (validation.company && /^employment with\s+/i.test(validation.company)) {
    validation.company = validation.company.replace(/^employment with\s+/i, '').trim();
  }
  if (
    validation.company &&
    validation.role &&
    String(validation.company).toLowerCase() === String(validation.role).toLowerCase()
  ) {
    validation.role = undefined;
    notes.push('role_rejected:matches_company');
  }

  const locationMatch = input.text.match(/\b([A-Z][A-Za-z .'-]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?)\b/);

  const appKeyPayload = buildApplicationKey({
    providerId: provider.providerId,
    company: validation.company,
    role: validation.role,
    jobId: externalReq?.externalReqId || null,
    location: locationMatch ? locationMatch[1] : null
  });

  const overrideCompany = Boolean(matchedHint?.company_override);
  const overrideRole = Boolean(matchedHint?.role_override);
  const overrideStatus = Boolean(matchedHint?.status_override);

  const confidence = {
    company: overrideCompany ? 95 : Number(parsed?.confidence?.company || 0),
    role: overrideRole ? 95 : Number(parsed?.confidence?.role || 0),
    status: overrideStatus
      ? 95
      : parsed.status === statusSignal.status
        ? Number(statusSignal.confidence || parsed?.confidence?.status || 0)
        : Number(parsed?.confidence?.status || statusSignal.confidence || 0),
    key: appKeyPayload
      ? Math.max(
          Number(parsed?.confidence?.key || 0),
          appKeyPayload.strategy === 'job_id' ? 96 : 86,
          overrideCompany || overrideRole || overrideStatus ? 95 : 0
        )
      : 0
  };

  const result = {
    providerId: provider.providerId,
    providerReason: provider.reason,
    company: validation.company,
    role: validation.role,
    status: parsed?.status,
    application_key: appKeyPayload?.key,
    application_key_payload: appKeyPayload || null,
    confidence,
    candidates: {
      company: Array.from(new Set([...(parsed?.candidates?.company || []), parsed?.company].filter(Boolean))),
      role: Array.from(new Set([...(parsed?.candidates?.role || []), parsed?.role].filter(Boolean)))
    },
    notes,
    parserDebug: parsed?.debug && typeof parsed.debug === 'object' ? parsed.debug : null,
    hints: {
      applied: Boolean(matchedHint),
      reason: hintResult?.match_reason || (matchedHint ? 'matched' : 'none'),
      hint_id: matchedHint?.id || null,
      fingerprint: {
        provider_id: hintFingerprint.provider_id,
        from_domain: hintFingerprint.from_domain,
        subject_pattern: hintFingerprint.subject_pattern,
        job_id_token: hintFingerprint.job_id_token
      },
      overrides: matchedHint
        ? {
            company_override: matchedHint.company_override || null,
            role_override: matchedHint.role_override || null,
            status_override: matchedHint.status_override || null
          }
        : null
    }
  };

  if (result.role && !result.company) {
    result.notes.push('role_without_company:allowed_for_fallback_matching');
  }

  return result;
}

module.exports = {
  parseJobEmail
};
