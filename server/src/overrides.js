const { ApplicationStatus } = require('../../shared/types');
const { createUserAction } = require('./userActions');

function nowIso() {
  return new Date().toISOString();
}

function applyStatusOverride(db, { userId, application, nextStatus, explanation }) {
  const statusExplanation = explanation ? String(explanation).trim() : 'User override.';
  const previousStatus = application.current_status || ApplicationStatus.UNKNOWN;

  db.prepare(
    `UPDATE job_applications
     SET current_status = ?, status = ?, status_confidence = ?, status_explanation = ?,
         status_updated_at = ?, status_source = 'user', suggested_status = NULL,
         suggested_confidence = NULL, suggested_explanation = NULL, user_override = 1,
         updated_at = ?
     WHERE id = ?`
  ).run(nextStatus, nextStatus, 1.0, statusExplanation, nowIso(), nowIso(), application.id);

  createUserAction(db, {
    userId,
    applicationId: application.id,
    actionType: 'STATUS_OVERRIDE',
    payload: {
      previous_value: previousStatus,
      new_value: nextStatus,
      explanation: statusExplanation
    }
  });

  return db.prepare('SELECT * FROM job_applications WHERE id = ?').get(application.id);
}

module.exports = {
  applyStatusOverride
};
