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

function createRateLimiter({ windowMs = getWindowMs(), max = getMax(), keyGenerator } = {}) {
  const hits = new Map();

  return function rateLimit(req, res, next) {
    const key = keyGenerator ? keyGenerator(req) : req.ip;
    if (!key) {
      return next();
    }
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (entry.count >= max) {
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
