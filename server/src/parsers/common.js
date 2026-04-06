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

// Interview detection supports both explicit scheduling and interview-stage assessment invites.
const INTERVIEW_CONTEXT_PATTERNS = [
  { pattern: /\binterview\b/i, label: 'interview_keyword' },
  { pattern: /\bphone screen\b|\bscreening call\b/i, label: 'phone_screen' },
  { pattern: /\bwould like to speak with you\b/i, label: 'speak_with_you' },
  { pattern: /\binvite you to (?:an )?interview\b/i, label: 'invite_to_interview' },
  { pattern: /\btime to meet\b/i, label: 'time_to_meet' }
];

const INTERVIEW_ACTION_PATTERNS = [
  { pattern: /\bschedule\b/i, label: 'schedule' },
  { pattern: /\bavailability\b/i, label: 'availability' },
  { pattern: /\bwhat time works\b/i, label: 'what_time_works' },
  { pattern: /\bselect (?:a )?(?:time|slot)\b/i, label: 'select_slot' },
  { pattern: /\btime slots?\b/i, label: 'time_slots' },
  { pattern: /\bcalendar invite\b|\bzoom (?:invitation|invite)\b/i, label: 'calendar_or_zoom_invite' },
  { pattern: /\bbook (?:a )?time\b/i, label: 'book_time' }
];

