const { Pool } = require('pg');
const { getRuntimeDatabaseConfig } = require('./dbConfig');

const GLOBAL_POOL_KEY = '__APPLICTUS_PG_POOL__';
const POOL_OPTIONS = {
  max: 1,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 10_000,
  allowExitOnIdle: true
};

function convertPlaceholders(sql = '') {
  let index = 0;
  let inSingle = false;
  let inDouble = false;
  let out = '';
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (inSingle) {
      out += ch;
      if (ch === "'" && next === "'") {
        // escaped single quote ''
        out += next;
        i += 1;
      } else if (ch === "'") {
        inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      out += ch;
      if (ch === '"' && next === '"') {
        // escaped double quote ""
        out += next;
        i += 1;
      } else if (ch === '"') {
        inDouble = false;
      }
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      out += ch;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      out += ch;
      continue;
    }
    if (ch === '?') {
      index += 1;
      out += `$${index}`;
    } else {
      out += ch;
    }
  }
  return out;
}

function redactDebugValue(value) {
  if (value === null || value === undefined) return value;
  if (Buffer.isBuffer(value)) return `<Buffer len=${value.length}>`;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return value;
  if (typeof value !== 'string') return `<${typeof value}>`;

  const text = value;
  const lower = text.toLowerCase();
  const looksLikeJwt = /^eyJ[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+\\./.test(text);
  const looksLikeGoogleToken = text.startsWith('ya29.') || text.startsWith('1//');
  const looksSensitive =
    looksLikeJwt ||
    looksLikeGoogleToken ||
    lower.includes('bearer ') ||
    lower.includes('refresh_token') ||
    lower.includes('access_token');

  if (looksSensitive) {
    return `<redacted len=${text.length}>`;
  }
  if (text.length > 120) {
    return `${text.slice(0, 60)}…<len=${text.length}>`;
  }
  return text;
}

function debugParamSummary(params) {
  return (params || []).map((p) => ({
    type: p === null ? 'null' : typeof p,
    value: redactDebugValue(p)
  }));
}

function createPool(databaseUrl) {
  if (!databaseUrl) {
    const err = new Error('DATABASE_URL_MISSING');
    err.code = 'DATABASE_URL_MISSING';
    throw err;
  }
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    ...POOL_OPTIONS
  });
  pool.on('error', (err) => {
    if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
      // eslint-disable-next-line no-console
      console.error('[pgDb] pool.error', {
        code: err && err.code ? String(err.code) : null,
        message: err && err.message ? String(err.message) : null
      });
    }
  });
  if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
    const endpoint = getDatabaseEndpoint(databaseUrl);
    // eslint-disable-next-line no-console
    console.debug('[pgDb] pool.init', {
      host: endpoint.host,
      port: endpoint.port,
      source: getRuntimeDatabaseConfig().source,
      max: POOL_OPTIONS.max,
      connectionTimeoutMillis: POOL_OPTIONS.connectionTimeoutMillis,
      idleTimeoutMillis: POOL_OPTIONS.idleTimeoutMillis
    });
  }
  return pool;
}

function getDatabaseEndpoint(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    return {
      host: url.hostname || null,
      port: url.port || null
    };
  } catch (_) {
    return { host: null, port: null };
  }
}

function getGlobalPoolState() {
  if (!globalThis[GLOBAL_POOL_KEY]) {
    globalThis[GLOBAL_POOL_KEY] = { url: null, pool: null };
  }
  return globalThis[GLOBAL_POOL_KEY];
}

function getOrCreatePool(databaseUrl) {
  const state = getGlobalPoolState();
  if (state.pool && state.url === databaseUrl) {
    return state.pool;
  }
  if (state.pool && state.url !== databaseUrl) {
    state.pool.end().catch(() => {});
  }
  state.url = databaseUrl;
  state.pool = createPool(databaseUrl);
  return state.pool;
}

function prepareFactory(pool, clientOverride) {
  return function prepare(sql) {
    const text = convertPlaceholders(sql);
    const runQuery = async (params = []) => {
      const client = clientOverride || (await pool.connect());
      try {
        try {
          const result = await client.query(text, params);
          return result;
        } catch (err) {
          if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
            // eslint-disable-next-line no-console
            console.error('[pgDb] query failed', {
              code: err.code || null,
              message: err.message || String(err)
            });
            // eslint-disable-next-line no-console
            console.error('[pgDb] failed sql', text);
            // eslint-disable-next-line no-console
            console.error('[pgDb] failed params', debugParamSummary(params));
          }
          throw err;
        }
      } finally {
        if (!clientOverride) client.release();
      }
    };
    return {
      async get(...args) {
        const result = await runQuery(args);
        return result.rows[0] || null;
      },
      async all(...args) {
        const result = await runQuery(args);
        return result.rows;
      },
      async run(...args) {
        const result = await runQuery(args);
        return {
          changes: result.rowCount,
          lastInsertRowid: result.rows?.[0]?.id || null
        };
      }
    };
  };
}

function createDb(databaseUrl, poolOverride = null) {
  const runtime = getRuntimeDatabaseConfig();
  const connectionString = databaseUrl || runtime.url;
  const pool = poolOverride || getOrCreatePool(connectionString);
  const db = { isAsync: true };
  db.prepare = prepareFactory(pool, null);
  db.transaction = async (fn) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const txDb = { prepare: prepareFactory(pool, client), isAsync: true };
      const result = await fn(txDb);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  };
  db.close = async () => pool.end();
  return db;
}

module.exports = {
  createDb,
  convertPlaceholders
};
