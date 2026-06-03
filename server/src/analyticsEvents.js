const crypto = require('crypto');
const { logWarn } = require('./logger');

const ANALYTICS_EVENT_NAMES = Object.freeze({
  PAGE_VIEW: 'page_view',
  SIGNUP: 'signup',
  FORWARDING_COMPLETE: 'forwarding_complete',
  FIRST_APPLICATION_DETECTED: 'first_application_detected',
  SUBSCRIPTION_STARTED: 'subscription_started'
});

const ALLOWED_ANALYTICS_EVENTS = new Set(Object.values(ANALYTICS_EVENT_NAMES));

function sanitizeAnalyticsString(value, maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function sanitizePath(value) {
  const text = String(value || '').trim();
  if (!text || !text.startsWith('/')) return '/';
  return sanitizeAnalyticsString(text, 500) || '/';
}

function normalizeAnalyticsEventName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ALLOWED_ANALYTICS_EVENTS.has(normalized) ? normalized : null;
}

function normalizeTrafficSourceLabel(source) {
  switch (String(source || '').toLowerCase()) {
    case 'google_search':
      return 'Google Search';
    case 'google_ads':
      return 'Google Ads';
    case 'linkedin':
      return 'LinkedIn';
    case 'reddit':
      return 'Reddit';
    case 'twitter':
      return 'X/Twitter';
    case 'direct':
      return 'Direct';
    default:
      return 'Other';
  }
}

function classifyTrafficSource({ referrer = '', utmSource = '', utmMedium = '' } = {}) {
  const source = String(utmSource || '').trim().toLowerCase();
  const medium = String(utmMedium || '').trim().toLowerCase();
  const ref = String(referrer || '').trim().toLowerCase();
  const isPaid = /^(cpc|ppc|paid|paid_social|paid-search|paid_search|display|ads?)$/.test(medium);

  if (source.includes('google') && isPaid) return 'google_ads';
  if (source.includes('linkedin')) return 'linkedin';
  if (source.includes('reddit')) return 'reddit';
  if (source === 'x' || source.includes('twitter') || source.includes('t.co')) return 'twitter';
  if (source.includes('google')) return 'google_search';

  if (!ref) return 'direct';
  let hostname = '';
  try {
    hostname = new URL(ref).hostname.replace(/^www\./, '');
  } catch (_) {
    hostname = ref;
  }

  if (hostname.includes('google.') && isPaid) return 'google_ads';
  if (hostname.includes('google.')) return 'google_search';
  if (hostname.includes('linkedin.')) return 'linkedin';
  if (hostname.includes('reddit.')) return 'reddit';
  if (hostname.includes('twitter.') || hostname === 'x.com' || hostname.includes('t.co')) {
    return 'twitter';
  }
  return 'other';
}

function maybeJson(value) {
  if (!value || typeof value !== 'object') return null;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return null;
  }
}

async function awaitMaybe(value) {
  return value && typeof value.then === 'function' ? await value : value;
}

async function runPrepared(db, sql, params = [], mode = 'run') {
  const stmt = db.prepare(sql);
  if (db.isAsync) return stmt[mode](...params);
  return stmt[mode](...params);
}

async function analyticsTableExists(db) {
  if (!db || typeof db.prepare !== 'function') return false;
  if (!db.isAsync) return true;
  const row = await runPrepared(db, `SELECT to_regclass($1) AS exists`, ['analytics_events'], 'get');
  return Boolean(row?.exists);
}

async function recordAnalyticsEvent(db, options = {}) {
  const eventName = normalizeAnalyticsEventName(options.eventName || options.event_name);
  if (!eventName || !db || typeof db.prepare !== 'function') return false;

  try {
    if (!(await analyticsTableExists(db))) return false;

    const now = new Date().toISOString();
    const idempotencyKey = sanitizeAnalyticsString(options.idempotencyKey || options.idempotency_key, 260);
    if (idempotencyKey) {
      const existing = await runPrepared(
        db,
        'SELECT id FROM analytics_events WHERE idempotency_key = ? LIMIT 1',
        [idempotencyKey],
        'get'
      );
      if (existing?.id) return false;
    }

    const utmSource = sanitizeAnalyticsString(options.utmSource || options.utm_source, 120);
    const utmMedium = sanitizeAnalyticsString(options.utmMedium || options.utm_medium, 120);
    const referrer = sanitizeAnalyticsString(options.referrer, 500);
    const source = sanitizeAnalyticsString(
      options.source || classifyTrafficSource({ referrer, utmSource, utmMedium }),
      80
    );
    const metadataJson = maybeJson(options.metadata || null);

    await awaitMaybe(
      db.prepare(
        `INSERT INTO analytics_events
          (id, event_name, user_id, visitor_id, session_id, path, referrer, source,
           utm_source, utm_medium, utm_campaign, utm_term, utm_content,
           metadata_json, idempotency_key, occurred_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        eventName,
        sanitizeAnalyticsString(options.userId || options.user_id, 120),
        sanitizeAnalyticsString(options.visitorId || options.visitor_id, 120),
        sanitizeAnalyticsString(options.sessionId || options.session_id, 120),
        sanitizePath(options.path),
        referrer,
        source,
        utmSource,
        utmMedium,
        sanitizeAnalyticsString(options.utmCampaign || options.utm_campaign, 160),
        sanitizeAnalyticsString(options.utmTerm || options.utm_term, 160),
        sanitizeAnalyticsString(options.utmContent || options.utm_content, 160),
        metadataJson,
        idempotencyKey,
        options.occurredAt || options.occurred_at || now,
        now
      )
    );
    return true;
  } catch (err) {
    if (!/unique|constraint/i.test(String(err?.message || ''))) {
      logWarn('analytics.event.record_failed', {
        eventName,
        code: err?.code || null,
        detail: err?.message ? String(err.message).slice(0, 180) : String(err)
      });
    }
    return false;
  }
}

async function recordFirstApplicationDetected(db, userId, { occurredAt = null, applicationId = null, source = null } = {}) {
  if (!userId) return false;
  return recordAnalyticsEvent(db, {
    eventName: ANALYTICS_EVENT_NAMES.FIRST_APPLICATION_DETECTED,
    userId,
    path: '/app',
    source: 'product',
    occurredAt,
    idempotencyKey: `first_application_detected:${userId}`,
    metadata: {
      application_id: applicationId || null,
      source: source || null
    }
  });
}

module.exports = {
  ANALYTICS_EVENT_NAMES,
  classifyTrafficSource,
  normalizeTrafficSourceLabel,
  recordAnalyticsEvent,
  recordFirstApplicationDetected
};
