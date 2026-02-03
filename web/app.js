// Frontend choice: buildless HTML/JS keeps iteration fast while the API stabilizes.
const STATUS_LABELS = {
  APPLIED: 'Applied',
  UNDER_REVIEW: 'Under review',
  INTERVIEW_REQUESTED: 'Interview requested',
  INTERVIEW_COMPLETED: 'Interview completed',
  OFFER_RECEIVED: 'Offer received',
  REJECTED: 'Rejected',
  GHOSTED: 'Ghosted',
  UNKNOWN: 'Unknown'
};

const STATUS_DEBUG_ENABLED = typeof location !== 'undefined' && location.hostname === 'localhost';
let statusDebugLogged = false;
const DEBUG_AUTH = typeof window !== 'undefined' && window.DEBUG_AUTH;
let authMode = 'signin';

function normalizeStatusValue(status) {
  if (!status) return 'UNKNOWN';
  const upper = String(status).toUpperCase().replace(/\s+/g, '_');
  if (upper.includes('OFFER')) return 'OFFER_RECEIVED';
  if (upper.includes('APPLIED')) return 'APPLIED';
  if (upper.includes('REJECT')) return 'REJECTED';
  if (upper.includes('REVIEW')) return 'UNDER_REVIEW';
  if (upper.includes('GHOST')) return 'GHOSTED';
  return STATUS_LABELS[upper] ? upper : 'UNKNOWN';
}

function getStatusPresentation(status) {
  const normalized = normalizeStatusValue(status);
  const label = STATUS_LABELS[normalized] || 'Unknown';
  const className = `appl-status-${normalized.toLowerCase()}`;
  if (STATUS_DEBUG_ENABLED && !statusDebugLogged) {
    console.debug('status-pill-debug', { raw: status, normalized, className });
    statusDebugLogged = true;
  }
  return { normalized, label, className };
}

function renderStatusPill(status) {
  const { normalized, label, className } = getStatusPresentation(status);
  return `<span class="appl-statusPill ${className}" data-status="${normalized}"><span class="dot"></span>${label}</span>`;
}

const authView = document.getElementById('auth-view');
const dashboardView = document.getElementById('dashboard-view');
const accountView = document.getElementById('account-view');
const archiveView = document.getElementById('archive-view');
const unsortedView = document.getElementById('unsorted-view');
const resumeCuratorView = document.getElementById('resume-curator-view');
const nav = document.getElementById('nav');
const topbar = document.getElementById('topbar');
const accountAvatar = document.getElementById('account-avatar');
const avatarInitials = document.getElementById('avatar-initials');

const authSwitch = document.querySelector('.auth-switch');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const googleAuth = document.getElementById('google-auth');
const logoutBtn = document.getElementById('logout-btn');
const accountLogout = document.getElementById('account-logout');
const accountEmail = document.getElementById('account-email');
const accountAuth = document.getElementById('account-auth');
const accountGmailStatus = document.getElementById('account-gmail-status');
const accountGmailEmail = document.getElementById('account-gmail-email');

const quickAdd = null;
const addToggle = document.getElementById('add-toggle');
const addPanel = null;
const filterCount = document.getElementById('filter-count');
const applicationsTable = document.getElementById('applications-table');
const pipelineView = document.getElementById('pipeline-view');
const appCount = document.getElementById('app-count');
const archivedTable = document.getElementById('archived-table');
const archivedCount = document.getElementById('archived-count');
const unsortedTable = document.getElementById('unsorted-table');
const viewToggle = document.getElementById('view-toggle');
const filterStatus = document.getElementById('filter-status');
const filterCompany = document.getElementById('filter-company');
const filterCompanyClear = document.getElementById('filter-company-clear');
const filterRole = document.getElementById('filter-role');
const filterRoleClear = document.getElementById('filter-role-clear');
const tablePrev = document.getElementById('table-prev');
const tableNext = document.getElementById('table-next');
const tablePageInfo = document.getElementById('table-page-info');
const archivedPrev = document.getElementById('archived-prev');
const archivedNext = document.getElementById('archived-next');
const archivedPageInfo = document.getElementById('archived-page-info');
const emailConnect = document.getElementById('email-connect');
const emailSync = document.getElementById('email-sync');
const syncDays = document.getElementById('sync-days');
const syncStatus = document.getElementById('sync-status');
const syncResult = document.getElementById('sync-result');
const syncErrorBanner = document.getElementById('sync-error-banner');
const syncErrorMessage = document.getElementById('sync-error-message');
const syncErrorDetail = document.getElementById('sync-error-detail');
const syncErrorToggle = document.getElementById('sync-error-toggle');
const dashboardGmailStatus = document.getElementById('dashboard-gmail-status');
const dashboardGmailEmail = document.getElementById('dashboard-gmail-email');
const syncControls = document.getElementById('sync-controls');
const syncConnectCta = document.getElementById('sync-connect-cta');
const syncProgress = document.getElementById('sync-progress');
const syncProgressFill = document.getElementById('sync-progress-fill');
const syncProgressLabel = document.getElementById('sync-progress-label');
const syncProgressValue = document.getElementById('sync-progress-value');
const syncSummary = document.getElementById('sync-summary');
const syncSummaryMain = document.getElementById('sync-summary-main');
const syncSummaryStatus = document.getElementById('sync-summary-status');
const syncSummaryMetrics = document.getElementById('sync-summary-metrics');
const syncDetailsToggle = document.getElementById('sync-details-toggle');
const syncDetailsWrapper = document.getElementById('sync-details-wrapper');
const kpiTotal = document.getElementById('kpi-total');
const kpiApplied = document.getElementById('kpi-applied');
const kpiOffer = document.getElementById('kpi-offer');
const kpiRejected = document.getElementById('kpi-rejected');
const accountEmailSync = document.getElementById('account-email-sync');
const accountSyncDays = document.getElementById('account-sync-days');
const accountSyncStatus = document.getElementById('account-sync-status');
const accountSyncResult = document.getElementById('account-sync-result');
const gmailHint = document.getElementById('gmail-hint');
const gmailHintText = document.getElementById('gmail-hint-text');
const emailEventsPanel = document.getElementById('email-events-panel');
const emailEventsTable = document.getElementById('email-events-table');
const detailDrawer = document.getElementById('detail-drawer');
const detailCompany = document.getElementById('detail-company');
const detailTitle = document.getElementById('detail-title');
const detailStatus = document.getElementById('detail-status');
const detailSource = document.getElementById('detail-source');
const detailConfidence = document.getElementById('detail-confidence');
const detailMeta = document.getElementById('detail-meta');
const detailExplanation = document.getElementById('detail-explanation');
const detailTimeline = document.getElementById('detail-timeline');
const detailSuggestion = document.getElementById('detail-suggestion');
const detailSuggestionLabel = document.getElementById('detail-suggestion-label');
const detailSuggestionExplanation = document.getElementById('detail-suggestion-explanation');
const detailSuggestionAccept = document.getElementById('detail-suggestion-accept');
const detailSuggestionDismiss = document.getElementById('detail-suggestion-dismiss');
const detailPanel = document.getElementById('detail-panel');
const detailExplainerToggle = document.getElementById('detail-explainer-toggle');
const detailExplainerBody = document.getElementById('detail-explainer-body');
let explanationOpen = false;
let lastDetailId = null;
let lastDetailEvents = [];
let deleteConfirmForId = null;
let deleteBusy = false;
let deleteError = null;
const detailActions = document.getElementById('detail-actions');
const modalRoot = document.getElementById('modal-root');
const modalTitle = document.getElementById('modal-title');
const modalDescription = document.getElementById('modal-description');
const modalBody = document.getElementById('modal-body');
const modalFooter = document.getElementById('modal-footer');

// Resume Curator DOM refs
const rcStatusEl = document.getElementById('rc-status');
const rcResumeSelect = document.getElementById('rc-resume-select');
const rcNewResumeBtn = document.getElementById('rc-new-resume');
const rcCompanyInput = document.getElementById('rc-company');
const rcRoleInput = document.getElementById('rc-role');
const rcLocationInput = document.getElementById('rc-location');
const rcJobUrlInput = document.getElementById('rc-job-url');
const rcJdInput = document.getElementById('rc-jd');
const rcToneSelect = document.getElementById('rc-tone');
const rcFocusSelect = document.getElementById('rc-focus');
const rcLengthSelect = document.getElementById('rc-length');
const rcIncludeCover = document.getElementById('rc-include-cover');
const rcKeywordsInput = document.getElementById('rc-keywords');
const rcGenerateBtn = document.getElementById('rc-generate');
const rcMarkExportedBtn = document.getElementById('rc-mark-exported');
const rcVersionsEl = document.getElementById('rc-versions');
const rcAtsScoreEl = document.getElementById('rc-ats-score');
const rcAtsFillEl = document.getElementById('rc-ats-fill');
const rcAtsMatchedEl = document.getElementById('rc-ats-matched');
const rcAtsMissingEl = document.getElementById('rc-ats-missing');
const rcSuggestionsEl = document.getElementById('rc-suggestions');
const rcCreateVersionBtn = document.getElementById('rc-create-version');
const rcPreviewBlock = document.getElementById('rc-preview-block');
const rcPreviewText = document.getElementById('rc-preview-text');

let sessionUser = null;
let currentDetail = null;
let csrfToken = null;
const STATUS_OPTIONS = Object.keys(STATUS_LABELS);
const PAGE_SIZE = 25;
const PIPELINE_LIMIT = 15;
const VIEW_MODE_KEY = 'applictus:viewMode';
const SYNC_DETAILS_KEY = 'applictus:syncDetailsOpen';
let rcInitialized = false;
let rcSessionId = null;
let rcVersionId = null;
let rcLastResumeId = null;
let rcRunId = null;
function formatRoleSource(application) {
  const source = application?.role_source;
  if (!source) {
    return null;
  }
  if (source === 'manual') {
    return 'Manual';
  }
  if (source === 'subject') {
    return 'Email subject';
  }
  if (source === 'snippet') {
    return 'Email snippet';
  }
  if (source === 'body') {
    return 'Email body';
  }
  return `Email ${source}`;
}

function getInitialViewMode() {
  try {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    if (stored === 'pipeline' || stored === 'table') {
      return stored;
    }
  } catch (err) {
    return 'table';
  }
  return 'table';
}

function formatShortDate(date, includeYear = false) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  const opts = { month: 'short', day: 'numeric' };
  if (includeYear) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}

function formatDateRange(startIso, endIso) {
  if (!startIso || !endIso) return '';
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  const sameYear = start.getFullYear() === end.getFullYear();
  const includeYear = !sameYear;
  return `${formatShortDate(start, includeYear)}–${formatShortDate(end, true)}`;
}

const state = {
  viewMode: getInitialViewMode(),
  filters: {
    status: '',
    company: '',
    role: ''
  },
  sort: {
    key: 'lastActivity',
    dir: 'desc'
  },
  lastTotal: 0,
  table: {
    offset: 0,
    total: 0,
    data: []
  },
  archived: {
    offset: 0,
    total: 0
  }
};

const emailState = {
  configured: false,
  encryptionReady: false,
  connected: false,
  email: null
};
const syncUiState = {
  visible: false,
  progress: 0,
  label: '',
  error: false,
  syncId: null,
  pollTimer: null,
  easingTimer: null,
  startTs: null,
  backendTarget: 0,
  backendPhaseLabel: null,
  state: 'idle', // 'idle' | 'running' | 'finishing' | 'error'
  finishTimer: null,
  finishGuard: null
};
renderSyncSummary({ status: 'idle', rawDetails: '' });

let modalState = {
  onClose: null,
  allowBackdropClose: false,
  focusable: [],
  lastFocused: null,
  keyHandler: null
};

function openAddModal() {
  const form = document.createElement('form');
  form.className = 'modal-form form-grid';

  const companyField = createTextField({
    label: 'Company name',
    name: 'company_name',
    placeholder: 'Company name',
    required: true
  });
  const roleField = createTextField({
    label: 'Role title',
    name: 'job_title',
    placeholder: 'Role title',
    required: true
  });
  const statusField = createSelectField({
    label: 'Status',
    name: 'current_status',
    value: 'APPLIED',
    options: STATUS_OPTIONS.map((status) => ({
      value: status,
      label: STATUS_LABELS[status] || status
    }))
  });
  const dateField = createTextField({
    label: 'Date',
    name: 'applied_at',
    type: 'date',
    required: true,
    value: new Date().toISOString().slice(0, 10)
  });

  const errorEl = document.createElement('div');
  errorEl.className = 'form-error hidden';

  form.append(companyField.wrapper, roleField.wrapper, statusField.wrapper, dateField.wrapper, errorEl);

  const footer = buildModalFooter({ confirmText: 'Add application', formId: 'add-app-form' });
  form.id = 'add-app-form';
  openModal({
    title: 'Add application',
    description: 'Manually create a new application entry.',
    body: form,
    footer,
    allowBackdropClose: true,
    initialFocus: companyField.input
  });

  const confirmBtn = footer.querySelector('[data-role="confirm"]');
  const updateButtonState = () => {
    const valid =
      companyField.input.value.trim() &&
      roleField.input.value.trim() &&
      statusField.select.value &&
      dateField.input.value;
    if (confirmBtn) {
      confirmBtn.disabled = !valid;
    }
  };
  form.addEventListener('input', updateButtonState);
  updateButtonState();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const company = companyField.input.value.trim();
    const role = roleField.input.value.trim();
    const status = statusField.select.value || 'APPLIED';
    const dateValue = dateField.input.value;
    if (!company || !role || !dateValue) {
      setFormError(errorEl, 'Please complete all required fields.');
      return;
    }
    setFormError(errorEl, '');
    disableModalFooter(footer, true);
    try {
      const when = new Date(dateValue);
      when.setHours(12, 0, 0, 0);
      const payload = {
        company_name: company,
        job_title: role,
        current_status: status,
        applied_at: when.toISOString()
      };
      await api('/api/applications', { method: 'POST', body: JSON.stringify(payload) });
      closeModal('success');
      await loadActiveApplications();
    } catch (err) {
      setFormError(errorEl, err.message || 'Unable to add application.');
      disableModalFooter(footer, false);
    }
  });
}

