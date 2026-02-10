const test = require('node:test');
const assert = require('node:assert/strict');

const {
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

