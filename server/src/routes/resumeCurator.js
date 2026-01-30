const express = require('express');
const path = require('path');
const multer = require('multer');
const {
  listResumes,
  createResume,
  setDefaultResume,
  getResume,
  createCuratorRun,
  getCuratorRun,
  createCuratorSuggestions,
  listCuratorSuggestions,
  updateCuratorSuggestionStatus,
  createCuratorVersion,
  listCuratorVersions,
  createTailorSession,
  listTailorSessions,
  getTailorSession,
  listTailorVersions,
  createTailorVersion,
  updateTailorSessionStatus,
  saveUserEditedVersionText,
  markVersionExported
} = require('../db');
const { runLlmExtraction } = require('../llmClient');
const { buildResumeTailorPrompt, computeAtsScore } = require('../../../shared/resumeCurator');
const { scoreAts } = require('../../../shared/resumeAtsScore');
const {
  detectSupportedResumeMime,
  extractTextFromDocx,
  extractTextFromPdf,
  normalizeExtractedResumeText,
  MAX_UPLOAD_BYTES
} = require('../../../shared/resumeParsing');
const { buildSuggestions } = require('../../../shared/resumeCuratorSuggestions');
const { parseModelJson } = require('../llm/client');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

function jsonError(res, status, error, detail) {
  return res.status(status).json({ error, detail });
}

function requireUser(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'AUTH_REQUIRED' });
  }
  return next();
}

router.use(requireUser);

router.get('/resumes', (req, res) => {
  const db = req.app.locals.db;
  const resumes = listResumes(db, req.user.id);
  return res.json({ resumes });
});

router.post('/resumes/upload', upload.single('file'), async (req, res) => {
  const db = req.app.locals.db;
  const file = req.file;
  if (!file) {
    return jsonError(res, 400, 'INVALID_REQUEST', 'file required');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return jsonError(res, 413, 'FILE_TOO_LARGE', 'Max file size is 5MB');
  }
  const mime = detectSupportedResumeMime(file.mimetype, file.originalname);
  if (!mime) {
    return jsonError(res, 400, 'UNSUPPORTED_FILE', 'Please upload a PDF or DOCX file.');
  }
  let extraction = { text: '', method: 'unknown', warnings: [] };
  try {
    if (mime.includes('pdf')) {
      extraction = await extractTextFromPdf(file.buffer);
    } else {
      extraction = await extractTextFromDocx(file.buffer);
    }
  } catch (err) {
    extraction = { text: '', method: 'error', warnings: [err.message || 'Failed to extract text'] };
  }
  const normalized = normalizeExtractedResumeText(extraction.text);
  if (!normalized || normalized.length < 200) {
    return jsonError(
      res,
      422,
      'EXTRACTION_FAILED',
      'We could not extract readable text. If this is a scanned PDF, try uploading a DOCX or paste the text instead.'
    );
  }

  const name =
    (req.body && (req.body.name || req.body.filename)) ||
    (file.originalname ? file.originalname.replace(path.extname(file.originalname), '') : 'Resume');
  const setDefault = req.body && (req.body.setDefault === 'true' || req.body.setDefault === true);

  const resume = createResume(db, {
    userId: req.user.id,
    name,
    sourceType: 'upload',
    originalFilename: file.originalname || null,
    mimeType: mime,
    fileSize: file.size,
    extractionMethod: extraction.method,
    extractionWarnings: extraction.warnings ? JSON.stringify(extraction.warnings) : null,
    resumeText: normalized,
    resumeJson: null,
    isDefault: Boolean(setDefault)
  });
  if (setDefault) {
    setDefaultResume(db, { userId: req.user.id, resumeId: resume.id });
  }

  return res.json({
    ok: true,
    resume,
    extractedPreview: normalized.slice(0, 800)
  });
});

