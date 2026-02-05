const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX = 10;

function getWindowMs() {
  const value = Number(process.env.JOBTRACK_RATE_LIMIT_WINDOW_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_WINDOW_MS;
}

function getMax() {
  const value = Number(process.env.JOBTRACK_RATE_LIMIT_MAX);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX;
}

function createRateLimiter({ windowMs, max, keyGenerator } = {}) {
  const hits = new Map();
  let lastConfigKey = null;

  return function rateLimit(req, res, next) {
    const windowMsValue =
      Number.isFinite(windowMs) && windowMs > 0 ? windowMs : getWindowMs();
    const maxValue = Number.isFinite(max) && max > 0 ? max : getMax();
    const configKey = `${windowMsValue}:${maxValue}`;
    if (configKey !== lastConfigKey) {
      hits.clear();
      lastConfigKey = configKey;
    }
    const key = keyGenerator ? keyGenerator(req) : req.ip;
    if (!key) {
      return next();
    }
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMsValue });
      return next();
    }
    if (entry.count >= maxValue) {
      return res.status(429).json({
        error: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.'
      });
    }
    entry.count += 1;
    return next();
  };
}

module.exports = {
  createRateLimiter
};
