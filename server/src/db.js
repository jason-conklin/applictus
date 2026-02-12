const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createDb: createPgDb } = require('./pgDb');
const { getRuntimeDatabaseUrl } = require('./dbConfig');

let Database;
try {
  // Load here so we can surface clearer errors if native module fails.
  Database = require('better-sqlite3');
} catch (err) {
  const help = [
    'Failed to load better-sqlite3 (native module).',
    'Use Node 20 LTS, then reinstall dependencies:',
    '- delete node_modules and package-lock.json',
    '- npm install',
    'If needed: npm rebuild better-sqlite3 --build-from-source'
  ].join(' ');
  const wrapped = new Error(`${help}. Original error: ${err.message}`);
  wrapped.code = err.code || 'SQLITE_NATIVE_LOAD_FAILED';
  wrapped.cause = err;
  throw wrapped;
}

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'jobtrack.db');

function openDb() {
  const isTestEnv =
    process.env.NODE_ENV === 'test' ||
    process.env.npm_lifecycle_event === 'test' ||
    process.env.RUNNING_TESTS === '1';
  const forcePg = process.env.FORCE_POSTGRES === '1';
  const runtimeDatabaseUrl = getRuntimeDatabaseUrl();

  if (runtimeDatabaseUrl && !isTestEnv && (forcePg || process.env.NODE_ENV === 'production')) {
    const pg = createPgDb(runtimeDatabaseUrl);
    pg.isAsync = true;
    return pg;
  }
  const dbPath = process.env.JOBTRACK_DB_PATH || DEFAULT_DB_PATH;
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  let db;
  try {
    db = new Database(dbPath);
  } catch (err) {
    const help = [
      'Failed to open SQLite database via better-sqlite3.',
      'Ensure better-sqlite3 is built for your platform (Node 20 LTS recommended).',
      'Try deleting node_modules and package-lock.json, then npm install.',
      'If needed: npm rebuild better-sqlite3 --build-from-source'
    ].join(' ');
    const wrapped = new Error(`${help}. DB path: ${dbPath}. Original error: ${err.message}`);
    wrapped.code = err.code || 'SQLITE_NATIVE_OPEN_FAILED';
    wrapped.cause = err;
    throw wrapped;
  }
  db.pragma('foreign_keys = ON');
  db.isAsync = false;
  return db;
}

function listMigrationFiles(adapter) {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .filter((file) => {
      const isPg = /_postgres\.sql$/i.test(file);
      return adapter === 'postgres' ? isPg : !isPg;
    })
    .sort();
}