router.post('/resumes', (req, res) => {
  const db = req.app.locals.db;
  const { name, source_type, original_filename, resume_text, resume_json, is_default } = req.body || {};
  if (!name || !source_type || !resume_text) {
    return jsonError(res, 400, 'INVALID_REQUEST', 'name, source_type, resume_text required');
  }
  if (!['paste', 'upload'].includes(source_type)) {
    return jsonError(res, 400, 'INVALID_SOURCE_TYPE');
  }
  const resume = createResume(db, {
    userId: req.user.id,
    name,
    sourceType: source_type,
    originalFilename: original_filename,
    mimeType: req.body?.mime_type || null,
    fileSize: req.body?.file_size || null,
    extractionMethod: req.body?.extraction_method || null,
    extractionWarnings: req.body?.extraction_warnings || null,
    resumeText: resume_text,
    resumeJson: resume_json,
    isDefault: Boolean(is_default)
  });
  if (is_default) {
    setDefaultResume(db, { userId: req.user.id, resumeId: resume.id });
  }
  return res.json({ resume });
});

router.post('/resumes/:id/set-default', (req, res) => {
  const db = req.app.locals.db;
  setDefaultResume(db, { userId: req.user.id, resumeId: req.params.id });
  return res.json({ ok: true });
});

router.post('/sessions', (req, res) => {
  const db = req.app.locals.db;
  const body = req.body || {};
  const required = ['resume_id', 'jd_source', 'job_description_text'];
  for (const field of required) {
    if (!body[field]) {
      return jsonError(res, 400, 'INVALID_REQUEST', `${field} required`);
    }
  }
  if (!['paste', 'url'].includes(body.jd_source)) {
    return jsonError(res, 400, 'INVALID_JD_SOURCE');
  }
  const options = Object.assign(
    {
      tone: 'neutral',
      focus: 'balanced',
      length: 'one_page',
      includeCoverLetter: false,
      targetKeywords: []
    },
    body.options || {}
  );
  const session = createTailorSession(db, {
    userId: req.user.id,
    resumeId: body.resume_id,
    companyName: body.company_name,
    jobTitle: body.job_title,
    jobLocation: body.job_location,
    jobUrl: body.job_url,
    jdSource: body.jd_source,
    jobDescriptionText: body.job_description_text,
    optionsJson: options,
    linkedApplicationId: body.linked_application_id
  });
  return res.json({ session });
});

router.get('/sessions', (req, res) => {
  const db = req.app.locals.db;
  const limit = Number(req.query.limit || 20);
  const offset = Number(req.query.offset || 0);
  const sessions = listTailorSessions(db, req.user.id, { limit, offset });
  return res.json({ sessions });
});

router.get('/sessions/:id', (req, res) => {
  const db = req.app.locals.db;
  const session = getTailorSession(db, req.user.id, req.params.id);
  if (!session) {
    return jsonError(res, 404, 'NOT_FOUND');
  }
  const versions = listTailorVersions(db, session.id);
  return res.json({ session, versions });
});

