function getPrimaryDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || process.env.SUPABASE_DB_URL || '';
}

function getDirectDatabaseUrl() {
  return process.env.DIRECT_URL || process.env.SUPABASE_DIRECT_URL || '';
}

function isVercelRuntime() {
  const vercelFlag = String(process.env.VERCEL || '').toLowerCase();
  if (vercelFlag === '1' || vercelFlag === 'true') {
    return true;
  }
  return Boolean(process.env.VERCEL_ENV || process.env.VERCEL_URL);
}

function getRuntimeDatabaseConfig() {
  const primary = getPrimaryDatabaseUrl();
  const direct = getDirectDatabaseUrl();
  if (isVercelRuntime()) {
    return { url: primary, source: 'primary' };
  }
  if (primary) {
    return { url: primary, source: 'primary' };
  }
  if (direct) {
    return { url: direct, source: 'direct' };
  }
  return { url: '', source: 'none' };
}

function getRuntimeDatabaseUrl() {
  return getRuntimeDatabaseConfig().url;
}

module.exports = {
  getPrimaryDatabaseUrl,
  getRuntimeDatabaseConfig,
  getRuntimeDatabaseUrl,
  isVercelRuntime
};
