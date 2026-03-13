const { normalizeEmail } = require('./inbound');

const GENERIC_PERSONAL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'icloud.com',
  'me.com'
]);

function parseSenderParts(fromValue) {
  const raw = String(fromValue || '').trim();
  if (!raw) {
    return { email: null, name: null, domain: null };
  }
  const angleMatch = raw.match(/^(.*?)<([^>]+)>/);
  const emailMatch = String(angleMatch?.[2] || raw).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email = emailMatch ? normalizeEmail(emailMatch[0]) : null;
  const name = angleMatch?.[1] ? angleMatch[1].replace(/["']/g, '').trim() : raw.replace(emailMatch?.[0] || '', '').trim();
  const domain = email && email.includes('@') ? email.split('@')[1] : null;
  return { email, name, domain };
}

function hasHeader(headers, predicate) {
  const list = Array.isArray(headers) ? headers : [];
  return list.some((header) => {
    const name = String(header?.Name || header?.name || '').toLowerCase();
    const value = String(header?.Value || header?.value || '').toLowerCase();
    return predicate(name, value);
  });
}

function countOccurrences(haystack, needleRegex) {
  const text = String(haystack || '');
  if (!text) {
    return 0;
  }
  const source = new RegExp(
    needleRegex.source,
    needleRegex.flags.includes('g') ? needleRegex.flags : `${needleRegex.flags}g`
  );
  const matches = text.match(source);
  return matches ? matches.length : 0;
}

function isOutboundUserMessage({ from, userEmail, userName }) {
  const sender = parseSenderParts(from);
  const normalizedUserEmail = normalizeEmail(userEmail);
  if (sender.email && normalizedUserEmail && sender.email === normalizedUserEmail) {
    return true;
  }
  const normalizedUserName = String(userName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const normalizedSenderName = String(sender.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return Boolean(
    normalizedUserName &&
      normalizedSenderName &&
      normalizedUserName === normalizedSenderName &&
      sender.domain &&
      GENERIC_PERSONAL_DOMAINS.has(sender.domain)
  );
}

function isForwardingVerification({ subject, text }) {
  return (
    /\bgmail forwarding confirmation\b/i.test(String(subject || '')) ||
    /\bgmail forwarding confirmation code\b/i.test(String(text || ''))
  );
}

function isBulkDigest({ fromDomain, subject, text, headers }) {
  const lowerSubject = String(subject || '').toLowerCase();
  const lowerText = String(text || '').toLowerCase();
  const listUnsubscribe = hasHeader(headers, (name) => name === 'list-unsubscribe');
  const precedenceBulk = hasHeader(headers, (name, value) => name === 'precedence' && value.includes('bulk'));
  const autoSubmitted = hasHeader(headers, (name, value) => name === 'auto-submitted' && value.includes('auto-generated'));
  const readMoreCount = countOccurrences(lowerText, /\bread more\b/i);

  if (fromDomain && fromDomain.includes('glassdoor.com') && /\btech buzz\b/i.test(lowerText + lowerSubject)) {
    return true;
  }

  if (
    /\b(tech buzz|discover your next job|jobs you may like|recommended for you|community|digest|newsletter)\b/i.test(
      lowerSubject
    ) &&
    (lowerText.includes('unsubscribe') || lowerText.includes('view more posts') || readMoreCount >= 3)
  ) {
    return true;
  }

  if (
    /\b(linkedin)\b/i.test(fromDomain || '') &&
    /\b(jobs recommended|top job picks|your job alert|new jobs for you)\b/i.test(lowerSubject)
  ) {
    return true;
  }

  if ((listUnsubscribe || precedenceBulk || autoSubmitted) && (lowerText.includes('unsubscribe') || readMoreCount >= 3)) {
    return true;
  }

  return false;
}

function shouldSuppressEmail({
  from,
  subject,
  text,
  headers,
  to,
  userEmail,
  userName,
  forwardingWrapper
}) {
  const sender = parseSenderParts(from);
  const wrapperDetected = Boolean(forwardingWrapper?.detected);
  const wrapperOriginalFrom = normalizeEmail(forwardingWrapper?.originalFromEmail || '');
  const normalizedUserEmail = normalizeEmail(userEmail);
  const forwardedExternalSource = Boolean(
    wrapperDetected &&
      wrapperOriginalFrom &&
      normalizedUserEmail &&
      wrapperOriginalFrom !== normalizedUserEmail
  );

  if (!forwardedExternalSource && isOutboundUserMessage({ from, userEmail, userName })) {
    return { suppress: true, reason: 'outbound_user' };
  }

  if (isForwardingVerification({ subject, text })) {
    return { suppress: true, reason: 'gmail_forwarding_verification' };
  }

  if (isBulkDigest({ fromDomain: sender.domain, subject, text, headers, to })) {
    return { suppress: true, reason: 'bulk_digest' };
  }

  return { suppress: false };
}

module.exports = {
  shouldSuppressEmail,
  isOutboundUserMessage,
  isForwardingVerification
};
