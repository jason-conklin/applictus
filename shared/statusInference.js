const { ApplicationStatus } = require('./types');

const TERMINAL_STATUSES = new Set([
  ApplicationStatus.REJECTED,
  ApplicationStatus.OFFER_RECEIVED
]);

const STATUS_PRIORITY = {
  [ApplicationStatus.REJECTED]: 5,
  [ApplicationStatus.OFFER_RECEIVED]: 5,
  [ApplicationStatus.INTERVIEW_COMPLETED]: 4,
  [ApplicationStatus.INTERVIEW_REQUESTED]: 3,
  [ApplicationStatus.UNDER_REVIEW]: 2,
  [ApplicationStatus.APPLIED]: 1,
  [ApplicationStatus.UNKNOWN]: 0,
  [ApplicationStatus.GHOSTED]: 1
};

const INTERVIEW_COMPLETED_PATTERNS = [
  /thank you for interviewing/i,
  /thanks for interviewing/i,
  /thank you for (?:the )?interview/i,
  /interview (?:completed|wrap[- ]?up)/i
];

const GHOSTED_THRESHOLD_DAYS = 21;

function normalize(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function getEventConfidence(event) {
  const value = event?.classification_confidence ?? event?.confidence_score;
  return Number.isFinite(value) ? value : 0;
}

function formatEventDate(internalDate, createdAt) {
  const date = internalDate ? new Date(Number(internalDate)) : new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return 'unknown date';
  }
  return date.toISOString().slice(0, 10);
}

function buildExplanation(prefix, event) {
  const subject = normalize(event.subject) || normalize(event.snippet) || 'No subject';
  const dateText = formatEventDate(event.internal_date, event.created_at);
  return `${prefix} Event ${event.id} ("${subject}", ${dateText}).`;
}

function detectInterviewCompleted(event) {
  const text = `${normalize(event.subject)} ${normalize(event.snippet)}`.trim();
  for (const pattern of INTERVIEW_COMPLETED_PATTERNS) {
    if (pattern.test(text)) {
      return {
        matched: true,
        confidence: 0.92,
        explanation: `Matched interview completed pattern ${pattern}.`
      };
    }
  }
  return { matched: false };
}

function buildCandidateFromEvent(event) {
  if (!event || !event.detected_type) {
    return null;
  }

  if (event.detected_type === 'confirmation') {
    return {
      status: ApplicationStatus.APPLIED,
      confidence: getEventConfidence(event),
      explanation: buildExplanation('Application confirmation detected.', event),
      eventIds: [event.id]
    };
  }

  if (event.detected_type === 'under_review') {
    return {
      status: ApplicationStatus.UNDER_REVIEW,
      confidence: getEventConfidence(event),
      explanation: buildExplanation('Application under review detected.', event),
      eventIds: [event.id]
    };
  }

  if (event.detected_type === 'interview') {
    const completed = detectInterviewCompleted(event);
    if (completed.matched) {
      const confidence = Math.min(getEventConfidence(event), completed.confidence);
      return {
        status: ApplicationStatus.INTERVIEW_COMPLETED,
        confidence,
        explanation: `${completed.explanation} ${buildExplanation(
          'Interview completion inferred.',
          event
        )}`,
        eventIds: [event.id]
      };
    }
    return {
      status: ApplicationStatus.INTERVIEW_REQUESTED,
      confidence: getEventConfidence(event),
      explanation: buildExplanation('Interview request detected.', event),
      eventIds: [event.id]
    };
  }

  if (event.detected_type === 'rejection') {
    return {
      status: ApplicationStatus.REJECTED,
      confidence: getEventConfidence(event),
      explanation: buildExplanation('Rejection detected.', event),
      eventIds: [event.id]
    };
  }

  if (event.detected_type === 'offer') {
    return {
      status: ApplicationStatus.OFFER_RECEIVED,
      confidence: getEventConfidence(event),
      explanation: buildExplanation('Offer detected.', event),
      eventIds: [event.id]
    };
  }

  return null;
}

function pickBestCandidate(candidates) {
  if (!candidates.length) {
    return null;
  }

  return candidates.sort((a, b) => {
    const priorityDiff = (STATUS_PRIORITY[b.status] || 0) - (STATUS_PRIORITY[a.status] || 0);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
    return 0;
  })[0];
}

function ghostedSuggestion(application) {
  if (!application || !application.last_activity_at) {
    return null;
  }
  if (TERMINAL_STATUSES.has(application.current_status)) {
    return null;
  }
  if (
    application.current_status !== ApplicationStatus.APPLIED &&
    application.current_status !== ApplicationStatus.UNDER_REVIEW
  ) {
    return null;
  }
  const last = new Date(application.last_activity_at);
  if (Number.isNaN(last.getTime())) {
    return null;
  }
  const daysSince = Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSince < GHOSTED_THRESHOLD_DAYS) {
    return null;
  }
  return {
    status: ApplicationStatus.GHOSTED,
    confidence: 0.75,
    explanation: `No activity for ${daysSince} days (threshold ${GHOSTED_THRESHOLD_DAYS}).`,
    eventIds: []
  };
}

function inferStatus(application, events) {
  const list = Array.isArray(events)
    ? events
    : events && Array.isArray(events.rows)
      ? events.rows
      : events && typeof events === 'object' && events.id && events.detected_type
        ? [events]
        : [];

  const candidates = (list || [])
    .map(buildCandidateFromEvent)
    .filter(Boolean);

  const eligible = candidates.filter((item) => item.confidence >= 0.7);
  const candidate = pickBestCandidate(eligible);
  if (candidate) {
    if (candidate.confidence >= 0.9) {
      return {
        inferred_status: candidate.status,
        confidence: candidate.confidence,
        explanation: candidate.explanation,
        suggested_only: false,
        event_ids: candidate.eventIds
      };
    }
    return {
      inferred_status: candidate.status,
      confidence: candidate.confidence,
      explanation: candidate.explanation,
      suggested_only: true,
      event_ids: candidate.eventIds
    };
  }

  const ghosted = ghostedSuggestion(application);
  if (ghosted) {
    return {
      inferred_status: ghosted.status,
      confidence: ghosted.confidence,
      explanation: ghosted.explanation,
      suggested_only: true,
      event_ids: ghosted.eventIds
    };
  }

  return {
    inferred_status: ApplicationStatus.UNKNOWN,
    confidence: 0,
    explanation: 'No qualifying events for inference.',
    suggested_only: false,
    event_ids: []
  };
}

module.exports = {
  inferStatus,
  TERMINAL_STATUSES,
  STATUS_PRIORITY,
  GHOSTED_THRESHOLD_DAYS
};
