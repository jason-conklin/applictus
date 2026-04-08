const crypto = require('crypto');

const BILLING_OPTIONS = Object.freeze({
  PRO_MONTHLY: 'pro_monthly',
  JOB_SEARCH_PLAN: 'job_search_plan'
});

const BILLING_TYPES = Object.freeze({
  NONE: 'none',
  SUBSCRIPTION: 'subscription',
  ONE_TIME: 'one_time'
});

function normalizeBillingOption(option) {
  const value = String(option || '')
    .trim()
    .toLowerCase();
  if (!value) {
    return null;
  }
  if (['pro_monthly', 'monthly', 'pro', 'pro-monthly'].includes(value)) {
    return BILLING_OPTIONS.PRO_MONTHLY;
  }
  if (
    ['job_search_plan', 'job-search-plan', 'job_search', 'jobsearch', 'job_search_3_month', '3_month'].includes(
      value
    )
  ) {
    return BILLING_OPTIONS.JOB_SEARCH_PLAN;
  }
  return null;
}

function getCheckoutPlanConfig(option, env = process.env) {
  const normalized = normalizeBillingOption(option);
  if (!normalized) {
    return null;
  }
  if (normalized === BILLING_OPTIONS.PRO_MONTHLY) {
    return {
      planKey: BILLING_OPTIONS.PRO_MONTHLY,
      mode: 'subscription',
      priceId: String(env.STRIPE_PRICE_ID_PRO_MONTHLY || '').trim()
    };
  }
  return {
    planKey: BILLING_OPTIONS.JOB_SEARCH_PLAN,
    mode: 'payment',
    priceId: String(env.STRIPE_PRICE_ID_JOB_SEARCH || '').trim()
  };
}

function buildCheckoutSessionParams({
  planKey,
  mode,
  priceId,
  userId,
  userEmail,
  stripeCustomerId = null,
  successUrl,
  cancelUrl
}) {
  const params = new URLSearchParams();
  params.set('mode', mode);
  params.set('success_url', String(successUrl || '').trim());
  params.set('cancel_url', String(cancelUrl || '').trim());
  params.set('line_items[0][price]', String(priceId || '').trim());
  params.set('line_items[0][quantity]', '1');
  if (userId) {
    params.set('client_reference_id', String(userId));
    params.set('metadata[user_id]', String(userId));
    params.set('metadata[userId]', String(userId));
  }
  if (planKey) {
    params.set('metadata[plan_key]', String(planKey));
    params.set('metadata[internal_plan_key]', String(planKey));
  }
  params.set('metadata[source]', 'applictus_checkout');

  if (stripeCustomerId) {
    params.set('customer', String(stripeCustomerId));
  } else if (userEmail) {
    params.set('customer_email', String(userEmail));
  }

  if (mode === 'subscription') {
    if (userId) {
      params.set('subscription_data[metadata][user_id]', String(userId));
      params.set('subscription_data[metadata][userId]', String(userId));
    }
    if (planKey) {
      params.set('subscription_data[metadata][plan_key]', String(planKey));
    }
  }

  if (mode === 'payment') {
    if (userId) {
      params.set('payment_intent_data[metadata][user_id]', String(userId));
      params.set('payment_intent_data[metadata][userId]', String(userId));
    }
    if (planKey) {
      params.set('payment_intent_data[metadata][plan_key]', String(planKey));
    }
  }

  return params;
}

async function createCheckoutSession({
  stripeSecretKey,
  planKey,
  mode,
  priceId,
  userId,
  userEmail,
  stripeCustomerId = null,
  successUrl,
  cancelUrl,
  fetchImpl = globalThis.fetch
}) {
  const secret = String(stripeSecretKey || '').trim();
  if (!secret) {
    const err = new Error('BILLING_NOT_CONFIGURED');
    err.code = 'BILLING_NOT_CONFIGURED';
    throw err;
  }
  if (!priceId) {
    const err = new Error('BILLING_PRICE_NOT_CONFIGURED');
    err.code = 'BILLING_PRICE_NOT_CONFIGURED';
    throw err;
  }
  if (!successUrl || !cancelUrl) {
    const err = new Error('BILLING_URLS_INVALID');
    err.code = 'BILLING_URLS_INVALID';
    throw err;
  }
  if (typeof fetchImpl !== 'function') {
    const err = new Error('FETCH_UNAVAILABLE');
    err.code = 'FETCH_UNAVAILABLE';
    throw err;
  }

  const params = buildCheckoutSessionParams({
    planKey,
    mode,
    priceId,
    userId,
    userEmail,
    stripeCustomerId,
    successUrl,
    cancelUrl
  });

  const response = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const stripeMessage =
      payload?.error?.message || payload?.message || `Stripe request failed (${response.status})`;
    const err = new Error(stripeMessage);
    err.code = payload?.error?.code || 'STRIPE_CHECKOUT_FAILED';
    err.status = response.status;
    err.raw = payload;
    throw err;
  }
  return payload;
}