async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && !csrfToken) {
    await loadCsrfToken();
  }
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (method !== 'GET' && method !== 'HEAD' && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  const response = await fetch(path, {
    headers,
    credentials: 'include',
    ...options
  });
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    let body = {};
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch (err) {
      body = {};
    }
    const message = body.error || body.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.code = body.error || body.code || response.status;
    error.detail = body.detail || null;
    error.status = response.status;
    throw error;
  }
  const rawText = await response.text().catch(() => '');
  if (!rawText) return {};
  try {
    return JSON.parse(rawText);
  } catch (err) {
    return { raw: rawText };
  }
}

async function loadCsrfToken() {
  try {
    const response = await fetch('/api/auth/csrf', { credentials: 'include' });
    const body = await response.json().catch(() => ({}));
    csrfToken = body.csrfToken || null;
  } catch (err) {
    csrfToken = null;
  }
}

function getAvatarInitials(email) {
  return 'A';
}

function setupLogoFallback() {
  document.querySelectorAll('[data-logo]').forEach((img) => {
    const wrapper = img.closest('.logo-wrap');
    if (!wrapper) {
      return;
    }
    const markReady = () => {
      wrapper.classList.add('logo-ready');
      wrapper.classList.remove('logo-failed');
    };
    const markFailed = () => {
      wrapper.classList.add('logo-failed');
      wrapper.classList.remove('logo-ready');
    };
    if (img.complete) {
      if (img.naturalWidth > 0) {
        markReady();
      } else {
        markFailed();
      }
    } else {
      img.addEventListener('load', markReady);
      img.addEventListener('error', markFailed);
    }
  });
}

function setPillState(element, text, state) {
  if (!element) {
    return;
  }
  element.textContent = text;
  if (state) {
    element.dataset.state = state;
  } else {
    element.removeAttribute('data-state');
  }
}

function setSyncStatusText(text) {
  if (syncStatus) {
    syncStatus.textContent = text;
  }
  if (accountSyncStatus) {
    accountSyncStatus.textContent = text;
  }
}

function setSyncResultText(text) {
  if (syncResult) {
    syncResult.textContent = text;
  }
  if (accountSyncResult) {
    accountSyncResult.textContent = text;
  }
}

function setSyncDisabled(isDisabled) {
  if (emailSync) {
    emailSync.disabled = isDisabled;
    emailSync.setAttribute('aria-busy', String(!!isDisabled));
  }
  if (accountEmailSync) {
    accountEmailSync.disabled = isDisabled;
    accountEmailSync.setAttribute('aria-busy', String(!!isDisabled));
  }
}

function getDashboardEmptyStateHtml() {
  return `
    <div class="empty-state">
      <h3>No applications yet</h3>
      <p class="muted">Sync Gmail to import applications automatically, or add one manually.</p>
      <div class="empty-state-actions">
        <button class="btn-primary" type="button" data-action="sync-gmail">Sync Gmail</button>
        <button class="ghost" type="button" data-action="add-application">Add application</button>
      </div>
    </div>
  `;
}

function updateModalFocusables() {
  if (!modalRoot) {
    modalState.focusable = [];
    return;
  }
  modalState.focusable = Array.from(
    modalRoot.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])')
  ).filter((el) => !el.hasAttribute('disabled'));
}

function handleModalKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeModal('escape');
    return;
  }
  if (event.key !== 'Tab') {
    return;
  }
  updateModalFocusables();
  if (!modalState.focusable.length) {
    return;
  }
  const first = modalState.focusable[0];
  const last = modalState.focusable[modalState.focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function setModalContent(target, content) {
  if (!target) {
    return;
  }
  target.innerHTML = '';
  if (!content) {
    return;
  }
  if (typeof content === 'string') {
    target.innerHTML = content;
  } else {
    target.appendChild(content);
  }
}

function openModal({ title, description, body, footer, onClose, allowBackdropClose = false, initialFocus }) {
  if (!modalRoot) {
    return;
  }
  if (modalTitle) {
    modalTitle.textContent = title || 'Notice';
  }
  if (modalDescription) {
    modalDescription.textContent = description || '';
    modalDescription.classList.toggle('hidden', !description);
  }
  setModalContent(modalBody, body);
  setModalContent(modalFooter, footer);
  modalRoot.classList.remove('hidden');
  modalRoot.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');

  modalState = {
    onClose,
    allowBackdropClose,
    focusable: [],
    lastFocused: document.activeElement,
    keyHandler: handleModalKeydown
  };
  document.addEventListener('keydown', modalState.keyHandler);
  updateModalFocusables();

  const focusTarget = typeof initialFocus === 'string' ? modalRoot.querySelector(initialFocus) : initialFocus;
  const fallback = modalState.focusable[0];
  window.setTimeout(() => {
    if (focusTarget && typeof focusTarget.focus === 'function') {
      focusTarget.focus();
    } else if (fallback) {
      fallback.focus();
    }
  }, 0);
}

function closeModal(reason) {
  if (!modalRoot || modalRoot.classList.contains('hidden')) {
    return;
  }
  modalRoot.classList.add('hidden');
  modalRoot.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  if (modalState.keyHandler) {
    document.removeEventListener('keydown', modalState.keyHandler);
  }
  const last = modalState.lastFocused;
  if (last && typeof last.focus === 'function') {
    last.focus();
  }
  if (typeof modalState.onClose === 'function') {
    modalState.onClose(reason);
  }
  modalState = {
    onClose: null,
    allowBackdropClose: false,
    focusable: [],
    lastFocused: null,
    keyHandler: null
  };
}

function buildModalFooter({ confirmText, cancelText = 'Cancel', formId } = {}) {
  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  if (cancelText) {
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'ghost';
    cancelButton.textContent = cancelText;
    cancelButton.dataset.role = 'cancel';
    cancelButton.addEventListener('click', () => closeModal('cancel'));
    footer.appendChild(cancelButton);
  }
  if (confirmText) {
    const confirmButton = document.createElement('button');
    confirmButton.textContent = confirmText;
    confirmButton.dataset.role = 'confirm';
    if (formId) {
      confirmButton.type = 'submit';
      confirmButton.setAttribute('form', formId);
    } else {
      confirmButton.type = 'button';
    }
    footer.appendChild(confirmButton);
  }
  return footer;
}

function setFormError(element, message) {
  if (!element) {
    return;
  }
  element.textContent = message || '';
  element.classList.toggle('hidden', !message);
}

function showNotice(message, title = 'Something went wrong') {
  const body = document.createElement('div');
  body.className = 'stack';
  const text = document.createElement('p');
  text.textContent = message || 'Please try again.';
  body.appendChild(text);
  const footer = buildModalFooter({ confirmText: 'OK', cancelText: null });
  const confirmButton = footer.querySelector('[data-role="confirm"]');
  confirmButton?.addEventListener('click', () => closeModal('confirm'));
  openModal({
    title,
    description: '',
    body,
    footer,
    allowBackdropClose: true
  });
}

function createTextField({ label, name, value = '', placeholder = '', required = false, type = 'text' }) {
  const wrapper = document.createElement('label');
  wrapper.textContent = label;
  const input = type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
  if (type !== 'textarea') {
    input.type = type;
  } else {
    input.rows = 3;
  }
  input.name = name;
  input.value = value;
  input.placeholder = placeholder;
  if (required) {
    input.required = true;
  }
  wrapper.appendChild(input);
  return { wrapper, input };
}

function createSelectField({ label, name, value = '', options = [] }) {
  const wrapper = document.createElement('label');
  wrapper.textContent = label;
  const select = document.createElement('select');
  select.name = name;
  options.forEach((optionItem) => {
    const option = document.createElement('option');
    option.value = optionItem.value;
    option.textContent = optionItem.label;
    if (optionItem.value === value) {
      option.selected = true;
    }
    select.appendChild(option);
  });
  wrapper.appendChild(select);
  return { wrapper, select };
}

function formatDate(value) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString();
}

function setSyncProgressState({ visible, progress, label, error = false }) {
  if (!syncProgress || !syncProgressFill || !syncProgressLabel || !syncProgressValue) {
    return;
  }
  syncUiState.visible = visible;
  if (typeof progress === 'number') {
    syncUiState.progress = progress;
  }
  syncUiState.label = label || syncUiState.label;
  syncUiState.error = error;

  syncProgress.classList.toggle('hidden', !visible);
  syncProgressLabel.textContent = syncUiState.label || '';
  const rawPct = Math.max(0, Math.min(100, (syncUiState.progress || 0) * 100));
  const displayPct =
    syncUiState.state === 'finishing'
      ? Math.min(100, rawPct)
      : rawPct > 0 && rawPct < 1
      ? 1
      : Math.min(99.5, rawPct);
  syncProgressValue.textContent = `${Math.round(displayPct)}%`;
  syncProgressFill.style.width = `${displayPct}%`;
  syncProgressFill.classList.toggle('error', !!error);
  if (window.__SYNC_DEBUG__) {
    console.debug('sync ui', {
      visible,
      progress: syncUiState.progress,
      displayPct,
      label: syncUiState.label,
      error
    });
  }
}

function hideSyncProgress() {
  setSyncProgressState({ visible: false, progress: 0, label: '', error: false });
  if (syncUiState.pollTimer) {
    window.clearInterval(syncUiState.pollTimer);
    syncUiState.pollTimer = null;
  }
  if (syncUiState.easingTimer) {
    window.clearInterval(syncUiState.easingTimer);
    syncUiState.easingTimer = null;
  }
  syncUiState.state = 'idle';
  syncUiState.syncId = null;
  syncUiState.startTs = null;
  syncUiState.backendTarget = 0;
  syncUiState.backendPhaseLabel = null;
  if (syncUiState.finishTimer) {
    window.clearTimeout(syncUiState.finishTimer);
    syncUiState.finishTimer = null;
  }
  if (syncUiState.finishGuard) {
    window.clearTimeout(syncUiState.finishGuard);
    syncUiState.finishGuard = null;
  }
  if (syncErrorBanner) {
    syncErrorBanner.classList.add('hidden');
    if (syncErrorDetail) syncErrorDetail.classList.add('hidden');
  }
}

function easeProgress(target) {
  const current = syncUiState.progress || 0;
  const next = current + (target - current) * 0.2;
  const clamped = Math.min(target, Math.max(current, next));
  setSyncProgressState({ visible: true, progress: clamped });
}

function mapPhaseLabel(phase) {
  switch (phase) {
    case 'listing':
      return 'Listing messages…';
    case 'fetching':
      return 'Fetching message details…';
    case 'classifying':
      return 'Classifying emails…';
    case 'matching':
      return 'Matching applications…';
    case 'saving':
      return 'Saving results…';
    case 'finalizing':
      return 'Finalizing…';
    default:
      return 'Syncing…';
  }
}

function animateToHundredThenHide() {
  const start = syncUiState.progress || 0;
  const duration = 550;
  const end = 1;
  const startTime = performance.now();
  function step(ts) {
    const t = Math.min(1, (ts - startTime) / duration);
    const eased = start + (end - start) * t;
    setSyncProgressState({ visible: true, progress: eased, label: 'Sync complete', error: false });
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      setTimeout(() => hideSyncProgress(), 250);
    }
  }
  requestAnimationFrame(step);
}

function enterFinishing() {
  if (syncUiState.state === 'finishing') return;
  syncUiState.state = 'finishing';
  syncUiState.backendTarget = 1;
  syncUiState.backendPhaseLabel = 'Sync complete';
  animateToHundredThenHide();
  if (syncUiState.finishGuard) {
    clearTimeout(syncUiState.finishGuard);
  }
  // Safety guard: if finishing hangs, force completion
  syncUiState.finishGuard = setTimeout(() => {
    if (syncUiState.state === 'finishing') {
      setSyncProgressState({ visible: true, progress: 1, label: 'Sync complete', error: false });
      hideSyncProgress();
    }
  }, 2000);
}

function startSyncPolling(syncId) {
  if (!syncId) return;
  syncUiState.syncId = syncId;
  syncUiState.startTs = Date.now();
  syncUiState.state = 'running';
  syncUiState.pollErrorCount = 0;
  if (syncUiState.pollTimer) {
    window.clearInterval(syncUiState.pollTimer);
  }
  if (syncUiState.easingTimer) {
    window.clearInterval(syncUiState.easingTimer);
  }
  syncUiState.easingTimer = window.setInterval(() => {
    if (!syncUiState.startTs) return;
    const elapsedSec = (Date.now() - syncUiState.startTs) / 1000;
    // Time-based perceived curve: fast rise then taper
    const cap = syncUiState.state === 'finishing' ? 1 : 0.95;
    const baseTarget = cap * (1 - Math.exp(-elapsedSec / 16)); // slower rise: ~11% @2s, ~31% @6s, ~58% @15s, ~79% @30s
    const backendTarget = syncUiState.backendTarget || 0;
    const target =
      syncUiState.state === 'finishing'
        ? 1
        : Math.min(cap, Math.max(baseTarget, backendTarget));
    easeProgress(target);
    const label =
      syncUiState.backendPhaseLabel ||
      (elapsedSec < 3
        ? 'Starting sync…'
        : elapsedSec < 12
        ? 'Fetching emails…'
        : elapsedSec < 30
        ? 'Classifying emails…'
        : 'Matching applications…');
    setSyncProgressState({ visible: true, label, error: syncUiState.error });
  }, 120);

  const isDev =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  const poll = async () => {
    try {
      const progress = await api(`/api/email/sync/status?sync_id=${encodeURIComponent(syncId)}`);
      syncUiState.pollErrorCount = 0;
      const total = Number(progress.total) || 0;
      const processed = Number(progress.processed) || 0;
      const status = progress.status || 'running';
      const phase = progress.phase || 'syncing';
      const label = mapPhaseLabel(phase);
      let target = 0;
      if (total > 0) {
        target = Math.min(0.99, processed / total);
      } else if (processed > 0) {
        const fallbackTotal = Math.max(processed + 5, processed * 1.2);
        target = Math.min(0.7, processed / fallbackTotal);
      }
      syncUiState.backendTarget = target;
      syncUiState.backendPhaseLabel = label;
      if (isDev) {
        console.debug('sync status', { progress, target });
      }
      setSyncProgressState({ visible: true, label, error: status === 'failed' });
      if (status === 'failed') {
        hideSyncProgress();
        if (syncStatus) syncStatus.textContent = 'Failed';
      }
      if (status === 'completed') {
        enterFinishing();
        window.clearInterval(syncUiState.pollTimer);
        syncUiState.pollTimer = null;
      }
    } catch (err) {
      // Treat intermittent poll errors as transient; only fail after a few consecutive errors.
      syncUiState.pollErrorCount = (syncUiState.pollErrorCount || 0) + 1;
      const transient = syncUiState.pollErrorCount < 3;
      if (isDev) {
        console.debug('sync status poll failed', err?.message || err, { count: syncUiState.pollErrorCount });
      }
      if (transient) {
        setSyncProgressState({
          visible: true,
          label: 'Syncing…',
          error: false
        });
        return;
      }
      setSyncProgressState({ visible: true, label: 'Sync failed', error: true });
      hideSyncProgress();
      if (syncStatus) syncStatus.textContent = 'Failed';
      if (syncUiState.pollTimer) {
        window.clearInterval(syncUiState.pollTimer);
        syncUiState.pollTimer = null;
      }
    }
  };
  poll();
  syncUiState.pollTimer = window.setInterval(poll, 450);
}

