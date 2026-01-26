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

const quickAdd = document.getElementById('quick-add');
const addToggle = document.getElementById('add-toggle');
const addPanel = document.getElementById('add-panel');
const filterToggle = document.getElementById('filter-toggle');
const filterCount = document.getElementById('filter-count');
const filtersPanel = document.getElementById('filters-panel');
const filtersSummary = document.getElementById('filters-summary');
const applicationsTable = document.getElementById('applications-table');
const pipelineView = document.getElementById('pipeline-view');
const appCount = document.getElementById('app-count');
const archivedTable = document.getElementById('archived-table');
const archivedCount = document.getElementById('archived-count');
const unsortedTable = document.getElementById('unsorted-table');
const viewToggle = document.getElementById('view-toggle');
const filterForm = document.getElementById('filters');
const filterStatus = document.getElementById('filter-status');
const filterCompany = document.getElementById('filter-company');
const filterRecency = document.getElementById('filter-recency');
const filterConfidence = document.getElementById('filter-confidence');
const filterSuggestions = document.getElementById('filter-suggestions');
const filterSort = document.getElementById('filter-sort');
const filterDir = document.getElementById('filter-dir');
const filterReset = document.getElementById('filter-reset');
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
const detailExplainerToggle = document.getElementById('detail-explainer-toggle');
const detailExplainerBody = document.getElementById('detail-explainer-body');
let explanationOpen = false;
let lastDetailId = null;
const detailActions = document.getElementById('detail-actions');
const modalRoot = document.getElementById('modal-root');
const modalTitle = document.getElementById('modal-title');
const modalDescription = document.getElementById('modal-description');
const modalBody = document.getElementById('modal-body');
const modalFooter = document.getElementById('modal-footer');

let sessionUser = null;
let currentDetail = null;
let csrfToken = null;
const STATUS_OPTIONS = Object.keys(STATUS_LABELS);
const PAGE_SIZE = 25;
const PIPELINE_LIMIT = 15;
const VIEW_MODE_KEY = 'applictus:viewMode';
const SYNC_DETAILS_KEY = 'applictus:syncDetailsOpen';
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
    recencyDays: '',
    minConfidence: '',
    suggestionsOnly: false,
    sortBy: 'last_activity_at',
    sortDir: 'desc'
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

const SORT_LABELS = {
  last_activity_at: 'Last activity',
  company_name: 'Company',
  job_title: 'Role',
  status: 'Status',
  confidence: 'Confidence',
  created_at: 'Created'
};

