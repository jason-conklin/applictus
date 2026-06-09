(() => {
  const EVENT_NAME = 'page_view';
  const VISITOR_KEY = 'applictus_visitor_id';
  const SESSION_KEY = 'applictus_session_id';

  function getApiBaseUrl() {
    const meta = document.querySelector('meta[name="app-api-base-url"]');
    const metaValue = meta?.getAttribute('content') || '';
    const configured = window.APP_CONFIG?.API_BASE_URL || metaValue;
    if (configured) return configured.replace(/\/$/, '');
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isLocal ? 'http://localhost:3000' : '';
  }

  function createId(prefix) {
    if (window.crypto?.randomUUID) {
      return `${prefix}_${window.crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function getStoredId(storage, key, prefix) {
    try {
      let value = storage.getItem(key);
      if (!value) {
        value = createId(prefix);
        storage.setItem(key, value);
      }
      return value;
    } catch (_) {
      return createId(prefix);
    }
  }

  function getUtmParams() {
    const params = new URLSearchParams(window.location.search || '');
    return {
      utm_source: params.get('utm_source') || '',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || '',
      utm_term: params.get('utm_term') || '',
      utm_content: params.get('utm_content') || '',
      gclid: params.get('gclid') || '',
      gbraid: params.get('gbraid') || '',
      wbraid: params.get('wbraid') || '',
      gad_source: params.get('gad_source') || ''
    };
  }

  function sendPageView() {
    const endpoint = `${getApiBaseUrl()}/api/analytics/event`;
    const visitorId = getStoredId(window.localStorage, VISITOR_KEY, 'visitor');
    const sessionId = getStoredId(window.sessionStorage, SESSION_KEY, 'session');
    const payload = {
      event_name: EVENT_NAME,
      visitor_id: visitorId,
      session_id: sessionId,
      path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      referrer: document.referrer || '',
      title: document.title || '',
      ...getUtmParams()
    };

    window
      .fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .catch(() => {});
  }

  if (document.prerendering) {
    document.addEventListener('prerenderingchange', sendPageView, { once: true });
  } else {
    window.setTimeout(sendPageView, 0);
  }
})();
