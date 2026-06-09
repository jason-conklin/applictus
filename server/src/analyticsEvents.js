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
const TRAFFIC_SOURCE_ORDER = Object.freeze([
  'direct',
  'google_search',
  'google_ads',
  'instagram',
  'tiktok',
  'youtube',
  'linkedin',
  'reddit',
  'twitter',
  'other'
]);
const KNOWN_TRAFFIC_SOURCES = new Set(TRAFFIC_SOURCE_ORDER);

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
    case 'instagram':
      return 'Instagram';
    case 'tiktok':
      return 'TikTok';
    case 'youtube':
      return 'YouTube';
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

function normalizeTrafficToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeKnownTrafficSource(value) {
  const token = normalizeTrafficToken(value);
  if (!token) return null;
  if (token === 'google' || token === 'google_organic' || token === 'organic_google') return 'google_search';
  if (token === 'google_ads' || token === 'google_adwords' || token === 'adwords') return 'google_ads';
  if (token === 'instagram' || token === 'ig') return 'instagram';
  if (token === 'tiktok' || token === 'tik_tok') return 'tiktok';
  if (token === 'youtube' || token === 'yt') return 'youtube';
  if (token === 'linkedin' || token === 'linked_in' || token === 'lnkd_in') return 'linkedin';
  if (token === 'reddit') return 'reddit';
  if (token === 'x' || token === 'twitter' || token === 'x_twitter' || token === 't_co') return 'twitter';
  if (token === 'direct') return 'direct';
  if (KNOWN_TRAFFIC_SOURCES.has(token)) return token;
  return null;
}

function extractTrafficSourceHostname(referrer = '') {
  const raw = String(referrer || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProtocol).hostname.replace(/^www\./, '');
  } catch (_) {
    return raw.split('/')[0].replace(/^www\./, '');
  }
}

function hostnameMatches(hostname, domains = []) {
  if (!hostname) return false;
  return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function hasPaidAdIdentifier({ path = '', gclid = '', gbraid = '', wbraid = '', gadSource = '' } = {}) {
  if (gclid || gbraid || wbraid || gadSource) return true;
  const rawPath = String(path || '').trim();
  if (!rawPath) return false;
  try {
    const url = new URL(rawPath, 'https://applictus.com');
    return ['gclid', 'gbraid', 'wbraid', 'gad_source'].some((name) => Boolean(url.searchParams.get(name)));
  } catch (_) {
    return /(?:\?|&)(gclid|gbraid|wbraid|gad_source)=/i.test(rawPath);
  }
}

function isGooglePaidMedium(utmMedium = '') {
  return /^(cpc|ppc|paid|paid_search|paid-search|search|sem|display|ad|ads?)$/.test(normalizeTrafficToken(utmMedium));
}

function classifyTrafficSource({
  referrer = '',
  utmSource = '',
  utmMedium = '',
  path = '',
  gclid = '',
  gbraid = '',
  wbraid = '',
  gadSource = '',
  storedSource = ''
} = {}) {
  const normalizedUtmSource = normalizeTrafficToken(utmSource);
  const refHostname = extractTrafficSourceHostname(referrer);
  const stored = normalizeKnownTrafficSource(storedSource);

  if (hasPaidAdIdentifier({ path, gclid, gbraid, wbraid, gadSource })) return 'google_ads';

  if (normalizedUtmSource) {
    const mappedUtmSource = normalizeKnownTrafficSource(normalizedUtmSource);
    if ((mappedUtmSource === 'google_search' || mappedUtmSource === 'google_ads') && isGooglePaidMedium(utmMedium)) {
      return 'google_ads';
    }
    return mappedUtmSource || 'other';
  }

  if (refHostname) {
    if (refHostname === 'google.com' || refHostname.startsWith('google.') || refHostname.includes('.google.')) {
      return 'google_search';
    }
    if (hostnameMatches(refHostname, ['instagram.com'])) return 'instagram';
    if (hostnameMatches(refHostname, ['tiktok.com'])) return 'tiktok';
    if (hostnameMatches(refHostname, ['youtube.com']) || refHostname === 'youtu.be') return 'youtube';
    if (hostnameMatches(refHostname, ['linkedin.com']) || refHostname === 'lnkd.in') return 'linkedin';
    if (hostnameMatches(refHostname, ['reddit.com'])) return 'reddit';
    if (hostnameMatches(refHostname, ['twitter.com']) || refHostname === 'x.com' || refHostname === 't.co') return 'twitter';
    if (hostnameMatches(refHostname, ['applictus.com'])) return 'direct';
    return stored && stored !== 'other' ? stored : 'other';
  }

  if (stored && stored !== 'other') return stored;
  return 'direct';
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

    const path = sanitizePath(options.path);
    const utmSource = sanitizeAnalyticsString(options.utmSource || options.utm_source, 120);
    const utmMedium = sanitizeAnalyticsString(options.utmMedium || options.utm_medium, 120);
    const referrer = sanitizeAnalyticsString(options.referrer, 500);
    const gclid = sanitizeAnalyticsString(options.gclid, 180);
    const gbraid = sanitizeAnalyticsString(options.gbraid, 180);
    const wbraid = sanitizeAnalyticsString(options.wbraid, 180);
    const gadSource = sanitizeAnalyticsString(options.gadSource || options.gad_source, 80);
    const source = sanitizeAnalyticsString(
      options.source || classifyTrafficSource({ referrer, utmSource, utmMedium, path, gclid, gbraid, wbraid, gadSource }),
      80
    );
    const metadata =
      options.metadata && typeof options.metadata === 'object' && !Array.isArray(options.metadata)
        ? { ...options.metadata }
        : null;
    if (metadata) {
      if (gclid) metadata.gclid = gclid;
      if (gbraid) metadata.gbraid = gbraid;
      if (wbraid) metadata.wbraid = wbraid;
      if (gadSource) metadata.gad_source = gadSource;
    }
    const metadataJson = maybeJson(metadata || null);

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
        path,
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
  TRAFFIC_SOURCE_ORDER,
  classifyTrafficSource,
  extractTrafficSourceHostname,
  normalizeTrafficSourceLabel,
  recordAnalyticsEvent,
  recordFirstApplicationDetected
};
