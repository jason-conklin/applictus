const REJECTION_SIGNAL_PATTERNS = [
  { pattern: /\bwe regret to inform you\b/i, label: 'we regret to inform you', strength: 'strong' },
  {
    pattern: /\bwill not be taking your application further\b/i,
    label: 'will not be taking your application further',
    strength: 'strong'
  },
  { pattern: /\bwill not be moving forward\b/i, label: 'will not be moving forward', strength: 'strong' },
  { pattern: /\bare not moving forward\b/i, label: 'are not moving forward', strength: 'strong' },
  {
    pattern: /\bnot moving forward with your (?:application|candidacy)\b/i,
    label: 'not moving forward with your candidacy',
    strength: 'strong'
  },
  { pattern: /\bwe will not be progressing\b/i, label: 'we will not be progressing', strength: 'strong' },
  { pattern: /\bafter careful consideration\b/i, label: 'after careful consideration', strength: 'strong' },
  { pattern: /\bnot selected\b/i, label: 'not selected', strength: 'strong' },
  { pattern: /\bunfortunately\b/i, label: 'unfortunately', strength: 'strong' },
  { pattern: /\bpursue other candidates\b/i, label: 'pursue other candidates', strength: 'strong' },
  { pattern: /\bunable to move forward\b/i, label: 'unable to move forward', strength: 'strong' },
  { pattern: /\bwe have carefully reviewed your application\b/i, label: 'we have carefully reviewed your application', strength: 'soft' },
  { pattern: /\bwe wish you all the best\b/i, label: 'we wish you all the best', strength: 'soft' },
  {
    pattern: /\bhope you consider\b.{0,120}\bfuture career opportunities\b/i,
    label: 'hope you consider future career opportunities',
    strength: 'soft'
  },
  {
    pattern: /\b(?:this message is )?only in reference to\b/i,
    label: 'only in reference to this position',
    strength: 'soft'
  },
  { pattern: /\bwish you continued career success\b/i, label: 'wish you continued career success', strength: 'soft' },
  { pattern: /\bwish you success in your job search\b/i, label: 'wish you success in your job search', strength: 'soft' }
];