function formatDateTime(value) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString();
}

function getActivityDate(application) {
  return application.last_activity_at || application.updated_at || application.created_at || null;
}

function compareByKey(a, b, key) {
  const av = (a || '').toString().toLowerCase();
  const bv = (b || '').toString().toLowerCase();
  return av.localeCompare(bv, undefined, { sensitivity: 'base' });
}

function sortApplications(list) {
  const key = state.sort.key;
  const dir = state.sort.dir === 'asc' ? 1 : -1;
  const sorted = [...list].sort((a, b) => {
    if (key === 'company') {
      return dir * compareByKey(a.company_name, b.company_name);
    }
    if (key === 'role') {
      return dir * compareByKey(a.job_title, b.job_title);
    }
    if (key === 'status') {
      return dir * compareByKey(a.current_status, b.current_status);
    }
    // lastActivity
    const ad = new Date(getActivityDate(a)).getTime() || 0;
    const bd = new Date(getActivityDate(b)).getTime() || 0;
    if (ad === bd) {
      return dir * compareByKey(a.company_name, b.company_name);
    }
    return dir * (ad - bd);
  });
  return sorted;
}

function getConfidence(application) {
  const value = application.status_confidence ?? application.suggested_confidence;
  if (value === null || value === undefined) {
    return null;
  }
  return Number(value);
}

function getStatusSource(application) {
  if (application.status_source) {
    return application.status_source;
  }
  return application.user_override ? 'user' : 'inferred';
}

function statusSourceLabel(value) {
  return value === 'user' ? 'User set' : 'Inferred';
}

function formatAuthProvider(value) {
  if (!value) {
    return 'Password';
  }
  if (value === 'password+google') {
    return 'Password + Google';
  }
  if (value === 'google') {
    return 'Google';
  }
  return 'Password';
}

function authErrorMessage(code) {
  const messages = {
    EMAIL_REQUIRED: 'Enter an email address.',
    PASSWORD_REQUIRED: 'Enter your password.',
    PASSWORD_TOO_SHORT: 'Password must be at least 12 characters.',
    EMAIL_IN_USE: 'That email already exists. Try signing in.',
    ACCOUNT_EXISTS: 'Account already exists. Please sign in.',
    INVALID_CREDENTIALS: 'Invalid email or password.',
    NO_SESSION: 'Your session expired. Please sign in again.'
  };
  return messages[code] || 'Unable to sign in. Please try again.';
}

function buildListParams(overrides = {}) {
  const params = new URLSearchParams();
  const filters = state.filters;
  const status = overrides.status ?? filters.status;
  const company = overrides.company ?? filters.company;
  const role = overrides.role ?? filters.role;
  const sortBy = 'last_activity_at';
  const sortDir = 'desc';

  if (status) {
    params.set('status', status);
  }
  if (company) {
    params.set('company', company);
  }
  if (role) {
    params.set('role', role);
  }
  if (sortBy) {
    params.set('sort_by', sortBy);
  }
  if (sortDir) {
    params.set('sort_dir', sortDir);
  }

  return params;
}

function syncViewToggle() {
  if (!viewToggle) {
    return;
  }
  viewToggle.querySelectorAll('button[data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === state.viewMode);
  });
}

function toggleSection(section, isVisible) {
  if (!section) {
    return;
  }
  section.hidden = !isVisible;
  section.classList.toggle('hidden', !isVisible);
}

function setPanelOpen(panel, open) {
  if (!panel) {
    return;
  }
  panel.hidden = !open;
  panel.classList.toggle('hidden', !open);
}

function getActiveFilters() {
  const filters = state.filters;
  const active = [];

  if (filters.status) {
    active.push(`Status: ${STATUS_LABELS[filters.status] || filters.status}`);
  }
  if (filters.company) {
    active.push(`Company: ${filters.company}`);
  }
  if (filters.role) {
    active.push(`Role: ${filters.role}`);
  }

  return active;
}

function updateFilterSummary() {
  const active = getActiveFilters();
  if (filterCount) {
    filterCount.textContent = String(active.length);
    filterCount.classList.toggle('hidden', active.length === 0);
  }
}

function updateDashboardMeta(total) {
  if (appCount) {
    appCount.textContent = `${total} tracked`;
  }
  if (viewToggle) {
    viewToggle.classList.toggle('hidden', total === 0);
  }
}

function updateKpiCounts({ total = 0, applied = 0, offer = 0, rejected = 0 } = {}) {
  if (kpiTotal) {
    kpiTotal.textContent = String(total);
  }
  if (kpiApplied) {
    kpiApplied.textContent = String(applied);
  }
  if (kpiOffer) {
    kpiOffer.textContent = String(offer);
  }
  if (kpiRejected) {
    kpiRejected.textContent = String(rejected);
  }
}

function getKpiCountsFromColumns(columns) {
  const counts = { total: 0, applied: 0, offer: 0, rejected: 0 };
  (columns || []).forEach((column) => {
    const count = column.count || 0;
    counts.total += count;
    if (column.status === 'APPLIED') {
      counts.applied += count;
    } else if (column.status === 'OFFER_RECEIVED' || column.status === 'INTERVIEW_REQUESTED') {
      counts.offer += count;
    } else if (column.status === 'REJECTED') {
      counts.rejected += count;
    }
  });
  return counts;
}

async function refreshKpisFromPipeline() {
  if (!kpiTotal) {
    return;
  }
  try {
    const params = buildListParams();
    params.set('per_status_limit', '1');
    const data = await api(`/api/applications/pipeline?${params.toString()}`);
    updateKpiCounts(getKpiCountsFromColumns(data.columns || []));
  } catch (err) {
    // Keep existing counts on fetch failure.
  }
}

function refreshDashboardEmptyStateIfNeeded() {
  if (!sessionUser || state.lastTotal !== 0) {
    return;
  }
  const hash = window.location.hash.replace('#', '');
  if (hash && hash !== 'dashboard') {
    return;
  }
  if (state.viewMode === 'pipeline') {
    renderPipeline([], 0);
  } else {
    renderApplicationsTable([]);
  }
}

function setView(view) {
  toggleSection(authView, view === 'auth');
  toggleSection(dashboardView, view === 'dashboard');
  toggleSection(accountView, view === 'account');
  toggleSection(archiveView, view === 'archive');
  toggleSection(unsortedView, view === 'unsorted');
  toggleSection(resumeCuratorView, view === 'resume-curator');
  const isAuthed = Boolean(sessionUser);
  if (topbar) {
    topbar.classList.toggle('hidden', !isAuthed);
  }
  if (nav) {
    nav.classList.toggle('hidden', !isAuthed);
  }
  if (logoutBtn) {
    logoutBtn.classList.toggle('hidden', !isAuthed);
  }
  if (accountAvatar) {
    accountAvatar.classList.toggle('hidden', !isAuthed);
    accountAvatar.classList.toggle('active', view === 'account');
  }

  if (nav) {
    const links = nav.querySelectorAll('.nav-link');
    links.forEach((link) => {
      const href = link.getAttribute('href') || '';
      link.classList.toggle('active', href === `#${view}`);
    });
  }
}

function setAuthPanel(panel) {
  document.querySelectorAll('[data-panel]').forEach((el) => {
    el.classList.toggle('hidden', el.dataset.panel !== panel);
  });
  if (panel === 'signup' || panel === 'signin') {
    authMode = panel;
  }
}

async function loadSession() {
  try {
    const data = await api('/api/auth/session');
    sessionUser = data.user;
    if (accountEmail) {
      accountEmail.textContent = sessionUser.email || '—';
    }
    if (accountAuth) {
      accountAuth.textContent = formatAuthProvider(sessionUser.auth_provider);
    }
    if (avatarInitials) {
      avatarInitials.textContent = getAvatarInitials(sessionUser.email);
    }
    if (accountAvatar) {
      accountAvatar.title = sessionUser.email || 'Account';
    }
    updateFilterSummary();
    addToggle?.setAttribute('aria-expanded', 'false');
    setView('dashboard');
    syncViewToggle();
    await loadActiveApplications();
    await refreshEmailStatus();
  } catch (err) {
    sessionUser = null;
    setView('auth');
  }
}

async function loadActiveApplications() {
  if (state.viewMode === 'pipeline') {
    await refreshPipeline();
  } else {
    await refreshTable();
  }
}

async function refreshPipeline() {
  if (!pipelineView) {
    return;
  }
  pipelineView.classList.remove('hidden');
  if (applicationsTable) {
    applicationsTable.classList.add('hidden');
  }
  const pagination = document.getElementById('table-pagination');
  if (pagination) {
    pagination.classList.add('hidden');
  }
  const params = buildListParams();
  params.set('per_status_limit', String(PIPELINE_LIMIT));
  const data = await api(`/api/applications/pipeline?${params.toString()}`);
  const columns = data.columns || [];
  const total = columns.reduce((sum, col) => sum + (col.count || 0), 0);
  updateDashboardMeta(total);
  updateKpiCounts(getKpiCountsFromColumns(columns));
  state.lastTotal = total;
  renderPipeline(columns, total);
}

async function refreshTable() {
  if (!applicationsTable) {
    return;
  }
  if (pipelineView) {
    pipelineView.classList.add('hidden');
  }
  applicationsTable.classList.remove('hidden');
  const pagination = document.getElementById('table-pagination');
  if (pagination) {
    pagination.classList.remove('hidden');
  }
  const params = buildListParams();
  params.set('limit', String(PAGE_SIZE));
  params.set('offset', String(state.table.offset));
  const data = await api(`/api/applications?${params.toString()}`);
  state.table.total = data.total || 0;
  state.table.data = data.applications || [];
  updateDashboardMeta(state.table.total);
  state.lastTotal = state.table.total;
  renderApplicationsTable(sortApplications(state.table.data));
  updateTablePagination();
  await refreshKpisFromPipeline();
}

async function refreshArchivedApplications() {
  if (!archivedTable) {
    return;
  }
  const params = buildListParams();
  params.set('archived', '1');
  params.set('limit', String(PAGE_SIZE));
  params.set('offset', String(state.archived.offset));
  const data = await api(`/api/applications?${params.toString()}`);
  state.archived.total = data.total || 0;
  if (archivedCount) {
    archivedCount.textContent = `${state.archived.total} archived`;
  }
  renderArchivedApplications(data.applications || []);
  updateArchivedPagination();
}

async function refreshUnsortedEvents() {
  if (!unsortedTable) {
    return;
  }
  try {
    const data = await api('/api/email/unsorted');
    renderUnsortedEvents(data.events || []);
  } catch (err) {
    unsortedTable.innerHTML = '<div class="muted">Unable to load events.</div>';
  }
}

