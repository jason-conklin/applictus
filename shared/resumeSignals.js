const { splitSections } = require('./jdSectionParser');

const SIGNAL_ALLOWLIST = {
  languages: ['c++', 'c#', 'java', 'python', 'javascript', 'typescript', 'go', 'rust'],
  frameworks: ['react', 'angular', 'vue', 'node', 'express', 'django', 'flask', 'spring'],
  os: ['linux', 'unix', 'windows'],
  cloud: ['aws', 'azure', 'gcp'],
  tools: ['docker', 'kubernetes', 'git', 'jenkins', 'ci', 'cd'],
  methods: ['agile methodologies', 'scrum', 'kanban', 'object-oriented programming', 'oop', 'sdlc'],
  testing: ['integration testing', 'unit testing', 'automation testing', 'tdd'],
  domain: ['embedded', 'real-time', 'rtos'],
  clearance: ['security clearance eligibility', 'secret clearance', 'ts/sci'],
  education: ['cs degree', 'ce degree', 'ee degree', 'bachelors degree', 'computer science degree'],
  misc: ['documentation']
};

const NOISE = new Set([
  'also',
  'other',
  'paid',
  'life',
  'benefits',
  'insurance',
  'leave',
  'company',
  'employees',
  'customer',
  'customers',
  'world',
  'team',
  'work',
  'range',
  'position',
  'role',
  'candidate',
  'candidates',
  'experience',
  'opportunity',
  'growth',
  'provide',
  'support',
  'will',
  'well',
  'good',
  'great',
  'people',
  'mission',
  'culture',
  'values'
]);

function normalize(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#/\.\\-\\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text = '') {
  return normalize(text)
    .split(' ')
    .filter((t) => t.length > 1 && !NOISE.has(t) && !/^\d+$/.test(t));
}

function mapTokenToSignal(token) {
  const lists = Object.values(SIGNAL_ALLOWLIST).flat();
  const match = lists.find((s) => s === token || s.replace(/ /g, '') === token);
  return match || null;
}

function extractSignalsFromText(text) {
  const signals = new Set();
  const lower = text.toLowerCase();

  // phrase-based signals
  if (/object[- ]oriented|oop/.test(lower)) signals.add('object-oriented programming');
  if (/agile|scrum|kanban/.test(lower)) signals.add('agile methodologies');
  if (/linux|unix/.test(lower)) signals.add('linux/unix');
  if (/integration testing/.test(lower)) signals.add('integration testing');
  if (/unit testing/.test(lower)) signals.add('unit testing');
  if (/security clearance|secret clearance|ts\/sci|dod clearance/.test(lower))
    signals.add('security clearance eligibility');
  if (/embedded/.test(lower)) signals.add('embedded');
  if (/real[- ]time/.test(lower)) signals.add('real-time');
  if (/documentation/.test(lower)) signals.add('documentation');
  if (/bachelor|bs\\b|b\\.s\\.|computer science|electrical engineering/.test(lower))
    signals.add('cs/ce degree');

  tokenize(text).forEach((tok) => {
    const sig = mapTokenToSignal(tok);
    if (sig) signals.add(sig);
  });

  return Array.from(signals);
}

function extractSignals({ jobDescriptionText = '', companyName = '' }) {
  const sections = splitSections(jobDescriptionText);
  const required = [];
  const preferred = [];
  sections.forEach((sec) => {
    const sigs = extractSignalsFromText(sec.text);
    if (['required', 'responsibilities', 'qualifications', 'education', 'clearance'].includes(sec.key)) {
      required.push(...sigs);
    } else if (sec.key === 'preferred') {
      preferred.push(...sigs);
    }
  });
  if (/clearance/i.test(jobDescriptionText)) {
    required.push('security clearance eligibility');
  }
  const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));
  const companyTokens = new Set(tokenize(companyName));
  const filterCompany = (arr) => arr.filter((s) => !companyTokens.has(s));
  return {
    required: filterCompany(uniq(required)),
    preferred: filterCompany(uniq(preferred))
  };
}

function extractResumeSignals(resumeText = '') {
  return extractSignalsFromText(resumeText);
}

module.exports = { extractSignals, extractResumeSignals };
