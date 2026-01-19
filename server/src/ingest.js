const crypto = require('crypto');
const { google } = require('googleapis');
const { getAuthorizedClient } = require('./email');
const { classifyEmail } = require('../../shared/emailClassifier');
const { matchAndAssignEvent } = require('./matching');
const {
  extractThreadIdentity,
  extractJobTitle,
  extractExternalReqId
} = require('../../shared/matching');
const { runStatusInferenceForApplication } = require('./statusInferenceRunner');
const { logInfo, logDebug } = require('./logger');

const REASON_KEYS = [
  'classified_not_job_related',
  'denylisted',
  'missing_identity',
  'low_confidence',
  'not_confident_for_create',
  'ambiguous_sender',
  'ambiguous_match',
  'ambiguous_match_rejection',
  'below_threshold',
  'provider_filtered',
  'parse_error',
  'duplicate',
  'duplicate_provider_message_id',
  'duplicate_rfc_message_id',
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

function decodeBase64Url(value) {
  if (!value) {
    return '';
  }
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findPayloadPart(payload, predicate) {
  if (!payload) {
    return null;
  }
  const mimeType = String(payload.mimeType || '').toLowerCase();
  if (predicate(mimeType) && payload.body?.data) {
    return payload;
  }
  const parts = payload.parts || [];
  for (const part of parts) {
    const found = findPayloadPart(part, predicate);
    if (found) {
      return found;
    }
  }
  return null;
}

function extractPlainTextFromPayload(payload) {
  const textPart = findPayloadPart(payload, (mime) => mime.startsWith('text/plain'));
  if (textPart) {
    return decodeBase64Url(textPart.body.data);
  }
  const htmlPart = findPayloadPart(payload, (mime) => mime.startsWith('text/html'));
  if (htmlPart) {
    return stripHtml(decodeBase64Url(htmlPart.body.data));
  }
  return '';
}

function truncateBodyText(text, max = 4000) {
  if (!text) {
    return '';
  }
  const clean = String(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return clean.length > max ? clean.slice(0, max) : clean;
}

function extractMessageMetadata(details) {
  const headers = details?.payload?.headers || [];
  const sender = parseHeader(headers, 'From');
  const subject = parseHeader(headers, 'Subject');
  const rfcMessageId = parseHeader(headers, 'Message-ID') || null;
  const snippet = details?.snippet || '';
  const internalDate = details?.internalDate ? Number(details.internalDate) : null;
  const bodyText = truncateBodyText(extractPlainTextFromPayload(details?.payload));
  return { sender, subject, rfcMessageId, snippet, internalDate, bodyText };
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

function insertEmailEventRecord(db, payload) {
  db.prepare(
    `INSERT INTO email_events
     (id, user_id, provider, message_id, provider_message_id, rfc_message_id, sender, subject, internal_date, snippet,
      detected_type, confidence_score, classification_confidence, identity_confidence, identity_company_name,
      identity_job_title, identity_company_confidence, identity_explanation, explanation, reason_code, reason_detail,
      role_title, role_confidence, role_source, role_explanation, external_req_id, ingest_decision, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    payload.id,
    payload.userId,
    payload.provider,
    payload.messageId,
    payload.providerMessageId,
    payload.rfcMessageId,
    payload.sender,
    payload.subject,
    payload.internalDate,
    payload.snippet,
    payload.detectedType,
    payload.confidenceScore,
    payload.classificationConfidence,
    payload.identityConfidence,
    payload.identityCompanyName,
    payload.identityJobTitle,
    payload.identityCompanyConfidence,
    payload.identityExplanation,
    payload.explanation,
    payload.reasonCode,
    payload.reasonDetail,
    payload.roleTitle,
    payload.roleConfidence,
    payload.roleSource,
    payload.roleExplanation,
    payload.externalReqId,
    payload.ingestDecision,
    payload.createdAt
  );
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
  let jobRelatedCandidates = 0;
  let filteredOutDenylist = 0;
  let classifiedConfirmation = 0;
  let classifiedRejection = 0;
  let storedEventsTotal = 0;
  let storedEventsRejection = 0;
  let matchedEventsRejection = 0;
  let updatedRejectedTotal = 0;
  let unsortedRejectionTotal = 0;
  let skippedDuplicatesProvider = 0;
  let skippedDuplicatesRfc = 0;
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
      const existingProvider = db
        .prepare(
          'SELECT id FROM email_events WHERE user_id = ? AND (provider_message_id = ? OR message_id = ?)'
        )
        .get(userId, message.id, message.id);
      if (existingProvider) {
        skippedDuplicate += 1;
        reasons.duplicate += 1;
        reasons.duplicate_provider_message_id += 1;
        skippedDuplicatesProvider += 1;
        fetched += 1;
        logDebug('ingest.skip_duplicate', {
          userId,
          messageId: message.id,
          reason: 'duplicate_provider_message_id'
        });
        continue;
      }

      const details = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'full'
      });

      const {
        sender,
        subject,
        rfcMessageId,
        snippet,
        internalDate,
        bodyText
      } = extractMessageMetadata(details.data);

      if (rfcMessageId) {
        const existingRfc = db
          .prepare('SELECT id FROM email_events WHERE user_id = ? AND rfc_message_id = ?')
          .get(userId, rfcMessageId);
        if (existingRfc) {
          skippedDuplicate += 1;
          reasons.duplicate += 1;
          reasons.duplicate_rfc_message_id += 1;
          skippedDuplicatesRfc += 1;
          fetched += 1;
          logDebug('ingest.skip_duplicate', {
            userId,
            messageId: message.id,
            reason: 'duplicate_rfc_message_id'
          });
          continue;
        }
      }

      const classification = classifyEmail({ subject, snippet, sender });
      if (!classification.isJobRelated) {
        skippedNotJob += 1;
        let reasonCode = 'classified_not_job_related';
        if (classification.reason === 'denylisted') {
          reasonCode = 'denylisted';
          filteredOutDenylist += 1;
        } else if (classification.reason === 'below_threshold') {
          reasonCode = 'below_threshold';
        }
        if (reasonCode === 'denylisted') {
          reasons.denylisted += 1;
        } else if (reasonCode === 'below_threshold') {
          reasons.below_threshold += 1;
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
      jobRelatedCandidates += 1;
      if (classification.detectedType === 'confirmation') {
        classifiedConfirmation += 1;
      }
      if (classification.detectedType === 'rejection') {
        classifiedRejection += 1;
      }

      const identity = extractThreadIdentity({ subject, sender, snippet, bodyText });
      const roleResult = extractJobTitle({
        subject,
        snippet,
        bodyText,
        sender,
        companyName: identity.companyName
      });
      const rolePayload = roleResult && roleResult.jobTitle ? roleResult : null;
      const reqResult = extractExternalReqId({ subject, snippet, bodyText });
      const externalReqId = reqResult.externalReqId || null;
      const eventId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const classificationConfidence = Number.isFinite(classification.confidenceScore)
        ? classification.confidenceScore
        : 0;
      const identityConfidence = identity.matchConfidence || 0;
      insertEmailEventRecord(db, {
        id: eventId,
        userId,
        provider: 'gmail',
        messageId: message.id,
        providerMessageId: message.id,
        rfcMessageId: rfcMessageId || null,
        sender: sender || null,
        subject: subject || null,
        internalDate,
        snippet: truncateSnippet(snippet),
        detectedType: classification.detectedType,
        confidenceScore: classificationConfidence,
        classificationConfidence,
        identityConfidence,
        identityCompanyName: identity.companyName || null,
        identityJobTitle: identity.jobTitle || null,
        identityCompanyConfidence: identity.companyConfidence || null,
        identityExplanation: identity.explanation || null,
        explanation: classification.explanation,
        reasonCode: null,
        reasonDetail: null,
        roleTitle: rolePayload?.jobTitle || null,
        roleConfidence: Number.isFinite(rolePayload?.confidence) ? rolePayload.confidence : null,
        roleSource: rolePayload?.source || null,
        roleExplanation: rolePayload?.explanation || null,
        externalReqId,
        ingestDecision: null,
        createdAt
      });
      storedEventsTotal += 1;
      if (classification.detectedType === 'rejection') {
        storedEventsRejection += 1;
      }

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
          role_title: rolePayload?.jobTitle || null,
          role_confidence: Number.isFinite(rolePayload?.confidence) ? rolePayload.confidence : null,
          role_source: rolePayload?.source || null,
          role_explanation: rolePayload?.explanation || null,
          external_req_id: externalReqId,
          created_at: createdAt
        },
        identity
      });
      let rejectionApplied = false;

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
        if (classification.detectedType === 'rejection') {
          matchedEventsRejection += 1;
        }
        db.prepare('UPDATE email_events SET ingest_decision = ? WHERE id = ?').run(
          'matched',
          eventId
        );
        const inference = runStatusInferenceForApplication(db, userId, matchResult.applicationId);
        if (inference?.applied && inference?.inferred_status === 'REJECTED') {
          updatedRejectedTotal += 1;
          rejectionApplied = true;
        }
      }
      if (matchResult.action === 'created_application') {
        createdApplications += 1;
        reasons.auto_created += 1;
        db.prepare('UPDATE email_events SET ingest_decision = ? WHERE id = ?').run(
          'auto_created',
          eventId
        );
        const inference = runStatusInferenceForApplication(db, userId, matchResult.applicationId);
        if (inference?.applied && inference?.inferred_status === 'REJECTED') {
          updatedRejectedTotal += 1;
          rejectionApplied = true;
        }
      }
      if (matchResult.action === 'unassigned') {
        unsortedCreated += 1;
        reasons.unsorted_created += 1;
        if (classification.detectedType === 'rejection') {
          unsortedRejectionTotal += 1;
        }
        db.prepare('UPDATE email_events SET ingest_decision = ? WHERE id = ?').run(
          'unsorted',
          eventId
        );
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
        } else if (matchResult.reason === 'ambiguous_match') {
          reasons.ambiguous_match += 1;
        } else if (matchResult.reason === 'ambiguous_match_rejection') {
          reasons.ambiguous_match_rejection += 1;
        }
      }
      created += 1;
      fetched += 1;

      if (classification.detectedType === 'rejection') {
        const senderDomain = sender && sender.includes('@')
          ? sender.split('@')[1]?.replace(/[> ]/g, '').toLowerCase()
          : null;
        const companyPreview = (identity.companyName || '').slice(0, 80);
        const rolePreview = (identity.jobTitle || rolePayload?.jobTitle || '').slice(0, 80);
        logInfo('ingest.rejection_trace', {
          userId,
          providerMessageId: message.id,
          senderDomain: senderDomain || null,
          classifierType: classification.detectedType,
          confidence: classificationConfidence,
          company: companyPreview || null,
          role: rolePreview || null,
          matchAction: matchResult.action,
          matchReason: matchResult.reason || null,
          rejectedApplied: rejectionApplied
        });
      }
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
    filteredOutDenylist,
    classifiedConfirmation,
    classifiedRejection,
    storedEventsTotal,
    storedEventsRejection,
    matchedEventsRejection,
    updatedRejectedTotal,
    unsortedRejectionTotal,
    skippedDuplicatesProvider,
    skippedDuplicatesRfc,
    reasons,
    days: queryDays
  });

  return {
    status: 'ok',
    fetched,
    totalScanned: fetched,
    jobRelatedCandidates,
    created,
    skippedDuplicate,
    skippedNotJob,
    matchedExisting,
    createdApplications,
    unsortedCreated,
    reasons,
    fetched_total: fetched,
    filtered_out_denylist: filteredOutDenylist,
    classified_job_related_total: jobRelatedCandidates,
    classified_confirmation: classifiedConfirmation,
    classified_rejection: classifiedRejection,
    stored_events_total: storedEventsTotal,
    stored_events_rejection: storedEventsRejection,
    matched_events_total: matchedExisting,
    matched_events_rejection: matchedEventsRejection,
    created_apps_total: createdApplications,
    updated_status_to_rejected_total: updatedRejectedTotal,
    unsorted_total: unsortedCreated,
    unsorted_rejection_total: unsortedRejectionTotal,
    skipped_duplicates_provider: skippedDuplicatesProvider,
    skipped_duplicates_rfc: skippedDuplicatesRfc,
    days: queryDays
  };
}

module.exports = {
  syncGmailMessages,
  REASON_KEYS,
  initReasonCounters,
  extractMessageMetadata,
  insertEmailEventRecord
};
