const test = require('node:test');
const assert = require('node:assert/strict');

const { buildGmailSyncQuery, syncGmailMessages } = require('../src/ingest');

function createMockDb(counters) {
  return {
    prepare(sql) {
      const query = String(sql || '').replace(/\s+/g, ' ').trim();
      return {
        get() {
          if (query.includes('COUNT(*) AS count FROM email_events')) {
            return { count: 0 };
          }
          return null;
        },
        all() {
          return [];
        },
        run() {
          if (query.startsWith('INSERT INTO email_events')) {
            counters.insertedEvents += 1;
          }
          if (query.startsWith('INSERT INTO job_applications')) {
            counters.insertedApplications += 1;
          }
          if (query.startsWith('INSERT INTO email_skip_samples')) {
            counters.skipSamples += 1;
          }
          return { changes: 1 };
        }
      };
    }
  };
}

test('buildGmailSyncQuery enforces inbound-only exclusions', () => {
  const query = buildGmailSyncQuery({
    afterSeconds: 1700000000,
    beforeSeconds: 1700003600
  });
  assert.match(query, /\bin:inbox\b/);
  assert.match(query, /-from:me/);
  assert.match(query, /-in:sent/);
  assert.match(query, /after:1700000000/);
  assert.match(query, /before:1700003600/);
});

test('syncGmailMessages ignores outbound sent replies and creates no application events', async () => {
  const counters = {
    insertedEvents: 0,
    insertedApplications: 0,
    skipSamples: 0
  };
  let listedQuery = null;

  const gmail = {
    users: {
      getProfile: async () => ({ data: { emailAddress: 'jasonconklin.dev@gmail.com' } }),
      messages: {
        list: async ({ q }) => {
          listedQuery = q;
          return {
            data: {
              messages: [{ id: 'msg-1' }],
              resultSizeEstimate: 1,
              nextPageToken: null
            }
          };
        },
        get: async () => ({
          data: {
            id: 'msg-1',
            snippet: 'Tuesday, March 3rd at 4:00 PM works for me.',
            labelIds: ['SENT'],
            payload: {
              headers: [
                { name: 'From', value: 'Jason Conklin <jasonconklin.dev@gmail.com>' },
                { name: 'Subject', value: 'Re: Interview availability' },
                { name: 'Message-ID', value: '<msg-1@test>' }
              ],
              mimeType: 'text/plain',
              body: {}
            }
          }
        })
      }
    }
  };

  const now = new Date();
  const start = new Date(now.getTime() - 60 * 60 * 1000);
  const result = await syncGmailMessages({
    db: createMockDb(counters),
    userId: 'user-1',
    days: 1,
    maxResults: 10,
    mode: 'days',
    timeWindowStart: start,
    timeWindowEnd: now,
    authClientOverride: {},
    gmailServiceOverride: gmail,
    authenticatedUserEmailOverride: 'jasonconklin.dev@gmail.com'
  });

  assert.match(String(listedQuery || ''), /\bin:inbox\b/);
  assert.match(String(listedQuery || ''), /-from:me/);
  assert.match(String(listedQuery || ''), /-in:sent/);
  assert.equal(result.status, 'ok');
  assert.equal(result.created, 0);
  assert.equal(result.createdApplications, 0);
  assert.equal(result.matchedExisting, 0);
  assert.equal(result.skippedNotJob, 1);
  assert.equal(result.reasons.outbound_ignored, 1);
  assert.equal(counters.insertedEvents, 0);
  assert.equal(counters.insertedApplications, 0);
  assert.equal(counters.skipSamples, 1);
});
