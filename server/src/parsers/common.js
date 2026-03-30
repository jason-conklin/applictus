const REJECTION_SIGNAL_PATTERNS = [
  { pattern: /\bwe regret to inform you\b/i, label: 'we regret to inform you' },
  { pattern: /\bwill not be taking your application further\b/i, label: 'will not be taking your application further' },
  { pattern: /\bwill not be moving forward\b/i, label: 'will not be moving forward' },
  { pattern: /\bare not moving forward\b/i, label: 'are not moving forward' },
  { pattern: /\bnot moving forward with your (?:application|candidacy)\b/i, label: 'not moving forward with your candidacy' },
  { pattern: /\bwe will not be progressing\b/i, label: 'we will not be progressing' },
  { pattern: /\bafter careful consideration\b/i, label: 'after careful consideration' },
  { pattern: /\bnot selected\b/i, label: 'not selected' },
  { pattern: /\bunfortunately\b/i, label: 'unfortunately' },
  { pattern: /\bpursue other candidates\b/i, label: 'pursue other candidates' },
  { pattern: /\bunable to move forward\b/i, label: 'unable to move forward' },
  { pattern: /\bwish you continued career success\b/i, label: 'wish you continued career success' },
  { pattern: /\bwish you success in your job search\b/i, label: 'wish you success in your job search' }
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

  const rejectionHit = REJECTION_SIGNAL_PATTERNS.find(({ pattern }) => pattern.test(corpus));
  if (rejectionHit) {
    return {
      status: 'rejected',
      confidence: 95,
      source: `rejection_phrase:${rejectionHit.label}`,
      matched: rejectionHit.label
    };
  }

  const digestVeto = DIGEST_VETO_PATTERN.test(corpus) && /\bunsubscribe\b/i.test(corpus);
  const interviewHit = INTERVIEW_SIGNAL_PATTERNS.find(({ pattern }) => pattern.test(corpus));
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
        matched: interviewHit.label
      };
    }
  }

  const appliedHit = APPLIED_SIGNAL_PATTERNS.find(({ pattern }) => pattern.test(corpus));
  if (appliedHit) {
    return {
      status: 'applied',
      confidence: 90,
      source: `applied_phrase:${appliedHit.label}`,
      matched: appliedHit.label
    };
  }

  if (defaultStatus) {
    return {
      status: defaultStatus,
      confidence: 74,
      source: 'default',
      matched: null
    };
  }
  return {
    status: undefined,
    confidence: 0,
    source: 'none',
    matched: null
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