async function generateVersion({ db, session, resume, options }) {
  const prompt = buildResumeTailorPrompt({
    baseResumeText: resume.resume_text,
    jobDescriptionText: session.job_description_text,
    options,
    companyName: session.company_name,
    jobTitle: session.job_title
  });

  let llmData = null;
  let modelInfo = {};
  try {
    const llmResult = await runLlmExtraction({ subject: 'Resume tailoring', bodyText: prompt });
    modelInfo = { model: llmResult?.model || null, prompt_version: llmResult?.promptVersion || null };
    if (llmResult && llmResult.data) {
      llmData = llmResult.data;
    } else if (llmResult && llmResult.raw) {
      const parsed = parseModelJson(llmResult.raw);
      if (parsed.ok) {
        llmData = parsed.parsed;
      }
    }
  } catch (err) {
    modelInfo = { error: err.message };
  }

  if (!llmData) {
    const merged = [
      'Tailored Summary:',
      session.job_title ? `Role: ${session.job_title}` : '',
      session.company_name ? `Company: ${session.company_name}` : '',
      'Resume:',
      resume.resume_text,
      'Job Description:',
      session.job_description_text
    ]
      .filter(Boolean)
      .join('\n');
    llmData = {
      resume_text: merged,
      resume_sections: {},
      change_log: { added_keywords: [], removed_phrases: [], bullets_rewritten: 0, notes: [] },
      cover_letter_text: options.includeCoverLetter ? '' : null
    };
  }

  const resumeText = (llmData && llmData.resume_text) || '';
  if (!resumeText || resumeText.length < 200 || /placeholder/i.test(resumeText)) {
    const detail = 'Invalid generated resume content';
    const err = new Error(detail);
    err.status = 422;
    err.code = 'invalid_generation';
    throw err;
  }

  const ats = scoreAts({
    resumeText,
    jobDescriptionText: session.job_description_text,
    companyName: session.company_name,
    roleTitle: session.job_title
  });
  const versions = listTailorVersions(db, session.id);
  const nextVersion = (versions.reduce((max, v) => Math.max(max, v.version_number), 0) || 0) + 1;

  const version = createTailorVersion(db, {
    sessionId: session.id,
    versionNumber: nextVersion,
    generatedResumeText: resumeText,
    generatedResumeJson: llmData.resume_sections || llmData,
    changeLogJson: llmData.change_log || {},
    atsScore: ats.score,
    atsKeywordsJson: { matched_keywords: ats.matched_keywords, missing_keywords: ats.missing_keywords },
    modelInfoJson: modelInfo
  });
  updateTailorSessionStatus(db, { userId: session.user_id, sessionId: session.id, status: 'generated' });
  return { version, ats };
}

router.post('/sessions/:id/generate', async (req, res) => {
  const db = req.app.locals.db;
  const session = getTailorSession(db, req.user.id, req.params.id);
  if (!session) {
    return jsonError(res, 404, 'NOT_FOUND');
  }
  const resume = getResume(db, req.user.id, session.resume_id);
  if (!resume) {
    return jsonError(res, 404, 'RESUME_NOT_FOUND');
  }
  const options = Object.assign(
    {
      tone: 'neutral',
      focus: 'balanced',
      length: 'one_page',
      includeCoverLetter: false,
      targetKeywords: []
    },
    req.body?.options || {}
  );
  try {
    const result = await generateVersion({ db, session, resume, options });
    return res.json(result);
  } catch (err) {
    const status = err.status || 500;
    return jsonError(res, status, err.code || 'GENERATION_FAILED', err.message);
  }
});

router.post('/sessions/:sessionId/versions/:versionId/save', (req, res) => {
  const db = req.app.locals.db;
  const { user_edited_resume_text } = req.body || {};
  if (!user_edited_resume_text || typeof user_edited_resume_text !== 'string') {
    return jsonError(res, 400, 'INVALID_REQUEST', 'user_edited_resume_text required');
  }
  const session = getTailorSession(db, req.user.id, req.params.sessionId);
  if (!session) {
    return jsonError(res, 404, 'NOT_FOUND');
  }
  saveUserEditedVersionText(db, {
    sessionId: req.params.sessionId,
    versionId: req.params.versionId,
    userEditedResumeText: user_edited_resume_text
  });
  return res.json({ ok: true });
});

router.post('/sessions/:sessionId/versions/:versionId/exported', (req, res) => {
  const db = req.app.locals.db;
  const session = getTailorSession(db, req.user.id, req.params.sessionId);
  if (!session) {
    return jsonError(res, 404, 'NOT_FOUND');
  }
  markVersionExported(db, { sessionId: req.params.sessionId, versionId: req.params.versionId });
  updateTailorSessionStatus(db, { userId: req.user.id, sessionId: req.params.sessionId, status: 'exported' });
  return res.json({ ok: true });
});