function parseStripeSignatureHeader(signatureHeader) {
  const header = String(signatureHeader || '').trim();
  if (!header) {
    return { timestamp: null, signatures: [] };
  }
  const entries = header
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  let timestamp = null;
  const signatures = [];
  for (const entry of entries) {
    const [key, value] = entry.split('=');
    if (!key || !value) {
      continue;
    }
    if (key === 't') {
      const asNumber = Number(value);
      timestamp = Number.isFinite(asNumber) ? asNumber : null;
      continue;
    }
    if (key === 'v1') {
      signatures.push(value);
    }
  }
  return { timestamp, signatures };
}

function timingSafeHexEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'hex');
  const right = Buffer.from(String(b || ''), 'hex');
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function constructWebhookEvent({
  rawBody,
  signatureHeader,
  webhookSecret,
  toleranceSeconds = 300,
  nowMs = Date.now()
}) {
  const secret = String(webhookSecret || '').trim();
  if (!secret) {
    const err = new Error('BILLING_WEBHOOK_NOT_CONFIGURED');
    err.code = 'BILLING_WEBHOOK_NOT_CONFIGURED';
    throw err;
  }
  const raw =
    Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody === undefined ? '' : rawBody);
  if (!raw) {
    const err = new Error('WEBHOOK_BODY_REQUIRED');
    err.code = 'WEBHOOK_BODY_REQUIRED';
    throw err;
  }

  const { timestamp, signatures } = parseStripeSignatureHeader(signatureHeader);
  if (!timestamp || !signatures.length) {
    const err = new Error('STRIPE_SIGNATURE_INVALID');
    err.code = 'STRIPE_SIGNATURE_INVALID';
    throw err;
  }

  if (Number.isFinite(toleranceSeconds) && toleranceSeconds > 0) {
    const ageSeconds = Math.abs(Math.floor(nowMs / 1000) - Number(timestamp));
    if (ageSeconds > toleranceSeconds) {
      const err = new Error('STRIPE_SIGNATURE_EXPIRED');
      err.code = 'STRIPE_SIGNATURE_EXPIRED';
      throw err;
    }
  }

  const signedPayload = `${timestamp}.${raw}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');
  const verified = signatures.some((candidate) => timingSafeHexEqual(expected, candidate));
  if (!verified) {
    const err = new Error('STRIPE_SIGNATURE_INVALID');
    err.code = 'STRIPE_SIGNATURE_INVALID';
    throw err;
  }

  try {
    return JSON.parse(raw);
  } catch (_) {
    const err = new Error('WEBHOOK_PAYLOAD_INVALID');
    err.code = 'WEBHOOK_PAYLOAD_INVALID';
    throw err;
  }
}

function computeJobSearchPlanExpiration({ now = new Date(), days = 90 } = {}) {
  const base = now instanceof Date ? now : new Date(now);
  const expires = new Date(base.getTime() + Math.max(1, Number(days) || 90) * 24 * 60 * 60 * 1000);
  return expires.toISOString();
}

function isJobSearchPlanActive(userLike, nowMs = Date.now()) {
  if (!userLike) {
    return false;
  }
  const billingType = String(userLike.billing_type || '').toLowerCase();
  if (billingType !== BILLING_TYPES.ONE_TIME) {
    return false;
  }
  if (!userLike.plan_expires_at) {
    return false;
  }
  const expiryMs = new Date(userLike.plan_expires_at).getTime();
  return Number.isFinite(expiryMs) && expiryMs > nowMs;
}

module.exports = {
  BILLING_OPTIONS,
  BILLING_TYPES,
  normalizeBillingOption,
  getCheckoutPlanConfig,
  createCheckoutSession,
  parseStripeSignatureHeader,
  constructWebhookEvent,
  computeJobSearchPlanExpiration,
  isJobSearchPlanActive
};
