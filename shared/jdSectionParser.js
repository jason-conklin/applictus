const SECTION_HEADINGS = [
  { key: 'required', patterns: [/^required/i, /^basic qualifications/i, /^must have/i] },
  { key: 'preferred', patterns: [/^preferred/i, /^nice to have/i, /^desired/i] },
  { key: 'responsibilities', patterns: [/^responsibil/i, /^you will/i, /^what you will do/i] },
  { key: 'gains', patterns: [/gain experience/i, /will learn/i] }
];

const IGNORE_HEADINGS = [/benefit/i, /culture/i, /mission/i, /about/i, /salary/i, /compensation/i, /insurance/i, /leave/i, /vacation/i, /perk/i];

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
    if (IGNORE_HEADINGS.some((rx) => rx.test(line))) {
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
