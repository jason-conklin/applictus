const DENYLIST = [
  /unsubscribe/i,
  /newsletter/i,
  /promotion/i,
  /sale\b/i,
  /discount/i,
  /marketing/i
];

const LINKEDIN_CONFIRMATION_RULE = {
  name: 'linkedin_application_sent',
  detectedType: 'confirmation',
  confidence: 0.92,
  requiresJobContext: false,
  patterns: [
    /your application was sent to/i,
    /applied on\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}/i
  ],
  senderPattern: /linkedin\.com/i
};

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
      /we appreciate your interest in the (?:position|role|opportunity)/i,
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
    patterns: [
      /schedule (?:an|your) interview/i,
      /interview (?:invite|invitation|confirmed|availability)/i,
      /interview (?:schedule|scheduled|scheduling)/i,
      /phone screen/i,
      /video interview/i,
      /thank you for interviewing/i,
      /thank you for (?:the )?interview/i,
      /select (?:a|your) time for an interview/i
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

function hasJobContext(text) {
  return /\b(application|apply|applied|position|role|job|candidate|candidacy|hiring|recruit|interview)\b/i.test(
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
    const matched = rule.patterns.find((pattern) => pattern.test(text));
    if (matched) {
      return { rule, matched };
    }
  }
  return null;
}

function classifyEmail({ subject, snippet, sender }) {
  const text = `${normalize(subject)} ${normalize(snippet)} ${normalize(sender)}`.trim();
  if (!text) {
    return { isJobRelated: false, explanation: 'Empty subject/snippet.' };
  }

  const minConfidence = 0.6;
  const rules = RULES;
  const jobContext = hasJobContext(text) || hasSubjectRolePattern(normalize(subject));

  // High-confidence LinkedIn Easy Apply confirmation override (before denylist).
  const senderMatchesLinkedIn = LINKEDIN_CONFIRMATION_RULE.senderPattern.test(sender || '');
  if (senderMatchesLinkedIn) {
    const linkedInMatch = LINKEDIN_CONFIRMATION_RULE.patterns.find((p) => p.test(text));
    if (linkedInMatch) {
      return {
        isJobRelated: true,
        detectedType: 'confirmation',
        confidenceScore: LINKEDIN_CONFIRMATION_RULE.confidence,
        explanation: 'LinkedIn application sent',
        reason: LINKEDIN_CONFIRMATION_RULE.name
      };
    }
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
    return {
      isJobRelated: true,
      detectedType: rejectionMatch.rule.detectedType,
      confidenceScore: rejectionMatch.rule.confidence,
      explanation: `Matched ${rejectionMatch.rule.name} via ${rejectionMatch.matched}.`,
      reason: rejectionMatch.rule.name
    };
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
  RULES,
  DENYLIST
};