function migrate(db) {
  const adapter = typeof db.exec === 'function' ? 'sqlite' : 'postgres';

  if (adapter === 'postgres') {
    // Postgres migrations are applied manually; skip auto-run to avoid async refactor.
    return;
  }

  const migrationFiles = listMigrationFiles(adapter);

  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)'
  );
  const applied = new Set(
    db
      .prepare('SELECT name FROM schema_migrations')
      .all()
      .map((row) => row.name)
  );

  for (const file of migrationFiles) {
    if (applied.has(file)) {
      continue;
    }
    const fullPath = path.join(__dirname, '..', 'migrations', file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(
      file,
      new Date().toISOString()
    );
  }

  // Resume Curator tables (idempotent, ensure present even before dedicated migrations ship)
  db.exec(`
    CREATE TABLE IF NOT EXISTS resumes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK (source_type IN ('upload','paste')),
      original_filename TEXT,
      mime_type TEXT,
      file_size INTEGER,
      extraction_method TEXT,
      extraction_warnings TEXT,
      resume_text TEXT NOT NULL,
      resume_json TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);
    CREATE INDEX IF NOT EXISTS idx_resumes_user_default ON resumes(user_id, is_default);

    CREATE TABLE IF NOT EXISTS resume_tailor_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      company_name TEXT,
      job_title TEXT,
      job_location TEXT,
      job_url TEXT,
      jd_source TEXT NOT NULL CHECK (jd_source IN ('paste','url')),
      job_description_text TEXT NOT NULL,
      resume_id TEXT NOT NULL,
      options_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','generated','exported')),
      linked_application_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_rts_user_id ON resume_tailor_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_rts_resume_id ON resume_tailor_sessions(resume_id);
    CREATE INDEX IF NOT EXISTS idx_rts_company_job ON resume_tailor_sessions(user_id, company_name, job_title);
    CREATE INDEX IF NOT EXISTS idx_rts_updated ON resume_tailor_sessions(user_id, updated_at);

    CREATE TABLE IF NOT EXISTS resume_tailor_versions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      generated_resume_text TEXT NOT NULL,
      generated_resume_json TEXT,
      change_log_json TEXT NOT NULL,
      ats_score INTEGER,
      ats_keywords_json TEXT,
      model_info_json TEXT,
      user_edited_resume_text TEXT,
      exported_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES resume_tailor_sessions(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rtv_session_version ON resume_tailor_versions(session_id, version_number);
    CREATE INDEX IF NOT EXISTS idx_rtv_session_id ON resume_tailor_versions(session_id);

    CREATE TABLE IF NOT EXISTS resume_curator_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      base_resume_id TEXT NOT NULL,
      company TEXT,
      role_title TEXT,
      job_url TEXT,
      job_description TEXT NOT NULL,
      target_keywords TEXT,
      tone TEXT,
      focus TEXT,
      length TEXT,
      include_cover_letter INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rcr_user ON resume_curator_runs(user_id);
    CREATE INDEX IF NOT EXISTS idx_rcr_resume ON resume_curator_runs(base_resume_id);

    CREATE TABLE IF NOT EXISTS resume_curator_suggestions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      kind TEXT,
      section TEXT,
      change_text TEXT NOT NULL,
      reason_text TEXT,
      evidence_text TEXT,
      impact TEXT,
      status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','applied','dismissed')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES resume_curator_runs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_rcs_run ON resume_curator_suggestions(run_id);
    CREATE INDEX IF NOT EXISTS idx_rcs_status ON resume_curator_suggestions(run_id, status);

    CREATE TABLE IF NOT EXISTS resume_curator_versions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      version_label TEXT NOT NULL,
      ats_score INTEGER,
      tailored_text TEXT NOT NULL,
      exported_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES resume_curator_runs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_rcv_run ON resume_curator_versions(run_id);
  `);
  ensureResumeColumns(db);
}

let emailEventColumnsCache = null;
function getEmailEventColumns(db) {
  if (emailEventColumnsCache) {
    return emailEventColumnsCache;
  }
  const rows = db.prepare('PRAGMA table_info(email_events)').all();
  emailEventColumnsCache = new Set(rows.map((r) => r.name));
  return emailEventColumnsCache;
}

function ensureResumeColumns(db) {
  const rows = db.prepare('PRAGMA table_info(resumes)').all();
  const cols = new Set(rows.map((r) => r.name));
  const alter = (sql) => db.exec(sql);
  if (!cols.has('mime_type')) {
    alter("ALTER TABLE resumes ADD COLUMN mime_type TEXT");
  }
  if (!cols.has('file_size')) {
    alter("ALTER TABLE resumes ADD COLUMN file_size INTEGER");
  }
  if (!cols.has('extraction_method')) {
    alter("ALTER TABLE resumes ADD COLUMN extraction_method TEXT");
  }
  if (!cols.has('extraction_warnings')) {
    alter("ALTER TABLE resumes ADD COLUMN extraction_warnings TEXT");
  }
}

