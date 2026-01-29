(function () {
  const statusEl = document.getElementById('rc-status');
  const resumeSelect = document.getElementById('rc-resume-select');
  const newResumePanel = document.getElementById('rc-new-resume-panel');
  const newResumeBtn = document.getElementById('rc-new-resume');
  const saveResumeBtn = document.getElementById('rc-save-resume');
  const newResumeName = document.getElementById('rc-new-resume-name');
  const newResumeText = document.getElementById('rc-new-resume-text');
  const newResumeDefault = document.getElementById('rc-new-resume-default');
  const companyInput = document.getElementById('rc-company');
  const roleInput = document.getElementById('rc-role');
  const locationInput = document.getElementById('rc-location');
  const jobUrlInput = document.getElementById('rc-job-url');
  const jdInput = document.getElementById('rc-jd');
  const toneSelect = document.getElementById('rc-tone');
  const focusSelect = document.getElementById('rc-focus');
  const lengthSelect = document.getElementById('rc-length');
  const includeCover = document.getElementById('rc-include-cover');
  const keywordsInput = document.getElementById('rc-keywords');
  const generateBtn = document.getElementById('rc-generate');
  const outputText = document.getElementById('rc-output-text');
  const saveEditsBtn = document.getElementById('rc-save-edits');
  const markExportedBtn = document.getElementById('rc-mark-exported');
  const versionsEl = document.getElementById('rc-versions');
  const atsScoreEl = document.getElementById('rc-ats-score');
  const atsFillEl = document.getElementById('rc-ats-fill');
  const atsMatchedEl = document.getElementById('rc-ats-matched');
  const atsMissingEl = document.getElementById('rc-ats-missing');

  let currentSessionId = null;
  let currentVersionId = null;

  function setStatus(text) {
    statusEl.textContent = text;
  }

  let csrfToken = '';

  async function loadCsrf() {
    try {
      const res = await fetch('/api/auth/csrf');
      const json = await res.json().catch(() => ({}));
      csrfToken = json.csrfToken || '';
    } catch (err) {
      // ignore
    }
  }

  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const method = opts.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD' && csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
    const res = await fetch(path, {
      method,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (res.status === 401) {
      throw new Error('Please sign in.');
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : {};
    } catch (err) {
      throw new Error('Invalid response');
    }
    if (!res.ok) {
      throw new Error(json.error || 'Request failed');
    }
    return json;
  }

  async function loadResumes() {
    setStatus('Loading resumes…');
    try {
      const data = await api('/api/resume-curator/resumes');
      resumeSelect.innerHTML = '';
      data.resumes.forEach((r) => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = `${r.name}${r.is_default ? ' (default)' : ''}`;
        resumeSelect.appendChild(opt);
      });
      setStatus('Ready');
    } catch (err) {
      setStatus(err.message);
    }
  }

  newResumeBtn.addEventListener('click', () => {
    newResumePanel.classList.toggle('hidden');
  });

  saveResumeBtn.addEventListener('click', async () => {
    if (!newResumeName.value || !newResumeText.value) {
      setStatus('Name and resume text required');
      return;
    }
    setStatus('Saving resume…');
    try {
      await api('/api/resume-curator/resumes', {
        method: 'POST',
        body: {
          name: newResumeName.value,
          source_type: 'paste',
          resume_text: newResumeText.value,
          is_default: newResumeDefault.checked
        }
      });
      newResumeName.value = '';
      newResumeText.value = '';
      newResumeDefault.checked = false;
      newResumePanel.classList.add('hidden');
      await loadResumes();
      setStatus('Resume saved');
    } catch (err) {
      setStatus(err.message);
    }
  });

  async function ensureSession() {
    if (currentSessionId) return currentSessionId;
    const options = getOptions();
    const payload = {
      resume_id: resumeSelect.value,
      company_name: companyInput.value,
      job_title: roleInput.value,
      job_location: locationInput.value,
      job_url: jobUrlInput.value,
      jd_source: 'paste',
      job_description_text: jdInput.value,
      options
    };
    const res = await api('/api/resume-curator/sessions', { method: 'POST', body: payload });
    currentSessionId = res.session.id;
    return currentSessionId;
  }

  function getOptions() {
    const keywords = keywordsInput.value
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    return {
      tone: toneSelect.value,
      focus: focusSelect.value,
      length: lengthSelect.value,
      includeCoverLetter: includeCover.checked,
      targetKeywords: keywords
    };
  }

  async function generate() {
    if (!resumeSelect.value || !jdInput.value) {
      setStatus('Select a resume and paste JD');
      return;
    }
    setStatus('Generating…');
    try {
      const sessionId = await ensureSession();
      const res = await api(`/api/resume-curator/sessions/${sessionId}/generate`, {
        method: 'POST',
        body: { options: getOptions() }
      });
      currentVersionId = res.version.id;
      outputText.value = res.version.generated_resume_text;
      renderAts(res.ats);
      await loadVersions(sessionId);
      setStatus('Generated');
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function loadVersions(sessionId) {
    const data = await api(`/api/resume-curator/sessions/${sessionId}`);
    versionsEl.innerHTML = '';
    data.versions.forEach((v) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ghost';
      btn.textContent = `v${v.version_number} • ATS ${v.ats_score ?? '—'}`;
      btn.addEventListener('click', () => {
        currentVersionId = v.id;
        outputText.value = v.generated_resume_text;
      });
      versionsEl.appendChild(btn);
    });
  }

  function renderAts(ats) {
    if (!ats) return;
    atsScoreEl.textContent = `ATS score: ${ats.score}`;
    atsFillEl.style.width = `${Math.max(0, Math.min(100, ats.score))}%`;
    atsMatchedEl.textContent = (ats.matched_keywords || []).join(', ') || '—';
    atsMissingEl.textContent = (ats.missing_keywords || []).join(', ') || '—';
  }

  saveEditsBtn.addEventListener('click', async () => {
    if (!currentSessionId || !currentVersionId) {
      setStatus('Generate first');
      return;
    }
    setStatus('Saving edits…');
    try {
      await api(`/api/resume-curator/sessions/${currentSessionId}/versions/${currentVersionId}/save`, {
        method: 'POST',
        body: { user_edited_resume_text: outputText.value }
      });
      setStatus('Saved');
    } catch (err) {
      setStatus(err.message);
    }
  });

  markExportedBtn.addEventListener('click', async () => {
    if (!currentSessionId || !currentVersionId) {
      setStatus('Generate first');
      return;
    }
    setStatus('Marking exported…');
    try {
      await api(`/api/resume-curator/sessions/${currentSessionId}/versions/${currentVersionId}/exported`, {
        method: 'POST'
      });
      setStatus('Exported');
    } catch (err) {
      setStatus(err.message);
    }
  });

  generateBtn.addEventListener('click', generate);

  // logout
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
      window.location.href = '/';
    } catch (err) {
      setStatus(err.message || 'Logout failed');
    }
  });

  // init
  loadCsrf().then(loadResumes);
})();
