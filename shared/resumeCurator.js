const DEFAULT_STOPWORDS = new Set([
  'the','a','an','and','or','but','if','then','else','for','to','of','in','on','at','by','with','from','up','down','into','over','after','before','between','is','are','was','were','be','been','being','this','that','these','those','as','it','its','their','your','our','we','you','they','he','she','them','his','her','our','ours','yours','theirs','about','can','will','just','not','no'
]);

function normalizeText(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  const norm = normalizeText(text);
  return norm ? norm.split(' ') : [];
}

function topKeywords(jdText, { max = 60, min = 30 } = {}) {
  const tokens = tokenize(jdText).filter((t) => t && !DEFAULT_STOPWORDS.has(t));
  const counts = new Map();
  for (const t of tokens) {
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  // bigrams
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (!a || !b) continue;
    if (DEFAULT_STOPWORDS.has(a) || DEFAULT_STOPWORDS.has(b)) continue;
    const bg = `${a} ${b}`;
    counts.set(bg, (counts.get(bg) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  });
  const sliceCount = Math.min(Math.max(sorted.length, min), max);
  return sorted.slice(0, sliceCount).map((e) => e[0]);
}

function computeAtsScore({ resumeText = '', jobDescriptionText = '' }) {
  const keywords = topKeywords(jobDescriptionText);
  const resumeNorm = normalizeText(resumeText);
  const matched = [];
  for (const kw of keywords) {
    const kwNorm = kw;
    if (kwNorm && resumeNorm.includes(kwNorm)) {
      matched.push(kw);
    }
  }
  const uniqueMatched = Array.from(new Set(matched));
  const missing = keywords.filter((kw) => !uniqueMatched.includes(kw));
  const total = keywords.length || 1;
  const score = Math.round((uniqueMatched.length / total) * 100);
  return {
    score: Math.min(100, Math.max(0, score)),
    matched_keywords: uniqueMatched,
    missing_keywords: missing
  };
}

function buildResumeTailorPrompt({ baseResumeText, jobDescriptionText, options = {}, companyName, jobTitle }) {
  const {
    tone = 'neutral',
    focus = 'balanced',
    length = 'one_page',
    includeCoverLetter = false,
    targetKeywords = []
  } = options;

  const contextParts = [];
  if (companyName) contextParts.push(`Company: ${companyName}`);
  if (jobTitle) contextParts.push(`Role: ${jobTitle}`);

  const schema = `{
  "resume_text": string,
  "resume_sections": {
    "summary": string,
    "skills": string[],
    "experience": array,
    "projects": array,
    "education": array,
    "certifications": array
  },
  "change_log": {
    "added_keywords": string[],
    "removed_phrases": string[],
    "bullets_rewritten": number,
    "notes": string[]
  },
  "cover_letter_text": ${includeCoverLetter ? 'string' : 'null'}
}`;

  const prompt = [
    'You are a resume tailoring assistant. Create a tailored resume for the given job description.',
    'Use only truthful details from the provided resume; do NOT invent companies, projects, or metrics.',
    'Keep formatting ATS-friendly: plain text, no tables or multi-column layouts.',
    `Tone: ${tone}. Focus: ${focus}. Length: ${length}. Include cover letter: ${includeCoverLetter}.`,
    targetKeywords.length ? `Target keywords: ${targetKeywords.join(', ')}.` : '',
    contextParts.length ? `Context: ${contextParts.join(' | ')}` : '',
    'Return STRICT JSON only matching this schema:',
    schema,
    'Do not include any prose outside the JSON. Ensure JSON is valid.'
  ]
    .filter(Boolean)
    .join('\n');

  const materials = [
    '--- Base Resume ---',
    baseResumeText || '',
    '--- Job Description ---',
    jobDescriptionText || ''
  ].join('\n');

  return `${prompt}\n${materials}`;
}

function extractJobDescriptionFromUrl(url) {
  return { supported: false, reason: 'client must paste JD text' };
}

module.exports = {
  buildResumeTailorPrompt,
  computeAtsScore,
  extractJobDescriptionFromUrl
};
