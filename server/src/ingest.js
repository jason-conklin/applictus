const crypto = require('crypto');
const { google } = require('googleapis');
const { getAuthorizedClient } = require('./email');
const { classifyEmail } = require('../../shared/emailClassifier');
const { matchAndAssignEvent } = require('./matching');
const { extractThreadIdentity } = require('../../shared/matching');
const { runStatusInferenceForApplication } = require('./statusInferenceRunner');
const { logInfo, logDebug } = require('./logger');

const REASON_KEYS = [
  'classified_not_job_related',
  'denylisted',
  'missing_identity',
  'low_confidence',
  'not_confident_for_create',
  'ambiguous_sender',
  'duplicate',
  'matched_existing',
  'auto_created',
  'unsorted_created'
];

function initReasonCounters() {
  return REASON_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function truncateSnippet(snippet, max = 140) {
  if (!snippet) {
    return null;
  }
  const clean = String(snippet).replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) : clean;
}

function parseHeader(headers, name) {
  const header = (headers || []).find(
    (entry) => entry.name && entry.name.toLowerCase() === name.toLowerCase()
  );
  return header?.value || '';
}

function recordSkipSample({ db, userId, provider, messageId, sender, subject, reasonCode }) {
  try {
    db.prepare(
      `INSERT INTO email_skip_samples
       (id, user_id, provider, provider_message_id, sender, subject, reason_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      userId,
      provider,
      messageId,
      sender || null,
      subject || null,
      reasonCode,
      new Date().toISOString()
    );
  } catch (err) {
    logDebug('ingest.skip_sample_failed', { userId, messageId, reasonCode });
  }
}

async function syncGmailMessages({ db, userId, days = 30, maxResults = 100 }) {
  const authClient = await getAuthorizedClient(db, userId);
  if (!authClient) {
    return { status: 'not_connected' };
  }

  logInfo('ingest.start', { userId, days, maxResults });

  const gmail = google.gmail({ version: 'v1', auth: authClient });
  let pageToken;
  let fetched = 0;
  let created = 0;
  let skippedDuplicate = 0;
  let skippedNotJob = 0;
  let matchedExisting = 0;
  let createdApplications = 0;
  let unsortedCreated = 0;
  const reasons = initReasonCounters();

  const queryDays = Math.max(1, Math.min(days, 365));
  const limit = Math.max(1, Math.min(maxResults, 500));

  do {
    if (fetched >= limit) {
      break;
    }
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: `newer_than:${queryDays}d`,
      maxResults: Math.min(100, limit - fetched),
      pageToken
    });

    const messages = list.data.messages || [];
    for (const message of messages) {
      if (fetched >= limit) {
        break;
      }
      const existing = db
        .prepare(
          'SELECT id FROM email_events WHERE user_id = ? AND (provider_message_id = ? OR message_id = ?)'
        )
        .get(userId, message.id, message.id);
      if (existing) {
        skippedDuplicate += 1;
        reasons.duplicate += 1;
        fetched += 1;
        logDebug('ingest.skip_duplicate', { userId, messageId: message.id });
        continue;
      }

      const details = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date']
      });

      const headers = details.data.payload?.headers || [];
      const sender = parseHeader(headers, 'From');
      const subject = parseHeader(headers, 'Subject');
      const snippet = details.data.snippet || '';
      const internalDate = details.data.internalDate ? Number(details.data.internalDate) : null;

      const classification = classifyEmail({ subject, snippet, sender });
      if (!classification.isJobRelated) {
        skippedNotJob += 1;
        const reasonCode = classification.reason === 'denylisted' ? 'denylisted' : 'classified_not_job_related';
        if (reasonCode === 'denylisted') {
          reasons.denylisted += 1;
        } else {
          reasons.classified_not_job_related += 1;
        }
        recordSkipSample({
          db,
          userId,
          provider: 'gmail',
          messageId: message.id,
          sender,
          subject,
          reasonCode
        });
        fetched += 1;
        logDebug('ingest.skip_not_job', {
          userId,
          messageId: message.id,
          explanation: classification.explanation
        });
        continue;
      }

      const identity = extractThreadIdentity({ subject, sender });
      const eventId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const classificationConfidence = Number.isFinite(classification.confidenceScore)
        ? classification.confidenceScore
        : 0;
      const identityConfidence = identity.matchConfidence || 0;
      db.prepare(
        `INSERT INTO email_events
         (id, user_id, provider, message_id, provider_message_id, sender, subject, internal_date, snippet,
          detected_type, confidence_score, classification_confidence, identity_confidence, identity_company_name,
          identity_job_title, identity_company_confidence, identity_explanation, explanation, reason_code, reason_detail,
          created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        eventId,
        userId,
        'gmail',
        message.id,
        message.id,
        sender || null,
        subject || null,
        internalDate,
        truncateSnippet(snippet),
        classification.detectedType,
        classificationConfidence,
        classificationConfidence,
        identityConfidence,
        identity.companyName || null,
        identity.jobTitle || null,
        identity.companyConfidence || null,
        identity.explanation || null,
        classification.explanation,
        null,
        null,
        createdAt
      );

      const matchResult = matchAndAssignEvent({
        db,
        userId,
        event: {
          id: eventId,
          sender,
          subject,
          snippet,
          internal_date: internalDate,
          detected_type: classification.detectedType,
          confidence_score: classificationConfidence,
          classification_confidence: classificationConfidence,
          created_at: createdAt
        },
        identity
      });

      logDebug('ingest.event_classified', {
        userId,
        eventId,
        detectedType: classification.detectedType,
        confidenceScore: classification.confidenceScore,
        matchAction: matchResult.action,
        matchReason: matchResult.reason || null
      });

      if (matchResult.action === 'matched_existing') {
        matchedExisting += 1;
        reasons.matched_existing += 1;
        runStatusInferenceForApplication(db, userId, matchResult.applicationId);
      }
      if (matchResult.action === 'created_application') {
        createdApplications += 1;
        reasons.auto_created += 1;
        runStatusInferenceForApplication(db, userId, matchResult.applicationId);
      }
      if (matchResult.action === 'unassigned') {
        unsortedCreated += 1;
        reasons.unsorted_created += 1;
        if (matchResult.reason || matchResult.reasonDetail) {
          db.prepare('UPDATE email_events SET reason_code = ?, reason_detail = ? WHERE id = ?').run(
            matchResult.reason || null,
            matchResult.reasonDetail || null,
            eventId
          );
        }
        if (matchResult.reason === 'missing_identity') {
          reasons.missing_identity += 1;
        } else if (matchResult.reason === 'low_confidence') {
          reasons.low_confidence += 1;
        } else if (matchResult.reason === 'not_confident_for_create') {
          reasons.not_confident_for_create += 1;
        } else if (matchResult.reason === 'ambiguous_sender') {
          reasons.ambiguous_sender += 1;
        }
      }
      created += 1;
      fetched += 1;
    }

    pageToken = list.data.nextPageToken;
  } while (pageToken && fetched < limit);

  logInfo('ingest.complete', {
    userId,
    fetched,
    created,
    skippedDuplicate,
    skippedNotJob,
    matchedExisting,
    createdApplications,
    unsortedCreated,
    reasons,
    days: queryDays
  });

  return {
    status: 'ok',
    fetched,
    created,
    skippedDuplicate,
    skippedNotJob,
    matchedExisting,
    createdApplications,
    unsortedCreated,
    reasons,
    days: queryDays
  };
}

module.exports = {
  syncGmailMessages,
  REASON_KEYS,
  initReasonCounters
};