function toJsonString(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (err) {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function createResume(
  db,
  {
    userId,
    name,
    sourceType,
    originalFilename,
    mimeType,
    fileSize,
    extractionMethod,
    extractionWarnings,
    resumeText,
    resumeJson,
    isDefault
  }
) {
  const id = uuid();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO resumes
     (id, user_id, name, source_type, original_filename, mime_type, file_size, extraction_method, extraction_warnings, resume_text, resume_json, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    name,
    sourceType,
    originalFilename || null,
    mimeType || null,
    fileSize || null,
    extractionMethod || null,
    extractionWarnings || null,
    resumeText,
    toJsonString(resumeJson),
    isDefault ? 1 : 0,
    ts,
    ts
  );
  return getResume(db, userId, id);
}

function setDefaultResume(db, { userId, resumeId }) {
  const tx = db.transaction(() => {
    db.prepare('UPDATE resumes SET is_default = 0 WHERE user_id = ?').run(userId);
    db.prepare('UPDATE resumes SET is_default = 1 WHERE id = ? AND user_id = ?').run(resumeId, userId);
  });
  tx();
  return getResume(db, userId, resumeId);
}

function listResumes(db, userId) {
  return db
    .prepare(
      `SELECT * FROM resumes
       WHERE user_id = ?
       ORDER BY created_at DESC`
    )
    .all(userId);
}

function getResume(db, userId, resumeId) {
  return db
    .prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?')
    .get(resumeId, userId);
}

function createTailorSession(
  db,
  {
    userId,
    resumeId,
    companyName,
    jobTitle,
    jobLocation,
    jobUrl,
    jdSource,
    jobDescriptionText,
    optionsJson,
    linkedApplicationId
  }
) {
  const id = uuid();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO resume_tailor_sessions
     (id, user_id, company_name, job_title, job_location, job_url, jd_source, job_description_text, resume_id, options_json, status, linked_application_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`
  ).run(
    id,
    userId,
    companyName || null,
    jobTitle || null,
    jobLocation || null,
    jobUrl || null,
    jdSource,
    jobDescriptionText,
    resumeId,
    toJsonString(optionsJson) || '{}',
    linkedApplicationId || null,
    ts,
    ts
  );
  return getTailorSession(db, userId, id);
}

function listTailorSessions(db, userId, { limit = 20, offset = 0 } = {}) {
  return db
    .prepare(
      `SELECT * FROM resume_tailor_sessions
       WHERE user_id = ?
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(userId, limit, offset);
}

function getTailorSession(db, userId, sessionId) {
  return db
    .prepare('SELECT * FROM resume_tailor_sessions WHERE id = ? AND user_id = ?')
    .get(sessionId, userId);
}

function createTailorVersion(
  db,
  {
    sessionId,
    versionNumber,
    generatedResumeText,
    generatedResumeJson,
    changeLogJson,
    atsScore,
    atsKeywordsJson,
    modelInfoJson
  }
) {
  const id = uuid();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO resume_tailor_versions
     (id, session_id, version_number, generated_resume_text, generated_resume_json, change_log_json, ats_score, ats_keywords_json, model_info_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    sessionId,
    versionNumber,
    generatedResumeText,
    toJsonString(generatedResumeJson),
    toJsonString(changeLogJson) || '{}',
    Number.isFinite(atsScore) ? atsScore : null,
    toJsonString(atsKeywordsJson),
    toJsonString(modelInfoJson),
    ts
  );
  return db.prepare('SELECT * FROM resume_tailor_versions WHERE id = ?').get(id);
}

function listTailorVersions(db, sessionId) {
  return db
    .prepare(
      `SELECT * FROM resume_tailor_versions
       WHERE session_id = ?
       ORDER BY version_number ASC`
    )
    .all(sessionId);
}

function updateTailorSessionStatus(db, { userId, sessionId, status }) {
  const ts = nowIso();
  db.prepare(
    `UPDATE resume_tailor_sessions
     SET status = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(status, ts, sessionId, userId);
  return getTailorSession(db, userId, sessionId);
}

function saveUserEditedVersionText(db, { sessionId, versionId, userEditedResumeText }) {
  db.prepare(
    `UPDATE resume_tailor_versions
     SET user_edited_resume_text = ?
     WHERE id = ? AND session_id = ?`
  ).run(userEditedResumeText || null, versionId, sessionId);
  return db.prepare('SELECT * FROM resume_tailor_versions WHERE id = ?').get(versionId);
}

function markVersionExported(db, { sessionId, versionId }) {
  const ts = nowIso();
  db.prepare(
    `UPDATE resume_tailor_versions
     SET exported_at = ?
     WHERE id = ? AND session_id = ?`
  ).run(ts, versionId, sessionId);
  return db.prepare('SELECT * FROM resume_tailor_versions WHERE id = ?').get(versionId);
}

function createCuratorRun(db, payload) {
  const id = uuid();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO resume_curator_runs
     (id, user_id, base_resume_id, company, role_title, job_url, job_description, target_keywords, tone, focus, length, include_cover_letter, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    payload.userId,
    payload.baseResumeId,
    payload.company || null,
    payload.roleTitle || null,
    payload.jobUrl || null,
    payload.jobDescription,
    payload.targetKeywords ? toJsonString(payload.targetKeywords) : null,
    payload.tone || null,
    payload.focus || null,
    payload.length || null,
    payload.includeCoverLetter ? 1 : 0,
    ts
  );
  return getCuratorRun(db, payload.userId, id);
}

function getCuratorRun(db, userId, runId) {
  return db.prepare('SELECT * FROM resume_curator_runs WHERE id = ? AND user_id = ?').get(runId, userId);
}

function createCuratorSuggestions(db, runId, suggestions) {
  const ts = nowIso();
  const stmt = db.prepare(
    `INSERT INTO resume_curator_suggestions
     (id, run_id, kind, section, change_text, reason_text, evidence_text, impact, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?)`
  );
  const tx = db.transaction((items) => {
    (items || []).forEach((s) => {
      stmt.run(
        uuid(),
        runId,
        s.kind || null,
        s.section || null,
        s.change_text,
        s.reason_text || null,
        s.evidence_text || null,
        s.impact || null,
        ts
      );
    });
  });
  tx(suggestions);
  return listCuratorSuggestions(db, runId);
}

function listCuratorSuggestions(db, runId) {
  return db
    .prepare('SELECT * FROM resume_curator_suggestions WHERE run_id = ? ORDER BY created_at ASC')
    .all(runId);
}

function updateCuratorSuggestionStatus(db, runId, suggestionId, status) {
  db.prepare(
    'UPDATE resume_curator_suggestions SET status = ? WHERE id = ? AND run_id = ?'
  ).run(status, suggestionId, runId);
  return db.prepare('SELECT * FROM resume_curator_suggestions WHERE id = ? AND run_id = ?').get(suggestionId, runId);
}

function createCuratorVersion(db, { runId, versionLabel, atsScore, tailoredText, exportedAt = null }) {
  const id = uuid();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO resume_curator_versions
     (id, run_id, version_label, ats_score, tailored_text, exported_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, runId, versionLabel, atsScore ?? null, tailoredText, exportedAt, ts);
  return db.prepare('SELECT * FROM resume_curator_versions WHERE id = ?').get(id);
}

function listCuratorVersions(db, runId) {
  return db.prepare('SELECT * FROM resume_curator_versions WHERE run_id = ? ORDER BY created_at DESC').all(runId);
}

module.exports = {
  openDb,
  migrate,
  listMigrationFiles,
  getEmailEventColumns,
  createResume,
  setDefaultResume,
  listResumes,
  getResume,
  createTailorSession,
  listTailorSessions,
  getTailorSession,
  createTailorVersion,
  listTailorVersions,
  updateTailorSessionStatus,
  saveUserEditedVersionText,
  markVersionExported,
  createCuratorRun,
  getCuratorRun,
  createCuratorSuggestions,
  listCuratorSuggestions,
  updateCuratorSuggestionStatus,
  createCuratorVersion,
  listCuratorVersions
};
