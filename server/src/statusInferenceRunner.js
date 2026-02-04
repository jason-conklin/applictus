const crypto = require('crypto');
const { ApplicationStatus } = require('../../shared/types');
const { inferStatus, TERMINAL_STATUSES, STATUS_PRIORITY } = require('../../shared/statusInference');
const { logInfo } = require('./logger');

function nowIso() {
  return new Date().toISOString();
}

async function awaitMaybe(value) {
  return value && typeof value.then === 'function' ? await value : value;
}

function normalizeRowList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.rows)) return value.rows;
  // Tolerate accidental single-row objects.
  if (value && typeof value === 'object' && value.id) return [value];
  return [];
}

function logUserAction(db, { userId, applicationId, actionType, payload }) {
  const stmt = db.prepare(
    `INSERT INTO user_actions (id, user_id, application_id, action_type, action_payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  return stmt.run(
    crypto.randomUUID(),
    userId,
    applicationId,
    actionType,
    payload ? JSON.stringify(payload) : null,
    nowIso()
  );
}

function shouldBlockAuto(application, nextStatus, confidence) {
  const current = application.current_status || ApplicationStatus.UNKNOWN;
  if (application.user_override && nextStatus !== current) {
    return 'user_override';
  }
  if (TERMINAL_STATUSES.has(current) && nextStatus !== current) {
    if (
      current === ApplicationStatus.OFFER_RECEIVED &&
      nextStatus === ApplicationStatus.REJECTED
    ) {
      const currentConfidence = application.status_confidence || 0;
      if ((confidence || 0) >= currentConfidence) {
        return null;
      }
    }
    return 'terminal';
  }
  const currentOrder = STATUS_PRIORITY[current] || 0;
  const nextOrder = STATUS_PRIORITY[nextStatus] || 0;
  if (nextOrder < currentOrder) {
    return 'regression';
  }
  return null;
}

function shouldBlockSuggestion(application, nextStatus) {
  if (!nextStatus) {
    return 'missing';
  }
  const current = application.current_status || ApplicationStatus.UNKNOWN;
  if (application.user_override && nextStatus !== current) {
    return 'user_override';
  }
  if (TERMINAL_STATUSES.has(current)) {
    return 'terminal';
  }
  if (nextStatus !== ApplicationStatus.GHOSTED) {
    const currentOrder = STATUS_PRIORITY[current] || 0;
    const nextOrder = STATUS_PRIORITY[nextStatus] || 0;
    if (nextOrder < currentOrder) {
      return 'regression';
    }
  }
  if (nextStatus === current) {
    return 'same_status';
  }
  return null;
}

async function runStatusInferenceForApplicationAsync(db, userId, applicationId) {
  try {
    const application = await awaitMaybe(
      db
        .prepare('SELECT * FROM job_applications WHERE id = ? AND user_id = ?')
        .get(applicationId, userId)
    );
    if (!application) {
      return { status: 'not_found' };
    }
    if (application.archived) {
      return { status: 'archived' };
    }

    const rawEvents = await awaitMaybe(
      db
        .prepare(
          `SELECT id, detected_type, confidence_score, classification_confidence, subject, snippet,
                  internal_date, created_at
           FROM email_events
           WHERE application_id = ?
           ORDER BY internal_date DESC`
        )
        .all(applicationId)
    );
    const events = normalizeRowList(rawEvents);
    if (
      process.env.JOBTRACK_LOG_LEVEL === 'debug' &&
      rawEvents &&
      rawEvents !== events &&
      !Array.isArray(rawEvents)
    ) {
      // eslint-disable-next-line no-console
      console.debug('[inference] normalized events shape', {
        type: typeof rawEvents,
        keys: rawEvents && typeof rawEvents === 'object' ? Object.keys(rawEvents).slice(0, 8) : null,
        length: events.length
      });
    }

    const result = inferStatus(application, events);

    logInfo('inference.evaluate', {
      userId,
      applicationId,
      inferredStatus: result.inferred_status,
      confidence: result.confidence,
      suggestedOnly: result.suggested_only,
      eventIds: result.event_ids
    });

    await awaitMaybe(
      logUserAction(db, {
        userId,
        applicationId,
        actionType: 'INFER_STATUS',
        payload: {
          inferred_status: result.inferred_status,
          confidence: result.confidence,
          suggested_only: result.suggested_only,
          explanation: result.explanation,
          event_ids: result.event_ids
        }
      })
    );

    const updates = { inference_updated_at: nowIso() };
    let applied = false;
    let suggested = false;
    let blocked = null;

    if (result.suggested_only && result.inferred_status !== ApplicationStatus.UNKNOWN) {
      blocked = shouldBlockSuggestion(application, result.inferred_status);
      if (!blocked) {
        updates.suggested_status = result.inferred_status;
        updates.suggested_confidence = result.confidence;
        updates.suggested_explanation = result.explanation;
        suggested = true;
      }
    } else if (result.confidence >= 0.9 && result.inferred_status !== ApplicationStatus.UNKNOWN) {
      blocked = shouldBlockAuto(application, result.inferred_status, result.confidence);
      if (!blocked) {
        updates.current_status = result.inferred_status;
        updates.status = result.inferred_status;
        updates.status_confidence = result.confidence;
        updates.status_explanation = result.explanation;
        updates.status_updated_at = nowIso();
        updates.status_source = 'inferred';
        updates.suggested_status = null;
        updates.suggested_confidence = null;
        updates.suggested_explanation = null;
        applied = true;
      }
    } else {
      updates.suggested_status = null;
      updates.suggested_confidence = null;
      updates.suggested_explanation = null;
    }

    if (blocked) {
      logInfo('inference.blocked', {
        userId,
        applicationId,
        inferredStatus: result.inferred_status,
        reason: blocked
      });
    }

    if (Object.keys(updates).length) {
      updates.updated_at = nowIso();
      const keys = Object.keys(updates);
      const setClause = keys.map((key) => `${key} = ?`).join(', ');
      const values = keys.map((key) => updates[key]);
      values.push(applicationId);
      await awaitMaybe(db.prepare(`UPDATE job_applications SET ${setClause} WHERE id = ?`).run(...values));
    }

    return {
      status: 'ok',
      inferred_status: result.inferred_status,
      applied,
      suggested,
      blocked
    };
  } catch (err) {
    logInfo('inference.error', {
      userId,
      applicationId,
      code: err && err.code ? String(err.code) : null,
      message: err && err.message ? String(err.message) : String(err)
    });
    return { status: 'error' };
  }
}

function runStatusInferenceForApplication(db, userId, applicationId) {
  // Keep SQLite behavior synchronous (tests rely on this), but support async Postgres adapter safely.
  if (db && db.isAsync) {
    return runStatusInferenceForApplicationAsync(db, userId, applicationId);
  }

  const application = db
    .prepare('SELECT * FROM job_applications WHERE id = ? AND user_id = ?')
    .get(applicationId, userId);
  if (!application) {
    return { status: 'not_found' };
  }
  if (application.archived) {
    return { status: 'archived' };
  }
  const events = db
    .prepare(
      `SELECT id, detected_type, confidence_score, classification_confidence, subject, snippet,
              internal_date, created_at
       FROM email_events
       WHERE application_id = ?
       ORDER BY internal_date DESC`
    )
    .all(applicationId);

  const result = inferStatus(application, events);

  logInfo('inference.evaluate', {
    userId,
    applicationId,
    inferredStatus: result.inferred_status,
    confidence: result.confidence,
    suggestedOnly: result.suggested_only,
    eventIds: result.event_ids
  });

  logUserAction(db, {
    userId,
    applicationId,
    actionType: 'INFER_STATUS',
    payload: {
      inferred_status: result.inferred_status,
      confidence: result.confidence,
      suggested_only: result.suggested_only,
      explanation: result.explanation,
      event_ids: result.event_ids
    }
  });

  const updates = { inference_updated_at: nowIso() };
  let applied = false;
  let suggested = false;
  let blocked = null;

  if (result.suggested_only && result.inferred_status !== ApplicationStatus.UNKNOWN) {
    blocked = shouldBlockSuggestion(application, result.inferred_status);
    if (!blocked) {
      updates.suggested_status = result.inferred_status;
      updates.suggested_confidence = result.confidence;
      updates.suggested_explanation = result.explanation;
      suggested = true;
    }
  } else if (result.confidence >= 0.9 && result.inferred_status !== ApplicationStatus.UNKNOWN) {
    blocked = shouldBlockAuto(application, result.inferred_status, result.confidence);
    if (!blocked) {
      updates.current_status = result.inferred_status;
      updates.status = result.inferred_status;
      updates.status_confidence = result.confidence;
      updates.status_explanation = result.explanation;
      updates.status_updated_at = nowIso();
      updates.status_source = 'inferred';
      updates.suggested_status = null;
      updates.suggested_confidence = null;
      updates.suggested_explanation = null;
      applied = true;
    }
  } else {
    updates.suggested_status = null;
    updates.suggested_confidence = null;
    updates.suggested_explanation = null;
  }

  if (blocked) {
    logInfo('inference.blocked', {
      userId,
      applicationId,
      inferredStatus: result.inferred_status,
      reason: blocked
    });
  }

  if (Object.keys(updates).length) {
    updates.updated_at = nowIso();
    const keys = Object.keys(updates);
    const setClause = keys.map((key) => `${key} = ?`).join(', ');
    const values = keys.map((key) => updates[key]);
    values.push(applicationId);
    db.prepare(`UPDATE job_applications SET ${setClause} WHERE id = ?`).run(...values);
  }

  return {
    status: 'ok',
    inferred_status: result.inferred_status,
    applied,
    suggested,
    blocked
  };
}

module.exports = {
  runStatusInferenceForApplication
};
