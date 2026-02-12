const test = require('node:test');
const assert = require('node:assert/strict');

const { getRuntimeDatabaseConfig } = require('../src/dbConfig');

test('runtime db config prefers primary DATABASE_URL style vars', () => {
  const prev = {
    DATABASE_URL: process.env.DATABASE_URL,
    SUPABASE_DATABASE_URL: process.env.SUPABASE_DATABASE_URL,
    SUPABASE_DB_URL: process.env.SUPABASE_DB_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    SUPABASE_DIRECT_URL: process.env.SUPABASE_DIRECT_URL,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL
  };
  try {
    process.env.DATABASE_URL = 'postgres://primary';
    process.env.DIRECT_URL = 'postgres://direct';
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_URL;
    const cfg = getRuntimeDatabaseConfig();
    assert.equal(cfg.url, 'postgres://primary');
    assert.equal(cfg.source, 'primary');
  } finally {
    Object.entries(prev).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test('runtime db config does not use DIRECT_URL on Vercel runtime', () => {
  const prev = {
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL
  };
  try {
    process.env.DATABASE_URL = 'postgres://pooled';
    process.env.DIRECT_URL = 'postgres://direct';
    process.env.VERCEL = '1';
    const cfg = getRuntimeDatabaseConfig();
    assert.equal(cfg.url, 'postgres://pooled');
    assert.equal(cfg.source, 'primary');
  } finally {
    Object.entries(prev).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

