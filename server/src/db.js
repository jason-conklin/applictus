const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
  return db;
}

function migrate(db) {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)'
  );
  const applied = new Set(
    db
      .prepare('SELECT name FROM schema_migrations')
      .all()
      .map((row) => row.name)
  );

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    if (applied.has(file)) {
      continue;
    }
    const fullPath = path.join(migrationsDir, file);
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

module.exports = {
  openDb,
  migrate,
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
  markVersionExported
};
