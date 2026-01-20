const ATS_DOMAINS = [
  'greenhouse',
  'workday',
  'icims',
  'workable',
  'breezy',
  'applytojob',
  'indeed',
  'lever',
  'smartrecruiters',
  'taleo',
  'talemetry',
  'ashby'
];

function looksGenericSubject(subject = '') {
  const lower = subject.toLowerCase();
  return (
    lower.includes('thank you for applying') ||
    lower.includes('application update') ||
    lower.includes('application received') ||
    lower === 'application update' ||
    lower === 'application received'
  );
}

function shouldUseLlm({ classification, identity, sender = '', subject = '', roleResult }) {
  const detected = classification?.detectedType || '';
  const confidence = classification?.confidenceScore || 0;
  const missingCompany = !identity?.companyName;
  const missingRole = !identity?.jobTitle && !roleResult?.jobTitle;
  const senderDomain = sender.includes('@')
    ? sender.split('@')[1].replace(/[> ]/g, '').toLowerCase()
    : '';
  const isAts = ATS_DOMAINS.some((d) => senderDomain.includes(d));

  if (detected === 'rejection' && confidence >= 0.95 && !missingCompany && !missingRole) {
    return false;
  }
  if (detected === 'confirmation' && confidence >= 0.95 && !missingCompany) {
    return false;
  }
  if (classification && (!classification.isJobRelated || confidence < 0.9)) {
    return true;
  }
  if (missingCompany || missingRole) {
    return true;
  }
  if (isAts && looksGenericSubject(subject)) {
    return true;
  }
  return false;
}

function shouldInvokeLlm({ classification, extracted, identity, sender = '', subject = '', roleResult, matchResult, reason }) {
  const effectiveIdentity = extracted || identity || {};
  const why = [];
  const type = classification?.detectedType || '';
  const confidence = classification?.confidenceScore || 0;
  const missingCompany = !effectiveIdentity?.companyName;
  const missingRole = !effectiveIdentity?.jobTitle && !roleResult?.jobTitle;
  const senderDomain = sender.includes('@')
    ? sender.split('@')[1].replace(/[> ]/g, '').toLowerCase()
    : '';
  const isAts = ATS_DOMAINS.some((d) => senderDomain.includes(d));

  if (reason && String(reason).includes('ambiguous')) {
    why.push('ambiguous_match');
  }
  if (missingCompany) {
    why.push('missing_company');
  }
  if (missingRole) {
    why.push('missing_role');
  }
  if (type === 'other_job_related') {
    why.push('low_type_confidence');
  }
  if ((type === 'rejection' || type === 'confirmation') && confidence < 0.9) {
    why.push('borderline_confidence');
  }
  if (matchResult && matchResult.reason && String(matchResult.reason).includes('ambiguous')) {
    why.push('ambiguous_match_reason');
  }
  if (isAts && looksGenericSubject(subject)) {
    why.push('generic_ats_subject');
  }

  const invoke = shouldUseLlm({
    classification,
    identity: effectiveIdentity,
    sender,
    subject,
    roleResult
  });

  return { invoke, why };
}

// Canonical export
module.exports = {
  shouldUseLlm,
  // Compatibility alias expected by tests and shims
  shouldInvokeLlm
};
