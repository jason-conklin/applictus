const SAFE_REQ_REGEX = /(R-\d{3,}|REQ[-\s]?\d{3,}|Job ID[:\s#-]?\w{3,})/gi;

function stripEmails(text) {
  return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<EMAIL>');
}

function stripPhones(text) {
  return text.replace(/(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/g, '<PHONE>');
}

function stripUrls(text) {
  return text.replace(/\bhttps?:\/\/\S+/gi, '<URL>');
}

function stripNames(text) {
  return text.replace(/\b(hi|hello|dear)\s+[A-Z][a-z]+/gi, '$1 <NAME>');
}

function preserveReqIds(text) {
  const matches = [...text.matchAll(SAFE_REQ_REGEX)].map((m) => m[0]);
  const placeholder = text.replace(SAFE_REQ_REGEX, '<REQ_ID>');
  return { placeholder, matches };
}

function truncate(text, max) {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) : clean;
}

function redactContent({ subject, snippet, bodyText, maxChars }) {
  const max = maxChars || 8000;
  const parts = [subject || '', snippet || '', bodyText || ''].join('\n').slice(0, max * 2);
  let redacted = stripEmails(parts);
  redacted = stripPhones(redacted);
  redacted = stripUrls(redacted);
  redacted = stripNames(redacted);
  const { placeholder, matches } = preserveReqIds(redacted);
  const truncated = truncate(placeholder, max);
  return { redacted: truncated, preservedReqIds: matches };
}

module.exports = {
  redactContent
};
