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
      /congratulations.+offer/i
    ]
  },
  {
    name: 'rejection',
    detectedType: 'rejection',
    confidence: 0.95,
    patterns: [
      /not moving forward/i,
      /regret to inform/i,
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
      /thank you for applying/i,
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
      /your application is in review/i
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
      /candidate portal/i,
      /position you applied/i
    ]
  }
];

function normalize(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function classifyEmail({ subject, snippet }) {
  const text = `${normalize(subject)} ${normalize(snippet)}`.trim();
  if (!text) {
    return { isJobRelated: false, explanation: 'Empty subject/snippet.' };
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

  for (const rule of RULES) {
    const matched = rule.patterns.find((pattern) => pattern.test(text));
      if (matched) {
        return {
          isJobRelated: true,
          detectedType: rule.detectedType,
          confidenceScore: rule.confidence,
          explanation: `Matched ${rule.name} via ${matched}.`,
          reason: rule.name
        };
      }
    }

  return { isJobRelated: false, explanation: 'No allowlist match.', reason: 'no_allowlist' };
}

module.exports = {
  classifyEmail,
  RULES,
  DENYLIST
};
