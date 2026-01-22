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
const { runLlmExtraction, getConfig: getLlmConfig } = require('./llmClient');
const { shouldInvokeLlm } = require('./llmGate');
const { getEmailEventColumns } = require('./db');

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

function categorizeSenderDomain(sender = '') {
  const domain = sender.includes('@') ? sender.split('@')[1].replace(/[> ]/g, '').toLowerCase() : '';
  if (!domain) return 'unknown';
  if (domain.includes('indeed')) return 'indeed';
  if (domain.includes('greenhouse')) return 'greenhouse';
  if (domain.includes('myworkday') || domain.includes('workday')) return 'workday';
  if (domain.includes('icims')) return 'icims';
  if (domain.includes('workable')) return 'workable';
  if (domain.includes('breezy')) return 'breezy';
  if (domain.includes('applytojob')) return 'applytojob';
  if (domain.includes('lever')) return 'lever';
  if (domain.includes('smartrecruiters')) return 'smartrecruiters';
  if (domain.includes('taleo') || domain.includes('talemetry')) return 'taleo';
  if (domain.includes('ashby')) return 'ashby';
  if (domain.includes('gmail')) return 'gmail';
  return domain;
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

const COLUMN_TO_PAYLOAD = {
  id: 'id',
  user_id: 'userId',
  provider: 'provider',
  message_id: 'messageId',
  provider_message_id: 'providerMessageId',
  rfc_message_id: 'rfcMessageId',
  sender: 'sender',
  subject: 'subject',
  internal_date: 'internalDate',
  snippet: 'snippet',
  detected_type: 'detectedType',
  confidence_score: 'confidenceScore',
  classification_confidence: 'classificationConfidence',
  identity_confidence: 'identityConfidence',
  identity_company_name: 'identityCompanyName',
  identity_job_title: 'identityJobTitle',
  identity_company_confidence: 'identityCompanyConfidence',
  identity_explanation: 'identityExplanation',
  explanation: 'explanation',
  reason_code: 'reasonCode',
  reason_detail: 'reasonDetail',
  role_title: 'roleTitle',
  role_confidence: 'roleConfidence',
  role_source: 'roleSource',
  role_explanation: 'roleExplanation',
  external_req_id: 'externalReqId',
  ingest_decision: 'ingestDecision',
  created_at: 'createdAt',
  llm_ran: 'llmRan',
  llm_status: 'llmStatus',
  llm_error: 'llmError',
  llm_model: 'llmModel',
  llm_latency_ms: 'llmLatency',
  llm_event_type: 'llmEventType',
  llm_confidence: 'llmConfidence',
  llm_company_name: 'llmCompanyName',
  llm_job_title: 'llmJobTitle',
  llm_external_req_id: 'llmExternalReqId',
  llm_provider_guess: 'llmProviderGuess',
  llm_reason_codes: 'llmReasonCodes',
  llm_raw_json: 'llmRawJson'
};

function normalizeSqliteValue(v) {
  if (v === undefined) return null;
  if (v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (Array.isArray(v)) return JSON.stringify(v);
  if (Buffer.isBuffer(v)) return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function insertEmailEventRecord(db, payload) {
  const columnsAvailable = getEmailEventColumns(db);
  const cols = [];
  const placeholders = [];
  const values = [];
  for (const [column, prop] of Object.entries(COLUMN_TO_PAYLOAD)) {
    if (!columnsAvailable.has(column)) {
      continue;
    }
    cols.push(column);
    placeholders.push('?');
    if (column === 'llm_ran') {
      values.push(normalizeSqliteValue(payload.llmRan ?? (payload.llmStatus ? 1 : 0)));
    } else {
      values.push(normalizeSqliteValue(payload[prop]));
    }
  }
  const sql = `INSERT INTO email_events (${cols.join(',')}) VALUES (${placeholders.join(',')})`;
  if (process.env.NODE_ENV !== 'production') {
    values.forEach((val, idx) => {
      const col = cols[idx];
      const t = typeof val;
      const ok = val === null || t === 'number' || t === 'string' || t === 'bigint' || Buffer.isBuffer(val);
      if (!ok) {
        throw new Error(`Unsupported SQLite bind for column ${col}: ${t}`);
      }
    });
  }
  db.prepare(sql).run(...values);
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
  let pagesFetched = 0;
  let totalMessagesListed = 0;
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
  let storedEventsConfirmation = 0;
  let storedEventsRejection = 0;
  let matchedEventsConfirmation = 0;
  let matchedEventsRejection = 0;
  let createdAppsConfirmation = 0;
  let createdAppsRejectionOnly = 0;
  let unsortedConfirmationTotal = 0;
  let updatedRejectedTotal = 0;
  let updatedAppliedTotal = 0;
  let unsortedRejectionTotal = 0;
  let skippedDuplicatesProvider = 0;
  let skippedDuplicatesRfc = 0;
  let llmCalls = 0;
  let llmCacheHits = 0;
  let llmFailures = 0;
  let llmUpgradedConfirmations = 0;
  let llmUpgradedRejections = 0;
  let llmAgreements = 0;
  let llmDisagreements = 0;
  let llmUsedIdentity = 0;
  let llmUsedType = 0;
  let llmUsedReqId = 0;
  let llmUsedRole = 0;
  let stoppedReason = 'completed';
  const messageSourceCounts = {};
  const reasons = initReasonCounters();

  const queryDays = Math.max(1, Math.min(days, 365));
  const limit = Math.max(1, Math.min(maxResults, 500));
  const timeWindowEnd = new Date();
  const timeWindowStart = new Date(timeWindowEnd.getTime() - queryDays * 24 * 60 * 60 * 1000);
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

    pagesFetched += 1;
    const messages = list.data.messages || [];
    totalMessagesListed += messages.length;
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
      const sourceBucket = categorizeSenderDomain(sender);
      messageSourceCounts[sourceBucket] = (messageSourceCounts[sourceBucket] || 0) + 1;

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
      let effectiveClassification = { ...classification };
      let effectiveIdentity = { ...identity };
      let effectiveRole = rolePayload;
      let llmStatus = 'skipped';
      let llmError = null;
      let llmModel = null;
      let llmLatency = null;
      let llmReasonCodes = [];
      let llmRaw = null;

      const gate = shouldInvokeLlm({
        classification,
        extracted: identity,
        matchResult: null,
        reason: null
      });
      const llmConfig = getLlmConfig();
      const maxCalls = llmConfig.maxCallsPerSync || 20;
      if (gate.invoke && llmCalls < maxCalls) {
        llmCalls += 1;
        llmReasonCodes = gate.why;
        const llmResponse = await runLlmExtraction({
          subject,
          snippet,
          from: sender,
          to: null,
          date: internalDate ? new Date(internalDate).toISOString() : null,
          headers: { rfcMessageId },
          provider: 'gmail',
          messageId: message.id,
          bodyText
        });
        llmModel = llmResponse.model || null;
        llmLatency = llmResponse.latencyMs || null;
        llmStatus = llmResponse.ok ? 'ok' : llmResponse.skipped ? 'skipped' : 'failed';
        if (llmResponse.ok && llmResponse.data) {
          llmRaw = JSON.stringify(llmResponse.data);
          const llmData = llmResponse.data;
          const agreeType = llmData.event_type === classification.detectedType;
          if (agreeType) {
            llmAgreements += 1;
          } else {
            llmDisagreements += 1;
          }
          const llmConf = llmData.confidence || 0;
          const safeUse = llmConf >= 0.85;
          if (safeUse && (!effectiveIdentity.companyName || effectiveIdentity.companyConfidence < 0.85)) {
            if (llmData.company_name) {
              effectiveIdentity = {
                ...effectiveIdentity,
                companyName: llmData.company_name,
                companyConfidence: llmConf,
                explanation: 'LLM'
              };
              llmUsedIdentity += 1;
            }
          }
          if (safeUse && (!effectiveRole || !effectiveRole.jobTitle) && llmData.job_title) {
            effectiveRole = {
              jobTitle: llmData.job_title,
              confidence: llmConf,
              source: 'llm',
              explanation: 'LLM'
            };
            llmUsedRole += 1;
          }
          if (safeUse && llmData.external_req_id && !externalReqId) {
            externalReqId = llmData.external_req_id;
            llmUsedReqId += 1;
          }
          if (safeUse && !classification.isJobRelated && llmData.is_job_related) {
            effectiveClassification = {
              isJobRelated: true,
              detectedType: llmData.event_type === 'non_job' ? 'other_job_related' : llmData.event_type,
              confidenceScore: llmConf,
              explanation: 'LLM',
              reason: 'llm'
            };
            llmUsedType += 1;
          }
        } else {
          llmError = llmResponse.error || llmResponse.reason || null;
          if (!llmResponse.skipped) {
            llmFailures += 1;
          }
        }
      }

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
        detectedType: effectiveClassification.detectedType,
        confidenceScore: effectiveClassification.confidenceScore,
        classificationConfidence: effectiveClassification.confidenceScore,
        identityConfidence,
        identityCompanyName: effectiveIdentity.companyName || null,
        identityJobTitle: effectiveIdentity.jobTitle || null,
        identityCompanyConfidence: effectiveIdentity.companyConfidence || null,
        identityExplanation: effectiveIdentity.explanation || null,
        explanation: effectiveClassification.explanation,
        reasonCode: null,
        reasonDetail: null,
        roleTitle: effectiveRole?.jobTitle || null,
        roleConfidence: Number.isFinite(effectiveRole?.confidence) ? effectiveRole.confidence : null,
        roleSource: effectiveRole?.source || null,
        roleExplanation: effectiveRole?.explanation || null,
        externalReqId,
        ingestDecision: null,
        createdAt,
        llmStatus,
        llmError,
        llmModel,
        llmLatency,
        llmEventType: llmStatus === 'ok' ? effectiveClassification.detectedType : null,
        llmConfidence: llmStatus === 'ok' ? effectiveClassification.confidenceScore : null,
        llmCompanyName: llmStatus === 'ok' ? effectiveIdentity.companyName : null,
        llmJobTitle: llmStatus === 'ok' ? effectiveRole?.jobTitle || null : null,
        llmExternalReqId: llmStatus === 'ok' ? externalReqId : null,
        llmReasonCodes: llmReasonCodes.length ? JSON.stringify(llmReasonCodes) : null,
        llmRawJson: llmRaw
      });
      storedEventsTotal += 1;
      if (classification.detectedType === 'confirmation') {
        storedEventsConfirmation += 1;
      }
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
          detected_type: effectiveClassification.detectedType,
          confidence_score: effectiveClassification.confidenceScore,
          classification_confidence: effectiveClassification.confidenceScore,
          role_title: effectiveRole?.jobTitle || null,
          role_confidence: Number.isFinite(effectiveRole?.confidence) ? effectiveRole.confidence : null,
          role_source: effectiveRole?.source || null,
          role_explanation: effectiveRole?.explanation || null,
          external_req_id: externalReqId,
          created_at: createdAt
        },
        identity: effectiveIdentity
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
        if (classification.detectedType === 'confirmation') {
          matchedEventsConfirmation += 1;
        }
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
        if (inference?.applied && inference?.inferred_status === 'APPLIED') {
          updatedAppliedTotal += 1;
        }
      }
      if (matchResult.action === 'created_application') {
        createdApplications += 1;
        reasons.auto_created += 1;
        if (classification.detectedType === 'confirmation') {
          createdAppsConfirmation += 1;
        }
        if (classification.detectedType === 'rejection') {
          createdAppsRejectionOnly += 1;
        }
        db.prepare('UPDATE email_events SET ingest_decision = ? WHERE id = ?').run(
          'auto_created',
          eventId
        );
        const inference = runStatusInferenceForApplication(db, userId, matchResult.applicationId);
        if (inference?.applied && inference?.inferred_status === 'REJECTED') {
          updatedRejectedTotal += 1;
          rejectionApplied = true;
        }
        if (inference?.applied && inference?.inferred_status === 'APPLIED') {
          updatedAppliedTotal += 1;
        }
      }
      if (matchResult.action === 'unassigned') {
        unsortedCreated += 1;
        reasons.unsorted_created += 1;
        if (classification.detectedType === 'confirmation') {
          unsortedConfirmationTotal += 1;
        }
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

      if (effectiveClassification.detectedType === 'rejection') {
        const senderDomain = sender && sender.includes('@')
          ? sender.split('@')[1]?.replace(/[> ]/g, '').toLowerCase()
          : null;
        const companyPreview = (effectiveIdentity.companyName || '').slice(0, 80);
        const rolePreview = (effectiveIdentity.jobTitle || effectiveRole?.jobTitle || '').slice(0, 80);
        logInfo('ingest.rejection_trace', {
          userId,
          providerMessageId: message.id,
          senderDomain: senderDomain || null,
          classifierType: effectiveClassification.detectedType,
          confidence: effectiveClassification.confidenceScore,
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
    storedEventsConfirmation,
    storedEventsRejection,
    matchedEventsConfirmation,
    matchedEventsRejection,
    createdAppsConfirmation,
    createdAppsRejectionOnly,
    updatedRejectedTotal,
    updatedAppliedTotal,
    unsortedConfirmationTotal,
    unsortedRejectionTotal,
    skippedDuplicatesProvider,
    skippedDuplicatesRfc,
    llmCalls,
    llmCacheHits,
    llmFailures,
    llmUpgradedConfirmations,
    llmUpgradedRejections,
    llmAgreements,
    llmDisagreements,
    llmUsedIdentity,
    llmUsedType,
    llmUsedReqId,
    llmUsedRole,
    pagesFetched,
    totalMessagesListed,
    messageSourceCounts,
    timeWindowStart: timeWindowStart.toISOString(),
    timeWindowEnd: timeWindowEnd.toISOString(),
    stoppedReason,
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
    stored_events_confirmation_total: storedEventsConfirmation,
    stored_events_rejection: storedEventsRejection,
    matched_events_total: matchedExisting,
    matched_events_confirmation_total: matchedEventsConfirmation,
    matched_events_rejection: matchedEventsRejection,
    created_apps_total: createdApplications,
    created_apps_confirmation_total: createdAppsConfirmation,
    created_apps_rejection_only_total: createdAppsRejectionOnly,
    updated_status_to_rejected_total: updatedRejectedTotal,
    updated_status_to_applied_total: updatedAppliedTotal,
    unsorted_total: unsortedCreated,
    unsorted_confirmation_total: unsortedConfirmationTotal,
    unsorted_rejection_total: unsortedRejectionTotal,
    skipped_duplicates_provider: skippedDuplicatesProvider,
    skipped_duplicates_rfc: skippedDuplicatesRfc,
    llm_calls: llmCalls,
    llm_cache_hits: llmCacheHits,
    llm_failures: llmFailures,
    llm_upgraded_confirmations: llmUpgradedConfirmations,
    llm_upgraded_rejections: llmUpgradedRejections,
    llm_agree_total: llmAgreements,
    llm_disagree_total: llmDisagreements,
    llm_used_identity_total: llmUsedIdentity,
    llm_used_type_total: llmUsedType,
    llm_used_req_id_total: llmUsedReqId,
    llm_used_role_total: llmUsedRole,
    pages_fetched: pagesFetched,
    total_messages_listed: totalMessagesListed,
    message_source_counts: messageSourceCounts,
    time_window_start: timeWindowStart.toISOString(),
    time_window_end: timeWindowEnd.toISOString(),
    stopped_reason: stoppedReason,
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