let modalState = {
  onClose: null,
  allowBackdropClose: false,
  focusable: [],
  lastFocused: null,
  keyHandler: null
};

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
    credentials: 'same-origin',
    ...options
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = body.error || `Request failed (${response.status})`;
    const error = new Error(message);
    error.code = body.code || response.status;
    error.detail = body.detail || null;
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function loadCsrfToken() {
  try {
    const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
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
      // Keep previous progress on poll error
      if (isDev) {
        console.debug('sync status poll failed', err?.message || err);
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
  const recencyDays = overrides.recencyDays ?? filters.recencyDays;
  const minConfidence = overrides.minConfidence ?? filters.minConfidence;
  const suggestionsOnly = overrides.suggestionsOnly ?? filters.suggestionsOnly;
  const sortBy = overrides.sortBy ?? filters.sortBy;
  const sortDir = overrides.sortDir ?? filters.sortDir;

  if (status) {
    params.set('status', status);
  }
  if (company) {
    params.set('company', company);
  }
  if (recencyDays) {
    params.set('recency_days', recencyDays);
  }
  if (minConfidence) {
    params.set('min_confidence', minConfidence);
  }
  if (suggestionsOnly) {
    params.set('suggestions_only', '1');
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
  if (filters.recencyDays) {
    active.push(`Recency: ${filters.recencyDays} days`);
  }
  if (filters.minConfidence) {
    active.push(`Confidence: ${Math.round(Number(filters.minConfidence) * 100)}%+`);
  }
  if (filters.suggestionsOnly) {
    active.push('Suggestions only');
  }
  if (filters.sortBy && filters.sortBy !== 'last_activity_at') {
    active.push(`Sort: ${SORT_LABELS[filters.sortBy] || filters.sortBy}`);
  }
  if (filters.sortDir && filters.sortDir !== 'desc') {
    active.push('Order: Oldest');
  }

  return active;
}

function updateFilterSummary() {
  const active = getActiveFilters();
  if (filterCount) {
    filterCount.textContent = String(active.length);
    filterCount.classList.toggle('hidden', active.length === 0);
  }
  if (filtersSummary) {
    const panelOpen = filtersPanel && !filtersPanel.classList.contains('hidden');
    if (active.length && !panelOpen) {
      filtersSummary.innerHTML = active.map((item) => `<span class="summary-chip">${item}</span>`).join('');
      filtersSummary.classList.remove('hidden');
    } else {
      filtersSummary.innerHTML = '';
      filtersSummary.classList.add('hidden');
    }
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
    } else if (column.status === 'OFFER_RECEIVED') {
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
    setPanelOpen(addPanel, false);
    setPanelOpen(filtersPanel, false);
    addToggle?.setAttribute('aria-expanded', 'false');
    filterToggle?.setAttribute('aria-expanded', 'false');
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
    if (result.status === 'not_connected') {
      if (statusEl) {
        statusEl.textContent = 'Not connected';
      }
    } else {
      if (statusEl) {
        statusEl.textContent = 'Complete';
      }
    }
    const rawDetails =
      result.status === 'not_connected' ? 'Connect Gmail first.' : formatSyncSummary(result);
    renderSyncSummary({
      status: result.status === 'not_connected' ? 'not_connected' : 'success',
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
    const rawDetails =
      result.status === 'not_connected' ? 'Connect Gmail first.' : formatSyncSummary(result);
    if (statusEl) {
      statusEl.textContent =
        result.status === 'not_connected' ? 'Connect Gmail first.' : 'Complete';
    }
    renderSyncSummary({
      status: result.status === 'not_connected' ? 'not_connected' : 'success',
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

  const errorEl = document.createElement('div');
  errorEl.className = 'form-error hidden';

  form.append(companyField.wrapper, titleField.wrapper, locationField.wrapper, sourceField.wrapper, errorEl);

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

    if (!company || !title) {
      setFormError(errorEl, 'Company name and role title are required.');
      return;
    }
    setFormError(errorEl, '');
    disableModalFooter(footer, true);
    try {
      await api(`/api/applications/${application.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          company_name: company,
          job_title: title,
          job_location: location,
          source
        })
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

async function openOverrideModal(application) {
  if (!application) {
    return;
  }
  const form = document.createElement('form');
  form.className = 'modal-form form-grid';
  form.id = `override-form-${application.id}`;

  const options = STATUS_OPTIONS.map((status) => ({
    value: status,
    label: STATUS_LABELS[status] || status
  }));
  const statusField = createSelectField({
    label: 'Status',
    name: 'current_status',
    value: application.current_status || 'UNKNOWN',
    options
  });
  const noteField = createTextField({
    label: 'Note (optional)',
    name: 'status_explanation',
    value: '',
    placeholder: 'Add a note for the audit trail.',
    type: 'textarea'
  });

  const errorEl = document.createElement('div');
  errorEl.className = 'form-error hidden';

  form.append(statusField.wrapper, noteField.wrapper, errorEl);

  const footer = buildModalFooter({ confirmText: 'Set status', formId: form.id });
  openModal({
    title: 'Override status',
    description: 'Set a manual status and mark this application as user-controlled.',
    body: form,
    footer,
    allowBackdropClose: false,
    initialFocus: statusField.select
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const nextStatus = statusField.select.value;
    if (!STATUS_OPTIONS.includes(nextStatus)) {
      setFormError(errorEl, 'Choose a valid status.');
      return;
    }
    setFormError(errorEl, '');
    disableModalFooter(footer, true);
    try {
      const payload = { current_status: nextStatus };
      const note = noteField.input.value.trim();
      if (note) {
        payload.status_explanation = note;
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

async function openMergeModal(application) {
  if (!application) {
    return;
  }
  let applications = [];
  try {
    applications = await fetchApplications({ includeArchived: false });
  } catch (err) {
    showNotice(err.message, 'Unable to load applications');
    return;
  }
  const candidates = applications.filter((app) => app.id !== application.id);
  const form = document.createElement('form');
  form.className = 'modal-form form-grid';
  form.id = `merge-form-${application.id}`;

  const info = document.createElement('p');
  info.textContent = 'Merge moves all events to the target and archives the source application.';
  info.className = 'modal-note';

  const selectOptions = [
    { value: '', label: candidates.length ? 'Select an application' : 'No applications available' },
    ...candidates.map((app) => ({ value: app.id, label: formatApplicationLabel(app) }))
  ];
  const targetField = createSelectField({
    label: 'Merge into',
    name: 'merge_target',
    value: '',
    options: selectOptions
  });
  if (!candidates.length) {
    targetField.select.disabled = true;
  }

  const confirmRow = document.createElement('label');
  confirmRow.className = 'checkbox-row';
  const confirmInput = document.createElement('input');
  confirmInput.type = 'checkbox';
  confirmInput.name = 'confirm_merge';
  const confirmText = document.createElement('span');
  confirmText.textContent = 'I understand this will archive the current application.';
  confirmRow.append(confirmInput, confirmText);

  const errorEl = document.createElement('div');
  errorEl.className = 'form-error hidden';

  form.append(info, targetField.wrapper, confirmRow, errorEl);

  const footer = buildModalFooter({ confirmText: 'Merge', formId: form.id });
  const confirmButton = footer.querySelector('[data-role="confirm"]');
  if (confirmButton && !candidates.length) {
    confirmButton.disabled = true;
  }
  openModal({
    title: 'Merge applications',
    description: 'Choose the application that should receive all events.',
    body: form,
    footer,
    allowBackdropClose: false,
    initialFocus: targetField.select
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const targetId = targetField.select.value;
    if (!targetId) {
      setFormError(errorEl, 'Select an application to merge into.');
      return;
    }
    if (!confirmInput.checked) {
      setFormError(errorEl, 'Confirm the merge before continuing.');
      return;
    }
    setFormError(errorEl, '');
    disableModalFooter(footer, true);
    try {
      await api(`/api/applications/${application.id}/merge`, {
        method: 'POST',
        body: JSON.stringify({ targetId })
      });
      closeModal('success');
      await loadActiveApplications();
      await refreshArchivedApplications();
      await openDetail(targetId);
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
  if (lastDetailId !== application.id) {
    explanationOpen = false;
    lastDetailId = application.id;
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

  if (detailCompany) {
    detailCompany.textContent = application.company_name || '—';
  }
  if (detailTitle) {
    detailTitle.textContent = application.job_title || '—';
  }
  if (detailStatus) {
    detailStatus.textContent = statusLabel;
    detailStatus.className = 'pill';
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
    const archiveButton = detailActions.querySelector('[data-action="archive"]');
    if (archiveButton) {
      archiveButton.textContent = application.archived ? 'Unarchive' : 'Archive';
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

function route() {
  if (!sessionUser) {
    setView('auth');
    return;
  }
  setDrawerOpen(false);
  setPanelOpen(addPanel, false);
  setPanelOpen(filtersPanel, false);
  addToggle?.setAttribute('aria-expanded', 'false');
  filterToggle?.setAttribute('aria-expanded', 'false');
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
  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());
  try {
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
    await loadCsrfToken();
    sessionUser = { email: payload.email };
    window.location.hash = '#dashboard';
    await loadSession();
  } catch (err) {
    showNotice(authErrorMessage(err.message), 'Sign in failed');
  }
});

signupForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(signupForm);
  const payload = Object.fromEntries(formData.entries());
  try {
    await api('/api/auth/signup', { method: 'POST', body: JSON.stringify(payload) });
    await loadCsrfToken();
    sessionUser = { email: payload.email };
    window.location.hash = '#dashboard';
    await loadSession();
  } catch (err) {
    showNotice(authErrorMessage(err.message), 'Sign up failed');
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
  if (!addPanel) {
    return;
  }
  const isOpen = !addPanel.classList.contains('hidden');
  setPanelOpen(addPanel, !isOpen);
  addToggle.setAttribute('aria-expanded', String(!isOpen));
  if (!isOpen) {
    setPanelOpen(filtersPanel, false);
    filterToggle?.setAttribute('aria-expanded', 'false');
  }
  updateFilterSummary();
});

filterToggle?.addEventListener('click', () => {
  if (!filtersPanel) {
    return;
  }
  const isOpen = !filtersPanel.classList.contains('hidden');
  setPanelOpen(filtersPanel, !isOpen);
  filterToggle.setAttribute('aria-expanded', String(!isOpen));
  if (!isOpen) {
    setPanelOpen(addPanel, false);
    addToggle?.setAttribute('aria-expanded', 'false');
  }
  updateFilterSummary();
});

quickAdd?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(quickAdd);
  const payload = Object.fromEntries(formData.entries());
  try {
    await api('/api/applications', { method: 'POST', body: JSON.stringify(payload) });
    quickAdd.reset();
    setPanelOpen(addPanel, false);
    addToggle?.setAttribute('aria-expanded', 'false');
    await loadActiveApplications();
  } catch (err) {
    showNotice(err.message, 'Unable to add application');
  }
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
    setPanelOpen(addPanel, true);
    addToggle?.setAttribute('aria-expanded', 'true');
    const firstField = addPanel?.querySelector('input[name="company_name"]');
    firstField?.focus();
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

filterForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  state.filters.status = filterStatus?.value || '';
  state.filters.company = filterCompany?.value.trim() || '';
  state.filters.recencyDays = filterRecency?.value || '';
  state.filters.minConfidence = filterConfidence?.value || '';
  state.filters.suggestionsOnly = Boolean(filterSuggestions?.checked);
  state.filters.sortBy = filterSort?.value || 'last_activity_at';
  state.filters.sortDir = filterDir?.value || 'desc';
  state.table.offset = 0;
  updateFilterSummary();
  await loadActiveApplications();
});

filterReset?.addEventListener('click', async () => {
  if (filterStatus) {
    filterStatus.value = '';
  }
  if (filterCompany) {
    filterCompany.value = '';
  }
  if (filterRecency) {
    filterRecency.value = '';
  }
  if (filterConfidence) {
    filterConfidence.value = '';
  }
  if (filterSuggestions) {
    filterSuggestions.checked = false;
  }
  if (filterSort) {
    filterSort.value = 'last_activity_at';
  }
  if (filterDir) {
    filterDir.value = 'desc';
  }
  state.filters = {
    status: '',
    company: '',
    recencyDays: '',
    minConfidence: '',
    suggestionsOnly: false,
    sortBy: 'last_activity_at',
    sortDir: 'desc'
  };
  state.table.offset = 0;
  updateFilterSummary();
  await loadActiveApplications();
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
  if (action === 'override') {
    await openOverrideModal(currentDetail);
    return;
  }
  if (action === 'merge') {
    await openMergeModal(currentDetail);
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
