const { computeAtsScore } = require('./resumeCurator');

function normalizeKeywordList(text) {
  if (!text) return [];
  return text
    .split(/[,\n]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function buildSuggestions({ baseResumeText, jobDescriptionText, targetKeywords = [] }) {
  const ats = computeAtsScore({ resumeText: baseResumeText || '', jobDescriptionText: jobDescriptionText || '' });
  const missingKeywords = ats.missing_keywords || [];
  const suggestions = [];

  missingKeywords.forEach((kw) => {
    suggestions.push({
      kind: 'add_keyword',
      section: 'skills',
      change_text: `Add keyword: ${kw}`,
      reason_text: 'Keyword appears in the job description but not in your resume.',
      evidence_text: kw,
      impact: 'high'
    });
  });

  const metricsPattern = /(\d+%|\d{2,}\s?(k|\$|usd|people|users|customers|leads|revenue))/i;
  if (!metricsPattern.test(baseResumeText || '')) {
    suggestions.push({
      kind: 'add_metrics',
      section: 'experience',
      change_text: 'Add measurable impact (metrics) to experience bullets.',
      reason_text: 'Recruiters and ATS favor quantified achievements.',
      evidence_text: 'Add numbers like % improvement, revenue, users impacted.',
      impact: 'medium'
    });
  }

  const targetMissing = normalizeKeywordList(targetKeywords.join(','));
  targetMissing.forEach((kw) => {
    if (!ats.matched_keywords.includes(kw) && !missingKeywords.includes(kw)) {
      suggestions.push({
        kind: 'add_keyword',
        section: 'skills',
        change_text: `Add target keyword: ${kw}`,
        reason_text: 'You asked to target this keyword.',
        evidence_text: kw,
        impact: 'medium'
      });
    }
  });

  return { suggestions, ats };
}

module.exports = { buildSuggestions, normalizeKeywordList };
