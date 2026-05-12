const test = require('node:test');
const assert = require('node:assert/strict');

const { extractForwardedOriginalMessage } = require('../src/forwardedMessage');
const { parseJobEmail } = require('../src/parseJobEmail');
const { applyFieldUpdate } = require('../src/safeFieldUpdate');
const { extractThreadIdentity, extractJobTitle } = require('../../shared/matching');

function forwardedHtml({ from, subject, to = 'jason@example.com', bodyLines = [] }) {
  const lines = [
    'Forwarding this to Applictus.',
    '',
    '---------- Forwarded message ---------',
    `From: ${from}`,
    'Date: Tue, May 12, 2026 at 9:30 AM',
    `Subject: ${subject}`,
    `To: ${to}`,
    '',
    ...bodyLines
  ];
  return lines.map((line) => `<div>${line}</div>`).join('');
}

async function deriveApplicationFields({ sender, subject, bodyText }) {
  const parsed = await parseJobEmail({
    fromEmail: sender,
    subject,
    text: bodyText,
    html: ''
  });
  const snippet = String(bodyText || '').slice(0, 240);
  const identity = extractThreadIdentity({ subject, sender, snippet, bodyText });
  const roleResult = extractJobTitle({
    subject,
    snippet,
    bodyText,
    sender,
    companyName: parsed.company || identity.companyName || null
  });

  return {
    company: parsed.company || identity.companyName || null,
    role: parsed.role || roleResult.jobTitle || identity.jobTitle || null
  };
}

const ROLE_CASES = [
  {
    company: 'METRIX IT SOLUTIONS INC',
    role: 'Charles River Developer',
    sender: 'LinkedIn Jobs <jobs-noreply@linkedin.com>',
    subject: 'Jason, your application was sent to METRIX IT SOLUTIONS INC',
    bodyLines: [
      'METRIX IT SOLUTIONS INC',
      'Charles River Developer',
      'New York, NY (Hybrid)',
      'View job'
    ]
  },
  {
    company: 'Scientific Search',
    role: 'Application Developer',
    sender: 'Scientific Search <jobs@scientificsearch.com>',
    subject: 'Regarding your application for Application Developer at Scientific Search',
    bodyLines: [
      'We are writing regarding your application for Application Developer at Scientific Search.',
      'View job'
    ]
  },
  {
    company: 'Mastech Digital',
    role: 'Full Stack Engineer',
    sender: 'Mastech Digital <careers@mastechdigital.com>',
    subject: 'Your application for Full Stack Engineer at Mastech Digital',
    bodyLines: ['Thank you for your application for Full Stack Engineer at Mastech Digital.']
  },
  {
    company: 'Aegistech',
    role: 'Software Engineer/Application Support',
    sender: 'Aegistech <careers@aegistech.com>',
    subject: 'Your application for Software Engineer/Application Support at Aegistech',
    bodyLines: ['We received your application for Software Engineer/Application Support at Aegistech.']
  },
  {
    company: 'Capgemini',
    role: 'Java Developer',
    sender: 'Capgemini <careers@capgemini.com>',
    subject: 'You applied to Java Developer at Capgemini',
    bodyLines: ['You applied to Java Developer at Capgemini.', 'View job']
  },
  {
    company: 'CubX Inc',
    role: 'Full Stack Software Engineer',
    sender: 'CubX Inc <careers@cubx.com>',
    subject: 'Your application for Full Stack Software Engineer at CubX Inc',
    bodyLines: ['Your application for the Full Stack Software Engineer job was submitted successfully.']
  },
  {
    company: 'SynergisticIT',
    role: 'junior software developer/AI engineer',
    sender: 'SynergisticIT <careers@synergisticit.com>',
    subject: 'Your application for junior software developer/AI engineer at SynergisticIT',
    bodyLines: [
      'Thank you for your application for junior software developer/AI engineer at SynergisticIT.'
    ]
  }
];

test('forwarded-wrapper and admin-style inputs derive the same company and role', async () => {
  for (const sample of ROLE_CASES) {
    const adminFields = await deriveApplicationFields({
      sender: sample.sender,
      subject: sample.subject,
      bodyText: sample.bodyLines.join('\n')
    });

    const forwarded = extractForwardedOriginalMessage({
      subject: `Fwd: ${sample.subject}`,
      text: '',
      html: forwardedHtml(sample),
      fromEmail: 'jason@example.com'
    });
    assert.equal(forwarded.isForwarded, true, sample.company);

    const forwardedFields = await deriveApplicationFields({
      sender: forwarded.originalFromEmail || sample.sender,
      subject: forwarded.originalSubject,
      bodyText: forwarded.originalText
    });

    assert.equal(adminFields.company, sample.company);
    assert.equal(adminFields.role, sample.role);
    assert.equal(forwardedFields.company, sample.company);
    assert.equal(forwardedFields.role, sample.role);
    assert.notEqual(forwardedFields.role, '');
  }
});

test('blank forwarding parse does not overwrite an existing non-empty role', () => {
  const result = applyFieldUpdate({
    existingValue: 'Charles River Developer',
    existingConfidence: 88,
    existingSource: 'parser',
    newValue: '',
    newConfidence: 0,
    newSource: 'parser'
  });

  assert.equal(result.accepted, false);
  assert.equal(result.value, 'Charles River Developer');
});
