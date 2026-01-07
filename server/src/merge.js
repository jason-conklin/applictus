const { createUserAction } = require('./userActions');

function nowIso() {
  return new Date().toISOString();
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function maxDate(a, b) {
  if (!a) {
    return b || null;
  }
  if (!b) {
    return a || null;
  }
  return a > b ? a : b;
}

function minDate(a, b) {
  if (!a) {
    return b || null;
  }
  if (!b) {
    return a || null;
  }
  return a < b ? a : b;
}

function mergeApplications(db, { userId, sourceId, targetId }) {
  if (sourceId === targetId) {
    return { status: 'invalid', error: 'SAME_ID' };
  }

  const tx = db.transaction(() => {
    const source = db
      .prepare('SELECT * FROM job_applications WHERE id = ? AND user_id = ?')
      .get(sourceId, userId);
    const target = db
      .prepare('SELECT * FROM job_applications WHERE id = ? AND user_id = ?')
      .get(targetId, userId);

    if (!source || !target) {
      return { status: 'not_found' };
    }

    const moved = db
      .prepare('SELECT COUNT(*) as count FROM email_events WHERE application_id = ?')
      .get(source.id).count;

    db.prepare('UPDATE email_events SET application_id = ? WHERE application_id = ?').run(
      target.id,
      source.id
    );

    const nextLast = maxDate(
      normalizeDate(target.last_activity_at),
      normalizeDate(source.last_activity_at)
    );
    const nextApplied = minDate(normalizeDate(target.applied_at), normalizeDate(source.applied_at));

    db.prepare(
      `UPDATE job_applications
       SET last_activity_at = ?, applied_at = COALESCE(?, applied_at), updated_at = ?
       WHERE id = ?`
    ).run(nextLast, nextApplied, nowIso(), target.id);

    db.prepare(
      'UPDATE job_applications SET archived = 1, user_override = 1, updated_at = ? WHERE id = ?'
    ).run(nowIso(), source.id);

    createUserAction(db, {
      userId,
      applicationId: target.id,
      actionType: 'MERGE_APPLICATION',
      payload: {
        source_id: source.id,
        target_id: target.id,
        moved_events: moved
      }
    });

    return { status: 'ok', movedEvents: moved, sourceId: source.id, targetId: target.id };
  });

  return tx();
}

module.exports = {
  mergeApplications
};
