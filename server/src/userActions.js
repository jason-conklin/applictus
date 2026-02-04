const crypto = require('crypto');

function nowIso() {
  return new Date().toISOString();
}

function createUserAction(db, { userId, applicationId, actionType, payload } = {}) {
  if (!db || !userId || !actionType) {
    return null;
  }
  const result = db
    .prepare(
    `INSERT INTO user_actions (id, user_id, application_id, action_type, action_payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
    crypto.randomUUID(),
    userId,
    applicationId,
    actionType,
    payload ? JSON.stringify(payload) : null,
    nowIso()
  );
  // Postgres adapter returns a Promise; we intentionally don't await here (fire-and-forget),
  // but we must attach a catch to avoid unhandled rejections.
  if (result && typeof result.then === 'function') {
    result.catch((err) => {
      if (process.env.JOBTRACK_LOG_LEVEL === 'debug') {
        // eslint-disable-next-line no-console
        console.error('[userActions] insert failed', {
          code: err && err.code ? String(err.code) : null,
          message: err && err.message ? String(err.message) : String(err)
        });
      }
    });
  }
  return true;
}

module.exports = {
  createUserAction
};
