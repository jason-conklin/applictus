const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

function getLevel() {
  const envLevel = process.env.JOBTRACK_LOG_LEVEL;
  const defaultLevel =
    process.env.NODE_ENV === 'test' ? 'error' : 'info';
  const level = String(envLevel || defaultLevel).toLowerCase();
  return LEVELS[level] ?? LEVELS[defaultLevel];
}

function formatEntry(level, message, meta) {
  const base = {
    level,
    message,
    timestamp: new Date().toISOString()
  };
  if (meta && typeof meta === 'object') {
    return { ...base, ...meta };
  }
  return base;
}

function log(level, message, meta) {
  if (getLevel() < LEVELS[level]) {
    return;
  }
  const entry = formatEntry(level, message, meta);
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function logInfo(message, meta) {
  log('info', message, meta);
}

function logWarn(message, meta) {
  log('warn', message, meta);
}

function logError(message, meta) {
  log('error', message, meta);
}

function logDebug(message, meta) {
  log('debug', message, meta);
}

module.exports = {
  logInfo,
  logWarn,
  logError,
  logDebug
};
