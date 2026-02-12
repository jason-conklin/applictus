const { getRuntimeDatabaseUrl } = require('./dbConfig');

function coalesceTimestamps(fields) {
  const usePg = !!getRuntimeDatabaseUrl() && process.env.NODE_ENV !== 'test';
  const parts = fields.map((f) => (usePg ? `${f}::timestamptz` : f));
  return `COALESCE(${parts.join(', ')})`;
}

module.exports = { coalesceTimestamps };
