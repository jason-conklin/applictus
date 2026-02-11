const DENYLIST = [
  /unsubscribe/i,
  /newsletter/i,
  /promotion/i,
  /sale\b/i,
  /discount/i,
  /marketing/i
];

const LINKEDIN_CONFIRMATION_RULE = {
  name: 'linkedin_application_sent_confirmation',
  detectedType: 'confirmation',
  confidence: 0.95,
  requiresJobContext: false,
  senderPattern: /jobs-noreply@linkedin\.com/i,
  subjectPattern: /^(?:.+,\s*)?your application was sent to\s+.+$/i,
  bodyPatterns: [/your application was sent to/i, /applied on\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}/i]
};

const LINKEDIN_REJECTION_RULE = {
  name: 'linkedin_application_rejection_update',
  detectedType: 'rejection',
  confidence: 0.97,
  senderPattern: /jobs-noreply@linkedin\.com/i,
  subjectPattern: /^your application to\s+.+\s+at\s+.+/i,
  bodyPatterns: [
    /unfortunately,\s*we will not be moving forward with your application/i,
    /we will not be moving forward with your application/i,
    /not be moving forward with your application/i
  ]
};

const STRONG_REJECTION_PATTERNS = [
  /unable to move forward/i,
  /we are unable to move forward/i,
  /not move forward with your application/i,
  /decided to pursue other candidates/i,
  /moving forward with other candidates/i,
  /we will not be moving forward/i,
  /we(?:'| )?ve decided to pursue other candidates/i,
  /after careful consideration[, ]+(?:we )?(?:are )?(?:not|unable|declined|declining|will not)/i,
  /unfortunately[, ]+(?:we )?(?:are )?(?:not|unable|declined|declining|will not|can(?:not|'t) move forward|pursue other candidates)/i
];

const PROFILE_SUBMITTED_RULE = {
  name: 'profile_submitted_confirmation',
  detectedType: 'confirmation',
  confidence: 0.92,
  requiresJobContext: true,
  patterns: [
    /\bprofile submitted to\b/i,
    /\bprofile submitted to\s+.+\s+for\s+.+\s*[\/|]\s*#?\d+/i,
    /\bwe have received the profile you submitted\b/i,
    /\breceived the profile you submitted for the\b/i,
    /\bif your profile matches the requirements\b/i
  ]
};

function isConditionalNotSelected(text) {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  const exact = /\bif\s+you(?:'re|\s+are)\s+not\s+selected\b/;
  if (exact.test(lower)) return true;
  const phrases = [
    /\bif you are not selected for this (?:position|role)\b/,
    /\bshould you not be selected\b/,
    /\bin the event you are not selected\b/
  ];
  if (phrases.some((p) => p.test(lower))) return true;
  const conditionalWindow =
    /(if|should|in the event|whether|may|might|could|please note that if)[^]{0,80}?not selected/;
  return conditionalWindow.test(lower);
}

function hasConfirmationReceiptCues(text) {
  if (!text) return false;
  return (
    /we (?:have )?received your application/i.test(text) ||
    /thank you for your application/i.test(text) ||
    /thank you for applying/i.test(text) ||
    /application received/i.test(text)
  );
}

function hasDecisionRejectionCues(text) {
  if (!text) return false;
  return STRONG_REJECTION_PATTERNS.some((p) => p.test(text));
}

const RULES = [
  {
    name: 'offer',
    detectedType: 'offer',
    confidence: 0.95,
    patterns: [
    /offer (?:letter|extended|of employment)/i,
    /we (?:are|re) pleased to offer/i,
    /congratulations.+offer/i,
    /offer(?:ing)? you the (?:position|role)/i
  ]
  },
  {
    name: 'rejection',
    detectedType: 'rejection',
    confidence: 0.95,
    requiresJobContext: true,
  patterns: [
    /not moving forward/i,
    /no longer under consideration/i,
    /not selected/i,
    /regret to inform/i,
    /unable to move forward/i,
    /we are unable to move forward/i,
    /after careful consideration/i,
    /after reviewing your application,? we(?:'| have)?(?:\s+)?decided to move forward/i,
    /we (?:have )?decided to move forward with other candidates/i,
    /we(?:'| have)?(?:\s+)?decided to pursue other candidates/i,
    /decided to pursue other candidates/i,
    /we (?:have )?chosen other candidates/i,
    /we (?:have )?chosen other applicants/i,
    /we (?:will not|won't) be moving forward/i,
    /we(?:'| have)?(?:\s+)?decided to go in a different direction/i,
    /moved to the next step in (?:their )?hiring process/i,
    /will not be moving forward/i,
    /we will not be moving forward/i,
    /application (?:was|has been) not selected/i,
    /your application was not selected/i,
      /unfortunately.+(?:application|candidacy|role|position)/i,
      /position has been filled/i,
      /application (?:was|has been) rejected/i,
      /application (?:was|has been) declined/i,
      /declined\b/i
    ]
  },
  {
    name: 'interview',
    detectedType: 'interview',
    confidence: 0.9,
    requiresJobContext: true,
    negativePatterns: [
      /\blinkedin\b/i,
      /\breacted to this post\b/i,
      /\bcommented on\b/i,
      /\bshare their thoughts\b/i,
      /\bview .* post\b/i,
      /\bnew (?:followers|connections|notifications)\b/i,
      /\bliked your post\b/i
    ],
    patterns: [
      /schedule (?:an|your) interview/i,
      /interview (?:invite|invitation|confirmed|availability)/i,
      /interview (?:schedule|scheduled|scheduling)/i,
      /video interview/i,
      /thank you for interviewing/i,
      /thank you for (?:the )?interview/i,
      /select (?:a|your) time for an interview/i,
      /(?=.*phone screen)(?=.*(schedule|calendly|availability|select a time|invite|interview|recruiter|talent|hiring))/i
    ]
  },
  {
    name: 'confirmation',
    detectedType: 'confirmation',
    confidence: 0.92,
    patterns: [
      /application (?:received|confirmation)/i,
      /application (?:submitted|submission received)/i,
      /thank you for applying/i,
      /thank you for your interest in the (?:position|role|opportunity)/i,
      /thank you for your application/i,
      /thanks for applying/i,
      /we (?:have )?received your application/i,
      /we received your application/i,
      /will review your (?:application|resume)/i,
      /thank you for applying to/i,
      /your application for the .* position/i,
      /application received/i,
      /an update on your application/i
    ]
  },
  {
    name: 'under_review',
    detectedType: 'under_review',
    confidence: 0.9,
    patterns: [
      /application (?:is )?under review/i,
      /application status[: ]+under review/i,
      /your application is in review/i,
      /application (?:is )?under consideration/i,
      /application (?:is )?being reviewed/i
    ]
  },
  {
    name: 'recruiter_outreach',
    detectedType: 'recruiter_outreach',
    confidence: 0.8,
    patterns: [
      /recruiter (?:from|at)/i,
      /talent acquisition/i,
      /reaching out about/i
    ]
  },
  {
    name: 'other_job_related',
    detectedType: 'other_job_related',
    confidence: 0.72,
    patterns: [
      /job application/i,
      /application status/i,
      /application received/i,
      /application was viewed/i,
      /your candidacy/i,
      /candidate portal/i,
      /candidate/i,
      /candidacy/i,
      /requisition/i,
      /job id[: ]*\d+/i,
      /position id[: ]*\d+/i,
      /assessment/i,
      /coding challenge/i,
      /take[- ]home/i,
      /hirevue/i,
      /skill survey/i,
      /next steps/i,
      /position you applied/i,
      /application update/i,
      /update on your application/i,
      /application progress/i
    ]
  }
];

const STRONG_REJECTION_RULE = {
  name: 'rejection_strong',
  detectedType: 'rejection',
  confidence: 0.98,
  requiresJobContext: true,
  patterns: [
    /not selected/i,
    /moved to the next step in (?:their )?hiring process/i,
    /we (?:will not|won't) be moving forward/i,
    /move forward with other candidates/i,
    /regret to inform/i,
    /go in a different direction/i
  ]
};

function normalize(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function isLinkedInJobsSender(sender) {
  return /jobs-noreply@linkedin\.com/i.test(String(sender || ''));
}

function isLinkedInJobsApplicationSentEmail({ subject, snippet, sender, body }) {
  if (!isLinkedInJobsSender(sender)) {
    return false;
  }
  const normalizedSubject = normalize(subject);
  const combinedText = `${normalize(snippet)}\n${normalize(body || '')}`;
  const hasSubjectEnvelope =
    /^.+,\s*your application was sent to\s+.+$/i.test(normalizedSubject) ||
    /^your application was sent to\s+.+$/i.test(normalizedSubject);
  const hasBodyEnvelope = /your application was sent to\s+.+/i.test(combinedText);
  const hasAppliedOn = /applied on\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}/i.test(combinedText);
  return hasSubjectEnvelope && (hasBodyEnvelope || hasAppliedOn);
}

function isLinkedInJobsUpdateEmail({ subject, snippet, sender, body }) {
  if (!isLinkedInJobsSender(sender)) {
    return false;
  }
  if (isLinkedInJobsApplicationSentEmail({ subject, snippet, sender, body })) {
    return true;
  }
  const normalizedSubject = normalize(subject);
  const combinedText = `${normalizedSubject}\n${normalize(snippet)}\n${normalize(body || '')}`;
  return /^your application to\s+/i.test(normalizedSubject) || /your update from\s+.+/i.test(combinedText);
}

function isLinkedInSocialNotification(text, sender = '') {
  const lower = text.toLowerCase();
  const senderLower = String(sender || '').toLowerCase();
  const isLinkedInSender = senderLower.includes('linkedin.com');
  const socialCues = [
    /reacted to this post/i,
    /commented on/i,
    /share their thoughts/i,
    /view .* post/i,
    /new follower/i,
    /connections?/i,
    /notifications?/i,
    /liked your post/i,
    /see what you missed/i
  ];
  const hasSocialCue = socialCues.some((p) => p.test(lower));
  return isLinkedInSender && hasSocialCue;
}

function hasJobContext(text) {
  return /\b(application|apply|applied|position|role|job|candidate|candidacy|hiring|recruit|recruiter|recruiting|interview|screen|screening)\b/i.test(
    text
  );
}

function hasSubjectRolePattern(subject) {
  return /\b[A-Z][A-Za-z0-9 '&/.()-]{2,}\s*[-–—]\s*[A-Z][A-Za-z0-9 '&/.()-]{2,}/.test(
    subject || ''
  );
}

function findRuleMatch(rules, text, minConfidence, jobContext) {
  for (const rule of rules) {
    if (rule.confidence < minConfidence) {
      continue;
    }
    if (rule.requiresJobContext && !jobContext) {
      continue;
    }
    if (rule.negativePatterns && rule.negativePatterns.some((p) => p.test(text))) {
      continue;
    }
    const matched = rule.patterns.find((pattern) => pattern.test(text));
    if (matched) {
      return { rule, matched };
    }
  }
  return null;
}

function classifyEmail({ subject, snippet, sender, body }) {
  const normalizedSnippet = normalize(snippet);
  const normalizedBody = normalize(body || '');
  const textSource = `${normalize(body || '')} ${normalize(snippet)} ${normalize(subject)} ${normalize(
    sender
  )}`.trim();
  const normalizedSubject = normalize(subject);
  const text = textSource.toLowerCase();
  if (!text) {
    return { isJobRelated: false, explanation: 'Empty subject/snippet.' };
  }

  const linkedInJobsUpdate = isLinkedInJobsUpdateEmail({ subject, snippet, sender, body });
  const linkedInApplicationSent = isLinkedInJobsApplicationSentEmail({ subject, snippet, sender, body });

  // Early guard: LinkedIn social/notification emails should not be classified as interview.
  if (!linkedInJobsUpdate && isLinkedInSocialNotification(textSource, sender)) {
    return { isJobRelated: false, explanation: 'LinkedIn social notification.' };
  }

  // Dedicated LinkedIn rejection template override for jobs updates.
  const linkedInRejectionInSnippet = LINKEDIN_REJECTION_RULE.bodyPatterns.some((pattern) =>
    pattern.test(normalizedSnippet)
  );
  const linkedInRejectionInBody = LINKEDIN_REJECTION_RULE.bodyPatterns.some((pattern) =>
    pattern.test(normalizedBody)
  );
  const linkedInRejectionSignal =
    linkedInRejectionInSnippet ||
    linkedInRejectionInBody ||
    LINKEDIN_REJECTION_RULE.bodyPatterns.some((pattern) => pattern.test(textSource));
  if (linkedInJobsUpdate && LINKEDIN_REJECTION_RULE.subjectPattern.test(normalizedSubject) && linkedInRejectionSignal) {
    const bodyOnlyReason = linkedInRejectionInBody && !linkedInRejectionInSnippet;
    return {
      isJobRelated: true,
      detectedType: LINKEDIN_REJECTION_RULE.detectedType,
      confidenceScore: LINKEDIN_REJECTION_RULE.confidence,
      explanation: 'LinkedIn rejection update detected.',
      reason: bodyOnlyReason ? 'linkedin_jobs_rejection_phrase_body' : LINKEDIN_REJECTION_RULE.name
    };
  }

  if (linkedInApplicationSent && LINKEDIN_CONFIRMATION_RULE.subjectPattern.test(normalizedSubject)) {
    const hasLinkedInBodySignal = LINKEDIN_CONFIRMATION_RULE.bodyPatterns.some((p) => p.test(textSource));
    if (hasLinkedInBodySignal) {
      return {
        isJobRelated: true,
        detectedType: LINKEDIN_CONFIRMATION_RULE.detectedType,
        confidenceScore: LINKEDIN_CONFIRMATION_RULE.confidence,
        explanation: 'LinkedIn application sent confirmation detected.',
        reason: LINKEDIN_CONFIRMATION_RULE.name
      };
    }
  }

  const minConfidence = 0.6;
  const rules = [PROFILE_SUBMITTED_RULE, ...RULES];
  const jobContext = hasJobContext(text) || hasSubjectRolePattern(normalize(subject));

  // Conditional "not selected" disclaimers in receipts should not be treated as rejection.
  if (
    isConditionalNotSelected(textSource) &&
    hasConfirmationReceiptCues(textSource) &&
    !hasDecisionRejectionCues(textSource)
  ) {
    return {
      isJobRelated: true,
      detectedType: 'confirmation',
      confidenceScore: 0.9,
      explanation: 'Conditional not selected disclaimer treated as confirmation.',
      reason: 'conditional_not_selected_receipt'
    };
  }

  // Strong rejection override regardless of confirmation cues
  const strongRejectionHit = STRONG_REJECTION_PATTERNS.find((p) => p.test(text));
  if (strongRejectionHit) {
    return {
      isJobRelated: true,
      detectedType: 'rejection',
      confidenceScore: 0.97,
      explanation: 'Strong rejection phrase detected',
      reason: 'rejection_override'
    };
  }

  const strongRejection = findRuleMatch([STRONG_REJECTION_RULE], text, 0.95, jobContext);
  if (strongRejection) {
    return {
      isJobRelated: true,
      detectedType: strongRejection.rule.detectedType,
      confidenceScore: strongRejection.rule.confidence,
      explanation: `Matched ${strongRejection.rule.name} via ${strongRejection.matched}.`,
      reason: strongRejection.rule.name
    };
  }

  // Denylist overrides generic allowlist (except for the strong rejection rule above).
  for (const pattern of DENYLIST) {
    if (pattern.test(text)) {
      if (linkedInJobsUpdate) {
        return {
          isJobRelated: true,
          detectedType: 'other_job_related',
          confidenceScore: 0.8,
          explanation: 'LinkedIn jobs update allowlisted.',
          reason: 'linkedin_jobs_update_allowlisted'
        };
      }
      return {
        isJobRelated: false,
        explanation: `Denied by ${pattern}.`,
        reason: 'denylisted'
      };
    }
  }

  const confirmationRules = rules.filter((rule) => rule.detectedType === 'confirmation');
  const rejectionRules = rules.filter((rule) => rule.detectedType === 'rejection');
  const rejectionMatch = findRuleMatch(rejectionRules, text, 0.9, jobContext);
  if (rejectionMatch) {
    const matchedPattern = rejectionMatch.matched;
    const isNotSelected = matchedPattern && /not selected/i.test(String(matchedPattern));
    const conditionalNotSelected =
      isNotSelected && isConditionalNotSelected(text) && hasConfirmationReceiptCues(text);
    const decisive = hasDecisionRejectionCues(text);
    if (!(conditionalNotSelected && !decisive)) {
      return {
        isJobRelated: true,
        detectedType: rejectionMatch.rule.detectedType,
        confidenceScore: rejectionMatch.rule.confidence,
        explanation: `Matched ${rejectionMatch.rule.name} via ${rejectionMatch.matched}.`,
        reason: rejectionMatch.rule.name
      };
    }
    // Conditional disclaimer present with receipt cues and no decisive rejection: allow confirmation path.
  }

  const confirmationMatch = findRuleMatch(confirmationRules, text, 0.9, jobContext);
  if (confirmationMatch) {
    return {
      isJobRelated: true,
      detectedType: confirmationMatch.rule.detectedType,
      confidenceScore: confirmationMatch.rule.confidence,
      explanation: `Matched ${confirmationMatch.rule.name} via ${confirmationMatch.matched}.`,
      reason: confirmationMatch.rule.name
    };
  }

  const match = findRuleMatch(rules, text, minConfidence, jobContext);
  if (match) {
    return {
      isJobRelated: true,
      detectedType: match.rule.detectedType,
      confidenceScore: match.rule.confidence,
      explanation: `Matched ${match.rule.name} via ${match.matched}.`,
      reason: match.rule.name
    };
  }

  const lowMatch = findRuleMatch(rules, text, 0, jobContext);
  if (lowMatch) {
    return {
      isJobRelated: false,
      explanation: `Matched ${lowMatch.rule.name} below threshold.`,
      reason: 'below_threshold'
    };
  }

  return { isJobRelated: false, explanation: 'No allowlist match.', reason: 'no_allowlist' };
}

module.exports = {
  classifyEmail,
  isLinkedInJobsUpdateEmail,
  isLinkedInJobsApplicationSentEmail,
  RULES,
  DENYLIST
};
