const test = require('node:test');
const assert = require('node:assert/strict');

const { inferStatus } = require('../../shared/statusInference');
const { ApplicationStatus } = require('../../shared/types');

function baseApplication(overrides = {}) {
  return {
    current_status: ApplicationStatus.UNKNOWN,
    last_activity_at: null,
    ...overrides
  };
}

function event(overrides = {}) {
  return {
    id: 'event-1',
    detected_type: 'confirmation',
    confidence_score: 0.92,
    subject: 'Application received',
    snippet: 'Thank you for applying',
    internal_date: Date.now(),
    created_at: new Date().toISOString(),
    ...overrides
  };
}

test('inferStatus auto-applies confirmation', () => {
  const result = inferStatus(baseApplication(), [event()]);
  assert.equal(result.inferred_status, ApplicationStatus.APPLIED);
  assert.equal(result.suggested_only, false);
  assert.ok(result.confidence >= 0.9);
});

test('inferStatus suggests when confidence is mid-range', () => {
  const result = inferStatus(baseApplication(), [event({ confidence_score: 0.8 })]);
  assert.equal(result.inferred_status, ApplicationStatus.APPLIED);
  assert.equal(result.suggested_only, true);
  assert.ok(result.confidence >= 0.7);
});

test('inferStatus detects interview completed via pattern', () => {
  const result = inferStatus(baseApplication(), [
    event({
      detected_type: 'interview',
      confidence_score: 0.95,
      subject: 'Thank you for interviewing with Acme',
      snippet: 'We appreciate your time'
    })
  ]);
  assert.equal(result.inferred_status, ApplicationStatus.INTERVIEW_COMPLETED);
  assert.equal(result.suggested_only, false);
});

test('inferStatus prefers terminal statuses over lower priority', () => {
  const result = inferStatus(baseApplication(), [
    event({
      id: 'event-1',
      detected_type: 'interview',
      confidence_score: 0.95,
      subject: 'Interview invitation'
    }),
    event({
      id: 'event-2',
      detected_type: 'rejection',
      confidence_score: 0.9,
      subject: 'Not moving forward'
    })
  ]);
  assert.equal(result.inferred_status, ApplicationStatus.REJECTED);
});

test('inferStatus uses higher confidence within same priority', () => {
  const result = inferStatus(baseApplication(), [
    event({
      id: 'event-1',
      detected_type: 'confirmation',
      confidence_score: 0.72
    }),
    event({
      id: 'event-2',
      detected_type: 'confirmation',
      confidence_score: 0.86
    })
  ]);
  assert.equal(result.inferred_status, ApplicationStatus.APPLIED);
  assert.equal(result.suggested_only, true);
  assert.ok(result.confidence >= 0.8);
});

test('inferStatus suggests ghosted when stale', () => {
  const staleDate = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString();
  const result = inferStatus(
    baseApplication({ current_status: ApplicationStatus.APPLIED, last_activity_at: staleDate }),
    []
  );
  assert.equal(result.inferred_status, ApplicationStatus.GHOSTED);
  assert.equal(result.suggested_only, true);
  assert.equal(result.confidence, 0.75);
});

test('inferStatus skips ghosted for terminal statuses', () => {
  const staleDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
  const result = inferStatus(
    baseApplication({ current_status: ApplicationStatus.REJECTED, last_activity_at: staleDate }),
    []
  );
  assert.equal(result.inferred_status, ApplicationStatus.UNKNOWN);
});

test('inferStatus keeps UNKNOWN for low confidence', () => {
  const result = inferStatus(baseApplication(), [event({ confidence_score: 0.5 })]);
  assert.equal(result.inferred_status, ApplicationStatus.UNKNOWN);
});

test('inferStatus ignores interview completed when confidence too low', () => {
  const result = inferStatus(baseApplication(), [
    event({
      detected_type: 'interview',
      confidence_score: 0.6,
      subject: 'Thank you for interviewing'
    })
  ]);
  assert.equal(result.inferred_status, ApplicationStatus.UNKNOWN);
});
