const { splitSections } = require('./jdSectionParser');

const ALLOW_SKILLS = [
  'c++',
  'c#',
  'java',
  'python',
  'javascript',
  'typescript',
  'node',
  'react',
  'angular',
  'vue',
  'go',
  'rust',
  'sql',
  'postgres',
  'mysql',
  'aws',
  'azure',
  'gcp',
  'docker',
  'kubernetes',
  'linux',
  'unix',
  'windows',
  'agile',
  'scrum',
  'kanban',
  'oop',
  'object oriented',
  'sdlc',
  'integration testing',
  'unit testing',
  'ci',
  'cd',
  'embedded',
  'real-time',
  'rtos',
  'security clearance',
  'secret clearance',
  'ts/sci'
];

const STOPWORDS = new Set([
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
  'benefit',
  'growth',
  'provide',
  'provide',
  'support',
  'will'
]);

function normalize(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#/\.\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text = '') {
  return normalize(text)
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function extractSignalsFromText(text) {
  const tokens = tokenize(text);
  const signals = new Set();
  tokens.forEach((t) => {
    ALLOW_SKILLS.forEach((skill) => {
      if (t === skill || t.replace(/\+/g, ' +') === skill) {
        signals.add(skill);
      }
    });
  });
  // regex phrases
  const lower = text.toLowerCase();
  if (/object[- ]oriented|oop/.test(lower)) signals.add('object oriented');
  if (/agile/.test(lower)) signals.add('agile');
  if (/linux|unix/.test(lower)) signals.add('linux');
  if (/integration testing/.test(lower)) signals.add('integration testing');
  if (/unit testing/.test(lower)) signals.add('unit testing');
  if (/security clearance|secret clearance|ts\/sci|dod clearance/.test(lower)) signals.add('security clearance');
  if (/embedded/.test(lower)) signals.add('embedded');
  if (/real[- ]time/.test(lower)) signals.add('real-time');
  return Array.from(signals);
}

function extractSignals({ jobDescriptionText = '', companyName = '' }) {
  const sections = splitSections(jobDescriptionText);
  const required = [];
  const preferred = [];
  sections.forEach((sec) => {
    const sigs = extractSignalsFromText(sec.text);
    if (sec.key === 'required') required.push(...sigs);
    else if (sec.key === 'preferred') preferred.push(...sigs);
    else if (sec.key === 'responsibilities') required.push(...sigs);
  });
  const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));
  const companyTokens = companyName ? tokenize(companyName) : [];
  const filterCompany = (arr) => arr.filter((s) => !companyTokens.includes(s));
  return {
    required: filterCompany(uniq(required)),
    preferred: filterCompany(uniq(preferred))
  };
}

function extractResumeSignals(resumeText = '') {
  return extractSignalsFromText(resumeText);
}

module.exports = { extractSignals, extractResumeSignals };
