const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { openDb, migrate } = require('../src/db');
const {
  buildHintFingerprintFromEmail,
  upsertUserHint,
  findBestHint,
  toSubjectPattern
} = require('../src/hints');

function createInMemoryDb() {
  const prevPath = process.env.JOBTRACK_DB_PATH;
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.JOBTRACK_DB_PATH = ':memory:';
  process.env.NODE_ENV = 'test';
  try {
    const db = openDb();
    migrate(db);
    return {
      db,
      skipped: false,
      restore() {
        if (typeof db.close === 'function') {
          db.close();
        }
        if (prevPath === undefined) delete process.env.JOBTRACK_DB_PATH;
        else process.env.JOBTRACK_DB_PATH = prevPath;
        if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = prevNodeEnv;
      }
    };
  } catch (err) {
    return {
      db: null,
      skipped: /better-sqlite3|invalid ELF header|SQLITE_NATIVE_(OPEN|LOAD)_FAILED/i.test(
        String(err?.message || err)
      ),
      restore() {
        if (prevPath === undefined) delete process.env.JOBTRACK_DB_PATH;
        else process.env.JOBTRACK_DB_PATH = prevPath;
        if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = prevNodeEnv;
      }
    };
  }
}

function seedUser(db, email) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, email, name, created_at, updated_at, auth_provider)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, email, 'Tester', now, now, 'password');
  return id;
}

test('upsertUserHint merges same fingerprint and findBestHint uses precedence', async (t) => {
  const { db, restore, skipped } = createInMemoryDb();
  t.after(restore);
  if (skipped || !db) {
    t.skip('better-sqlite3 native module unavailable in this environment');
    return;
  }

  const userId = seedUser(db, 'hints-a@example.com');
  const otherUserId = seedUser(db, 'hints-b@example.com');

  const baseFingerprint = {
    provider_id: 'linkedin_jobs',
    from_domain: 'linkedin.com',
    subject_pattern: 'your application was sent to *',
    job_id_token: null,
    subject_text: 'Your application was sent to EarthCam'
  };

  const first = await upsertUserHint(db, userId, baseFingerprint, {
    role_override: 'Initial Role'
  });
  assert.ok(first?.id);

  const merged = await upsertUserHint(db, userId, baseFingerprint, {
    role_override: 'Updated Role',
    company_override: 'EarthCam'
  });
  assert.equal(merged.id, first.id);
  assert.equal(merged.role_override, 'Updated Role');

  await upsertUserHint(db, userId, {
    provider_id: 'linkedin_jobs',
    from_domain: 'linkedin.com',
    subject_pattern: null,
    job_id_token: '2708',
    subject_text: 'Your recent job application for Software Engineer | - 2708'
  }, {
    role_override: 'Software Engineer'
  });

  await upsertUserHint(db, userId, {
    provider_id: 'linkedin_jobs',
    from_domain: 'linkedin.com',
    subject_pattern: null,
    job_id_token: null,
    subject_text: ''
  }, {
    role_override: 'Domain fallback role'
  });

  const byJob = await findBestHint(db, userId, {
    provider_id: 'linkedin_jobs',
    from_domain: 'linkedin.com',
    subject_pattern: 'your application was sent to *',
    job_id_token: '2708',
    subject_text: 'Your application was sent to EarthCam'
  });
  assert.equal(byJob.match_reason, 'exact_job_id_token');
  assert.equal(byJob.hint.role_override, 'Software Engineer');

  const bySubject = await findBestHint(db, userId, {
    provider_id: 'linkedin_jobs',
    from_domain: 'linkedin.com',
    subject_pattern: 'your application was sent to *',
    job_id_token: null,
    subject_text: 'Your application was sent to EarthCam'
  });
  assert.equal(bySubject.match_reason, 'provider_domain_subject_pattern');
  assert.equal(bySubject.hint.role_override, 'Updated Role');

  const byDomain = await findBestHint(db, userId, {
    provider_id: 'linkedin_jobs',
    from_domain: 'linkedin.com',
    subject_pattern: 'completely unrelated subject *',
    job_id_token: null,
    subject_text: 'Completely unrelated subject text'
  });
  assert.equal(byDomain.match_reason, 'provider_domain');

  const crossUser = await findBestHint(db, otherUserId, {
    provider_id: 'linkedin_jobs',
    from_domain: 'linkedin.com',
    subject_pattern: 'your application was sent to *',
    job_id_token: '2708',
    subject_text: 'Your application was sent to EarthCam'
  });
  assert.equal(crossUser, null);
});

test('buildHintFingerprintFromEmail uses stable subject patterns', () => {
  assert.equal(toSubjectPattern('Thanks for applying to EarthCam'), 'thanks for applying to *');
  assert.equal(toSubjectPattern('Indeed Application: Mobile Developer'), 'indeed application:*');

  const fingerprint = buildHintFingerprintFromEmail({
    providerId: 'workable_candidates',
    fromDomain: 'candidates.workablemail.com',
    subject: 'Thanks for applying to EarthCam',
    text: 'Your application for the Jr. Python Developer job was submitted successfully.'
  });
  assert.equal(fingerprint.provider_id, 'workable_candidates');
  assert.equal(fingerprint.from_domain, 'candidates.workablemail.com');
  assert.equal(fingerprint.subject_pattern, 'thanks for applying to *');
});
