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

test('schema validation fails on missing required signals', () => {
  const raw =
    '{"is_job_related":true,"event_type":"job_application","company_name":"Acme","job_title":"Engineer","confidence":0.9,"evidence":{"company_source":"from"},"notes":"example"}';
  const res = parseModelJson(raw);
  assert.equal(res.ok, true);
  assert.throws(() => validateOrThrow(JSON.stringify(res.parsed)));
});

test('schema validation passes on aligned example', () => {
  const good =
    '{"is_job_related":true,"event_type":"confirmation","company_name":"Acme","job_title":"Engineer","external_req_id":null,"confidence":0.92,"signals":{"job_context_signals":["application"],"rejection_signals":[],"confirmation_signals":["thank you"]},"evidence":{"company_source":"subject","role_source":"body","decision_source":"combined"},"notes":"Aligned with schema","safe_debug":{"provider_hint":null,"matched_patterns":["thank you"]}}';
  const res = parseModelJson(good);
  assert.equal(res.ok, true);
  validateOrThrow(JSON.stringify(res.parsed));
});