async function refreshEmailStatus() {
  if (
    !accountGmailStatus &&
    !accountGmailEmail &&
    !emailSync &&
    !accountEmailSync &&
    !dashboardGmailStatus &&
    !dashboardGmailEmail
  ) {
    return;
  }
  try {
    const data = await api('/api/email/status');
    emailState.configured = Boolean(data.configured);
    emailState.encryptionReady = Boolean(data.encryptionReady);
    emailState.connected = Boolean(data.connected);
    emailState.email = data.email || null;
    if (!data.configured) {
      setPillState(accountGmailStatus, 'Not configured', 'warning');
      setPillState(dashboardGmailStatus, 'Not configured', 'warning');
      if (emailConnect) {
        emailConnect.disabled = true;
      }
      setSyncDisabled(true);
      setSyncStatusText('Disabled');
      if (accountGmailEmail) {
        accountGmailEmail.textContent = 'Gmail OAuth is not configured.';
      }
      if (dashboardGmailEmail) {
        dashboardGmailEmail.textContent = 'Gmail OAuth is not configured.';
      }
      if (gmailHint) {
        gmailHint.classList.remove('hidden');
      }
    if (gmailHintText) {
      gmailHintText.textContent =
        'Add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REDIRECT_URI in .env to enable Gmail.';
    }
    if (syncControls) syncControls.classList.add('hidden');
    if (syncConnectCta) syncConnectCta.classList.remove('hidden');
    return;
  }
  if (!data.encryptionReady) {
    setPillState(accountGmailStatus, 'Encryption required', 'warning');
    setPillState(dashboardGmailStatus, 'Encryption required', 'warning');
    if (emailConnect) {
      emailConnect.disabled = true;
    }
    setSyncDisabled(true);
    setSyncStatusText('Disabled');
      if (accountGmailEmail) {
        accountGmailEmail.textContent = 'Token encryption key is missing.';
      }
      if (dashboardGmailEmail) {
        dashboardGmailEmail.textContent = 'Token encryption key is missing.';
      }
      if (gmailHint) {
        gmailHint.classList.remove('hidden');
      }
      if (gmailHintText) {
        gmailHintText.textContent =
        'Set JOBTRACK_TOKEN_ENC_KEY to enable encrypted Gmail tokens.';
    }
    if (syncControls) syncControls.classList.add('hidden');
    if (syncConnectCta) syncConnectCta.classList.remove('hidden');
    return;
  }
  if (gmailHint) {
    gmailHint.classList.add('hidden');
  }
    if (emailConnect) {
      emailConnect.disabled = false;
    }
    setSyncDisabled(!data.connected);
    if (data.connected) {
      setPillState(accountGmailStatus, 'Connected', 'connected');
      setPillState(dashboardGmailStatus, 'Connected', 'connected');
      if (accountGmailEmail) {
        accountGmailEmail.textContent = data.email ? `Connected as ${data.email}` : 'Connected';
      }
      if (dashboardGmailEmail) {
        dashboardGmailEmail.textContent = data.email ? data.email : 'Connected';
      }
      if (syncControls) syncControls.classList.remove('hidden');
      if (syncConnectCta) syncConnectCta.classList.add('hidden');
      setSyncStatusText('Ready');
    } else {
      setPillState(accountGmailStatus, 'Not connected', 'idle');
      setPillState(dashboardGmailStatus, 'Not connected', 'idle');
      if (accountGmailEmail) {
        accountGmailEmail.textContent = 'Not connected.';
      }
      if (dashboardGmailEmail) {
        dashboardGmailEmail.textContent = '';
      }
      setSyncStatusText('');
      if (syncControls) syncControls.classList.add('hidden');
      if (syncConnectCta) syncConnectCta.classList.remove('hidden');
    }
    refreshDashboardEmptyStateIfNeeded();
  } catch (err) {
    emailState.connected = false;
    emailState.email = null;
    setPillState(accountGmailStatus, 'Not connected', 'idle');
    setSyncDisabled(true);
    setSyncStatusText('Not connected');
    if (gmailHint) {
      gmailHint.classList.add('hidden');
    }
    if (syncControls) syncControls.classList.add('hidden');
    if (syncConnectCta) syncConnectCta.classList.remove('hidden');
    refreshDashboardEmptyStateIfNeeded();
    renderSyncSummary({ status: 'not_connected', rawDetails: '' });
  }
}

async function refreshEmailEvents() {
  if (!emailEventsPanel || !emailEventsTable) {
    return;
  }
  try {
    const data = await api('/api/email/events');
    emailEventsPanel.classList.remove('hidden');
    renderEmailEvents(data.events || []);
  } catch (err) {
    emailEventsPanel.classList.add('hidden');
  }
}

function formatSyncSummary(result) {
  const reasons = result.reasons || {};
  const matched = result.matchedExisting ?? reasons.matched_existing ?? 0;
  const createdApps = result.createdApplications ?? reasons.auto_created ?? 0;
  const unsorted = result.unsortedCreated ?? reasons.unsorted_created ?? 0;
  const denylisted = reasons.denylisted || 0;
  const notJob = reasons.classified_not_job_related ?? result.skippedNotJob ?? 0;
  const missingIdentity = reasons.missing_identity || 0;
  const lowConfidence = (reasons.low_confidence || 0) + (reasons.not_confident_for_create || 0);
  const ambiguousSender = reasons.ambiguous_sender || 0;
  const ambiguousMatch = reasons.ambiguous_match || 0;
  const belowThreshold = reasons.below_threshold || 0;
  const duplicates = reasons.duplicate ?? result.skippedDuplicate ?? 0;
  const confirmations = result.classified_confirmation ?? 0;
  const rejections = result.classified_rejection ?? 0;
  const rejectionsMatched = result.matched_events_rejection ?? 0;
  const rejectedApplied = result.updated_status_to_rejected_total ?? 0;
  const confirmationsMatched = result.matched_events_confirmation_total ?? 0;
  const confirmationsStored = result.stored_events_confirmation_total ?? confirmations;
  const confirmationsCreated = result.created_apps_confirmation_total ?? 0;
  const unsortedConfirmations = result.unsorted_confirmation_total ?? 0;
  const unsortedRejections = result.unsorted_rejection_total ?? 0;
  const updatedApplied = result.updated_status_to_applied_total ?? 0;
  const llmCalls = result.llm_calls ?? 0;
  const llmCacheHits = result.llm_cache_hits ?? 0;
  const llmFailures = result.llm_failures ?? 0;
  const llmDisagree = result.llm_disagree_total ?? 0;
  const scanned = result.total_messages_listed ?? result.fetched_total ?? result.fetched ?? 0;
  const pages = result.pages_fetched ?? null;
  const stoppedReason = result.stopped_reason || 'completed';
  const windowStart = result.time_window_start || '';
  const windowEnd = result.time_window_end || '';
  const sourceCounts = result.message_source_counts || {};
  const sourceParts = Object.entries(sourceCounts)
    .filter(([, count]) => count > 0)
    .map(([k, v]) => `${k}:${v}`)
    .join(', ');
  const skippedTotal =
    denylisted +
    notJob +
    missingIdentity +
    lowConfidence +
    ambiguousSender +
    ambiguousMatch +
    belowThreshold +
    duplicates;

  const skippedParts = [];
  if (denylisted) skippedParts.push(`denylist ${denylisted}`);
  if (notJob) skippedParts.push(`not job related ${notJob}`);
  if (missingIdentity) skippedParts.push(`missing identity ${missingIdentity}`);
  if (lowConfidence) skippedParts.push(`low confidence ${lowConfidence}`);
  if (ambiguousSender) skippedParts.push(`ambiguous sender ${ambiguousSender}`);
  if (ambiguousMatch) skippedParts.push(`ambiguous match ${ambiguousMatch}`);
  if (belowThreshold) skippedParts.push(`below threshold ${belowThreshold}`);
  if (duplicates) skippedParts.push(`duplicates ${duplicates}`);

  const skippedLabel = skippedParts.length
    ? `Skipped ${skippedTotal}: ${skippedParts.join(', ')}`
    : `Skipped ${skippedTotal}`;

  const lines = [];
  lines.push(
    `Scanned ${scanned} messages${pages ? ` across ${pages} pages` : ''} (${windowStart} → ${windowEnd}) [${stoppedReason}]`
  );
  lines.push(
    `Confirmations: classified ${confirmations}, stored ${confirmationsStored}, matched ${confirmationsMatched}, new apps ${confirmationsCreated}, updated→APPLIED ${updatedApplied}, unsorted ${unsortedConfirmations}`
  );
  lines.push(
    `Rejections: classified ${rejections}, matched ${rejectionsMatched}, status→REJECTED ${rejectedApplied}, unsorted ${unsortedRejections}`
  );
  if (sourceParts) {
    lines.push(`Sources: ${sourceParts}`);
  }
  lines.push(`Events: matched ${matched}, new apps ${createdApps}, unsorted ${unsorted}`);
  lines.push(
    `LLM: calls ${llmCalls} (cache ${llmCacheHits}), failures ${llmFailures}, disagreements ${llmDisagree}`
  );
  lines.push(skippedLabel);
  return lines.join('\n');
}

function deriveSyncMetrics(result = {}, rawDetails = '') {
  const metrics = {
    scanned: null,
    pages: null,
    appsUpdated: null,
    windowStart: result?.time_window_start || null,
    windowEnd: result?.time_window_end || null,
    days: null
  };
  if (result && typeof result === 'object') {
    metrics.scanned =
      result.total_messages_listed ?? result.fetched_total ?? result.fetched ?? metrics.scanned;
    metrics.pages = result.pages_fetched ?? metrics.pages;
    const updatedRejected = result.updated_status_to_rejected_total ?? 0;
    const updatedApplied = result.updated_status_to_applied_total ?? 0;
    const createdApps =
      result.createdApplications ?? result.created_apps_total ?? result.created_apps_confirmation_total ?? 0;
    // Anchor to created apps; if none, fall back to status changes only.
    const updated = createdApps || (updatedRejected + updatedApplied);
    metrics.appsUpdated = updated || metrics.appsUpdated;
    metrics.days = result.days ?? metrics.days;
  }
  if (rawDetails) {
    const scanMatch = rawDetails.match(/Scanned\s+(\d+)\s+messages(?:\s+across\s+(\d+)\s+pages)?/i);
    if (scanMatch) {
      metrics.scanned = metrics.scanned ?? Number(scanMatch[1]);
      metrics.pages = metrics.pages ?? (scanMatch[2] ? Number(scanMatch[2]) : null);
    }
    const updatedMatch = rawDetails.match(/updated[^0-9]*?(\d+)\s*(applications|apps)?/i);
    if (updatedMatch) {
      metrics.appsUpdated = metrics.appsUpdated ?? Number(updatedMatch[1]);
    }
  }
  return metrics;
}

function buildMetricsLine(metrics) {
  const parts = [];
  if (Number.isFinite(metrics.scanned)) {
    parts.push(`Scanned ${metrics.scanned} messages`);
  }
  const days =
    metrics.days ??
    (syncDays ? Number(syncDays.value) || null : null) ??
    (metrics.windowStart && metrics.windowEnd
      ? Math.max(1, Math.round((new Date(metrics.windowEnd) - new Date(metrics.windowStart)) / 86400000))
      : null);
  const dateRange =
    metrics.windowStart && metrics.windowEnd
      ? formatDateRange(metrics.windowStart, metrics.windowEnd)
      : '';
  if (dateRange || days) {
    const label = dateRange
      ? `${dateRange}${days ? ` (${days} days)` : ''}`
      : `Last ${days} days`;
    parts.push(label);
  }
  if (Number.isFinite(metrics.appsUpdated)) {
    parts.push(`${metrics.appsUpdated} applications updated`);
  }
  return parts.join(' · ');
}

function getStoredSyncDetailsOpen() {
  try {
    return localStorage.getItem(SYNC_DETAILS_KEY) === '1';
  } catch (err) {
    return false;
  }
}

function storeSyncDetailsOpen(open) {
  try {
    localStorage.setItem(SYNC_DETAILS_KEY, open ? '1' : '0');
  } catch (err) {
    // ignore
  }
}

function applySyncDetailsVisibility(open, hasDetails, allowToggle = true) {
  if (!syncDetailsWrapper || !syncDetailsToggle) return;
  const effectiveOpen = hasDetails && allowToggle && open;
  syncDetailsWrapper.classList.toggle('hidden', !effectiveOpen);
  if (syncSummaryMain) {
    syncSummaryMain.classList.toggle('open', effectiveOpen);
  }
  if (syncSummaryMain) {
    syncSummaryMain.setAttribute('aria-expanded', effectiveOpen ? 'true' : 'false');
  }
}

function renderSyncSummary({ status = 'idle', result = null, rawDetails = '', label = '' } = {}) {
  if (!syncSummary || !syncSummaryStatus || !syncSummaryMetrics) return;
  if (status === 'running') {
    // While sync is in progress, rely on the progress bar and hide the summary/disclosure to reduce noise.
    syncSummary.classList.add('hidden');
    applySyncDetailsVisibility(false, false, false);
    return;
  }
  const hasDetails = Boolean(rawDetails && rawDetails.trim().length);
  if (syncResult) {
    syncResult.textContent = hasDetails ? rawDetails : '';
  }
  let statusText = 'Last sync not run';
  let metricsText = '';
  switch (status) {
    case 'running':
      statusText = '⏳ Syncing…';
      metricsText = label || 'In progress';
      break;
    case 'success': {
      statusText = '✅ Last sync complete';
      const metrics = deriveSyncMetrics(result, rawDetails);
      metricsText = buildMetricsLine(metrics) || 'Sync complete';
      break;
    }
    case 'failed':
      statusText = '⚠️ Last sync failed';
      metricsText = label || 'See details for more info';
      break;
    case 'not_connected':
      statusText = 'Not connected';
      metricsText = 'Connect Gmail to start syncing';
      break;
    default:
      statusText = 'Last sync not run';
      metricsText = 'Run a sync to see metrics';
      break;
  }
  syncSummaryStatus.textContent = statusText;
  syncSummaryMetrics.textContent = metricsText;
  syncSummary.classList.remove('hidden');
  const shouldOpen =
    hasDetails &&
    (syncDetailsToggle?.dataset.open === 'true' || getStoredSyncDetailsOpen());
  const allowToggle = status !== 'running';
  applySyncDetailsVisibility(shouldOpen, hasDetails, allowToggle);
}

async function runEmailSync({ days, statusEl, resultEl, buttonEl }) {
  if (buttonEl?.disabled) {
    return;
  }
  if (syncErrorBanner) {
    syncErrorBanner.classList.add('hidden');
  }
  renderSyncSummary({ status: 'running', rawDetails: 'Sync in progress…' });
  if (statusEl) {
    statusEl.textContent = 'Syncing...';
  }
  if (resultEl) {
    resultEl.textContent = '';
  }
  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.setAttribute('aria-busy', 'true');
    buttonEl.dataset.originalLabel = buttonEl.textContent;
    buttonEl.textContent = 'Syncing…';
    buttonEl.classList.add('loading');
  }
  const syncId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  setSyncProgressState({ visible: true, progress: 0, label: 'Starting sync…', error: false });
  startSyncPolling(syncId);
  try {
    const result = await api('/api/email/sync', {
      method: 'POST',
      body: JSON.stringify({ days, sync_id: syncId })
    });
    const status = result.status || 'success';
    if (status === 'not_connected') {
      if (statusEl) {
        statusEl.textContent = 'Not connected';
      }
    } else {
      if (statusEl) {
        statusEl.textContent = 'Complete';
      }
    }
    const rawDetails = status === 'not_connected' ? 'Connect Gmail first.' : formatSyncSummary(result);
    renderSyncSummary({
      status: status === 'not_connected' ? 'not_connected' : 'success',
      result,
      rawDetails
    });
    if (resultEl) {
      resultEl.textContent = rawDetails;
    }
    await loadActiveApplications();
    await refreshEmailEvents();
    await refreshUnsortedEvents();
    enterFinishing();
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = 'Failed';
    }
    if (syncErrorBanner && syncErrorMessage && syncErrorDetail) {
      syncErrorMessage.textContent = 'Sync failed';
      syncErrorDetail.textContent = `${err?.message || 'Unexpected error'}${err?.detail ? `\n${err.detail}` : ''}`;
      syncErrorBanner.classList.remove('hidden');
      syncErrorDetail.classList.add('hidden');
    }
    const code = err?.code ? ` (${err.code})` : '';
    const rawDetails = `${err?.message || 'Unexpected error'}${code}${
      err?.detail ? `\n${err.detail}` : ''
    }`;
    renderSyncSummary({ status: 'failed', rawDetails, label: 'Sync failed' });
    if (resultEl) {
      resultEl.textContent = rawDetails;
    }
    setSyncProgressState({ visible: true, progress: syncUiState.progress, label: 'Sync failed', error: true });
    hideSyncProgress();
  } finally {
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.setAttribute('aria-busy', 'false');
      if (buttonEl.dataset.originalLabel) {
        buttonEl.textContent = buttonEl.dataset.originalLabel;
        delete buttonEl.dataset.originalLabel;
      }
      buttonEl.classList.remove('loading');
    }
  }
}

