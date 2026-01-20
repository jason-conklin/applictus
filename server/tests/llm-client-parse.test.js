const test = require('node:test');
const assert = require('node:assert/strict');

const { parseModelJson } = require('../src/llm/client');
const { validateOrThrow } = require('../src/llm/promptTemplate');

test('parseModelJson handles fenced JSON', () => {
  const raw = '```json\n{"is_job_related":true,"event_type":"confirmation","company_name":null,"job_title":null,"external_req_id":null,"confidence":0.9,"signals":{"job_context_signals":[],"rejection_signals":[],"confirmation_signals":[]},"evidence":{"company_source":"unknown","role_source":"unknown","decision_source":"unknown"},"notes":""}\n```';
  const res = parseModelJson(raw);
  assert.equal(res.ok, true);
  validateOrThrow(JSON.stringify(res.parsed));
});

test('parseModelJson extracts JSON after leading text', () => {
  const raw = 'Here is the result { "is_job_related": true, "event_type": "non_job", "company_name": null, "job_title": null, "external_req_id": null, "confidence": 0.5, "signals": {"job_context_signals": [], "rejection_signals": [], "confirmation_signals": []}, "evidence": {"company_source": "unknown", "role_source": "unknown", "decision_source": "unknown"}, "notes": "" } thanks';
  const res = parseModelJson(raw);
  assert.equal(res.ok, true);
  validateOrThrow(JSON.stringify(res.parsed));
});

test('schema validation fails on bad enum', () => {
  const raw = '{"is_job_related":true,"event_type":"bad","company_name":null,"job_title":null,"external_req_id":null,"confidence":0.9,"signals":{"job_context_signals":[],"rejection_signals":[],"confirmation_signals":[]},"evidence":{"company_source":"unknown","role_source":"unknown","decision_source":"unknown"},"notes":""}';
  const res = parseModelJson(raw);
  assert.equal(res.ok, true);
  assert.throws(() => validateOrThrow(JSON.stringify(res.parsed)));
});
