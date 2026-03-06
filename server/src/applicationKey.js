const crypto = require('crypto');

function normalizeToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeJobId(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '')
    .trim();
}

function normalizeLocation(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\((remote|hybrid|on[- ]?site)\)/gi, '$1')
    .replace(/[^a-z0-9, ]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildApplicationKey({ providerId, company, role, jobId, location } = {}) {
  const normalizedCompany = normalizeToken(company);
  const normalizedRole = normalizeToken(role);
  const normalizedJobId = normalizeJobId(jobId);
  const normalizedLocation = normalizeLocation(location);

  const inputs = {
    providerId: providerId || null,
    company: normalizedCompany || null,
    role: normalizedRole || null,
    jobId: normalizedJobId || null,
    location: normalizedLocation || null
  };

  let raw = null;
  let strategy = null;

  if (normalizedJobId) {
    // Req/job IDs are the strongest deterministic key when present.
    raw = `jobid:${normalizedJobId}`;
    strategy = 'job_id';
  } else if (normalizedCompany && normalizedRole) {
    // Canonical cross-provider key should stay stable even when one source omits location.
    raw = `${normalizedCompany}|${normalizedRole}`;
    strategy = normalizedLocation ? 'company_role_with_location_context' : 'company_role';
  } else {
    return null;
  }

  const key = crypto.createHash('sha256').update(raw).digest('hex');
  return {
    key,
    raw,
    strategy,
    normalizedCompany: normalizedCompany || null,
    normalizedRole: normalizedRole || null,
    normalizedJobId: normalizedJobId || null,
    normalizedLocation: normalizedLocation || null,
    inputs
  };
}

module.exports = {
  buildApplicationKey,
  normalizeToken,
  normalizeJobId,
  normalizeLocation
};