async function runQuickSync() {
  const statusEl = document.getElementById('empty-sync-status');
  if (statusEl) {
    statusEl.textContent = 'Syncing...';
  }
  renderSyncSummary({ status: 'running', rawDetails: 'Sync in progress…' });
  const syncId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  startSyncPolling(syncId);
  try {
    const result = await api('/api/email/sync', {
      method: 'POST',
      body: JSON.stringify({ days: 30, sync_id: syncId })
    });
    const status = result.status || 'success';
    const rawDetails = status === 'not_connected' ? 'Connect Gmail first.' : formatSyncSummary(result);
    if (statusEl) {
      statusEl.textContent = status === 'not_connected' ? 'Connect Gmail first.' : 'Complete';
    }
    renderSyncSummary({
      status: status === 'not_connected' ? 'not_connected' : 'success',
      result,
      rawDetails
    });
    await loadActiveApplications();
    await refreshEmailEvents();
    await refreshUnsortedEvents();
    enterFinishing();
  } catch (err) {
    if (statusEl) {
      const code = err?.code ? ` (${err.code})` : '';
      statusEl.textContent = `Sync failed: ${err?.message || 'Unexpected error'}${code}`;
      if (err?.detail) {
        statusEl.textContent += ` — ${err.detail}`;
      }
    }
    const code = err?.code ? ` (${err.code})` : '';
    const rawDetails = `${err?.message || 'Unexpected error'}${code}${
      err?.detail ? `\n${err.detail}` : ''
    }`;
    renderSyncSummary({ status: 'failed', rawDetails, label: 'Sync failed' });
  }
}

function formatApplicationLabel(application) {
  const company = application.company_name || '—';
  const title = application.job_title || '—';
  return `${company} — ${title}`;
}

async function fetchApplications({ includeArchived = true, limit = 200 } = {}) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', '0');
  if (!includeArchived) {
    params.set('archived', '0');
  }
  const data = await api(`/api/applications?${params.toString()}`);
  return data.applications || [];
}

function disableModalFooter(footer, isDisabled) {
  if (!footer) {
    return;
  }
  footer.querySelectorAll('button').forEach((button) => {
    button.disabled = isDisabled;
  });
}

async function openEditModal(application) {
  if (!application) {
    return;
  }
  const form = document.createElement('form');
  form.className = 'modal-form form-grid';
  form.id = `edit-form-${application.id}`;

  const companyField = createTextField({
    label: 'Company name',
    name: 'company_name',
    value: application.company_name || '',
    required: true,
    placeholder: 'Company'
  });
  const titleField = createTextField({
    label: 'Job title',
    name: 'job_title',
    value: application.job_title || '',
    required: true,
    placeholder: 'Role title'
  });
  const locationField = createTextField({
    label: 'Location (optional)',
    name: 'job_location',
    value: application.job_location || '',
    placeholder: 'City, Remote, etc.'
  });
  const sourceField = createTextField({
    label: 'Source (optional)',
    name: 'source',
    value: application.source || '',
    placeholder: 'Referral, LinkedIn, etc.'
  });
  const isManualStatus = application.status_source === 'user' || application.user_override;
  const statusOptions = STATUS_OPTIONS.map((status) => ({
    value: status,
    label: STATUS_LABELS[status] || status
  }));
  const manualToggleRow = document.createElement('label');
  manualToggleRow.className = 'checkbox-row';
  const manualToggle = document.createElement('input');
  manualToggle.type = 'checkbox';
  manualToggle.checked = isManualStatus;
  const manualLabel = document.createElement('span');
  manualLabel.textContent = 'Manual status override';
  manualToggleRow.append(manualToggle, manualLabel);

  const statusFields = document.createElement('div');
  statusFields.className = `stack ${isManualStatus ? '' : 'hidden'}`;
  const statusField = createSelectField({
    label: 'Status',
    name: 'current_status',
    value: application.current_status || 'UNKNOWN',
    options: statusOptions
  });
  const noteField = createTextField({
    label: 'Note (optional)',
    name: 'status_explanation',
    value: application.status_explanation || '',
    placeholder: 'Add a note for the audit trail.',
    type: 'textarea'
  });
  const helper = document.createElement('div');
  helper.className = 'form-help';
  helper.textContent = 'Manual status locks this application and prevents automatic changes.';
  statusFields.append(statusField.wrapper, noteField.wrapper, helper);

  manualToggle.addEventListener('change', () => {
    statusFields.classList.toggle('hidden', !manualToggle.checked);
  });

  const errorEl = document.createElement('div');
  errorEl.className = 'form-error hidden';

  form.append(
    companyField.wrapper,
    titleField.wrapper,
    locationField.wrapper,
    sourceField.wrapper,
    manualToggleRow,
    statusFields,
    errorEl
  );

  const footer = buildModalFooter({ confirmText: 'Save', formId: form.id });
  openModal({
    title: 'Edit application',
    description: 'Update the core details for this application.',
    body: form,
    footer,
    allowBackdropClose: false,
    initialFocus: companyField.input
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const company = companyField.input.value.trim();
    const title = titleField.input.value.trim();
    const location = locationField.input.value.trim();
    const source = sourceField.input.value.trim();
    const manualStatus = manualToggle.checked;

    if (!company || !title) {
      setFormError(errorEl, 'Company name and role title are required.');
      return;
    }
    setFormError(errorEl, '');
    disableModalFooter(footer, true);
    try {
      const payload = {
        company_name: company,
        job_title: title,
        job_location: location,
        source
      };
      if (manualStatus) {
        payload.current_status = statusField.select.value;
        const note = noteField.input.value.trim();
        if (note) {
          payload.status_explanation = note;
        }
      } else if (application.status_source === 'user' || application.user_override) {
        payload.user_override = 0;
      }
      await api(`/api/applications/${application.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      closeModal('success');
      await loadActiveApplications();
      await refreshArchivedApplications();
      await openDetail(application.id);
    } catch (err) {
      setFormError(errorEl, err.message);
      disableModalFooter(footer, false);
    }
  });
}

async function openArchiveModal(application) {
  if (!application) {
    return;
  }
  const isArchived = Boolean(application.archived);
  const container = document.createElement('div');
  container.className = 'stack';
  const message = document.createElement('p');
  message.textContent = isArchived
    ? 'Restore this application to the active dashboard?'
    : 'Archive this application? You can restore it from Archive later.';
  const errorEl = document.createElement('div');
  errorEl.className = 'form-error hidden';
  container.append(message, errorEl);

  const footer = buildModalFooter({ confirmText: isArchived ? 'Unarchive' : 'Archive' });
  const confirmButton = footer.querySelector('[data-role="confirm"]');
  const cancelButton = footer.querySelector('[data-role="cancel"]');

  openModal({
    title: isArchived ? 'Unarchive application' : 'Archive application',
    description: '',
    body: container,
    footer,
    allowBackdropClose: false
  });

  confirmButton?.addEventListener('click', async () => {
    setFormError(errorEl, '');
    if (confirmButton) {
      confirmButton.disabled = true;
    }
    if (cancelButton) {
      cancelButton.disabled = true;
    }
    try {
      await api(`/api/applications/${application.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: !isArchived })
      });
      closeModal('success');
      await loadActiveApplications();
      await refreshArchivedApplications();
      await openDetail(application.id);
    } catch (err) {
      setFormError(errorEl, err.message);
      if (confirmButton) {
        confirmButton.disabled = false;
      }
      if (cancelButton) {
        cancelButton.disabled = false;
      }
    }
  });
}

async function openAttachModal(eventId) {
  let applications = [];
  try {
    applications = await fetchApplications({ includeArchived: false });
  } catch (err) {
    showNotice(err.message, 'Unable to load applications');
    return;
  }
  const form = document.createElement('form');
  form.className = 'modal-form form-grid';
  form.id = `attach-form-${eventId}`;

  const options = [
    { value: '', label: applications.length ? 'Select an application' : 'No applications available' },
    ...applications.map((app) => ({ value: app.id, label: formatApplicationLabel(app) }))
  ];
  const targetField = createSelectField({
    label: 'Attach to application',
    name: 'application_id',
    value: '',
    options
  });
  if (!applications.length) {
    targetField.select.disabled = true;
  }

  const errorEl = document.createElement('div');
  errorEl.className = 'form-error hidden';
  form.append(targetField.wrapper, errorEl);

  const footer = buildModalFooter({ confirmText: 'Attach', formId: form.id });
  const confirmButton = footer.querySelector('[data-role="confirm"]');
  if (confirmButton && !applications.length) {
    confirmButton.disabled = true;
  }
  openModal({
    title: 'Attach event',
    description: 'Link this email event to an existing application.',
    body: form,
    footer,
    allowBackdropClose: false,
    initialFocus: targetField.select
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const applicationId = targetField.select.value;
    if (!applicationId) {
      setFormError(errorEl, 'Select an application first.');
      return;
    }
    setFormError(errorEl, '');
    disableModalFooter(footer, true);
    try {
      await api(`/api/email/events/${eventId}/attach`, {
        method: 'POST',
        body: JSON.stringify({ applicationId })
      });
      closeModal('success');
      await loadActiveApplications();
      await refreshUnsortedEvents();
    } catch (err) {
      setFormError(errorEl, err.message);
      disableModalFooter(footer, false);
    }
  });
}

async function openCreateModal(eventId, defaults = {}) {
  const form = document.createElement('form');
  form.className = 'modal-form form-grid';
  form.id = `create-form-${eventId}`;

  const companyField = createTextField({
    label: 'Company name',
    name: 'company_name',
    value: defaults.company_name || '',
    required: true,
    placeholder: 'Company'
  });
  const titleField = createTextField({
    label: 'Job title',
    name: 'job_title',
    value: defaults.job_title || '',
    required: true,
    placeholder: 'Role title'
  });
  const locationField = createTextField({
    label: 'Location (optional)',
    name: 'job_location',
    value: '',
    placeholder: 'City, Remote, etc.'
  });
  const sourceField = createTextField({
    label: 'Source (optional)',
    name: 'source',
    value: '',
    placeholder: 'Referral, LinkedIn, etc.'
  });

  const errorEl = document.createElement('div');
  errorEl.className = 'form-error hidden';

  form.append(companyField.wrapper, titleField.wrapper, locationField.wrapper, sourceField.wrapper, errorEl);

  const footer = buildModalFooter({ confirmText: 'Create', formId: form.id });
  openModal({
    title: 'Create application',
    description: 'Create a new application from this email event.',
    body: form,
    footer,
    allowBackdropClose: false,
    initialFocus: companyField.input
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const company = companyField.input.value.trim();
    const title = titleField.input.value.trim();
    const location = locationField.input.value.trim();
    const source = sourceField.input.value.trim();
    if (!company || !title) {
      setFormError(errorEl, 'Company name and role title are required.');
      return;
    }
    setFormError(errorEl, '');
    disableModalFooter(footer, true);
    try {
      await api(`/api/email/events/${eventId}/create-application`, {
        method: 'POST',
        body: JSON.stringify({
          company_name: company,
          job_title: title,
          job_location: location,
          source
        })
      });
      closeModal('success');
      await loadActiveApplications();
      await refreshUnsortedEvents();
    } catch (err) {
      setFormError(errorEl, err.message);
      disableModalFooter(footer, false);
    }
  });
}

function renderPipeline(columns, total) {
  if (!pipelineView) {
    return;
  }
  if (!columns.length || total === 0) {
    pipelineView.innerHTML = getDashboardEmptyStateHtml();
    return;
  }
  const html = columns
    .map((column) => {
      const statusLabel = STATUS_LABELS[column.status] || column.status;
      const cards = (column.applications || [])
        .map((app) => {
          const statusValue = normalizeStatusValue(app.current_status || 'UNKNOWN');
          const statusPill = renderStatusPill(statusValue);
          const confidenceValue = getConfidence(app);
          const confidence = confidenceValue !== null ? `${Math.round(confidenceValue * 100)}%` : '—';
          const activity = formatDate(getActivityDate(app));
          const sourceLabel = statusSourceLabel(getStatusSource(app));
          const suggestionLabel = app.suggested_status
            ? STATUS_LABELS[app.suggested_status] || app.suggested_status
            : null;
          return `
            <div class="pipeline-card" data-id="${app.id}">
              <div><strong>${app.company_name || '—'}</strong></div>
              <div class="meta">${app.job_title || '—'}</div>
              <div class="status-cell">${statusPill}</div>
              <div class="meta">Last activity: ${activity}</div>
              <div class="badge-row">
                <span class="badge">${confidence}</span>
                <span class="pill subtle">${sourceLabel}</span>
                ${suggestionLabel ? `<span class="pill">${suggestionLabel} suggested</span>` : ''}
              </div>
            </div>
          `;
        })
        .join('');

      const emptyColumn = '<div class="pipeline-empty">No items</div>';
      return `
        <div class="pipeline-column">
          <div class="pipeline-column-header">
            <span>${statusLabel}</span>
            <span>${column.count || 0}</span>
          </div>
          <div class="pipeline-column-body">${cards || emptyColumn}</div>
        </div>
      `;
    })
    .join('');

  pipelineView.innerHTML = html;
}

