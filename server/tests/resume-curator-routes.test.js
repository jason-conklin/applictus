const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.JOBTRACK_DB_PATH = ':memory:';
process.env.JOBTRACK_LOG_LEVEL = 'error';

// Mock LLM before server loads routes
const llmClient = require('../src/llmClient');
const MOCK_RESUME_TEXT = 'Generated tailored resume '.repeat(12); // > 200 chars
llmClient.runLlmExtraction = async () => ({
  ok: true,
  data: {
    resume_text: MOCK_RESUME_TEXT,
    resume_sections: { summary: 'Summary', skills: ['react'], experience: [], projects: [], education: [], certifications: [] },
    change_log: { added_keywords: ['react'], removed_phrases: [], bullets_rewritten: 1, notes: [] },
    cover_letter_text: null
  },
  model: 'mock-model',
  promptVersion: 'test'
});

const { startServer, stopServer } = require('../src/index');

async function createClient(baseUrl) {
  const cookieJar = new Map();
  let csrfToken = '';

  const refreshCsrf = async () => {
    const cookieHeader = buildCookieHeader();
    const res = await fetch(`${baseUrl}/api/auth/csrf`, {
      headers: cookieHeader ? { Cookie: cookieHeader } : {}
    });
    updateCookies(res);
    const body = await res.json().catch(() => ({}));
    csrfToken = body.csrfToken || '';
  };

  const updateCookies = (res) => {
    let setCookies = [];
    if (typeof res.headers.getSetCookie === 'function') {
      setCookies = res.headers.getSetCookie();
    } else if (res.headers.raw) {
      const raw = res.headers.raw()['set-cookie'];
      if (raw) setCookies = raw;
    } else {
      const single = res.headers.get('set-cookie');
      if (single) setCookies = [single];
    }
    for (const entry of setCookies) {
      const value = entry.split(';')[0];
      const name = value.split('=')[0];
      if (name) {
        cookieJar.set(name, value);
      }
    }
  };

  const buildCookieHeader = () => {
    const values = Array.from(cookieJar.values());
    return values.length ? values.join('; ') : '';
  };

  await refreshCsrf();

  return async function request(pathname, { method = 'GET', body } = {}) {
    const cookieHeader = buildCookieHeader();
    const headers = { 'Content-Type': 'application/json' };
    if (cookieHeader) headers.Cookie = cookieHeader;
    if (method !== 'GET' && method !== 'HEAD' && csrfToken) headers['X-CSRF-Token'] = csrfToken;
    const res = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    updateCookies(res);
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      throw new Error(json.error || `Request failed ${res.status}`);
    }
    if (pathname === '/api/auth/login' || pathname === '/api/auth/signup') {
      await refreshCsrf();
    }
    return json;
  };
}

test('Resume Curator end-to-end generate flow', async (t) => {
  const server = await startServer(0, { log: false, host: '127.0.0.1' });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await stopServer();
  });

  const request = await createClient(baseUrl);

  // signup
  await request('/api/auth/signup', {
    method: 'POST',
    body: {
      name: 'Test User',
      email: 'resume@test.com',
      password: 'longpassword12'
    }
  });

  // create resume
  const resumeResp = await request('/api/resume-curator/resumes', {
    method: 'POST',
    body: {
      name: 'Base Resume',
      source_type: 'paste',
      resume_text: 'My base resume content here.'
    }
  });
  assert.ok(resumeResp.resume?.id);

  // create session
  const sessionResp = await request('/api/resume-curator/sessions', {
    method: 'POST',
    body: {
      resume_id: resumeResp.resume.id,
      company_name: 'Acme',
      job_title: 'Engineer',
      jd_source: 'paste',
      job_description_text: 'We need an engineer with react skills.'
    }
  });
  const sessionId = sessionResp.session.id;
  assert.ok(sessionId);

  // generate version
  const genResp = await request(`/api/resume-curator/sessions/${sessionId}/generate`, {
    method: 'POST',
    body: { options: { tone: 'neutral' } }
  });
  assert.equal(genResp.version.version_number, 1);
  assert.equal(genResp.version.session_id, sessionId);
  assert.ok(Number.isFinite(genResp.ats.score));

  // ensure session status updated and version listed
  const sessionDetail = await request(`/api/resume-curator/sessions/${sessionId}`);
  assert.equal(sessionDetail.session.status, 'generated');
  assert.equal(sessionDetail.versions.length, 1);
  assert.equal(sessionDetail.versions[0].version_number, 1);
});
