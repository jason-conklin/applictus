const DENYLIST = [
  /unsubscribe/i,
  /newsletter/i,
  /promotion/i,
  /sale\b/i,
  /discount/i,
  /marketing/i
];

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
    patterns: [
      /not moving forward/i,
      /no longer under consideration/i,
      /not selected/i,
      /regret to inform/i,
      /we (?:have )?decided to move forward with other candidates/i,
      /decided to pursue other candidates/i,
      /will not be moving forward/i,
      /we will not be moving forward/i,
      /unfortunately.+(?:application|candidacy|role|position)/i,
      /thank you for your interest in the (?:position|role|opportunity)/i,
      /we appreciate your interest in the (?:position|role|opportunity)/i,
      /position has been filled/i,
      /application (?:was|has been) rejected/i
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
      /thanks for applying/i,
      /we (?:have )?received your application/i,
      /we received your application/i
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
      /assessment/i,
      /next steps/i,
      /position you applied/i
    ]
  }
];

const BALANCED_RULES = [
  {
    name: 'candidate_updates',
    detectedType: 'other_job_related',
    confidence: 0.6,
    patterns: [
      /candidate/i,
      /candidacy/i,
      /requisition/i,
      /job id[: ]*\d+/i,
      /position id[: ]*\d+/i
    ]
  },
  {
    name: 'assessments',
    detectedType: 'other_job_related',
    confidence: 0.6,
    patterns: [
      /assessment/i,
      /coding challenge/i,
      /take[- ]home/i,
      /hirevue/i,
      /skill survey/i
    ]
  },
  {
    name: 'application_updates',
    detectedType: 'other_job_related',
    confidence: 0.6,
    patterns: [
      /application update/i,
      /update on your application/i,
      /next steps/i,
      /application progress/i
    ]
  }
];

function normalize(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeMode(mode) {
  const value = String(mode || '').toLowerCase();
  return value === 'balanced' ? 'balanced' : 'strict';
}

function findRuleMatch(rules, text, minConfidence) {
  for (const rule of rules) {
    if (rule.confidence < minConfidence) {
      continue;
    }
    const matched = rule.patterns.find((pattern) => pattern.test(text));
    if (matched) {
      return { rule, matched };
    }
  }
  return null;
}

function classifyEmail({ subject, snippet, sender, mode }) {
  const text = `${normalize(subject)} ${normalize(snippet)} ${normalize(sender)}`.trim();
  if (!text) {
    return { isJobRelated: false, explanation: 'Empty subject/snippet.' };
  }

  const classifierMode = normalizeMode(mode);
  const minConfidence = classifierMode === 'balanced' ? 0.6 : 0.7;
  const rules = classifierMode === 'balanced' ? [...RULES, ...BALANCED_RULES] : RULES;

  const rejectionRules = rules.filter((rule) => rule.detectedType === 'rejection');
  const rejectionMatch = findRuleMatch(rejectionRules, text, 0.9);
  if (rejectionMatch) {
    return {
      isJobRelated: true,
      detectedType: rejectionMatch.rule.detectedType,
      confidenceScore: rejectionMatch.rule.confidence,
      explanation: `Matched ${rejectionMatch.rule.name} via ${rejectionMatch.matched}.`,
      reason: rejectionMatch.rule.name
    };
  }

  for (const pattern of DENYLIST) {
    if (pattern.test(text)) {
      return {
        isJobRelated: false,
        explanation: `Denied by ${pattern}.`,
        reason: 'denylisted'
      };
    }
  }

  const match = findRuleMatch(rules, text, minConfidence);
  if (match) {
    return {
      isJobRelated: true,
      detectedType: match.rule.detectedType,
      confidenceScore: match.rule.confidence,
      explanation: `Matched ${match.rule.name} via ${match.matched}.`,
      reason: match.rule.name
    };
  }

  const lowMatch = findRuleMatch(rules, text, 0);
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
  BALANCED_RULES,
  DENYLIST
};
