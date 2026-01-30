const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreAts } = require('../../shared/resumeAtsScore');

const BAE_JD = `
BAE Systems
Responsibilities
Design and develop software in C++ and Java for real-time embedded systems.
Required:
- Experience with Linux/Unix development
- Object-oriented programming (OOP)
- Agile methodologies
- Eligible for US DoD security clearance
Preferred:
- Integration testing automation
- C# experience
Benefits include insurance, paid time off, leave, and great culture.
`;

test('signal-based ATS filters noise and surfaces requirements', () => {
  const resume = 'Experienced developer with Python and Git.';
  const ats = scoreAts({ resumeText: resume, jobDescriptionText: BAE_JD, companyName: 'BAE Systems' });
  const missing = ats.missingSignals;
  const contains = (sig) => missing.some((m) => m.toLowerCase().includes(sig));
  assert.ok(contains('agile')); 
  assert.ok(contains('object')); 
  assert.ok(contains('linux')); 
  assert.ok(contains('clearance')); 
  assert.ok(contains('c++') || contains('c#') || contains('java'));

  const noiseWords = ['employees', 'insurance', 'paid', 'benefits', 'leave', 'world', 'well', 'also', 'team', 'customers'];
  noiseWords.forEach((w) => {
    assert.ok(!missing.some((m) => m.toLowerCase() === w), `should not include ${w}`);
  });
});
