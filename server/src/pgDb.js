const { Pool } = require('pg');

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

function createPool(databaseUrl) {
  const ssl =
    databaseUrl && databaseUrl.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : { rejectUnauthorized: false };
  return new Pool({
    connectionString: databaseUrl,
    ssl
  });
}

function prepareFactory(pool, clientOverride) {
  return function prepare(sql) {
    const text = convertPlaceholders(sql);
    const runQuery = async (params = []) => {
      const client = clientOverride || (await pool.connect());
      try {
        if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
          // eslint-disable-next-line no-console
          console.debug('[pgDb] query', text, params);
        }
        const result = await client.query(text, params);
        return result;
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
  const pool = poolOverride || createPool(databaseUrl);
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
