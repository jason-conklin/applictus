const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isIndeedApplicationConfirmationEnvelope,
  isIndeedDuplicateReprocessCandidate,
  isDuplicateReprocessCandidate,
  isLinkedInDuplicateReprocessCandidate,
  hasLinkedInRejectionPhrase
} = require('../src/ingest');

test('LinkedIn duplicate reprocess candidate is true for non-rejection jobs updates', () => {
  const shouldReprocess = isLinkedInDuplicateReprocessCandidate({
    id: 'evt-1',
    sender: 'jobs-noreply@linkedin.com',
    subject: 'Your application to Software Engineer at Concorde Research Technologies',
    snippet: 'Your update from Concorde Research Technologies.',
    detected_type: 'other_job_related',
    reason_code: 'classified_not_job_related'
  });
  assert.equal(shouldReprocess, true);
});

test('LinkedIn duplicate reprocess candidate is true for confirmation with malformed role', () => {
  const shouldReprocess = isLinkedInDuplicateReprocessCandidate({
    id: 'evt-confirm-1',
    sender: 'jobs-noreply@linkedin.com',
    subject: 'Jason, your application was sent to Tata Consultancy Services',
    snippet: 'Your application was sent to Tata Consultancy Services.',
    detected_type: 'confirmation',
    role_title: 'Your application was sent to Tata Consultancy Services'
  });
  assert.equal(shouldReprocess, true);
});

test('LinkedIn duplicate reprocess candidate is false for already-rejected events', () => {
  const shouldReprocess = isLinkedInDuplicateReprocessCandidate({
    id: 'evt-2',
    sender: 'jobs-noreply@linkedin.com',
    subject: 'Your application to Software Engineer at Concorde Research Technologies',
    snippet:
      'Your update from Concorde Research Technologies. Unfortunately, we will not be moving forward with your application.',
    detected_type: 'rejection'
  });
  assert.equal(shouldReprocess, false);
});

test('LinkedIn duplicate reprocess candidate is false for non-LinkedIn sender', () => {
  const shouldReprocess = isLinkedInDuplicateReprocessCandidate({
    id: 'evt-3',
    sender: 'notifications-noreply@linkedin.com',
    subject: 'Top jobs this week',
    snippet: 'Unsubscribe',
    detected_type: 'other_job_related'
  });
  assert.equal(shouldReprocess, false);
});

test('hasLinkedInRejectionPhrase detects moving-forward rejection phrase', () => {
  assert.equal(
    hasLinkedInRejectionPhrase(
      'Unfortunately, we will not be moving forward with your application at this time.'
    ),
    true
  );
  assert.equal(hasLinkedInRejectionPhrase('Your update from Concorde Research Technologies.'), false);
});

test('Indeed duplicate reprocess candidate is true for previously ignored confirmation', () => {
  const shouldReprocess = isIndeedDuplicateReprocessCandidate({
    id: 'evt-indeed-1',
    sender: 'Indeed Apply <indeedapply@indeed.com>',
    subject: "Indeed Application: Sr. Analyst, Business Management Indeed o'clock Application submitted",
    snippet: 'The following items were sent to Valley National Bank. Good luck!',
    detected_type: 'other_job_related',
    reason_code: 'not_relevant',
    ingest_decision: 'unsorted',
    role_title: "Indeed o'clock Application submitted"
  });
  assert.equal(shouldReprocess, true);
});

test('Indeed duplicate reprocess candidate is false for already-correct confirmation', () => {
  const shouldReprocess = isIndeedDuplicateReprocessCandidate({
    id: 'evt-indeed-2',
    sender: 'Indeed Apply <indeedapply@indeed.com>',
    subject: 'Indeed Application: Sr. Analyst, Business Management',
    snippet: 'The following items were sent to Valley National Bank. Good luck!',
    detected_type: 'confirmation',
    ingest_decision: 'auto_created',
    role_title: 'Sr. Analyst, Business Management'
  });
  assert.equal(shouldReprocess, false);
});

test('generic duplicate reprocess candidate includes recoverable Indeed confirmations', () => {
  const shouldReprocess = isDuplicateReprocessCandidate({
    id: 'evt-indeed-3',
    sender: 'Indeed Apply <indeedapply@indeed.com>',
    subject: "Indeed Application: Sr. Analyst, Business Management Indeed o'clock Application submitted",
    snippet: 'The following items were sent to Valley National Bank. Good luck!',
    detected_type: 'other_job_related',
    reason_code: 'classified_not_job_related',
    ingest_decision: 'unsorted',
    role_title: "Indeed o'clock Application submitted"
  });
  assert.equal(shouldReprocess, true);
});

test('Indeed confirmation envelope recognizes non-indeed.com sender variants when subject/body are clear', () => {
  const isIndeed = isIndeedApplicationConfirmationEnvelope({
    sender: 'Indeed <noreply@indeedemail.com>',
    subject: "Indeed Application: Sr. Analyst, Business Management Indeed o'clock Application submitted",
    snippet: 'The following items were sent to Valley National Bank. Good luck!',
    body: 'The employer or job advertiser may reach out to you about your application.'
  });
  assert.equal(isIndeed, true);
});

test('generic duplicate reprocess candidate includes recoverable generic Indeed lifecycle subjects', () => {
  const shouldReprocess = isDuplicateReprocessCandidate({
    id: 'evt-indeed-4',
    sender: 'Indeed <noreply@indeedemail.com>',
    subject: 'Application Update',
    snippet: 'Your application status has changed',
    detected_type: 'other_job_related',
    reason_code: 'not_relevant',
    ingest_decision: 'unsorted',
    role_title: 'unknown role'
  });
  assert.equal(shouldReprocess, true);
});

test('generic duplicate reprocess candidate does not pull in Indeed job-alert digests', () => {
  const shouldReprocess = isDuplicateReprocessCandidate({
    id: 'evt-indeed-5',
    sender: 'Indeed <alerts@indeed.com>',
    subject: 'Job Alert: New jobs in New Jersey',
    snippet: 'Recommended jobs for you based on your search',
    detected_type: 'other_job_related',
    reason_code: 'not_relevant',
    ingest_decision: 'unsorted',
    role_title: 'unknown role'
  });
  assert.equal(shouldReprocess, false);
});
