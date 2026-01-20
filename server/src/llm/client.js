const crypto = require('crypto');
const { redactContent } = require('./redact');
const { logInfo, logWarn } = require('../logger');
const { validateOrThrow } = require('./promptTemplate');

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

function parseModelJson(rawText) {
  const cleaned = (rawText || '').trim();
  const preview = cleaned.replace(/\s+/g, ' ').slice(0, 300);
  if (!cleaned) {
    return { ok: false, stage: 'parse_failed', preview };
  }
  const unfenced = cleaned.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    const parsed = JSON.parse(unfenced);
    return { ok: true, parsed, preview };
  } catch (err) {
    // fall through
  }
  const first = unfenced.indexOf('{');
  const last = unfenced.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const slice = unfenced.slice(first, last + 1);
    try {
      const parsed = JSON.parse(slice);
      return { ok: true, parsed, preview };
    } catch (err) {
      // continue
    }
  }
  return { ok: false, stage: 'parse_failed', preview };
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
    const parsedResult = parseModelJson(raw);
    if (!parsedResult.ok) {
      logWarn('llm.validation_failed', {
        stage: parsedResult.stage,
        messageHash: hashPrompt(messageId || ''),
        duration_ms: Date.now() - start,
        promptHash,
        rawPreview: parsedResult.preview
      });
      return {
        used: true,
        cached: false,
        result: null,
        error: 'parse_failed',
        promptVersion: PROMPT_VERSION,
        promptHash
      };
    }
    try {
      validateOrThrow(JSON.stringify(parsedResult.parsed));
      logInfo('llm.call', {
        messageHash: hashPrompt(messageId || ''),
        duration_ms: Date.now() - start,
        success: true,
        promptHash
      });
      return {
        used: true,
        cached: false,
        result: parsedResult.parsed,
        promptVersion: PROMPT_VERSION,
        promptHash
      };
    } catch (err) {
      logWarn('llm.validation_failed', {
        stage: 'schema_failed',
        messageHash: hashPrompt(messageId || ''),
        duration_ms: Date.now() - start,
        promptHash,
        ajvErrors: String(err.message || '').slice(0, 500),
        rawPreview: parsedResult.preview
      });
      return {
        used: true,
        cached: false,
        result: null,
        error: 'schema_failed',
        promptVersion: PROMPT_VERSION,
        promptHash
      };
    }
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
  // Backwards-compatible alias
  runLlmExtraction: analyzeEmailForJobSignals,
  getConfig,
  hashPrompt,
  PROMPT_VERSION,
  parseModelJson
};
