const crypto = require('crypto');

function nowIso() {
  return new Date().toISOString();
}

function createUserAction(db, { userId, applicationId, actionType, payload } = {}) {
  if (!db || !userId || !actionType) {
    return null;
  }
  db.prepare(
    `INSERT INTO user_actions (id, user_id, application_id, action_type, action_payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    userId,
    applicationId,
    actionType,
    payload ? JSON.stringify(payload) : null,
    nowIso()
  );
  return true;
}

module.exports = {
  createUserAction
};