// ----- New structured run + suggestions workflow -----
router.post('/run', (req, res) => {
  const db = req.app.locals.db;
  const body = req.body || {};
  if (!body.base_resume_id || !body.job_description) {
    return jsonError(res, 400, 'INVALID_REQUEST', 'base_resume_id and job_description required');
  }
  const resume = getResume(db, req.user.id, body.base_resume_id);
  if (!resume) {
    return jsonError(res, 404, 'RESUME_NOT_FOUND');
  }
  const run = createCuratorRun(db, {
    userId: req.user.id,
    baseResumeId: resume.id,
    company: body.company || null,
    roleTitle: body.role_title || null,
    jobUrl: body.job_url || null,
    jobDescription: body.job_description,
    targetKeywords: body.target_keywords || [],
    tone: body.tone || 'neutral',
    focus: body.focus || 'balanced',
    length: body.length || 'one_page',
    includeCoverLetter: Boolean(body.include_cover_letter)
  });
  const { suggestions, ats } = buildSuggestions({
    baseResumeText: resume.resume_text,
    jobDescriptionText: body.job_description,
    targetKeywords: body.target_keywords || []
  });
  const stored = createCuratorSuggestions(db, run.id, suggestions);
  return res.json({
    run,
    ats: { score: ats.score, matched: ats.matched_keywords, missing: ats.missing_keywords },
    suggestions: stored
  });
});

router.get('/:runId', (req, res) => {
  const db = req.app.locals.db;
  const run = getCuratorRun(db, req.user.id, req.params.runId);
  if (!run) return jsonError(res, 404, 'NOT_FOUND');
  const resume = getResume(db, req.user.id, run.base_resume_id);
  const ats = scoreAts({
    resumeText: resume?.resume_text || '',
    jobDescriptionText: run.job_description || '',
    companyName: run.company,
    roleTitle: run.role_title
  });
  return res.json({
    run,
    ats: { score: ats.score, matched: ats.matched_keywords, missing: ats.missing_keywords },
    suggestions: listCuratorSuggestions(db, run.id),
    versions: listCuratorVersions(db, run.id)
  });
});

router.patch('/suggestions/:id', (req, res) => {
  const db = req.app.locals.db;
  const status = req.body?.status;
  if (!['applied', 'dismissed', 'proposed'].includes(status)) {
    return jsonError(res, 400, 'INVALID_STATUS');
  }
  const suggestion = db.prepare('SELECT * FROM resume_curator_suggestions WHERE id = ?').get(req.params.id);
  if (!suggestion) return jsonError(res, 404, 'NOT_FOUND');
  const run = getCuratorRun(db, req.user.id, suggestion.run_id);
  if (!run) return jsonError(res, 404, 'NOT_FOUND');
  const updated = updateCuratorSuggestionStatus(db, run.id, suggestion.id, status);
  return res.json({ suggestion: updated });
});

router.post('/:runId/version', (req, res) => {
  const db = req.app.locals.db;
  const run = getCuratorRun(db, req.user.id, req.params.runId);
  if (!run) return jsonError(res, 404, 'NOT_FOUND');
  const resume = getResume(db, req.user.id, run.base_resume_id);
  if (!resume) return jsonError(res, 404, 'RESUME_NOT_FOUND');
  const suggestions = listCuratorSuggestions(db, run.id);
  const applied = suggestions.filter((s) => s.status === 'applied');
  let tailored = resume.resume_text || '';
  const skillsAdds = applied.filter((s) => s.kind === 'add_keyword').map((s) => s.evidence_text || s.change_text);
  if (skillsAdds.length) {
    tailored = `${tailored}\n\nSkills Additions: ${skillsAdds.join(', ')}`;
  }
  if (applied.some((s) => s.kind === 'add_metrics')) {
    tailored = `${tailored}\n\n[Add metric-driven bullet to experience]`;
  }
  const ats = scoreAts({
    resumeText: tailored,
    jobDescriptionText: run.job_description || '',
    companyName: run.company,
    roleTitle: run.role_title
  });
  const versions = listCuratorVersions(db, run.id);
  const label = `v${(versions.length || 0) + 1}`;
  const version = createCuratorVersion(db, {
    runId: run.id,
    versionLabel: label,
    atsScore: ats.score,
    tailoredText: tailored,
    exportedAt: null
  });
  return res.json({
    version,
    ats: { score: ats.score, matched: ats.matched_keywords, missing: ats.missing_keywords }
  });
});

module.exports = router;
