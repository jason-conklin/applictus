const { normalizeCompany, normalizeRole } = require('../validateJobFields');
const { detectStatusSignal } = require('./common');

function parse({ subject, text }) {
  const notes = [];
  const candidates = { company: [], role: [] };
  const rejectedCandidates = [];
  const body = String(text || '');
  const subjectText = String(subject || '').trim();
  const corpus = `${subjectText}\n${body}`;

  let companyRaw = null;
  let companySource = null;
  let roleRaw = null;
  let roleSource = null;
  let matchedCompanyPattern = null;

  const confirmationMatch = corpus.match(
    /(?:^|[.!?]\s+)(?:congratulations!?\s*)?([A-Z][A-Za-z0-9&.'\- ]{1,80}?)\s+(?:it\s+)?has received your application for\s+(.+?)(?:\s+in\s+[A-Z][A-Za-z .'-]+,\s*[A-Z]{2}\b|[.!?\n]|$)/i
  );
  if (confirmationMatch) {
    companyRaw = String(confirmationMatch[1] || '').trim();
    roleRaw = String(confirmationMatch[2] || '').trim();
    companySource = 'monster_confirmation_sentence';
    roleSource = 'monster_confirmation_sentence';
    matchedCompanyPattern = 'company_has_received_application_for';
    if (companyRaw) candidates.company.push(companyRaw);
    if (roleRaw) candidates.role.push(roleRaw);
  }

  if (!companyRaw) {
    const companyOnlyMatch = corpus.match(
      /(?:^|[.!?]\s+)(?:congratulations!?\s*)?([A-Z][A-Za-z0-9&.'\- ]{1,80}?)\s+(?:it\s+)?has received your application for\b/i
    );
    if (companyOnlyMatch && companyOnlyMatch[1]) {
      companyRaw = String(companyOnlyMatch[1] || '').trim();
      companySource = 'monster_confirmation_company_phrase';
      matchedCompanyPattern = 'company_has_received_application_for';
      candidates.company.push(companyRaw);
    }
  }

  if (
    companyRaw &&
    /^(monster|monster\.com)$/i.test(String(companyRaw).trim())
  ) {
    rejectedCandidates.push({
      field: 'company',
      value: companyRaw,
      reason: 'provider_branding_not_employer'
    });
    companyRaw = null;
    companySource = null;
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

  if (company && role && company.toLowerCase() === role.toLowerCase()) {
    rejectedCandidates.push({ field: 'role', value: role, reason: 'matches_company' });
    notes.push('role_rejected:matches_company');
  }

  return {
    company,
    role,
    status: statusSignal.status || 'applied',
    confidence: {
      company: company ? 95 : 0,
      role: role ? 92 : 0,
      status: Number(statusSignal.confidence || 0),
      key: company && role ? 90 : 0
    },
    candidates,
    notes,
    debug: {
      provider: 'monster',
      parser_strategy: 'monster_confirmation_sentence',
      company_source: companySource || null,
      role_source: roleSource || null,
      status_source: statusSignal.source || null,
      matched_monster_company_pattern: matchedCompanyPattern,
      rejected_candidates: rejectedCandidates,
      chosen_fields: {
        company: company || null,
        role: role || null,
        status: statusSignal.status || 'applied'
      }
    }
  };
}

module.exports = {
  parse
};