function renderApplicationsTable(applications) {
  if (!applications.length) {
    applicationsTable.innerHTML = getDashboardEmptyStateHtml();
    return;
  }

  const sortKey = state.sort.key;
  const sortDir = state.sort.dir;
  const arrow = sortDir === 'asc' ? '▲' : '▼';
  const header = `
    <div class="table-header sortable">
      <button type="button" class="sort-btn${sortKey === 'company' ? ' active' : ''}" data-sort="company" aria-label="Sort by company">
        <span>Company</span>${sortKey === 'company' ? `<span class="arrow">${arrow}</span>` : ''}
      </button>
      <button type="button" class="sort-btn${sortKey === 'role' ? ' active' : ''}" data-sort="role" aria-label="Sort by role">
        <span>Role</span>${sortKey === 'role' ? `<span class="arrow">${arrow}</span>` : ''}
      </button>
      <button type="button" class="sort-btn${sortKey === 'status' ? ' active' : ''}" data-sort="status" aria-label="Sort by status">
        <span>Status</span>${sortKey === 'status' ? `<span class="arrow">${arrow}</span>` : ''}
      </button>
      <button type="button" class="sort-btn${sortKey === 'lastActivity' ? ' active' : ''}" data-sort="lastActivity" aria-label="Sort by last activity">
        <span>Last activity</span>${sortKey === 'lastActivity' ? `<span class="arrow">${arrow}</span>` : ''}
      </button>
    </div>
  `;

  const rows = applications
    .map((app, index) => {
      const statusValue = normalizeStatusValue(app.current_status || 'UNKNOWN');
      const statusPill = renderStatusPill(statusValue);
      const activity = formatDate(getActivityDate(app));
      const suggestionLabel = app.suggested_status
        ? STATUS_LABELS[app.suggested_status] || app.suggested_status
        : null;
      return `
        <div class="table-row" style="--stagger: ${index}" data-id="${app.id}">
          <div class="cell-company"><strong>${app.company_name || '—'}</strong></div>
          <div class="cell-role" title="${app.job_title || '—'}">${app.job_title || '—'}</div>
          <div>
            <div class="status-cell">${statusPill}</div>
            ${suggestionLabel ? `<div class="explanation">Suggestion: ${suggestionLabel}</div>` : ''}
          </div>
          <div>${activity}</div>
        </div>
      `;
    })
    .join('');

  applicationsTable.innerHTML = header + rows;
}

function renderArchivedApplications(applications) {
  if (!applications.length) {
    archivedTable.innerHTML = '<div class="muted">No archived applications.</div>';
    return;
  }

  const header = `
    <div class="table-header">
      <div>Company</div>
      <div>Role</div>
      <div>Status</div>
      <div>Last activity</div>
      <div>Confidence</div>
      <div>Source</div>
    </div>
  `;

  const rows = applications
    .map((app, index) => {
      const statusValue = normalizeStatusValue(app.current_status || 'UNKNOWN');
      const statusPill = renderStatusPill(statusValue);
      const confidenceValue = getConfidence(app);
      const confidence = confidenceValue !== null ? `${Math.round(confidenceValue * 100)}%` : '—';
      const activity = formatDate(getActivityDate(app));
      const sourceLabel = statusSourceLabel(getStatusSource(app));
      return `
        <div class="table-row" style="--stagger: ${index}" data-id="${app.id}">
          <div><strong>${app.company_name || '—'}</strong></div>
          <div>${app.job_title || '—'}</div>
          <div class="status-cell">${statusPill}</div>
          <div>${activity}</div>
          <div><span class="badge">${confidence}</span></div>
          <div>${sourceLabel}</div>
        </div>
      `;
    })
    .join('');

  archivedTable.innerHTML = header + rows;
}

