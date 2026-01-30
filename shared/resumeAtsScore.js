const { extractSignals, extractResumeSignals } = require('./resumeSignals');

const SECTION_MAP = {
  default: 'Skills',
  clearance: 'Compliance',
  degree: 'Education',
  methods: 'Experience',
  testing: 'Experience',
  documentation: 'Experience'
};

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
  const missingSignals = rankSignals([...missingRequired, ...missingPreferred]).slice(0, 12);

  const suggestions = buildSuggestions({ missingRequired, missingPreferred }).slice(0, 10);

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

function rankSignals(signals) {
  const weight = (sig) => {
    const s = sig.toLowerCase();
    if (s.includes('clearance')) return 100;
    if (s.includes('c++') || s.includes('c#') || s.includes('java') || s.includes('python')) return 90;
    if (s.includes('linux') || s.includes('unix')) return 85;
    if (s.includes('agile') || s.includes('object')) return 80;
    if (s.includes('testing')) return 75;
    if (s.includes('degree')) return 70;
    return 50;
  };
  return Array.from(new Set(signals)).sort((a, b) => weight(b) - weight(a));
}

function buildSuggestions({ missingRequired, missingPreferred }) {
  const suggestions = [];
  const add = (type, section, importance, change, reason, evidence) => {
    suggestions.push({
      id: `${type}-${change}-${section}`,
      type,
      section,
      importance,
      change,
      reason,
      evidence
    });
  };

  missingRequired.forEach((sig) => {
    const section = mapSection(sig);
    add('missing-required', section, 'High', `Add ${sig} to your ${section}`, 'Required by the JD.', sig);
  });
  missingPreferred.forEach((sig) => {
    const section = mapSection(sig);
    add('missing-preferred', section, 'Medium', `Consider adding ${sig} to your ${section}`, 'Preferred by the JD.', sig);
  });
  if (!suggestions.some((s) => s.type === 'metrics')) {
    add('metrics', 'Experience', 'Medium', 'Add metrics to key bullets', 'Quantified impact improves screening.', null);
  }
  return suggestions;
}

function mapSection(sig) {
  const lower = sig.toLowerCase();
  if (lower.includes('degree')) return SECTION_MAP.degree;
  if (lower.includes('clearance')) return SECTION_MAP.clearance;
  if (lower.includes('agile') || lower.includes('object') || lower.includes('testing') || lower.includes('documentation'))
    return SECTION_MAP.methods;
  return SECTION_MAP.default;
}

module.exports = { scoreAts };
