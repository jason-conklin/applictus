const SECTION_HEADINGS = [
  { key: 'required', patterns: [/^required/i, /^requirements/i, /^basic qualifications/i, /^must have/i] },
  { key: 'preferred', patterns: [/^preferred/i, /^nice to have/i, /^desired/i] },
  { key: 'responsibilities', patterns: [/^responsibil/i, /^you will/i, /^what you will do/i] },
  { key: 'qualifications', patterns: [/^qualifications/i, /^skills/i, /^experience/i] },
  { key: 'education', patterns: [/^education/i, /degree/i] },
  { key: 'clearance', patterns: [/clearance/i] }
];

const IGNORE_CUES = [
  /benefit/i,
  /insurance/i,
  /401k/i,
  /401\(k\)/i,
  /paid time off/i,
  /pto/i,
  /vacation/i,
  /leave/i,
  /life insurance/i,
  /wellness/i,
  /recognition/i,
  /perks/i,
  /about us/i,
  /our (mission|values|culture|employees)/i,
  /equal opportunity/i,
  /salary/i,
  /compensation/i
];

function splitSections(text = '') {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  let current = { key: 'other', content: [] };
  const sections = [];
  const flush = () => {
    if (current.content.length) {
      sections.push({ key: current.key, text: current.content.join(' ') });
    }
    current = { key: 'other', content: [] };
  };
  lines.forEach((line) => {
    if (!line) return;
    if (IGNORE_CUES.some((rx) => rx.test(line))) {
      flush();
      current = { key: 'ignore', content: [] };
      return;
    }
    const matched = SECTION_HEADINGS.find((h) => h.patterns.some((rx) => rx.test(line)));
    if (matched) {
      flush();
      current = { key: matched.key, content: [] };
      return;
    }
    if (current.key === 'ignore') return;
    current.content.push(line);
  });
  flush();
  return sections.filter((s) => s.text && s.key !== 'ignore');
}

module.exports = { splitSections };
