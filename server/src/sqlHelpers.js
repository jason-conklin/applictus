function coalesceTimestamps(fields) {
  const usePg = !!process.env.DATABASE_URL && process.env.NODE_ENV !== 'test';
  const parts = fields.map((f) => (usePg ? `${f}::timestamptz` : f));
  return `COALESCE(${parts.join(', ')})`;
}

module.exports = { coalesceTimestamps };
