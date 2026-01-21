const crypto = require('crypto');
const { redactContent } = require('./redact');
const { logInfo, logWarn } = require('../logger');
const { validateOrThrow, buildPrompt } = require('./promptTemplate');

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

async function callProvider({ messages, config }) {
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
        messages,
        temperature: 0,
        response_format: { type: 'json_object' }
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
  const messages = buildPrompt({
    from,
    subject,
    snippet,
    bodyText: redacted || null
  });

  const promptHash = hashPrompt(JSON.stringify(messages));
  const start = Date.now();
  try {
    const raw = await callProvider({ messages, config });
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
      const topLevelKeys = parsedResult.parsed && typeof parsedResult.parsed === 'object'
        ? Object.keys(parsedResult.parsed)
        : [];
      logWarn('llm.validation_failed', {
        stage: 'schema_failed',
        messageHash: hashPrompt(messageId || ''),
        duration_ms: Date.now() - start,
        promptHash,
        ajvErrors: String(err.message || '').slice(0, 500),
        rawPreview: parsedResult.preview,
        keys: topLevelKeys
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
