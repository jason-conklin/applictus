const test = require('node:test');
const assert = require('node:assert/strict');

const { extractThreadIdentity } = require('../src/../shared/matching');
const { classifyEmail } = require('../src/../shared/emailClassifier');
const { extractJobTitle } = require('../src/../shared/matching');

const digestBody = `
Workday Inbox - Your Daily Digest
Daily Digest for Jason Conklin
Notifications (1)
Thanks for applying!
Thank you for your interest in the 2026 IT Accelerated Development Program (ADP) – Software Developer Track position and in Raymond James.
Thanks again for taking the time to apply and for your interest in Raymond James.
Raymond James Talent Acquisition
Business Process: Job Application: Jason Conklin - R-0008694 2026 IT Accelerated Development Program (ADP) – Software Developer Track on 01/19/2026
Subject: Jason Conklin - R-0008694 2026 IT Accelerated Development Program (ADP) – Software Developer Track on 01/19/2026
`;

const digestSubject =
  'Workday Inbox - Your Daily Digest Jason Conklin - R-0008694 2026 IT Accelerated Development Program (ADP) – Software Developer Track';

test('Workday digest wrapper extracts company and role', () => {
  const identity = extractThreadIdentity({
    subject: digestSubject,
    sender: 'Workday <Workday@raymondjames.com>',
    snippet: '',
    bodyText: digestBody
  });
  assert.equal(identity.companyName, 'Raymond James');
  assert.ok(identity.jobTitle.includes('Software Developer Track'));
  assert.ok(identity.jobTitle.includes('ADP'));
  assert.notEqual(identity.companyName.toLowerCase(), 'daily digest');
});

test('Workday confirmation stays confirmation', () => {
  const subject = 'We have received your application';
  const snippet =
    'We have received your application for Junior Full Stack Java Developer and will be reviewing your information shortly';
  const classification = classifyEmail({
    subject,
    snippet,
    sender: 'bbh@myworkday.com'
  });
  assert.equal(classification.detectedType, 'confirmation');
  const role = extractJobTitle({
    subject,
    snippet,
    bodyText:
      'Business Process: Job Application: Jane Doe - 69073 Junior Full Stack Java Developer on 01/20/2026',
    senderName: 'Workday',
    sender: 'bbh@myworkday.com',
    companyName: 'Brown Brothers Harriman'
  });
  assert.ok(role?.jobTitle?.includes('Junior Full Stack Java Developer'));
});
