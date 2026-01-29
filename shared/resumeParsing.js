const path = require('path');

const MAX_RESUME_LENGTH = 200000;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function detectSupportedResumeMime(mime, filename = '') {
  const lcMime = (mime || '').toLowerCase();
  const ext = (filename || '').toLowerCase();
  if (lcMime.includes('pdf') || ext.endsWith('.pdf')) {
    return 'application/pdf';
  }
  if (lcMime.includes('officedocument') || lcMime.includes('docx') || ext.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return null;
}

async function extractTextFromDocx(buffer) {
  let warnings = [];
  let text = '';
  try {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    text = result?.value || '';
    warnings = (result?.messages || []).map((m) => m.message || String(m));
    return { text, method: 'mammoth', warnings };
  } catch (err) {
    warnings.push(err.message || 'docx parse failed; using fallback');
    text = buffer.toString('utf8');
    return { text, method: 'fallback', warnings };
  }
}

async function extractTextFromPdf(buffer) {
  let warnings = [];
  let text = '';
  try {
    const pdfParse = require('pdf-parse');
    const result = await pdfParse(buffer);
    text = result?.text || '';
    return { text, method: 'pdf-parse', warnings };
  } catch (err) {
    warnings.push(err.message || 'pdf parse failed; using fallback');
    text = buffer.toString('utf8');
    return { text, method: 'fallback', warnings };
  }
}

function normalizeExtractedResumeText(text) {
  if (!text) return '';
  let cleaned = text.replace(/\u0000/g, '');
  cleaned = cleaned.replace(/\r\n/g, '\n');
  cleaned = cleaned.replace(/[\t ]+/g, ' ');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.trim();
  if (cleaned.length > MAX_RESUME_LENGTH) {
    cleaned = cleaned.slice(0, MAX_RESUME_LENGTH);
  }
  return cleaned;
}

module.exports = {
  MAX_UPLOAD_BYTES,
  detectSupportedResumeMime,
  extractTextFromDocx,
  extractTextFromPdf,
  normalizeExtractedResumeText
};
