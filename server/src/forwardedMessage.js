const { normalizeEmail } = require('./inbound');

const FORWARDED_MARKER_RE = /^\s*-{2,}\s*forwarded message\s*-{2,}\s*$/i;
const BEGIN_FORWARDED_RE = /^\s*begin forwarded message:\s*$/i;
const HEADER_LINE_RE = /^\s*(from|subject|date|to|cc|reply-to)\s*:\s*(.+)\s*$/i;

function stripHtml(text) {
  return String(text || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTextBody(text, html) {
  const plain = String(text || '').trim();
  if (plain) {
    return plain;
  }
  return stripHtml(html || '');
}

function stripForwardPrefixes(subject) {
  let value = String(subject || '').trim();
  while (/^(?:fwd?|fw)\s*:\s*/i.test(value)) {
    value = value.replace(/^(?:fwd?|fw)\s*:\s*/i, '').trim();
  }
  return value;
}

function parseAddress(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return { email: null, name: null };
  }
  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email = emailMatch ? normalizeEmail(emailMatch[0]) : null;
  const name = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/["']/g, '')
    .replace(emailMatch?.[0] || '', '')
    .replace(/\s+/g, ' ')
    .trim();
  return { email, name: name || null };
}

function findForwardedHeaderStart(lines = [], wrapperSubject = '') {
  const markerIndex = lines.findIndex((line) => FORWARDED_MARKER_RE.test(line) || BEGIN_FORWARDED_RE.test(line));
  if (markerIndex >= 0) {
    for (let i = markerIndex + 1; i < Math.min(lines.length, markerIndex + 12); i += 1) {
      if (HEADER_LINE_RE.test(lines[i])) {
        return i;
      }
    }
    return Math.min(markerIndex + 1, lines.length - 1);
  }

  if (/^(?:fwd?|fw)\s*:/i.test(String(wrapperSubject || '').trim())) {
    const fromIndex = lines.findIndex((line) => /^\s*from\s*:/i.test(line));
    if (fromIndex >= 0) {
      const nearbyHeaders = lines
        .slice(fromIndex, Math.min(lines.length, fromIndex + 10))
        .filter((line) => /^\s*(subject|date|to)\s*:/i.test(line));
      if (nearbyHeaders.length) {
        return fromIndex;
      }
    }
  }

  return -1;
}

function readForwardedHeaders(lines = [], startIndex = -1) {
  if (!Array.isArray(lines) || startIndex < 0 || startIndex >= lines.length) {
    return {
      headers: {},
      bodyStart: -1,
      headerCount: 0
    };
  }

  const headers = {};
  let currentHeader = null;
  let headerCount = 0;
  let bodyStart = -1;

  for (let i = startIndex; i < lines.length; i += 1) {
    const line = String(lines[i] || '');
    const headerMatch = line.match(HEADER_LINE_RE);
    if (headerMatch) {
      currentHeader = String(headerMatch[1] || '').toLowerCase();
      const value = String(headerMatch[2] || '').trim();
      headers[currentHeader] = headers[currentHeader]
        ? `${headers[currentHeader]} ${value}`.trim()
        : value;
      headerCount += 1;
      continue;
    }

    if (currentHeader && /^\s+/.test(line)) {
      headers[currentHeader] = `${headers[currentHeader] || ''} ${line.trim()}`.trim();
      continue;
    }

    if (!line.trim()) {
      if (headerCount >= 2) {
        bodyStart = i + 1;
        break;
      }
      continue;
    }

    if (headerCount >= 2) {
      bodyStart = i;
      break;
    }

    if (headerCount === 0) {
      continue;
    }

    bodyStart = i;
    break;
  }

  if (bodyStart < 0) {
    bodyStart = Math.min(lines.length, startIndex + headerCount);
  }

  return {
    headers,
    bodyStart,
    headerCount
  };
}

function extractForwardedOriginalMessage({ subject, text, html, fromEmail } = {}) {
  const wrapperSubject = String(subject || '').trim();
  const wrapperFromEmail = normalizeEmail(fromEmail || '') || null;
  const normalizedText = normalizeTextBody(text, html);
  const lines = normalizedText
    ? normalizedText.replace(/\r\n/g, '\n').split('\n')
    : [];

  const headerStart = findForwardedHeaderStart(lines, wrapperSubject);
  const markerDetected = lines.some((line) => FORWARDED_MARKER_RE.test(line) || BEGIN_FORWARDED_RE.test(line));
  const { headers, bodyStart, headerCount } = readForwardedHeaders(lines, headerStart);
  const fwdSubjectCandidate = stripForwardPrefixes(wrapperSubject);
  const originalSubject = stripForwardPrefixes(headers.subject || fwdSubjectCandidate || '');
  const fromParts = parseAddress(headers.from || '');
  const originalText = bodyStart >= 0 ? lines.slice(bodyStart).join('\n').trim() : '';
  const looksForwarded = Boolean(
    markerDetected ||
      (headerStart >= 0 && headerCount >= 2) ||
      (/^(?:fwd?|fw)\s*:/i.test(wrapperSubject) && headerStart >= 0)
  );

  return {
    isForwarded: looksForwarded,
    wrapperSubject: wrapperSubject || null,
    wrapperFromEmail,
    originalSubject: originalSubject || null,
    originalFromEmail: fromParts.email || null,
    originalFromName: fromParts.name || null,
    originalDate: headers.date ? String(headers.date).trim() : null,
    originalText: originalText || null
  };
}

module.exports = {
  extractForwardedOriginalMessage,
  stripForwardPrefixes
};
