const crypto = require('crypto');
const { redactContent } = require('./redact');
const { logInfo, logWarn } = require('../logger');

const PROMPT_VERSION = 'v1';

function getConfig() {
  return {
    enabled: process.env.APPLICTUS_LLM_ENABLED === '1',
    provider: process.env.APPLICTUS_LLM_PROVIDER || 'openai_compatible',
    baseUrl: process.env.APPLICTUS_LLM_BASE_URL || '',
    apiKey: process.env.APPLICTUS_LLM_API_KEY || '',
    model: process.env.APPLICTUS_LLM_MODEL || 'gpt-4.1-mini',
    maxInputChars: Number(process.env.APPLICTUS_LLM_MAX_INPUT_CHARS || '8000'),
    timeoutMs: Number(process.env.APPLICTUS_LLM_TIMEOUT_MS || '8000')
  };
}

function hashPrompt(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function callProvider({ prompt, config }) {
  if (!config.baseUrl || !config.apiKey) {
    throw new Error('LLM provider not configured');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content:
              'You are a parser that extracts job application signals. Reply ONLY with JSON matching the provided schema.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0
      })
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`LLM HTTP ${response.status}: ${text}`);
    }
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(content) {
  try {
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

function validateResult(result) {
  if (!result || typeof result !== 'object') return false;
  if (typeof result.is_job_related !== 'boolean') return false;
  const typeOk =
    typeof result.event_type === 'string' &&
    [
      'confirmation',
      'rejection',
      'interview',
      'offer',
      'under_review',
      'recruiter_outreach',
      'other_job_related',
      'non_job'
    ].includes(result.event_type);
  if (!typeOk) return false;
  if (typeof result.confidence !== 'number') return false;
  return true;
}

async function analyzeEmailForJobSignals({
  messageId,
  subject,
  snippet,
  from,
  to,
  date,
  headers,
  bodyText
}) {
  const config = getConfig();
  if (!config.enabled) {
    return { used: false, cached: false, result: null, promptVersion: PROMPT_VERSION };
  }
  const { redacted } = redactContent({
    subject,
    snippet,
    bodyText,
    maxChars: config.maxInputChars
  });
  const prompt = [
    'Extract job application signals. Return JSON with keys:',
    'is_job_related (bool), event_type, confidence (0-1), company_name, job_title, external_req_id, evidence {company_source, role_source, req_source}, notes.',
    `Subject: ${subject || ''}`,
    `Snippet: ${snippet || ''}`,
    `From: ${from || ''}`,
    `To: ${to || ''}`,
    `Date: ${date || ''}`,
    `Headers: ${JSON.stringify(headers || {})}`,
    `Content: ${redacted}`
  ].join('\n');

  const promptHash = hashPrompt(prompt);
  const start = Date.now();
  try {
    const raw = await callProvider({ prompt, config });
    const parsed = parseJson(raw);
    const valid = validateResult(parsed);
    logInfo('llm.call', {
      messageHash: hashPrompt(messageId || ''),
      duration_ms: Date.now() - start,
      success: valid,
      promptHash
    });
    if (!valid) {
      throw new Error('Invalid LLM schema');
    }
    return { used: true, cached: false, result: parsed, promptVersion: PROMPT_VERSION, promptHash };
  } catch (err) {
    logWarn('llm.call_failed', {
      messageHash: hashPrompt(messageId || ''),
      duration_ms: Date.now() - start,
      error: err.message
    });
    return { used: true, cached: false, result: null, error: err, promptVersion: PROMPT_VERSION, promptHash };
  }
}

module.exports = {
  analyzeEmailForJobSignals,
  getConfig,
  hashPrompt,
  PROMPT_VERSION
};
