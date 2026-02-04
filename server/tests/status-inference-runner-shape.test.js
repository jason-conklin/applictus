const test = require('node:test');
const assert = require('node:assert/strict');

const { runStatusInferenceForApplication } = require('../src/statusInferenceRunner');

test('runStatusInferenceForApplication unwraps postgres-like {rows} events and does not crash', async () => {
  const db = {
    isAsync: true,
    prepare(sql) {
      const text = String(sql);
      return {
        get(...args) {
          if (text.includes('FROM job_applications')) {
            return Promise.resolve({
              id: args[0],
              user_id: args[1],
              archived: false,
              user_override: false,
              current_status: 'UNKNOWN',
              last_activity_at: null
            });
          }
          return Promise.resolve(null);
        },
        all() {
          if (text.includes('FROM email_events')) {
            return Promise.resolve({
              rows: [
                {
                  id: 'evt-1',
                  detected_type: 'confirmation',
                  confidence_score: 0.92,
                  subject: 'Application received',
                  snippet: 'Thank you for applying',
                  internal_date: Date.now(),
                  created_at: new Date().toISOString()
                }
              ]
            });
          }
          return Promise.resolve({ rows: [] });
        },
        run() {
          return Promise.resolve({ changes: 1 });
        }
      };
    }
  };

  const result = await runStatusInferenceForApplication(db, 'user-1', 'app-1');
  assert.equal(result.status, 'ok');
  assert.equal(result.inferred_status, 'APPLIED');
});

