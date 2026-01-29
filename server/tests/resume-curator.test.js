const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeAtsScore,
  buildResumeTailorPrompt,
  extractJobDescriptionFromUrl
} = require('../../shared/resumeCurator');

test('computeAtsScore matches keywords and returns score', () => {
  const jd =
    'We need a Software Engineer with strong React and Node experience. React developers collaborate with product.';
  const resume = 'React developer who builds Node services and GraphQL APIs.';
  const result = computeAtsScore({ resumeText: resume, jobDescriptionText: jd });
  assert.ok(result.score >= 10, 'score should be reasonable');
  assert.ok(result.matched_keywords.includes('react'));
  assert.ok(result.matched_keywords.includes('node'));
  assert.ok(Array.isArray(result.missing_keywords));
});

test('buildResumeTailorPrompt includes JSON schema and instructions', () => {
  const prompt = buildResumeTailorPrompt({
    baseResumeText: 'Base resume text',
    jobDescriptionText: 'Job description text',
    options: { includeCoverLetter: true, targetKeywords: ['react', 'node'] },
    companyName: 'Acme',
    jobTitle: 'Software Engineer'
  });
  assert.ok(prompt.includes('STRICT JSON'));
  assert.ok(prompt.includes('"resume_text"'));
  assert.ok(prompt.includes('cover_letter_text'));
  assert.ok(prompt.includes('Base resume text'));
  assert.ok(prompt.includes('Job description text'));
});

test('extractJobDescriptionFromUrl is placeholder', () => {
  const res = extractJobDescriptionFromUrl('https://example.com/jd');
  assert.strictEqual(res.supported, false);
  assert.ok(res.reason);
});
