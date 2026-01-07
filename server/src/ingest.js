const crypto = require('crypto');
const { google } = require('googleapis');
const { getAuthorizedClient } = require('./email');
const { classifyEmail } = require('../../shared/emailClassifier');
const { matchAndAssignEvent } = require('./matching');
const { runStatusInferenceForApplication } = require('./statusInferenceRunner');
const { logInfo, logDebug } = require('./logger');

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
        fetched += 1;
        logDebug('ingest.skip_not_job', {
          userId,
          messageId: message.id,
          explanation: classification.explanation
        });
        continue;
      }

      const eventId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      db.prepare(
        `INSERT INTO email_events
         (id, user_id, provider, message_id, provider_message_id, sender, subject, internal_date, snippet,
          detected_type, confidence_score, explanation, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        classification.confidenceScore,
        classification.explanation,
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
          confidence_score: classification.confidenceScore,
          created_at: createdAt
        }
      });

      logDebug('ingest.event_classified', {
        userId,
        eventId,
        detectedType: classification.detectedType,
        confidenceScore: classification.confidenceScore,
        matchAction: matchResult.action
      });

      if (matchResult.action === 'matched_existing') {
        matchedExisting += 1;
        runStatusInferenceForApplication(db, userId, matchResult.applicationId);
      }
      if (matchResult.action === 'created_application') {
        createdApplications += 1;
        runStatusInferenceForApplication(db, userId, matchResult.applicationId);
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
    days: queryDays
  };
}

module.exports = {
  syncGmailMessages
};