function updateTablePagination() {
  if (!tablePageInfo) {
    return;
  }
  const pagination = document.getElementById('table-pagination');
  if (pagination) {
    pagination.classList.toggle('hidden', state.table.total === 0);
  }
  if (state.table.total === 0) {
    return;
  }
  const currentPage = Math.floor(state.table.offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(Math.ceil(state.table.total / PAGE_SIZE), 1);
  tablePageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  if (tablePrev) {
    tablePrev.disabled = state.table.offset <= 0;
  }
  if (tableNext) {
    tableNext.disabled = state.table.offset + PAGE_SIZE >= state.table.total;
  }
}

function updateArchivedPagination() {
  if (!archivedPageInfo) {
    return;
  }
  const currentPage = Math.floor(state.archived.offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(Math.ceil(state.archived.total / PAGE_SIZE), 1);
  archivedPageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  if (archivedPrev) {
    archivedPrev.disabled = state.archived.offset <= 0;
  }
  if (archivedNext) {
    archivedNext.disabled = state.archived.offset + PAGE_SIZE >= state.archived.total;
  }
}

function renderUnsortedEvents(events) {
  if (!events.length) {
    unsortedTable.innerHTML = '<div class="muted">No unsorted events.</div>';
    return;
  }

  function formatUnsortedReason(event) {
    if (event.reason_detail) {
      return event.reason_detail;
    }
    if (event.reason_code === 'missing_identity') {
      return 'Missing company';
    }
    if (event.reason_code === 'low_confidence') {
      return 'Low identity confidence';
    }
    if (event.reason_code === 'not_confident_for_create') {
      return 'Not confident enough to auto-create';
    }
    if (event.reason_code === 'ambiguous_sender') {
      return 'Ambiguous sender';
    }
    return '—';
  }

  const header = `
    <div class="table-header">
      <div>Sender</div>
      <div>Subject</div>
      <div>Type</div>
      <div>Confidence</div>
      <div>Reason</div>
      <div>Actions</div>
    </div>
  `;

  const rows = events
    .map((event, index) => {
      const classificationConfidence =
        event.classification_confidence ?? event.confidence_score ?? null;
      const confidence = classificationConfidence
        ? Math.round(classificationConfidence * 100) + '%'
        : '—';
      const companyPrefill = event.identity_company_name || '';
      const titlePrefill =
        event.role_title || event.identity_job_title || (companyPrefill ? 'Unknown role' : '');
      return `
        <div class="table-row" style="--stagger: ${index}">
          <div>${event.sender || '—'}</div>
          <div>${event.subject || '—'}</div>
          <div>${event.detected_type || '—'}</div>
          <div>${confidence}</div>
          <div>${formatUnsortedReason(event)}</div>
          <div class="action-group">
            <button class="ghost" data-action="attach" data-id="${event.id}">Attach</button>
            <button class="ghost" data-action="create" data-id="${event.id}"
              data-company="${encodeURIComponent(companyPrefill)}"
              data-title="${encodeURIComponent(titlePrefill)}">
              Create (prefilled)
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  unsortedTable.innerHTML = header + rows;
}

function renderEmailEvents(events) {
  if (!events.length) {
    emailEventsTable.innerHTML = '<div class=\"muted\">No ingested events.</div>';
    return;
  }

  const header = `
    <div class=\"table-header\">
      <div>Sender</div>
      <div>Subject</div>
      <div>Type</div>
      <div>Confidence</div>
    </div>
  `;

  const rows = events
    .map((event, index) => {
      const classificationConfidence =
        event.classification_confidence ?? event.confidence_score ?? null;
      const confidence = classificationConfidence
        ? Math.round(classificationConfidence * 100) + '%'
        : '—';
      return `
        <div class=\"table-row\" style=\"--stagger: ${index}\">
          <div>${event.sender || '—'}</div>
          <div>${event.subject || '—'}</div>
          <div>${event.detected_type || '—'}</div>
          <div>${confidence}</div>
        </div>
      `;
    })
    .join('');

  emailEventsTable.innerHTML = header + rows;
}

function setDrawerOpen(isOpen) {
  if (!detailDrawer) {
    return;
  }
  detailDrawer.classList.toggle('hidden', !isOpen);
  if (!isOpen) {
    currentDetail = null;
    lastDetailId = null;
    lastDetailEvents = [];
    deleteConfirmForId = null;
    deleteBusy = false;
    deleteError = null;
    explanationOpen = false;
    if (detailExplainerBody) {
      detailExplainerBody.classList.add('collapsed');
    }
    if (detailExplainerToggle) {
      detailExplainerToggle.setAttribute('aria-expanded', 'false');
    }
  }
}

function renderDetail(application, events) {
  if (!application) {
    return;
  }
  lastDetailEvents = events || [];
  if (lastDetailId !== application.id) {
    explanationOpen = false;
    lastDetailId = application.id;
    deleteConfirmForId = null;
    deleteBusy = false;
    deleteError = null;
    if (detailExplainerBody) {
      detailExplainerBody.classList.add('collapsed');
    }
    if (detailExplainerToggle) {
      detailExplainerToggle.setAttribute('aria-expanded', 'false');
    }
  }
  const statusValue = application.current_status || 'UNKNOWN';
  const statusLabel = STATUS_LABELS[statusValue] || statusValue;
  const confidenceValue = getConfidence(application);
  const confidenceLabel = confidenceValue !== null ? `${Math.round(confidenceValue * 100)}%` : '—';
  const sourceLabel = statusSourceLabel(getStatusSource(application));
  if (detailPanel) {
    detailPanel.dataset.status = statusValue.toLowerCase();
  }

  if (detailCompany) {
    detailCompany.textContent = application.company_name || '—';
  }
  if (detailTitle) {
    detailTitle.textContent = application.job_title || '—';
  }
  if (detailStatus) {
    detailStatus.textContent = statusLabel;
    detailStatus.className = `pill pill-status pill-${statusValue.toLowerCase()}`;
  }
  if (detailSource) {
    detailSource.textContent = sourceLabel;
  }
  if (detailConfidence) {
    detailConfidence.textContent = confidenceLabel === '—' ? 'Confidence —' : `${confidenceLabel} confidence`;
  }

  if (detailMeta) {
    const metaItems = [
      { label: 'Last activity', value: formatDateTime(getActivityDate(application)) },
      { label: 'Applied at', value: formatDateTime(application.applied_at) },
      { label: 'Location', value: application.job_location || '—' },
      { label: 'Source', value: application.source || '—' },
      { label: 'Archived', value: application.archived ? 'Yes' : 'No' }
    ];
    const roleSource = formatRoleSource(application);
    if (roleSource) {
      metaItems.splice(3, 0, { label: 'Role source', value: roleSource });
    }
    detailMeta.innerHTML = metaItems
      .map((item) => `<div class="details-label">${item.label}</div><div class="details-value">${item.value}</div>`)
      .join('');
  }

  if (detailExplanation) {
    detailExplanation.textContent = application.status_explanation || 'No explanation yet.';
  }

  if (detailSuggestion) {
    if (application.suggested_status) {
      const suggestionLabel = STATUS_LABELS[application.suggested_status] || application.suggested_status;
      const suggestionConfidence =
        application.suggested_confidence !== null && application.suggested_confidence !== undefined
          ? `${Math.round(application.suggested_confidence * 100)}%`
          : null;
      detailSuggestionLabel.textContent = suggestionConfidence
        ? `Suggestion: ${suggestionLabel} (${suggestionConfidence})`
        : `Suggestion: ${suggestionLabel}`;
      detailSuggestionExplanation.textContent =
        application.suggested_explanation || 'No explanation.';
      detailSuggestion.classList.remove('hidden');
      detailSuggestionAccept.dataset.id = application.id;
      detailSuggestionDismiss.dataset.id = application.id;
    } else {
      detailSuggestion.classList.add('hidden');
      detailSuggestionAccept.dataset.id = '';
      detailSuggestionDismiss.dataset.id = '';
    }
  }

  if (detailActions) {
    if (deleteConfirmForId === application.id) {
      detailActions.innerHTML = `
        <div class="danger-panel" aria-live="polite">
          <div class="danger-panel-title">Delete application?</div>
          <div class="danger-panel-body">This will remove this application and its timeline events. This can't be undone.</div>
          ${deleteError ? `<div class="form-error">${deleteError}</div>` : ''}
          <div class="danger-panel-actions">
            <button class="ghost" type="button" data-action="delete-cancel"${deleteBusy ? ' disabled' : ''}>Cancel</button>
            <button class="ghost danger" type="button" data-action="delete-confirm"${deleteBusy ? ' disabled' : ''}>${deleteBusy ? 'Deleting…' : 'Delete permanently'}</button>
          </div>
        </div>
      `;
    } else {
      detailActions.innerHTML = `
        <button class="ghost" type="button" data-action="edit">Edit</button>
        <button class="ghost" type="button" data-action="archive">${application.archived ? 'Unarchive' : 'Archive'}</button>
        <button class="ghost danger" type="button" data-action="delete">Delete</button>
      `;
    }
  }

  if (detailTimeline) {
    if (!events.length) {
      detailTimeline.innerHTML = '<div class="muted">No events yet.</div>';
    } else {
      const typeIcon = (type) => {
        const t = (type || '').toLowerCase();
        if (t === 'confirmation') return '✅';
        if (t === 'rejection') return '⛔';
        if (t.includes('interview')) return '📅';
        if (t.includes('offer')) return '🎉';
        return '•';
      };
      detailTimeline.innerHTML = events
        .map((eventItem) => {
          const eventDate = eventItem.internal_date
            ? new Date(Number(eventItem.internal_date)).toISOString()
            : eventItem.created_at;
          const classificationConfidence =
            eventItem.classification_confidence ?? eventItem.confidence_score ?? null;
          const confidence =
            classificationConfidence !== null && classificationConfidence !== undefined
              ? `${Math.round(classificationConfidence * 100)}%`
              : '—';
          const typeLabel = eventItem.detected_type || 'other';
          return `
            <div class="timeline-card">
              <div class="timeline-card-top">
                <span class="timeline-icon">${typeIcon(typeLabel)}</span>
                <span class="timeline-type">${typeLabel}</span>
                <span class="timeline-confidence">${confidence}</span>
                <span class="timeline-date">${formatDateTime(eventDate)}</span>
              </div>
              <div class="timeline-subject">${eventItem.subject || '—'}</div>
              <div class="timeline-meta">${eventItem.sender || '—'}</div>
              ${eventItem.explanation ? `<div class="timeline-meta muted">${eventItem.explanation}</div>` : ''}
            </div>
          `;
        })
        .join('');
    }
  }
}

async function openDetail(applicationId) {
  try {
    const data = await api(`/api/applications/${applicationId}`);
    currentDetail = data.application;
    renderDetail(currentDetail, data.events || []);
    setDrawerOpen(true);
  } catch (err) {
    showNotice(err.message);
  }
}

// ---------------- Resume Curator ----------------
function setRcStatus(text) {
  if (rcStatusEl) {
    rcStatusEl.textContent = text;
  }
}

function rcGetOptions() {
  const keywords = (rcKeywordsInput?.value || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  return {
    tone: rcToneSelect?.value || 'neutral',
    focus: rcFocusSelect?.value || 'balanced',
    length: rcLengthSelect?.value || 'one_page',
    includeCoverLetter: Boolean(rcIncludeCover?.checked),
    targetKeywords: keywords
  };
}

async function rcLoadResumes(selectId) {
  if (!rcResumeSelect) return;
  setRcStatus('Loading resumes…');
  try {
    const data = await api('/api/resume-curator/resumes');
    rcResumeSelect.innerHTML = '';
    let defaultId = null;
    (data.resumes || []).forEach((r) => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = `${r.name}${r.is_default ? ' (default)' : ''}`;
      if (r.is_default) defaultId = r.id;
      rcResumeSelect.appendChild(opt);
    });
    if (selectId) {
      rcResumeSelect.value = selectId;
    } else if (defaultId) {
      rcResumeSelect.value = defaultId;
    }
    rcSessionId = null;
    rcVersionId = null;
    setRcStatus('Ready');
  } catch (err) {
    setRcStatus(err.message || 'Failed to load resumes');
  }
}

async function rcEnsureSession() {
  if (rcSessionId) return rcSessionId;
  if (!rcResumeSelect?.value || !rcJdInput?.value) {
    throw new Error('Select a resume and paste the JD.');
  }
  const payload = {
    resume_id: rcResumeSelect.value,
    company_name: rcCompanyInput?.value || '',
    job_title: rcRoleInput?.value || '',
    job_location: rcLocationInput?.value || '',
    job_url: rcJobUrlInput?.value || '',
    jd_source: 'paste',
    job_description_text: rcJdInput.value,
    options: rcGetOptions()
  };
  const res = await api('/api/resume-curator/sessions', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  rcSessionId = res.session.id;
  rcLastResumeId = rcResumeSelect.value;
  return rcSessionId;
}

function rcRenderAts(ats) {
  if (!ats) return;
  rcAtsScoreEl.textContent = `ATS score: ${ats.score}`;
  rcAtsFillEl.style.width = `${Math.max(0, Math.min(100, ats.score || 0))}%`;
  const matched = ats.matchedSignals || ats.matched_keywords || [];
  const missing = ats.missingSignals || ats.missing_keywords || [];
  rcAtsMatchedEl.textContent = matched.slice(0, 12).join(', ') || '—';
  rcAtsMissingEl.textContent = missing.slice(0, 12).join(', ') || '—';

  // coverage bars (if present)
  if (ats.coverage) {
    const cov = ats.coverage;
    const reqText =
      cov.required && cov.required.total
        ? `${cov.required.matched}/${cov.required.total} required`
        : '';
    const prefText =
      cov.preferred && cov.preferred.total ? `${cov.preferred.matched}/${cov.preferred.total} preferred` : '';
    if (reqText || prefText) {
      rcAtsScoreEl.textContent += reqText ? ` • ${reqText}` : '';
      rcAtsScoreEl.textContent += prefText ? ` • ${prefText}` : '';
    }
  }
}

async function rcLoadVersions(sessionId) {
  if (!rcVersionsEl) return;
  const data = await api(`/api/resume-curator/${sessionId}`);
  rcVersionsEl.innerHTML = '';
  (data.versions || []).forEach((v) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ghost';
    btn.textContent = `${v.version_label || v.version_number || 'v'} • ATS ${v.ats_score ?? '—'}`;
    btn.addEventListener('click', () => {
      rcVersionId = v.id;
      if (rcPreviewBlock) rcPreviewBlock.removeAttribute('hidden');
      if (rcPreviewText) rcPreviewText.textContent = v.tailored_text || v.generated_resume_text || '';
      rcRenderAts({
        score: v.ats_score ?? 0,
        matched_keywords: v.ats_matched_keywords || [],
        missing_keywords: v.ats_missing_keywords || []
      });
    });
    rcVersionsEl.appendChild(btn);
  });
}

async function rcGenerate() {
  if (!rcResumeSelect?.value || !rcJdInput?.value) {
    setRcStatus('Select a resume and paste JD');
    return;
  }
  setRcStatus('Running…');
  try {
    const body = {
      base_resume_id: rcResumeSelect.value,
      company: rcCompanyInput?.value || '',
      role_title: rcRoleInput?.value || '',
      job_url: rcJobUrlInput?.value || '',
      job_description: rcJdInput.value,
      target_keywords: (rcKeywordsInput?.value || '')
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
      tone: rcToneSelect?.value || 'neutral',
      focus: rcFocusSelect?.value || 'balanced',
      length: rcLengthSelect?.value || 'one_page',
      include_cover_letter: rcIncludeCover?.checked || false
    };
    const res = await api('/api/resume-curator/run', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    rcRunId = res.run.id;
    rcRenderAts({ score: res.ats.score, matched_keywords: res.ats.matched, missing_keywords: res.ats.missing });
    renderSuggestions(res.suggestions || []);
    rcPreviewBlock?.setAttribute('hidden', 'hidden');
    setRcStatus('Ready');
  } catch (err) {
    setRcStatus(err.message || 'Run failed');
  }
}

async function rcUploadResume({ file, name, setDefault, pasteText }) {
  if (file) {
    const formData = new FormData();
    formData.append('file', file);
    if (name) formData.append('name', name);
    if (setDefault) formData.append('setDefault', 'true');
    const headers = {};
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    const res = await fetch('/api/resume-curator/resumes/upload', {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'same-origin'
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const msg = json.error || `Upload failed (${res.status})`;
      throw new Error(msg);
    }
    return json.resume;
  }
  if (pasteText) {
    const payload = {
      name: name || 'Pasted resume',
      source_type: 'paste',
      resume_text: pasteText,
      is_default: setDefault
    };
    const res = await api('/api/resume-curator/resumes', { method: 'POST', body: JSON.stringify(payload) });
    return res.resume;
  }
  throw new Error('Select a file or paste text');
}

function showUploadResumeModal() {
  const form = document.createElement('form');
  form.id = 'rc-upload-form';
  form.className = 'stack';

  const fileLabel = document.createElement('label');
  fileLabel.textContent = 'Resume file (PDF or DOCX)';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept =
    '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  fileLabel.appendChild(fileInput);

  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'General resume';
  nameLabel.appendChild(nameInput);

  const defaultLabel = document.createElement('label');
  defaultLabel.className = 'checkbox';
  const defaultInput = document.createElement('input');
  defaultInput.type = 'checkbox';
  defaultLabel.appendChild(defaultInput);
  defaultLabel.appendChild(document.createTextNode(' Set as default'));

  const pasteToggle = document.createElement('button');
  pasteToggle.type = 'button';
  pasteToggle.className = 'ghost';
  pasteToggle.textContent = 'Prefer to paste instead';

  const pasteLabel = document.createElement('label');
  pasteLabel.textContent = 'Paste resume text (optional fallback)';
  const pasteInput = document.createElement('textarea');
  pasteInput.rows = 6;
  pasteInput.placeholder = 'Paste your resume text';
  pasteLabel.appendChild(pasteInput);
  pasteLabel.classList.add('hidden');

  pasteToggle.addEventListener('click', () => {
    pasteLabel.classList.toggle('hidden');
  });

  form.appendChild(fileLabel);
  form.appendChild(nameLabel);
  form.appendChild(defaultLabel);
  form.appendChild(pasteToggle);
  form.appendChild(pasteLabel);

  const footer = buildModalFooter({ confirmText: 'Upload & Save', cancelText: 'Cancel', formId: form.id });
  footer.querySelector('[data-role=\"confirm\"]')?.classList.add('btn', 'btn-primary');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = fileInput.files && fileInput.files[0];
    const name = nameInput.value || (file ? file.name.replace(/\\.[^.]+$/, '') : '');
    const setDefault = defaultInput.checked;
    const pasted = pasteLabel.classList.contains('hidden') ? '' : pasteInput.value.trim();
    try {
      setRcStatus(file ? 'Uploading…' : 'Saving…');
      const resume = await rcUploadResume({ file, name, setDefault, pasteText: pasted });
      await rcLoadResumes(resume?.id);
      setRcStatus('Resume saved');
      closeModal('confirm');
    } catch (err) {
      setRcStatus(err.message || 'Upload failed');
    }
  });

  openModal({
    title: 'Upload resume',
    body: form,
    footer,
    allowBackdropClose: true,
    initialFocus: 'input[type=\"file\"]'
  });
}

function initResumeCurator() {
  if (rcInitialized) return;
  rcInitialized = true;

  rcNewResumeBtn?.addEventListener('click', () => {
    showUploadResumeModal();
  });

  rcResumeSelect?.addEventListener('change', () => {
    rcSessionId = null;
    rcVersionId = null;
    rcRunId = null;
  });

  rcGenerateBtn?.addEventListener('click', rcGenerate);
  rcCreateVersionBtn?.addEventListener('click', async () => {
    if (!rcRunId) {
      setRcStatus('Run first');
      return;
    }
    setRcStatus('Creating version…');
    try {
      const res = await api(`/api/resume-curator/${rcRunId}/version`, { method: 'POST' });
      rcVersionId = res.version.id;
      rcRenderAts({
        score: res.ats.score,
        matched_keywords: res.ats.matched,
        missing_keywords: res.ats.missing,
        coverage: res.ats.coverage
      });
      if (rcPreviewBlock) rcPreviewBlock.removeAttribute('hidden');
      if (rcPreviewText) rcPreviewText.textContent = res.version.tailored_text || '';
      await rcLoadRun(rcRunId);
      setRcStatus('Version created');
    } catch (err) {
      setRcStatus(err.message || 'Version failed');
    }
  });
  rcMarkExportedBtn?.addEventListener('click', async () => {
    setRcStatus('Export flag set');
  });

  rcLoadResumes();
}

function route() {
  if (!sessionUser) {
    setView('auth');
    return;
  }
  setDrawerOpen(false);
  addToggle?.setAttribute('aria-expanded', 'false');
  updateFilterSummary();
  const hash = window.location.hash.replace('#', '');
  if (hash === 'gmail') {
    setView('account');
    refreshEmailStatus();
  } else if (hash === 'archive') {
    setView('archive');
    state.archived.offset = 0;
    refreshArchivedApplications();
  } else if (hash === 'unsorted') {
    setView('unsorted');
    refreshUnsortedEvents();
  } else if (hash === 'account') {
    setView('account');
    refreshEmailStatus();
  } else if (hash === 'resume-curator') {
    setView('resume-curator');
    initResumeCurator();
  } else {
    setView('dashboard');
    syncViewToggle();
    loadActiveApplications();
  }
}

authSwitch?.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-auth]');
  if (!button) {
    return;
  }
  setAuthPanel(button.dataset.auth);
});

googleAuth?.addEventListener('click', () => {
  (async () => {
    try {
      const response = await fetch('/api/auth/google/start', { redirect: 'manual' });
      const redirectUrl = response.headers.get('location');
      if (response.status === 302 && redirectUrl) {
        window.location.href = redirectUrl;
        return;
      }
      const body = await response.json().catch(() => ({}));
      showNotice(authErrorMessage(body.error), 'Google sign-in unavailable');
    } catch (err) {
      showNotice('Unable to start Google sign-in.', 'Google sign-in unavailable');
    }
  })();
});

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (authMode !== 'signin') return;
  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());
  try {
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
    await loadCsrfToken();
    sessionUser = { email: payload.email };
    window.location.hash = '#dashboard';
    try {
      await loadSession();
    } catch (sessionErr) {
      showNotice('Session cookie not set; check cookie settings.', 'Sign in issue');
      setView('auth');
      return;
    }
    if (DEBUG_AUTH) {
      // eslint-disable-next-line no-console
      console.debug('[auth] login success, session user', sessionUser);
    }
  } catch (err) {
    showNotice(authErrorMessage(err.message), 'Sign in failed');
  }
});

signupForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (authMode !== 'signup') return;
  if (signupForm.__submitting) return;
  signupForm.__submitting = true;
  const submitBtn = signupForm.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  const formData = new FormData(signupForm);
  const payload = Object.fromEntries(formData.entries());
  try {
    await api('/api/auth/signup', { method: 'POST', body: JSON.stringify(payload) });
    await loadCsrfToken();
    sessionUser = { email: payload.email };
    window.location.hash = '#dashboard';
    try {
      await loadSession();
    } catch (sessionErr) {
      showNotice('Account created. Please sign in to continue.', 'Signup succeeded');
      window.location.hash = '#account';
      setView('auth');
      return;
    }
    if (DEBUG_AUTH) {
      // eslint-disable-next-line no-console
      console.debug('[auth] signup success, session user', sessionUser);
    }
  } catch (err) {
    if (err.status === 409 || err.code === 'ACCOUNT_EXISTS') {
      showNotice('Account already exists — please sign in.', 'Sign up');
      window.location.hash = '#account';
      setView('auth');
      const emailInput = signupForm.querySelector('input[name=\"email\"]');
      if (emailInput) emailInput.focus();
    } else {
      showNotice(authErrorMessage(err.message), 'Sign up failed');
    }
  }
  finally {
    signupForm.__submitting = false;
    if (submitBtn) submitBtn.disabled = false;
  }
});

logoutBtn?.addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  sessionUser = null;
  window.location.hash = '#account';
  setView('auth');
  await loadCsrfToken();
});

accountLogout?.addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  sessionUser = null;
  window.location.hash = '#account';
  setView('auth');
  await loadCsrfToken();
});

addToggle?.addEventListener('click', () => {
  openAddModal();
});

viewToggle?.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-view]');
  if (!button) {
    return;
  }
  const nextView = button.dataset.view;
  if (nextView !== 'pipeline' && nextView !== 'table') {
    return;
  }
  state.viewMode = nextView;
  if (nextView === 'table') {
    state.table.offset = 0;
  }
  try {
    localStorage.setItem(VIEW_MODE_KEY, nextView);
  } catch (err) {
    // Ignore storage errors (private mode, etc).
  }
  viewToggle.querySelectorAll('button[data-view]').forEach((el) => {
    el.classList.toggle('active', el.dataset.view === nextView);
  });
  await loadActiveApplications();
});

dashboardView?.addEventListener('click', async (event) => {
  const actionTarget = event.target.closest('[data-action]');
  if (!actionTarget) {
    return;
  }
  const action = actionTarget.dataset.action;
  if (action === 'add-application') {
    openAddModal();
    return;
  }
   if (action === 'sync-gmail') {
    if (emailState.connected) {
      const days = Number(syncDays?.value) || 30;
      await runEmailSync({
        days,
        statusEl: syncStatus,
        resultEl: syncResult,
        buttonEl: emailSync
      });
    } else {
      window.location.hash = '#account';
    }
    return;
  }
  if (action === 'manage-gmail') {
    window.location.hash = '#account';
    return;
  }
});

let filterCompanyTimer = null;
let filterRoleTimer = null;
const applyFilters = async () => {
  state.table.offset = 0;
  updateFilterSummary();
  await loadActiveApplications();
};

filterStatus?.addEventListener('change', async () => {
  state.filters.status = filterStatus.value || '';
  await applyFilters();
});

filterCompany?.addEventListener('input', () => {
  if (filterCompanyClear) {
    filterCompanyClear.classList.toggle('hidden', !filterCompany.value);
  }
  clearTimeout(filterCompanyTimer);
  filterCompanyTimer = setTimeout(async () => {
    state.filters.company = filterCompany.value.trim();
    await applyFilters();
  }, 180);
});

filterCompanyClear?.addEventListener('click', async () => {
  if (!filterCompany) return;
  filterCompany.value = '';
  filterCompanyClear.classList.add('hidden');
  state.filters.company = '';
  await applyFilters();
});

filterRole?.addEventListener('input', () => {
  if (filterRoleClear) {
    filterRoleClear.classList.toggle('hidden', !filterRole.value);
  }
  clearTimeout(filterRoleTimer);
  filterRoleTimer = setTimeout(async () => {
    state.filters.role = filterRole.value.trim();
    await applyFilters();
  }, 180);
});

filterRoleClear?.addEventListener('click', async () => {
  if (!filterRole) return;
  filterRole.value = '';
  filterRoleClear.classList.add('hidden');
  state.filters.role = '';
  await applyFilters();
});

tablePrev?.addEventListener('click', async () => {
  if (state.table.offset <= 0) {
    return;
  }
  state.table.offset = Math.max(state.table.offset - PAGE_SIZE, 0);
  await refreshTable();
});

tableNext?.addEventListener('click', async () => {
  if (state.table.offset + PAGE_SIZE >= state.table.total) {
    return;
  }
  state.table.offset += PAGE_SIZE;
  await refreshTable();
});

archivedPrev?.addEventListener('click', async () => {
  if (state.archived.offset <= 0) {
    return;
  }
  state.archived.offset = Math.max(state.archived.offset - PAGE_SIZE, 0);
  await refreshArchivedApplications();
});

archivedNext?.addEventListener('click', async () => {
  if (state.archived.offset + PAGE_SIZE >= state.archived.total) {
    return;
  }
  state.archived.offset += PAGE_SIZE;
  await refreshArchivedApplications();
});

applicationsTable?.addEventListener('click', (event) => {
  const sortBtn = event.target.closest('.sort-btn');
  if (sortBtn) {
    const key = sortBtn.dataset.sort;
    if (key) {
      if (state.sort.key === key) {
        state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort.key = key;
        state.sort.dir = key === 'lastActivity' ? 'desc' : 'asc';
      }
      renderApplicationsTable(sortApplications(state.table.data));
    }
    return;
  }
  const row = event.target.closest('.table-row');
  if (!row) {
    return;
  }
  const applicationId = row.dataset.id;
  if (applicationId) {
    openDetail(applicationId);
  }
});

pipelineView?.addEventListener('click', (event) => {
  const card = event.target.closest('.pipeline-card');
  if (!card) {
    return;
  }
  const applicationId = card.dataset.id;
  if (applicationId) {
    openDetail(applicationId);
  }
});

archivedTable?.addEventListener('click', (event) => {
  const row = event.target.closest('.table-row');
  if (!row) {
    return;
  }
  const applicationId = row.dataset.id;
  if (applicationId) {
    openDetail(applicationId);
  }
});

emailConnect?.addEventListener('click', async () => {
  if (emailConnect.disabled) {
    return;
  }
  try {
    const data = await api('/api/email/connect', { method: 'POST' });
    window.location.href = data.url;
  } catch (err) {
    showNotice(err.message, 'Unable to connect Gmail');
  }
});

emailSync?.addEventListener('click', async () => {
  const days = Number(syncDays?.value) || 30;
  await runEmailSync({
    days,
    statusEl: syncStatus,
    resultEl: syncResult,
    buttonEl: emailSync
  });
});

syncErrorToggle?.addEventListener('click', () => {
  if (!syncErrorDetail) return;
  const willShow = syncErrorDetail.classList.contains('hidden');
  syncErrorDetail.classList.toggle('hidden', !willShow);
  if (syncErrorToggle) {
    syncErrorToggle.textContent = willShow ? 'Hide details' : 'Show details';
  }
});

if (syncSummaryMain) {
  syncSummaryMain.addEventListener('click', () => {
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;
    const current = syncSummaryMain.dataset.open === 'true';
    const next = !current;
    syncSummaryMain.dataset.open = next ? 'true' : 'false';
    storeSyncDetailsOpen(next);
    applySyncDetailsVisibility(next, Boolean(syncResult?.textContent?.trim()));
  });
  syncSummaryMain.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const current = syncSummaryMain.dataset.open === 'true';
      const next = !current;
      syncSummaryMain.dataset.open = next ? 'true' : 'false';
      storeSyncDetailsOpen(next);
      applySyncDetailsVisibility(next, Boolean(syncResult?.textContent?.trim()));
    }
  });
}

accountEmailSync?.addEventListener('click', async () => {
  const days = Number(accountSyncDays?.value) || 30;
  // Navigate to dashboard and start sync to keep UX consistent
  window.location.hash = '#dashboard';
  setView('dashboard');
  if (syncDays) {
    syncDays.value = days;
  }
  await runEmailSync({
    days,
    statusEl: accountSyncStatus,
    resultEl: accountSyncResult,
    buttonEl: emailSync
  });
});

unsortedTable?.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }
  const action = button.dataset.action;
  const eventId = button.dataset.id;

  if (action === 'attach') {
    await openAttachModal(eventId);
  }
  if (action === 'create') {
    const company = button.dataset.company ? decodeURIComponent(button.dataset.company) : '';
    const title = button.dataset.title ? decodeURIComponent(button.dataset.title) : '';
    await openCreateModal(eventId, {
      company_name: company,
      job_title: title
    });
  }
});

detailDrawer?.addEventListener('click', async (event) => {
  const actionTarget = event.target.closest('[data-action]');
  if (!actionTarget) {
    return;
  }
  const action = actionTarget.dataset.action;
  if (action === 'close') {
    setDrawerOpen(false);
    return;
  }
  if (!currentDetail) {
    return;
  }

  if (action === 'edit') {
    await openEditModal(currentDetail);
    return;
  }
  if (action === 'archive') {
    const confirmText = currentDetail.archived
      ? 'Unarchive this application?'
      : 'Archive this application?';
    const ok = window.confirm(confirmText);
    if (ok) {
      await openArchiveModal(currentDetail);
    }
    return;
  }
  if (action === 'delete') {
    deleteConfirmForId = currentDetail.id;
    deleteError = null;
    deleteBusy = false;
    renderDetail(currentDetail, lastDetailEvents);
    return;
  }
  if (action === 'delete-cancel') {
    deleteConfirmForId = null;
    deleteBusy = false;
    deleteError = null;
    renderDetail(currentDetail, lastDetailEvents);
    return;
  }
  if (action === 'delete-confirm') {
    if (deleteBusy) return;
    deleteBusy = true;
    deleteError = null;
    renderDetail(currentDetail, lastDetailEvents);
    try {
      await api(`/api/applications/${currentDetail.id}`, { method: 'DELETE' });
      deleteConfirmForId = null;
      deleteBusy = false;
      deleteError = null;
      setDrawerOpen(false);
      await loadActiveApplications();
      await refreshArchivedApplications();
    } catch (err) {
      deleteBusy = false;
      deleteError = err.message || 'Delete failed. Please try again.';
      renderDetail(currentDetail, lastDetailEvents);
    }
    return;
  }

  try {
    if (action === 'accept-suggestion') {
      await api(`/api/applications/${currentDetail.id}/suggestion/accept`, { method: 'POST' });
    }

    if (action === 'dismiss-suggestion') {
      await api(`/api/applications/${currentDetail.id}/suggestion/dismiss`, { method: 'POST' });
    }

    await loadActiveApplications();
    await refreshArchivedApplications();
    await openDetail(currentDetail.id);
  } catch (err) {
    showNotice(err.message);
  }
});

function setExplanationOpen(open) {
  explanationOpen = open;
  if (detailExplainerBody) {
    detailExplainerBody.classList.toggle('collapsed', !open);
  }
  if (detailExplainerToggle) {
    detailExplainerToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    const chev = detailExplainerToggle.querySelector('.chevron');
    if (chev) {
      chev.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
    }
  }
}

detailExplainerToggle?.addEventListener('click', () => setExplanationOpen(!explanationOpen));
detailExplainerToggle?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    setExplanationOpen(!explanationOpen);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && detailDrawer && !detailDrawer.classList.contains('hidden')) {
    if (deleteConfirmForId) {
      deleteConfirmForId = null;
      deleteBusy = false;
      deleteError = null;
      renderDetail(currentDetail, lastDetailEvents);
      return;
    }
    setDrawerOpen(false);
  }
});

modalRoot?.addEventListener('click', (event) => {
  const actionTarget = event.target.closest('[data-action]');
  if (!actionTarget) {
    return;
  }
  const action = actionTarget.dataset.action;
  if (action === 'close') {
    closeModal('close');
  }
  if (action === 'backdrop' && modalState.allowBackdropClose) {
    closeModal('backdrop');
  }
});

window.addEventListener('hashchange', route);

(async () => {
  setAuthPanel('signin');
  setupLogoFallback();
  await loadCsrfToken();
  await loadSession();
  route();
})();
async function rcLoadRun(runId) {
  const data = await api(`/api/resume-curator/${runId}`);
  rcRenderAts({
    score: data.ats.score,
    matched_keywords: data.ats.matched,
    missing_keywords: data.ats.missing,
    coverage: data.ats.coverage
  });
  renderSuggestions(data.suggestions || []);
  rcVersionsEl && (rcVersionsEl.innerHTML = '');
  (data.versions || []).forEach((v) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ghost';
    btn.textContent = `${v.version_label || 'v'} • ATS ${v.ats_score ?? '—'}`;
    btn.addEventListener('click', () => {
      rcVersionId = v.id;
      rcPreviewBlock?.removeAttribute('hidden');
      if (rcPreviewText) rcPreviewText.textContent = v.tailored_text || '';
    });
    rcVersionsEl?.appendChild(btn);
  });
}

function renderSuggestions(suggestions) {
  if (!rcSuggestionsEl) return;
  rcSuggestionsEl.innerHTML = '';
  if (!suggestions || !suggestions.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No suggestions yet.';
    rcSuggestionsEl.appendChild(empty);
    return;
  }
  suggestions.forEach((s) => {
    const card = document.createElement('div');
    card.className = 'card stack';
    const top = document.createElement('div');
    top.className = 'inline';
    const title = document.createElement('strong');
    title.textContent = s.change || s.change_text || 'Suggestion';
    const impact = document.createElement('span');
    impact.className = 'pill subtle';
    impact.textContent = s.importance || s.impact || 'med';
    top.appendChild(title);
    top.appendChild(impact);
    const reason = document.createElement('div');
    reason.className = 'muted small';
    reason.textContent = s.reason || s.reason_text || '';
    const evidence = document.createElement('div');
    evidence.className = 'muted xsmall';
    if (s.evidence_text || s.evidence) evidence.textContent = s.evidence_text || s.evidence;
    const actions = document.createElement('div');
    actions.className = 'inline';
    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'btn btn-secondary btn-sm';
    applyBtn.textContent = s.status === 'applied' ? 'Applied' : 'Apply';
    applyBtn.disabled = s.status === 'applied';
    applyBtn.addEventListener('click', async () => {
      await api(`/api/resume-curator/suggestions/${s.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'applied' })
      });
      renderSuggestions(
        suggestions.map((item) => (item.id === s.id ? { ...item, status: 'applied' } : item))
      );
    });
    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'ghost';
    dismissBtn.textContent = s.status === 'dismissed' ? 'Dismissed' : 'Dismiss';
    dismissBtn.disabled = s.status === 'dismissed';
    dismissBtn.addEventListener('click', async () => {
      await api(`/api/resume-curator/suggestions/${s.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'dismissed' })
      });
      renderSuggestions(
        suggestions.map((item) => (item.id === s.id ? { ...item, status: 'dismissed' } : item))
      );
    });
    actions.appendChild(applyBtn);
    actions.appendChild(dismissBtn);
    card.appendChild(top);
    card.appendChild(reason);
    if (evidence.textContent) card.appendChild(evidence);
    actions.style.gap = '8px';
    card.appendChild(actions);
    rcSuggestionsEl.appendChild(card);
  });
}