// Interview detection must be explicit; generic CTAs should not match.
const INTERVIEW_SIGNAL_PATTERNS = [
  { pattern: /\binterview\b/i, label: 'interview_keyword' },
  { pattern: /\bwe(?:'d| would)? like to schedule\b/i, label: 'schedule_interview' },
  { pattern: /\bschedule (?:a )?(call|chat|meeting|time)\b/i, label: 'schedule_time' },
  { pattern: /\bselect (?:a )?(time|slot)\b/i, label: 'select_time_slot' },
  { pattern: /\btime slots?\b/i, label: 'time_slots' },
  { pattern: /\bavailability\b/i, label: 'availability' },
  { pattern: /\bphone screen\b/i, label: 'phone_screen' },
  { pattern: /\bcalendar\b/i, label: 'calendar' },
  { pattern: /\bwould like to speak with you\b/i, label: 'speak_with_you' },
  { pattern: /\binvite you to interview\b/i, label: 'invite_to_interview' },
  { pattern: /\bbook (?:a )?time\b/i, label: 'book_time' },
  { pattern: /\blet'?s connect\b/i, label: 'lets_connect' }
];

const APPLIED_SIGNAL_PATTERNS = [
  { pattern: /\bthank you for applying\b/i, label: 'thank_you_for_applying' },
  { pattern: /\bthanks for applying\b/i, label: 'thanks_for_applying' },
  { pattern: /\bapplication submitted\b/i, label: 'application_submitted' },
  { pattern: /\byour application was sent\b/i, label: 'application_was_sent' },
  { pattern: /\byour application has been received\b/i, label: 'application_received' },
  { pattern: /\bwe (?:have )?received your application\b/i, label: 'received_your_application' }
];

const JOB_CONTEXT_PATTERN =
  /\b(application|applied|position|role|candidate|requisition|job|hiring|recruit|recruiter|screen|offer)\b/i;

const DIGEST_VETO_PATTERN =
  /\b(newsletter|digest|community|jobs you may like|recommended for you|discover your next job|view more posts)\b/i;

function cleanLine(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lines(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => cleanLine(line))
    .filter(Boolean);
}

function normalizeForCompare(value) {
  return cleanLine(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function collectPatternHits(patterns, corpus) {
  return patterns
    .filter(({ pattern }) => pattern.test(corpus))
    .map(({ label, strength }) => ({ label, strength: strength || 'neutral' }));
}

function isLocationLike(value) {
  const text = cleanLine(value);
  if (!text) {
    return false;
  }
  if (/\b(remote|hybrid|on[- ]?site)\b/i.test(text)) {
    return true;
  }
  if (/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?\b/.test(text)) {
    return true;
  }
  if (/\b\d{5}(?:-\d{4})?\b/.test(text)) {
    return true;
  }
  return false;
}

function parseCompanyLocationLine(line, { expectedCompany } = {}) {
  const text = cleanLine(line);
  if (!text) {
    return null;
  }
  const match = text.match(/^(.+?)\s*(?:[·•]|[-–—])\s*(.+)$/);
  if (!match) {
    return null;
  }
  const left = cleanLine(match[1]);
  const right = cleanLine(match[2]);
  if (!left || !right || !isLocationLike(right)) {
    return null;
  }
  if (expectedCompany) {
    const normalizedLeft = normalizeForCompare(left);
    const normalizedExpected = normalizeForCompare(expectedCompany);
    if (normalizedLeft && normalizedExpected && normalizedLeft !== normalizedExpected) {
      return null;
    }
  }
  return {
    company: left,
    location: right,
    line: text
  };
}

function detectStatusSignal({
  subject,
  text,
  company,
  role,
  defaultStatus = 'applied'
} = {}) {
  const corpus = `${String(subject || '')}\n${String(text || '')}`;
  const rejectionHits = collectPatternHits(REJECTION_SIGNAL_PATTERNS, corpus);
  const strongRejectionHits = rejectionHits.filter((hit) => hit.strength === 'strong');
  const softRejectionHits = rejectionHits.filter((hit) => hit.strength !== 'strong');
  const appliedHits = collectPatternHits(APPLIED_SIGNAL_PATTERNS, corpus);
  const hasDecisiveRejection = strongRejectionHits.length > 0 || softRejectionHits.length >= 2;

  if (hasDecisiveRejection) {
    const selectedRejection = strongRejectionHits[0] || softRejectionHits[0] || rejectionHits[0];
    const rejectionWonOverApplied = appliedHits.length > 0;
    return {
      status: 'rejected',
      confidence: strongRejectionHits.length > 0 ? 95 : 92,
      source: `rejection_phrase:${selectedRejection.label}`,
      matched: selectedRejection.label,
      rejectionMatches: rejectionHits.map((hit) => hit.label),
      interviewMatches: [],
      appliedMatches: appliedHits.map((hit) => hit.label),
      decisionReason: rejectionWonOverApplied
        ? 'strong_rejection_overrides_applied_intro'
        : strongRejectionHits.length > 0
          ? 'strong_rejection_signal'
          : 'soft_rejection_cluster'
    };
  }

  const digestVeto = DIGEST_VETO_PATTERN.test(corpus) && /\bunsubscribe\b/i.test(corpus);
  const interviewHits = collectPatternHits(INTERVIEW_SIGNAL_PATTERNS, corpus);
  const interviewHit = interviewHits[0] || null;
  if (interviewHit) {
    const hasContext = Boolean(
      (company && cleanLine(company)) ||
      (role && cleanLine(role)) ||
      JOB_CONTEXT_PATTERN.test(corpus) ||
      /\binterview\b/i.test(corpus)
    );
    if (hasContext && !digestVeto) {
      return {
        status: 'interview_requested',
        confidence: 86,
        source: `interview_phrase:${interviewHit.label}`,
        matched: interviewHit.label,
        rejectionMatches: rejectionHits.map((hit) => hit.label),
        interviewMatches: interviewHits.map((hit) => hit.label),
        appliedMatches: appliedHits.map((hit) => hit.label),
        decisionReason: 'explicit_interview_signal'
      };
    }
  }

  const appliedHit = appliedHits[0] || null;
  if (appliedHit) {
    return {
      status: 'applied',
      confidence: 90,
      source: `applied_phrase:${appliedHit.label}`,
      matched: appliedHit.label,
      rejectionMatches: rejectionHits.map((hit) => hit.label),
      interviewMatches: interviewHits.map((hit) => hit.label),
      appliedMatches: appliedHits.map((hit) => hit.label),
      decisionReason: 'applied_phrase_match'
    };
  }

  if (defaultStatus) {
    return {
      status: defaultStatus,
      confidence: 74,
      source: 'default',
      matched: null,
      rejectionMatches: rejectionHits.map((hit) => hit.label),
      interviewMatches: interviewHits.map((hit) => hit.label),
      appliedMatches: appliedHits.map((hit) => hit.label),
      decisionReason: 'fallback_default_status'
    };
  }
  return {
    status: undefined,
    confidence: 0,
    source: 'none',
    matched: null,
    rejectionMatches: rejectionHits.map((hit) => hit.label),
    interviewMatches: interviewHits.map((hit) => hit.label),
    appliedMatches: appliedHits.map((hit) => hit.label),
    decisionReason: 'no_status_signal'
  };
}

module.exports = {
  cleanLine,
  lines,
  normalizeForCompare,
  isLocationLike,
  parseCompanyLocationLine,
  detectStatusSignal
};