const INTERVIEW_STAGE_INVITE_PATTERNS = [
  { pattern: /\b(?:we(?:'|’)re|we are)\s+pleased to invite you to\b/i, label: 'pleased_to_invite' },
  { pattern: /\binvite you to the next step in our hiring process\b/i, label: 'invite_next_step_hiring_process' },
  { pattern: /\bnext step in our hiring process\b/i, label: 'next_step_hiring_process' }
];

const INTERVIEW_STAGE_ASSESSMENT_PATTERNS = [
  { pattern: /\binitial interview\b/i, label: 'initial_interview' },
  { pattern: /\bscreening test\b/i, label: 'screening_test' },
  { pattern: /\battached questions?\b/i, label: 'attached_questions' },
  { pattern: /\bassessment\b/i, label: 'assessment' },
  { pattern: /\bjob description\b/i, label: 'job_description' }
];

const INTERVIEW_STAGE_ACTION_PATTERNS = [
  { pattern: /\bsubmit your responses?\b/i, label: 'submit_responses' },
  { pattern: /\breview and respond\b/i, label: 'review_and_respond' },
  { pattern: /\bat your earliest convenience\b/i, label: 'earliest_convenience' },
  { pattern: /\bprogression to the next stage\b/i, label: 'progression_to_next_stage' },
  { pattern: /\breviewing your submission\b/i, label: 'reviewing_submission' }
];

const INTERVIEW_VAGUE_PATTERNS = [
  { pattern: /\bnext steps\b/i, label: 'next_steps' },
  { pattern: /\bmay reach out\b/i, label: 'may_reach_out' },
  { pattern: /\bwe will contact you\b/i, label: 'will_contact_you' },
  { pattern: /\breviewing your application\b/i, label: 'reviewing_application' },
  { pattern: /\bunder consideration\b/i, label: 'under_consideration' }
];

const INTERVIEW_PROCESS_ONLY_PATTERNS = [
  { pattern: /\bover the coming weeks\b/i, label: 'future_process_timeline' },
  {
    pattern: /\bif your qualifications (?:prove to be|are) a match\b/i,
    label: 'conditional_match_language'
  },
  {
    pattern: /\bwe (?:may|might) invite you to some or all of the (?:below )?recruitment stages\b/i,
    label: 'recruitment_stages_overview'
  },
  {
    pattern: /\bsome of your interactions with us may include\b/i,
    label: 'process_stage_examples'
  },
  { pattern: /\bwe will be assessing applicants\b/i, label: 'assessment_phase_language' }
];

const INTERVIEW_CONDITIONAL_PATTERNS = [
  {
    pattern: /\bif\b.{0,140}\b(?:wish|want|would like|plan|need)\b.{0,60}\bschedule\b.{0,40}\binterview\b/i,
    label: 'if_wish_to_schedule_interview'
  },
  {
    pattern: /\bif we need additional information or wish to schedule an interview\b/i,
    label: 'if_need_info_or_schedule_interview'
  },
  { pattern: /\bif selected for (?:an )?interview\b/i, label: 'if_selected_for_interview' },
  {
    pattern: /\b(?:may|might|will)\s+contact you\b.{0,90}\b(?:schedule\b.{0,30}\binterview|interview)\b/i,
    label: 'may_contact_you_to_interview'
  },
  { pattern: /\bwe will contact you if\b.{0,120}\binterview\b/i, label: 'will_contact_you_if_interview' }
];

const INTERVIEW_NEGATIVE_PATTERNS = [
  { pattern: /\bjobs? for you\b/i, label: 'jobs_for_you' },
  { pattern: /\brecommended jobs?\b/i, label: 'recommended_jobs' },
  { pattern: /\bbased on your search\b/i, label: 'based_on_your_search' },
  { pattern: /\bjob alert\b/i, label: 'job_alert' },
  { pattern: /\bjobs you may like\b/i, label: 'jobs_you_may_like' },
  { pattern: /\bnew jobs? in\b/i, label: 'new_jobs_in' }
];

const MESSAGE_NOTIFICATION_PATTERNS = [
  { pattern: /\bnew message from\b/i, label: 'new_message_from' },
  { pattern: /\byou(?:'|’)ve received a new message(?:\s+from)?\b/i, label: 'received_new_message' },
  { pattern: /\bview message\b/i, label: 'view_message' },
  { pattern: /\breply from your account\b/i, label: 'reply_from_account' },
  { pattern: /\b(?:non[- ]?repliable|do not reply directly)\b/i, label: 'non_repliable' }
];

const MESSAGE_NOTIFICATION_NEGATIVE_PATTERNS = [
  { pattern: /\b(commented on|reacted to|liked your post|community|digest|newsletter)\b/i, label: 'social_digest_noise' },
  { pattern: /\bpassword reset\b/i, label: 'password_reset' },
  { pattern: /\bsecurity alert\b/i, label: 'security_alert' },
  { pattern: /\border (?:update|confirmation)\b/i, label: 'commerce_message' },
  { pattern: /\bsupport ticket\b/i, label: 'support_ticket' }
];

const APPLIED_SIGNAL_PATTERNS = [
  { pattern: /\bthank you for applying at\b/i, label: 'thank_you_for_applying_at' },
  { pattern: /\bthank you for applying\b/i, label: 'thank_you_for_applying' },
  { pattern: /\bthanks for applying\b/i, label: 'thanks_for_applying' },
  {
    pattern: /\bthank you for inquiring about employment opportunities\b/i,
    label: 'thank_you_inquiring_employment_opportunities'
  },
  { pattern: /\bapplication submitted\b/i, label: 'application_submitted' },
  { pattern: /\byour application was sent\b/i, label: 'application_was_sent' },
  { pattern: /\byour application has been received\b/i, label: 'application_received' },
  { pattern: /\bwe have successfully received your application\b/i, label: 'successfully_received_application' },
  { pattern: /\bwe (?:have )?received your application\b/i, label: 'received_your_application' },
  { pattern: /\b(?:it is|your application is)\s+currently under review\b/i, label: 'currently_under_review' },
  { pattern: /\bwe will be assessing applicants\b/i, label: 'assessing_applicants' },
  { pattern: /\bcheck the status of your application\b/i, label: 'check_application_status' },
  { pattern: /\bwe are currently reviewing your resume\b/i, label: 'reviewing_resume' },
  { pattern: /\bevaluating your professional credentials\b/i, label: 'evaluating_credentials' },
  {
    pattern: /\bif there is a match between our requirements and your experience\b/i,
    label: 'requirements_experience_match'
  },
  { pattern: /\bwe wish you the best in your employment search\b/i, label: 'employment_search_wish' },
  { pattern: /\bjobs applied to on\s+\d{1,2}\/\d{1,2}\/\d{2,4}\b/i, label: 'jobs_applied_to_subject' },
  { pattern: /\bid[:#]?\s*[A-Z0-9-]{3,}\s*[-–—]\s*[A-Za-z]/i, label: 'job_id_title_line' }
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
  const interviewContextHits = collectPatternHits(INTERVIEW_CONTEXT_PATTERNS, corpus);
  const interviewActionHits = collectPatternHits(INTERVIEW_ACTION_PATTERNS, corpus);
  const interviewStageInviteHits = collectPatternHits(INTERVIEW_STAGE_INVITE_PATTERNS, corpus);
  const interviewStageAssessmentHits = collectPatternHits(INTERVIEW_STAGE_ASSESSMENT_PATTERNS, corpus);
  const interviewStageActionHits = collectPatternHits(INTERVIEW_STAGE_ACTION_PATTERNS, corpus);
  const interviewVagueHits = collectPatternHits(INTERVIEW_VAGUE_PATTERNS, corpus);
  const interviewProcessOnlyHits = collectPatternHits(INTERVIEW_PROCESS_ONLY_PATTERNS, corpus);
  const interviewConditionalHits = collectPatternHits(INTERVIEW_CONDITIONAL_PATTERNS, corpus);
  const interviewNegativeHits = collectPatternHits(INTERVIEW_NEGATIVE_PATTERNS, corpus);
  const hasDirectInterviewCta =
    /\bplease (?:share|send|provide).{0,40}\b(?:availability|time slots?)\b/i.test(corpus) ||
    /\bplease (?:select|choose|book).{0,25}\b(?:time|slot)\b/i.test(corpus) ||
    /\b(?:are you available|here are some times?)\b/i.test(corpus);
  const interviewMatches = Array.from(
    new Set([
      ...interviewContextHits.map((hit) => hit.label),
      ...interviewActionHits.map((hit) => hit.label),
      ...interviewStageInviteHits.map((hit) => hit.label),
      ...interviewStageAssessmentHits.map((hit) => hit.label),
      ...interviewStageActionHits.map((hit) => hit.label),
      ...(hasDirectInterviewCta ? ['direct_interview_cta'] : [])
    ])
  );

  const hasInterviewStageInvite = interviewStageInviteHits.length > 0;
  const hasInterviewStageAssessment =
    interviewStageAssessmentHits.some((hit) =>
      ['initial_interview', 'screening_test', 'attached_questions'].includes(hit.label)
    ) || /\bserve as your initial interview\b/i.test(corpus);
  const hasInterviewStageAction =
    interviewStageActionHits.length > 0 || /\bsubmit (?:your )?(?:answers?|responses?)\b/i.test(corpus);
  const hasContext = Boolean(
    (company && cleanLine(company)) ||
    (role && cleanLine(role)) ||
    JOB_CONTEXT_PATTERN.test(corpus) ||
    /\binterview\b/i.test(corpus)
  );
  const shouldTreatAsInterviewStageAssessment =
    hasInterviewStageInvite &&
    hasInterviewStageAssessment &&
    hasInterviewStageAction &&
    hasContext &&
    !digestVeto &&
    interviewNegativeHits.length === 0;
  if (shouldTreatAsInterviewStageAssessment) {
    return {
      status: 'interview_requested',
      confidence: 90,
      source: `interview_stage:${interviewStageInviteHits[0]?.label || 'assessment_stage_invite'}`,
      matched: interviewStageInviteHits[0]?.label || null,
      rejectionMatches: rejectionHits.map((hit) => hit.label),
      interviewMatches,
      appliedMatches: appliedHits.map((hit) => hit.label),
      negativeMatches: [
        ...interviewNegativeHits.map((hit) => hit.label),
        ...interviewProcessOnlyHits.map((hit) => hit.label),
        ...interviewVagueHits.map((hit) => hit.label)
      ],
      interviewSuppressionMatches: interviewProcessOnlyHits.map((hit) => hit.label),
      decisionReason: 'assessment_interview_stage_signals'
    };
  }

  const hasInterviewContext = interviewContextHits.length > 0;
  const hasInterviewAction = interviewActionHits.length > 0 || hasDirectInterviewCta;
  const hasExplicitSchedulingRequest = hasDirectInterviewCta;
  const interviewSuppressedByProcessOnlyLanguage =
    interviewProcessOnlyHits.length > 0 && !hasExplicitSchedulingRequest;
  const interviewSuppressedByConditionalLanguage =
    interviewConditionalHits.length > 0 && !hasExplicitSchedulingRequest;
  const interviewSuppressedByNegatives =
    digestVeto ||
    interviewNegativeHits.length > 0 ||
    interviewSuppressedByProcessOnlyLanguage ||
    interviewSuppressedByConditionalLanguage ||
    (interviewVagueHits.length > 0 && !hasInterviewAction);
  if (hasInterviewContext && hasInterviewAction && hasContext && !interviewSuppressedByNegatives) {
    return {
      status: 'interview_requested',
      confidence: 88,
      source: `interview_phrase:${interviewMatches[0] || interviewContextHits[0]?.label || 'explicit_interview_signal'}`,
      matched: interviewMatches[0] || interviewContextHits[0]?.label || null,
      rejectionMatches: rejectionHits.map((hit) => hit.label),
      interviewMatches,
      appliedMatches: appliedHits.map((hit) => hit.label),
      negativeMatches: [
        ...interviewNegativeHits.map((hit) => hit.label),
        ...interviewProcessOnlyHits.map((hit) => hit.label),
        ...interviewConditionalHits.map((hit) => hit.label),
        ...interviewVagueHits.map((hit) => hit.label)
      ],
      interviewSuppressionMatches: [
        ...interviewProcessOnlyHits.map((hit) => hit.label),
        ...interviewConditionalHits.map((hit) => hit.label)
      ],
      decisionReason: 'explicit_interview_signal'
    };
  }

  const messageHits = collectPatternHits(MESSAGE_NOTIFICATION_PATTERNS, corpus);
  const messageNegativeHits = collectPatternHits(MESSAGE_NOTIFICATION_NEGATIVE_PATTERNS, corpus);
  const hasMessageEnvelope =
    /\bnew message from\b/i.test(corpus) ||
    /\byou(?:'|’)ve received a new message(?:\s+from)?\b/i.test(corpus);
  const hasMessageAction = /\bview message\b/i.test(corpus) || /\breply from your account\b/i.test(corpus);
  const hasMessageJobAnchor =
    hasContext ||
    /\bnew message from\b.{0,140}[-–—].{0,140}\b(?:associate|specialist|engineer|developer|analyst|manager|intern)\b/i.test(
      corpus
    );
  const shouldTreatAsMessageNotification =
    messageHits.length > 0 &&
    messageNegativeHits.length === 0 &&
    !digestVeto &&
    hasMessageJobAnchor &&
    (hasMessageEnvelope || (messageHits.length >= 2 && hasMessageAction));
  if (shouldTreatAsMessageNotification) {
    return {
      status: 'message_received',
      confidence: 84,
      source: `message_notification:${messageHits[0]?.label || 'message_notification'}`,
      matched: messageHits[0]?.label || null,
      rejectionMatches: rejectionHits.map((hit) => hit.label),
      interviewMatches,
      appliedMatches: appliedHits.map((hit) => hit.label),
      negativeMatches: [
        ...interviewNegativeHits.map((hit) => hit.label),
        ...interviewProcessOnlyHits.map((hit) => hit.label),
        ...interviewConditionalHits.map((hit) => hit.label),
        ...interviewVagueHits.map((hit) => hit.label),
        ...messageNegativeHits.map((hit) => hit.label)
      ],
      interviewSuppressionMatches: [
        ...interviewProcessOnlyHits.map((hit) => hit.label),
        ...interviewConditionalHits.map((hit) => hit.label)
      ],
      decisionReason: 'message_notification_signal'
    };
  }

  const appliedHit = appliedHits[0] || null;
  if (appliedHit) {
    return {
      status: 'applied',
      confidence: 90,
      source: `applied_phrase:${appliedHit.label}`,
      matched: appliedHit.label,
      rejectionMatches: rejectionHits.map((hit) => hit.label),
      interviewMatches,
      appliedMatches: appliedHits.map((hit) => hit.label),
      negativeMatches: [
        ...interviewNegativeHits.map((hit) => hit.label),
        ...interviewProcessOnlyHits.map((hit) => hit.label),
        ...interviewConditionalHits.map((hit) => hit.label),
        ...interviewVagueHits.map((hit) => hit.label)
      ],
      interviewSuppressionMatches: [
        ...interviewProcessOnlyHits.map((hit) => hit.label),
        ...interviewConditionalHits.map((hit) => hit.label)
      ],
      decisionReason:
        interviewProcessOnlyHits.length > 0 || interviewConditionalHits.length > 0
          ? 'interview_process_language_suppressed_to_applied'
          : 'applied_phrase_match'
    };
  }

  if (defaultStatus) {
    return {
      status: defaultStatus,
      confidence: 74,
      source: 'default',
      matched: null,
      rejectionMatches: rejectionHits.map((hit) => hit.label),
      interviewMatches,
      appliedMatches: appliedHits.map((hit) => hit.label),
      negativeMatches: [
        ...interviewNegativeHits.map((hit) => hit.label),
        ...interviewProcessOnlyHits.map((hit) => hit.label),
        ...interviewConditionalHits.map((hit) => hit.label),
        ...interviewVagueHits.map((hit) => hit.label)
      ],
      interviewSuppressionMatches: [
        ...interviewProcessOnlyHits.map((hit) => hit.label),
        ...interviewConditionalHits.map((hit) => hit.label)
      ],
      decisionReason: 'fallback_default_status'
    };
  }
  return {
    status: undefined,
    confidence: 0,
    source: 'none',
    matched: null,
    rejectionMatches: rejectionHits.map((hit) => hit.label),
    interviewMatches,
    appliedMatches: appliedHits.map((hit) => hit.label),
    negativeMatches: [
      ...interviewNegativeHits.map((hit) => hit.label),
      ...interviewProcessOnlyHits.map((hit) => hit.label),
      ...interviewConditionalHits.map((hit) => hit.label),
      ...interviewVagueHits.map((hit) => hit.label)
    ],
    interviewSuppressionMatches: [
      ...interviewProcessOnlyHits.map((hit) => hit.label),
      ...interviewConditionalHits.map((hit) => hit.label)
    ],
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
