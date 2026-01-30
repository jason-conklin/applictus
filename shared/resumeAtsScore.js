const { extractSignals, extractResumeSignals } = require('./resumeSignals');

function scoreAts({ resumeText, jobDescriptionText, companyName }) {
  const jdSignals = extractSignals({ jobDescriptionText, companyName });
  const resumeSignals = extractResumeSignals(resumeText || '');
  const matchedRequired = jdSignals.required.filter((s) => resumeSignals.includes(s));
  const missingRequired = jdSignals.required.filter((s) => !resumeSignals.includes(s));
  const matchedPreferred = jdSignals.preferred.filter((s) => resumeSignals.includes(s));
  const missingPreferred = jdSignals.preferred.filter((s) => !resumeSignals.includes(s));

  const requiredTotal = jdSignals.required.length || 1;
  const preferredTotal = jdSignals.preferred.length || 1;
  const requiredScore = (matchedRequired.length / requiredTotal) * 70;
  const preferredScore = (matchedPreferred.length / preferredTotal) * 20;
  const structureScore = hasStructure(resumeText) ? 10 : 0;
  const total = Math.round(Math.min(100, requiredScore + preferredScore + structureScore));

  const matchedSignals = [...matchedRequired, ...matchedPreferred].slice(0, 12);
  const missingSignals = [...missingRequired, ...missingPreferred].slice(0, 12);

  const suggestions = buildSuggestions({ missingRequired, missingPreferred });

  return {
    score: total,
    coverage: {
      required: { matched: matchedRequired.length, total: jdSignals.required.length },
      preferred: { matched: matchedPreferred.length, total: jdSignals.preferred.length }
    },
    matchedSignals,
    missingSignals,
    suggestions
  };
}

function hasStructure(text = '') {
  const lower = text.toLowerCase();
  return lower.includes('skills') && lower.includes('education') && /\d/.test(text);
}

function buildSuggestions({ missingRequired, missingPreferred }) {
  const suggestions = [];
  const add = (section, impact, change, reason) => {
    suggestions.push({
      id: `${section}-${change}-${impact}`,
      section,
      impact,
      change,
      reason
    });
  };
  missingRequired.forEach((sig) => {
    const section = pickSection(sig);
    add(section, 'High', `Add ${sig} to ${section}`, 'Required by the job description.');
  });
  missingPreferred.forEach((sig) => {
    const section = pickSection(sig);
    add(section, 'Medium', `Consider adding ${sig} to ${section}`, 'Preferred by the job description.');
  });
  if (!suggestions.some((s) => s.change.includes('metric'))) {
    add('Experience', 'Medium', 'Add metrics to key bullets', 'Quantified impact improves screening.');
  }
  return suggestions.slice(0, 12);
}

function pickSection(sig) {
  const lower = sig.toLowerCase();
  if (lower.includes('degree')) return 'Education';
  if (lower.includes('clearance')) return 'Compliance';
  return 'Skills';
}

module.exports = { scoreAts };
