import { ensureAnimatedBackgroundLayout, removeAnimatedBackgroundLayout } from '/animated-background.js';

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
const DEBUG_APP = typeof window !== 'undefined' && window.DEBUG_APP;
const APP_TITLE = 'Applictus';
const API_BASE_URL = (() => {
  if (typeof window === 'undefined') return '';
  const meta = document.querySelector('meta[name="app-api-base-url"]');
  const metaValue = meta?.getAttribute('content') || '';
  const configured = window.APP_CONFIG?.API_BASE_URL || metaValue;
  if (configured) return configured.replace(/\/$/, '');
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isLocal) return 'http://localhost:3000';
  return '';
})();

function apiUrl(path) {
  if (!path) return API_BASE_URL || '';
  if (path.startsWith('http')) return path;
  const base = API_BASE_URL || '';
  return `${base}${path}`;
}

let splashHidden = false;

function hideSplash() {
  if (splashHidden || typeof document === 'undefined') {
    return;
  }
  splashHidden = true;
  document.body?.classList.add('app-ready');
  const splash = document.getElementById('app-splash');
  if (!splash) {
    return;
  }
  splash.classList.add('splash-hide');
  window.setTimeout(() => {
    splash.remove();
  }, 250);
}

if (DEBUG_APP && typeof window !== 'undefined' && !window.__APP_DEBUG_ERRORS_BOUND) {
  window.__APP_DEBUG_ERRORS_BOUND = true;
  window.addEventListener('error', (event) => {
    // eslint-disable-next-line no-console
    console.error('[debug][app] window error', {
      message: event?.message,
      stack: event?.error?.stack || null,
      detailApplicationId: window.__APP_DEBUG_DETAIL_ID || null
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    // eslint-disable-next-line no-console
    console.error('[debug][app] unhandled rejection', {
      message: reason?.message || String(reason),
      stack: reason?.stack || null,
      detailApplicationId: window.__APP_DEBUG_DETAIL_ID || null
    });
  });
}

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
const privacyView = document.getElementById('privacy-view');
const termsView = document.getElementById('terms-view');
const contactView = document.getElementById('contact-view');
const aboutView = document.getElementById('about-view');
const nav = document.getElementById('nav');
const topbar = document.getElementById('topbar');
const profileMenu = document.getElementById('profile-menu');
const profileMenuPanel = document.getElementById('profile-menu-panel');
const accountAvatar = document.getElementById('account-avatar');
const avatarInitials = document.getElementById('avatar-initials');

const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const googleAuth = document.getElementById('google-auth');
const accountLogout = document.getElementById('account-logout');
const accountEmail = document.getElementById('account-email');
const accountEmailCopy = document.getElementById('account-email-copy');
const accountMethods = document.getElementById('account-methods');
const accountPasswordButton = document.getElementById('account-password-button');
const accountPasswordHint = document.getElementById('account-password-hint');
const accountGmailStatus = document.getElementById('account-gmail-status');
const accountGmailEmail = document.getElementById('account-gmail-email');
const contactForm = document.getElementById('contact-form');
const contactError = document.getElementById('contact-error');
const contactSuccess = document.getElementById('contact-success');

const quickAdd = null;
const addToggle = document.getElementById('add-toggle');
const addPanel = null;
const filterCount = document.getElementById('filter-count');
const applicationsTable = document.getElementById('applications-table');
const appCount = document.getElementById('app-count');
const archivedTable = document.getElementById('archived-table');
const archivedCount = document.getElementById('archived-count');
const unsortedTable = document.getElementById('unsorted-table');
const filterStatus = document.getElementById('filter-status');
const filterCompany = document.getElementById('filter-company');
const filterCompanyClear = document.getElementById('filter-company-clear');
const filterRole = document.getElementById('filter-role');
const filterRoleClear = document.getElementById('filter-role-clear');
const tablePrev = document.getElementById('table-prev');
const tableNext = document.getElementById('table-next');
const tablePageInfo = document.getElementById('table-page-info');
const tablePrevTop = document.getElementById('table-prev-top');
const tableNextTop = document.getElementById('table-next-top');
const tablePageInfoTop = document.getElementById('table-page-info-top');
const tableBulkBar = document.getElementById('table-bulk-bar');
const tableBulkCount = document.getElementById('table-bulk-count');
const bulkArchiveBtn = document.getElementById('bulk-archive-btn');
const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
const bulkClearBtn = document.getElementById('bulk-clear-btn');
const archivedPrev = document.getElementById('archived-prev');
const archivedNext = document.getElementById('archived-next');
const archivedPageInfo = document.getElementById('archived-page-info');
const emailConnect = document.getElementById('email-connect');
const emailDisconnect = document.getElementById('email-disconnect');
const emailSync = document.getElementById('email-sync');
const syncMenuButton = document.getElementById('email-sync-menu-button');
const syncRangeMenu = document.getElementById('sync-range-menu');
const syncActionGroup = document.getElementById('sync-action-group');
const syncHelperText = document.getElementById('sync-helper-text');
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
let bulkActionBusy = false;
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
const SYNC_DETAILS_KEY = 'applictus:syncDetailsOpen';
let rcInitialized = false;
let rcSessionId = null;
let rcVersionId = null;
let rcLastResumeId = null;
let rcRunId = null;
let dbUnavailableNoticeOpen = false;
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

function formatSyncDateTime(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

const state = {
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
    data: [],
    selectedIds: new Set()
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
  email: null,
  lastSyncedAt: null,
  lastSyncStats: null
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

let syncRangeMenuOpen = false;
let lastSyncOption = 'since_last';
updateSyncOptionSelection(lastSyncOption);

let profileMenuOpen = false;
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
  const url = apiUrl(path);
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
  const response = await fetch(url, {
    headers,
    credentials: 'include',
    ...options
  });
  if (DEBUG_APP && url.includes('/api/applications')) {
    // eslint-disable-next-line no-console
    console.debug('[api]', url, {
      status: response.status,
      contentType: response.headers.get('content-type')
    });
  }
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
    const parsed = JSON.parse(rawText);
    if (DEBUG_APP && url.includes('/api/applications')) {
      // eslint-disable-next-line no-console
      console.debug('[api] parsed', {
        path: url,
        type: typeof parsed,
        isArray: Array.isArray(parsed),
        preview: Array.isArray(parsed) ? parsed.slice(0, 1) : parsed
      });
    }
    return parsed;
  } catch (err) {
    return { raw: rawText };
  }
}

async function loadCsrfToken() {
  try {
    const response = await fetch(apiUrl('/api/auth/csrf'), { credentials: 'include' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || `Request failed (${response.status})`);
      error.code = body.error || body.code || response.status;
      error.status = response.status;
      throw error;
    }
    csrfToken = body.csrfToken || null;
    return Boolean(csrfToken);
  } catch (err) {
    csrfToken = null;
    if (isDbUnavailableClientError(err)) {
      showDbUnavailableNotice(async () => {
        await loadCsrfToken();
        const ok = await loadSession();
        if (ok) {
          route();
        }
      });
    }
    return false;
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
  if (syncMenuButton) {
    syncMenuButton.disabled = isDisabled;
  }
  if (accountEmailSync) {
    accountEmailSync.disabled = isDisabled;
    accountEmailSync.setAttribute('aria-busy', String(!!isDisabled));
  }
  if (isDisabled) {
    closeSyncRangeMenu();
  }
}

function setSyncRangeMenuOpen(open) {
  syncRangeMenuOpen = Boolean(open);
  if (syncRangeMenu) {
    syncRangeMenu.classList.toggle('hidden', !syncRangeMenuOpen);
  }
  if (syncMenuButton) {
    syncMenuButton.setAttribute('aria-expanded', syncRangeMenuOpen ? 'true' : 'false');
  }
}

function closeSyncRangeMenu() {
  setSyncRangeMenuOpen(false);
}

function updateSyncOptionSelection(option) {
  const normalized = String(option || 'since_last');
  lastSyncOption = normalized;
  if (!syncRangeMenu) {
    return;
  }
  const items = Array.from(syncRangeMenu.querySelectorAll('[data-sync-option]'));
  items.forEach((item) => {
    const selected = item.dataset.syncOption === normalized;
    item.classList.toggle('is-selected', selected);
    item.setAttribute('aria-checked', selected ? 'true' : 'false');
    const check = item.querySelector('.sync-range-check');
    if (check) {
      check.textContent = selected ? '✓' : '';
    }
  });
}

function updateSyncHelperText() {
  if (!syncHelperText) {
    return;
  }
  if (!emailState.connected) {
    syncHelperText.textContent = '';
    return;
  }
  if (!emailState.lastSyncedAt) {
    syncHelperText.textContent = 'First scan checks the last 30 days';
    return;
  }
  const label = formatSyncDateTime(emailState.lastSyncedAt);
  syncHelperText.textContent = label ? `Scans new emails since ${label}` : 'Scans new emails since last scan';
}

function getDashboardEmptyStateHtml() {
  return `
    <div class="empty-state">
      <h3>No applications yet</h3>
      <p class="muted">Scan Gmail to import applications automatically, or add one manually.</p>
      <div class="empty-state-actions">
        <button class="btn btn--primary btn--md" type="button" data-action="sync-gmail">Scan Gmail</button>
        <button class="btn btn--ghost btn--sm" type="button" data-action="add-application">Add application</button>
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
    cancelButton.className = 'btn btn--ghost btn--sm';
    cancelButton.textContent = cancelText;
    cancelButton.dataset.role = 'cancel';
    cancelButton.addEventListener('click', () => closeModal('cancel'));
    footer.appendChild(cancelButton);
  }
  if (confirmText) {
    const confirmButton = document.createElement('button');
    confirmButton.className = 'btn btn--primary btn--md';
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

function showToast(message, { tone = 'info' } = {}) {
  if (!message || typeof document === 'undefined') {
    return;
  }
  let root = document.getElementById('app-toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'app-toast-root';
    root.className = 'app-toast-root';
    document.body.appendChild(root);
  }
  const toast = document.createElement('div');
  toast.className = `app-toast ${tone ? `app-toast-${tone}` : ''}`;
  toast.textContent = message;
  root.appendChild(toast);
  window.requestAnimationFrame(() => toast.classList.add('is-visible'));
  const close = () => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => toast.remove(), 200);
  };
  window.setTimeout(close, 2200);
}

function isDbUnavailableClientError(err) {
  const code = String(err?.code || err?.message || '').toUpperCase();
  return code === 'DB_UNAVAILABLE' || (err?.status === 503 && code === '503');
}

function showDbUnavailableNotice(onRetry) {
  if (dbUnavailableNoticeOpen) {
    return;
  }
  dbUnavailableNoticeOpen = true;
  const body = document.createElement('div');
  body.className = 'stack';
  const text = document.createElement('p');
  text.textContent = 'Service temporarily unavailable. Please retry in a moment.';
  body.appendChild(text);
  const footer = buildModalFooter({ confirmText: 'Retry', cancelText: 'Dismiss' });
  const retryButton = footer.querySelector('[data-role="confirm"]');
  retryButton?.addEventListener('click', async () => {
    closeModal('confirm');
    if (typeof onRetry === 'function') {
      try {
        await onRetry();
      } catch (_) {
        // Retry failures are handled by existing request flows.
      }
    }
  });
  openModal({
    title: 'Service temporarily unavailable',
    description: '',
    body,
    footer,
    allowBackdropClose: true,
    onClose: () => {
      dbUnavailableNoticeOpen = false;
    }
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

const PASSWORD_EYE_SVG = `
  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
    <path
      d="M1.5 12s4-7.5 10.5-7.5S22.5 12 22.5 12s-4 7.5-10.5 7.5S1.5 12 1.5 12Z"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"
    />
    <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="1.5" />
  </svg>
`;

const PASSWORD_EYE_OFF_SVG = `
  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
    <path
      d="M2.5 12s3.8-7.5 9.5-7.5S21.5 12 21.5 12s-3.8 7.5-9.5 7.5S2.5 12 2.5 12Z"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"
    />
    <path
      d="M9.5 9.5A3.5 3.5 0 0 1 14.5 14.5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
    <path
      d="M4 4l16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
  </svg>
`;

function createPasswordField({
  label,
  id,
  name,
  placeholder = '',
  required = true,
  autocomplete = 'current-password'
}) {
  const wrapper = document.createElement('label');
  wrapper.textContent = label;
  const container = document.createElement('div');
  container.className = 'input-with-toggle';
  const input = document.createElement('input');
  input.type = 'password';
  input.id = id;
  input.name = name;
  input.placeholder = placeholder;
  input.autocomplete = autocomplete;
  if (required) {
    input.required = true;
  }
  container.appendChild(input);

  const toggle = document.createElement('button');
  toggle.className = 'password-toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Show password');
  toggle.setAttribute('aria-pressed', 'false');
  toggle.setAttribute('aria-controls', id);
  toggle.dataset.passwordToggle = id;
  toggle.dataset.passwordVisible = '0';
  toggle.innerHTML = `
    <span class="password-icon icon-eye" aria-hidden="true">${PASSWORD_EYE_SVG}</span>
    <span class="password-icon icon-eye-off" aria-hidden="true">${PASSWORD_EYE_OFF_SVG}</span>
  `;
  container.appendChild(toggle);

  wrapper.appendChild(container);
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
  const date = parseDate(value);
  return date ? date.toLocaleDateString() : '—';
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      if (!Number.isFinite(num)) return null;
      const ms = num < 1e12 ? num * 1000 : num;
      const date = new Date(ms);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
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
      return 'Scanning…';
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
    setSyncProgressState({ visible: true, progress: eased, label: 'Scan complete', error: false });
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
  syncUiState.backendPhaseLabel = 'Scan complete';
  animateToHundredThenHide();
  if (syncUiState.finishGuard) {
    clearTimeout(syncUiState.finishGuard);
  }
  // Safety guard: if finishing hangs, force completion
  syncUiState.finishGuard = setTimeout(() => {
    if (syncUiState.state === 'finishing') {
      setSyncProgressState({ visible: true, progress: 1, label: 'Scan complete', error: false });
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
        ? 'Starting scan…'
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
      if (progress && (progress.ok === false || progress.status === 'unknown_sync_id')) {
        // Backend doesn't know this sync id (or restarted). Stop polling but keep UI running;
        // the main /api/email/sync request will still resolve with success/failure.
        if (syncUiState.pollTimer) {
          window.clearInterval(syncUiState.pollTimer);
          syncUiState.pollTimer = null;
        }
        return;
      }
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
      // If the status record isn't found, stop polling and rely on the main sync request.
      if (err && (err.status === 404 || err.code === 'NOT_FOUND')) {
        if (syncUiState.pollTimer) {
          window.clearInterval(syncUiState.pollTimer);
          syncUiState.pollTimer = null;
        }
        return;
      }
      // Treat intermittent poll errors as transient; only fail after a few consecutive errors.
      syncUiState.pollErrorCount = (syncUiState.pollErrorCount || 0) + 1;
      const transient = syncUiState.pollErrorCount < 3;
      if (isDev) {
        console.debug('sync status poll failed', err?.message || err, { count: syncUiState.pollErrorCount });
      }
      if (transient) {
        setSyncProgressState({
          visible: true,
          label: 'Scanning…',
          error: false
        });
        return;
      }
      setSyncProgressState({ visible: true, label: 'Scan failed', error: true });
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
  const date = parseDate(value);
  return date ? date.toLocaleString() : '—';
}

function getActivityDate(application) {
  return application.last_activity_at || application.updated_at || application.created_at || null;
}

function compareByKey(a, b, key) {
  const av = (a || '').toString().toLowerCase();
  const bv = (b || '').toString().toLowerCase();
  return av.localeCompare(bv, undefined, { sensitivity: 'base' });
}

function normalizeApplicationsList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.applications)) return payload.applications;
  if (payload && Array.isArray(payload.items)) return payload.items;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

function sortApplications(list) {
  if (!Array.isArray(list)) return [];
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
    NO_SESSION: 'Your session expired. Please sign in again.',
    GOOGLE_NOT_CONFIGURED: 'Google sign-in is not configured yet. Please use email/password for now.',
    OAUTH_STATE_INVALID: 'Google sign-in expired or was interrupted. Please try again.',
    OAUTH_CODE_MISSING: 'Google sign-in did not return a valid authorization code.',
    GOOGLE_AUTH_VERIFY_FAILED: 'We could not verify your Google sign-in. Please try again.',
    GOOGLE_EMAIL_UNVERIFIED: 'Your Google account email must be verified before signing in.',
    OAUTH_USER_CREATE_FAILED: 'We could not finish Google sign-in. Please try again.',
    GMAIL_NOT_CONFIGURED: 'Gmail connect is not configured yet.',
    TOKEN_ENC_KEY_REQUIRED: 'Token encryption is not configured yet.',
    GMAIL_CONNECT_FAILED: 'Google sign-in worked, but Gmail connection could not be completed.',
    DB_UNAVAILABLE: 'Service temporarily unavailable. Please retry in a moment.'
  };
  return messages[code] || 'Unable to sign in. Please try again.';
}

function consumeAuthRedirectError() {
  if (typeof window === 'undefined') {
    return null;
  }
  const url = new URL(window.location.href);
  const errorCode = url.searchParams.get('auth_error') || url.searchParams.get('error');
  if (!errorCode) {
    return null;
  }
  url.searchParams.delete('auth_error');
  url.searchParams.delete('error');
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, '', nextUrl || '/');
  return errorCode;
}

function consumeAuthRedirectSuccess() {
  if (typeof window === 'undefined') {
    return null;
  }
  const url = new URL(window.location.href);
  const gmailConnected = url.searchParams.get('gmail_connected');
  if (!gmailConnected) {
    return null;
  }
  url.searchParams.delete('gmail_connected');
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, '', nextUrl || '/');
  return { gmailConnected: gmailConnected === '1' };
}

function contactErrorMessage(code) {
  const messages = {
    NAME_REQUIRED: 'Enter your name.',
    NAME_TOO_LONG: 'Name is too long.',
    EMAIL_REQUIRED: 'Enter an email address.',
    EMAIL_TOO_LONG: 'Email is too long.',
    INVALID_EMAIL: 'Enter a valid email address.',
    MESSAGE_REQUIRED: 'Enter a message.',
    MESSAGE_TOO_LONG: 'Message is too long.',
    RATE_LIMITED: 'Too many messages. Please try again in a bit.',
    CSRF_REQUIRED: 'Please refresh and try again.',
    CSRF_INVALID: 'Please refresh and try again.',
    CONTACT_SUBMIT_FAILED: 'Unable to send your message right now.'
  };
  return messages[code] || 'Unable to send your message. Please try again.';
}

function setMetaDescription(content) {
  if (typeof document === 'undefined') {
    return;
  }
  const tag = document.querySelector('meta[name="description"]');
  if (!tag) {
    return;
  }
  tag.setAttribute('content', content);
}

function setPageMeta(view) {
  if (typeof document === 'undefined') {
    return;
  }
  const titles = {
    auth: `${APP_TITLE} – Sign in`,
    dashboard: `${APP_TITLE} – Dashboard`,
    account: `${APP_TITLE} – Account`,
    archive: `${APP_TITLE} – Archive`,
    'resume-curator': `${APP_TITLE} – Resume Curator`,
    privacy: `${APP_TITLE} – Privacy Policy`,
    terms: `${APP_TITLE} – Terms of Service`,
    contact: `${APP_TITLE} – Contact`,
    about: `${APP_TITLE} – About Applictus`
  };

  const descriptions = {
    auth: 'Sign in to Applictus to track job applications and scan Gmail updates.',
    dashboard:
      'Applictus helps you track job applications and scan Gmail updates so you always know your application status.',
    account: 'Manage your Applictus account and Gmail connection.',
    archive: 'Browse archived job applications in Applictus.',
    privacy: 'Read the Applictus Privacy Policy.',
    terms: 'Read the Applictus Terms of Service.',
    contact: 'Contact the Applictus team.',
    about: 'Learn more about Applictus.'
  };

  document.title = titles[view] || APP_TITLE;
  setMetaDescription(descriptions[view] || descriptions.dashboard);
}

function normalizeRoutePath(pathname = '') {
  const trimmed = String(pathname || '').replace(/\/+$/, '');
  return trimmed || '/';
}

function routeFromPathname(pathname = '') {
  const path = normalizeRoutePath(pathname);
  if (path === '/privacy') return 'privacy';
  if (path === '/terms') return 'terms';
  if (path === '/contact') return 'contact';
  if (path === '/about') return 'about';
  return '';
}

function getCurrentRouteKey() {
  const hash = window.location.hash.replace('#', '');
  const routeKey = hash || routeFromPathname(window.location.pathname);
  if (routeKey === 'unsorted') {
    return 'dashboard';
  }
  return routeKey;
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

async function refreshDashboardKpis() {
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
  renderApplicationsTable([]);
}

function setProfileMenuOpen(nextOpen) {
  profileMenuOpen = Boolean(nextOpen);
  if (profileMenuPanel) {
    profileMenuPanel.classList.toggle('hidden', !profileMenuOpen);
  }
  if (profileMenu) {
    profileMenu.classList.toggle('open', profileMenuOpen);
  }
  if (accountAvatar) {
    accountAvatar.setAttribute('aria-expanded', profileMenuOpen ? 'true' : 'false');
  }
}

function closeProfileMenu() {
  setProfileMenuOpen(false);
}

function setView(view) {
  if (document?.body) {
    const useAnimatedAuthBackground =
      view === 'auth' || view === 'privacy' || view === 'terms' || view === 'contact' || view === 'about';
    const animatedVariant = useAnimatedAuthBackground ? 'auth' : null;
    const useAppGradient = view === 'dashboard' || view === 'archive' || view === 'account';
    document.body.classList.toggle('auth-mode', view === 'auth');
    document.body.classList.toggle('animated-bg-mode', Boolean(animatedVariant));
    document.body.classList.toggle('animated-bg-auth', animatedVariant === 'auth');
    document.body.classList.remove('animated-bg-dashboard');
    document.body.classList.toggle('app-page-bg', useAppGradient);
    if (animatedVariant) {
      ensureAnimatedBackgroundLayout({ variant: animatedVariant });
    } else {
      removeAnimatedBackgroundLayout();
    }
  }
  setPageMeta(view);
  toggleSection(authView, view === 'auth');
  toggleSection(dashboardView, view === 'dashboard');
  toggleSection(accountView, view === 'account');
  toggleSection(archiveView, view === 'archive');
  toggleSection(unsortedView, view === 'unsorted');
  toggleSection(resumeCuratorView, view === 'resume-curator');
  toggleSection(privacyView, view === 'privacy');
  toggleSection(termsView, view === 'terms');
  toggleSection(contactView, view === 'contact');
  toggleSection(aboutView, view === 'about');
  const isAuthed = Boolean(sessionUser);
  if (topbar) {
    topbar.classList.toggle('hidden', !isAuthed);
  }
  if (nav) {
    nav.classList.toggle('hidden', !isAuthed);
  }
  if (accountAvatar) {
    accountAvatar.classList.toggle('hidden', !isAuthed);
    accountAvatar.classList.toggle('active', view === 'account');
  }
  closeProfileMenu();

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
  if (document?.body?.classList.contains('animated-bg-auth')) {
    ensureAnimatedBackgroundLayout({ variant: 'auth' });
  }
}

function renderAccountPanel(user = sessionUser) {
  if (!user) {
    return;
  }
  if (accountEmail) {
    accountEmail.textContent = user.email || '—';
  }
  if (accountEmailCopy) {
    accountEmailCopy.disabled = !user.email;
  }
  if (accountMethods) {
    const provider = user.auth_provider || 'password';
    const hasGoogle = String(provider).includes('google');
    const hasPassword = Boolean(user.has_password);
    const chips = [
      { label: 'Password', enabled: hasPassword },
      { label: 'Google', enabled: hasGoogle }
    ];
    accountMethods.innerHTML = chips
      .map(
        (chip) =>
          `<span class="method-chip" data-state="${chip.enabled ? 'on' : 'off'}"><span class="dot"></span>${
            chip.label
          }</span>`
      )
      .join('');
  }
  if (accountPasswordButton) {
    accountPasswordButton.textContent = user.has_password ? 'Change password' : 'Set password';
  }
  if (accountPasswordHint) {
    accountPasswordHint.classList.remove('account-password-success');
    accountPasswordHint.textContent = user.has_password
      ? 'Update your password to keep your account secure.'
      : 'Set a password to sign in without Google.';
  }
}

let accountPasswordHintTimer = null;
function flashAccountPasswordHint(message, { success = false } = {}) {
  if (!accountPasswordHint) {
    return;
  }
  if (accountPasswordHintTimer) {
    clearTimeout(accountPasswordHintTimer);
    accountPasswordHintTimer = null;
  }
  accountPasswordHint.classList.toggle('account-password-success', !!success);
  accountPasswordHint.textContent = message || '';
  accountPasswordHintTimer = setTimeout(() => {
    accountPasswordHint.classList.remove('account-password-success');
    renderAccountPanel();
    accountPasswordHintTimer = null;
  }, 5000);
}

function accountPasswordErrorMessage(code) {
  if (code === 'INVALID_CURRENT_PASSWORD') {
    return 'Current password is incorrect.';
  }
  if (code === 'VALIDATION_ERROR') {
    return 'Password must be at least 12 characters.';
  }
  return 'Unable to update password. Please try again.';
}

function openAccountPasswordModal() {
  if (!sessionUser) {
    return;
  }
  const hasPassword = Boolean(sessionUser.has_password);
  const form = document.createElement('form');
  form.className = 'modal-form form-grid';
  form.id = 'account-password-form';

  const fields = [];
  let currentField = null;
  if (hasPassword) {
    currentField = createPasswordField({
      label: 'Current password',
      id: 'account-current-password',
      name: 'currentPassword',
      placeholder: 'Enter current password',
      required: true,
      autocomplete: 'current-password'
    });
    fields.push(currentField);
  }
  const newField = createPasswordField({
    label: 'New password',
    id: 'account-new-password',
    name: 'newPassword',
    placeholder: 'Minimum 12 characters',
    required: true,
    autocomplete: 'new-password'
  });
  const confirmField = createPasswordField({
    label: 'Confirm new password',
    id: 'account-confirm-password',
    name: 'confirmPassword',
    placeholder: 'Re-enter new password',
    required: true,
    autocomplete: 'new-password'
  });
  fields.push(newField, confirmField);

  const errorEl = document.createElement('div');
  errorEl.className = 'form-error hidden';
  fields.forEach((field) => form.appendChild(field.wrapper));
  form.appendChild(errorEl);

  const footer = buildModalFooter({
    confirmText: hasPassword ? 'Change password' : 'Set password',
    cancelText: 'Cancel',
    formId: form.id
  });

  openModal({
    title: hasPassword ? 'Change password' : 'Set password',
    description: hasPassword
      ? 'Enter your current password and choose a new one.'
      : 'Set a password so you can sign in with email and password.',
    body: form,
    footer,
    allowBackdropClose: true,
    initialFocus: hasPassword ? currentField.input : newField.input
  });

  bindPasswordVisibilityToggles(modalRoot || document);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const currentPassword = currentField ? currentField.input.value : '';
    const newPassword = newField.input.value;
    const confirmPassword = confirmField.input.value;

    if (hasPassword && !currentPassword) {
      setFormError(errorEl, 'Enter your current password.');
      return;
    }
    if (!newPassword || newPassword.length < 12) {
      setFormError(errorEl, 'New password must be at least 12 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError(errorEl, 'Passwords do not match.');
      return;
    }
    setFormError(errorEl, '');

    const inputs = fields.map((f) => f.input);
    inputs.forEach((input) => {
      input.disabled = true;
    });
    disableModalFooter(footer, true);

    try {
      const payload = hasPassword ? { currentPassword, newPassword } : { newPassword };
      await api('/api/account/password', { method: 'POST', body: JSON.stringify(payload) });

      const data = await api('/api/auth/session').catch(() => null);
      if (data && data.user) {
        sessionUser = data.user;
        renderAccountPanel(sessionUser);
        if (avatarInitials) {
          avatarInitials.textContent = getAvatarInitials(sessionUser.email);
        }
      }
      closeModal('success');
      flashAccountPasswordHint('Password updated.', { success: true });
    } catch (err) {
      const code = err?.message || err?.code;
      setFormError(errorEl, accountPasswordErrorMessage(code));
      disableModalFooter(footer, false);
      inputs.forEach((input) => {
        input.disabled = false;
      });
      if (hasPassword) {
        currentField?.input.focus();
      } else {
        newField.input.focus();
      }
    }
  });
}

async function loadSession() {
  let data;
  try {
    data = await api('/api/auth/session');
  } catch (err) {
    if (isDbUnavailableClientError(err)) {
      showDbUnavailableNotice(async () => {
        await loadCsrfToken();
        const ok = await loadSession();
        if (ok) {
          route();
        }
      });
      return false;
    }
    if (DEBUG_AUTH) {
      // eslint-disable-next-line no-console
      console.debug('[auth] loadSession failed', err);
    }
    sessionUser = null;
    setView('auth');
    return false;
  }

  sessionUser = data.user;
  renderAccountPanel(sessionUser);
  if (avatarInitials) {
    avatarInitials.textContent = getAvatarInitials(sessionUser.email);
  }
  if (accountAvatar) {
    accountAvatar.title = sessionUser.email || 'Account';
  }
  updateFilterSummary();
  addToggle?.setAttribute('aria-expanded', 'false');

  setView('dashboard');

  try {
    await loadActiveApplications();
  } catch (err) {
    const authFailure = err?.status === 401 || err?.message === 'AUTH_REQUIRED';
    if (authFailure) {
      sessionUser = null;
      setView('auth');
      return false;
    }
    if (DEBUG_APP) {
      // eslint-disable-next-line no-console
      console.debug('[apps] loadActiveApplications failed', err);
    }
    showNotice('Unable to load applications.', 'Dashboard');
  }

  await refreshEmailStatus();
  return true;
}

async function loadActiveApplications() {
  await refreshTable();
}

async function refreshTable() {
  if (!applicationsTable) {
    return;
  }
  setTablePaginationLoading(true);
  try {
    applicationsTable.classList.remove('hidden');
    const pagination = document.getElementById('table-pagination');
    if (pagination) {
      pagination.classList.remove('hidden');
    }
    const params = buildListParams();
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(state.table.offset));
    const data = await api(`/api/applications?${params.toString()}`);
    if (DEBUG_AUTH) {
      // eslint-disable-next-line no-console
      console.debug('[apps] table response', {
        status: data?.status,
        type: typeof data,
        isArray: Array.isArray(data)
      });
    }
    const apps = normalizeApplicationsList(data);
    state.table.total = data.total || apps.length || 0;
    state.table.data = apps;
    updateDashboardMeta(state.table.total);
    state.lastTotal = state.table.total;
    renderApplicationsTable(sortApplications(state.table.data));
    await refreshDashboardKpis();
  } finally {
    setTablePaginationLoading(false);
    updateTablePagination();
  }
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
  if (DEBUG_AUTH) {
    // eslint-disable-next-line no-console
    console.debug('[apps] archived response', {
      status: data?.status,
      type: typeof data,
      isArray: Array.isArray(data)
    });
  }
  const apps = normalizeApplicationsList(data);
  state.archived.total = data.total || apps.length || 0;
  if (archivedCount) {
    archivedCount.textContent = `${state.archived.total} archived`;
  }
  renderArchivedApplications(sortApplications(apps));
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
    emailState.lastSyncedAt = data.last_synced_at || data.lastSync?.last_synced_at || null;
    emailState.lastSyncStats = data.last_sync || data.lastSync || null;
    if (!data.configured) {
      emailState.lastSyncedAt = null;
      emailState.lastSyncStats = null;
      setPillState(accountGmailStatus, 'Not configured', 'warning');
      setPillState(dashboardGmailStatus, 'Not configured', 'warning');
      if (emailConnect) {
        emailConnect.disabled = true;
      }
      if (emailDisconnect) {
        emailDisconnect.classList.add('hidden');
        emailDisconnect.disabled = true;
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
      closeSyncRangeMenu();
      updateSyncHelperText();
      renderSyncSummary({ status: 'not_connected', rawDetails: '' });
      return;
    }
    if (!data.encryptionReady) {
      emailState.lastSyncedAt = null;
      emailState.lastSyncStats = null;
      setPillState(accountGmailStatus, 'Encryption required', 'warning');
      setPillState(dashboardGmailStatus, 'Encryption required', 'warning');
    if (emailConnect) {
      emailConnect.disabled = true;
    }
    if (emailDisconnect) {
      emailDisconnect.classList.add('hidden');
      emailDisconnect.disabled = true;
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
      closeSyncRangeMenu();
      updateSyncHelperText();
      renderSyncSummary({ status: 'not_connected', rawDetails: '' });
      return;
    }
    if (gmailHint) {
      gmailHint.classList.add('hidden');
    }
    if (emailConnect) {
      emailConnect.disabled = false;
    }
    if (emailDisconnect) {
      emailDisconnect.classList.toggle('hidden', !data.connected);
      emailDisconnect.disabled = !data.connected;
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
      if (emailState.lastSyncStats && syncUiState.state !== 'running') {
        renderSyncSummary({ status: 'success', result: emailState.lastSyncStats, rawDetails: '' });
      }
    } else {
      emailState.lastSyncedAt = null;
      emailState.lastSyncStats = null;
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
      closeSyncRangeMenu();
      renderSyncSummary({ status: 'not_connected', rawDetails: '' });
    }
    updateSyncHelperText();
    refreshDashboardEmptyStateIfNeeded();
  } catch (err) {
    emailState.connected = false;
    emailState.email = null;
    emailState.lastSyncedAt = null;
    emailState.lastSyncStats = null;
    setPillState(accountGmailStatus, 'Not connected', 'idle');
    if (emailDisconnect) {
      emailDisconnect.classList.add('hidden');
      emailDisconnect.disabled = true;
    }
    setSyncDisabled(true);
    setSyncStatusText('Not connected');
    if (gmailHint) {
      gmailHint.classList.add('hidden');
    }
    if (syncControls) syncControls.classList.add('hidden');
    if (syncConnectCta) syncConnectCta.classList.remove('hidden');
    closeSyncRangeMenu();
    updateSyncHelperText();
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
    lastSyncedAt: result?.last_synced_at || result?.lastSync?.last_synced_at || emailState.lastSyncedAt || null,
    windowStart: result?.time_window_start || null,
    windowEnd: result?.time_window_end || null
  };
  if (result && typeof result === 'object') {
    metrics.scanned =
      result.total_messages_listed ??
      result.message_count_scanned ??
      result.fetched_total ??
      result.fetched ??
      metrics.scanned;
    metrics.pages = result.pages_fetched ?? metrics.pages;
    if (Number.isFinite(result.applications_updated)) {
      metrics.appsUpdated = Number(result.applications_updated);
    }
    const updatedRejected = result.updated_status_to_rejected_total ?? 0;
    const updatedApplied = result.updated_status_to_applied_total ?? 0;
    const createdApps =
      result.createdApplications ?? result.created_apps_total ?? result.created_apps_confirmation_total ?? 0;
    // Anchor to created apps; if none, fall back to status changes only.
    const updated = createdApps || (updatedRejected + updatedApplied);
    metrics.appsUpdated = updated || metrics.appsUpdated;
    metrics.lastSyncedAt = result.last_synced_at ?? metrics.lastSyncedAt;
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
  const when = formatSyncDateTime(metrics.lastSyncedAt || metrics.windowEnd) || '—';
  const messages = Number.isFinite(metrics.scanned) ? `${metrics.scanned} messages` : '— messages';
  const applications = Number.isFinite(metrics.appsUpdated)
    ? `${metrics.appsUpdated} updated`
    : '— updated';
  return `Last scan • ${when} • ${messages} • ${applications}`;
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
  let statusText = 'Last scan not run';
  let metricsText = '';
  switch (status) {
    case 'running':
      statusText = '⏳ Scanning…';
      metricsText = label || 'In progress';
      break;
    case 'success': {
      statusText = '✅ Last scan complete';
      const metrics = deriveSyncMetrics(result, rawDetails);
      metricsText = buildMetricsLine(metrics) || 'Scan complete';
      break;
    }
    case 'failed':
      statusText = '⚠️ Last scan failed';
      metricsText = label || 'See details for more info';
      break;
    case 'not_connected':
      statusText = 'Not connected';
      metricsText = 'Connect Gmail to start scanning';
      break;
    default:
      statusText = 'Last scan not run';
      metricsText = 'Run a scan to see metrics';
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

function isGmailReconnectRequiredError(err) {
  const code = String(err?.code || err?.message || '').toUpperCase();
  return code === 'GMAIL_RECONNECT_REQUIRED';
}

async function startGmailConnectFlow() {
  const data = await api('/api/email/connect', { method: 'POST' });
  if (!data?.url) {
    throw new Error('GMAIL_CONNECT_URL_MISSING');
  }
  window.location.href = data.url;
}

async function disconnectGmailConnection(buttonEl) {
  const originalLabel = buttonEl?.textContent || 'Disconnect';
  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.textContent = 'Disconnecting…';
  }
  try {
    await api('/api/email/disconnect', { method: 'POST' });
    await refreshEmailStatus();
    renderSyncSummary({ status: 'not_connected', rawDetails: '' });
    setSyncResultText('');
  } catch (err) {
    showNotice(err.message, 'Unable to disconnect Gmail');
  } finally {
    if (buttonEl) {
      buttonEl.textContent = originalLabel;
      buttonEl.disabled = !emailState.connected;
    }
  }
}

async function runEmailSync({ mode = 'since_last', days = null, statusEl, resultEl, buttonEl }) {
  if (buttonEl?.disabled) {
    return;
  }
  closeSyncRangeMenu();
  if (buttonEl === emailSync && syncMenuButton) {
    syncMenuButton.disabled = true;
  }
  const normalizedMode = mode === 'days' ? 'days' : 'since_last';
  const normalizedDays =
    normalizedMode === 'days'
      ? Math.max(1, Math.min(365, Number(days) || 30))
      : null;
  if (syncErrorBanner) {
    syncErrorBanner.classList.add('hidden');
  }
  if (syncErrorToggle) {
    syncErrorToggle.dataset.mode = 'details';
    syncErrorToggle.textContent = 'Show details';
  }
  renderSyncSummary({ status: 'running', rawDetails: 'Scan in progress…' });
  if (statusEl) {
    statusEl.textContent = 'Scanning...';
  }
  if (resultEl) {
    resultEl.textContent = '';
  }
  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.setAttribute('aria-busy', 'true');
    buttonEl.dataset.originalLabel = buttonEl.textContent;
    buttonEl.textContent = 'Scanning…';
    buttonEl.classList.add('loading');
  }
  const syncId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  const syncBody = {
    mode: normalizedMode,
    sync_id: syncId
  };
  if (normalizedMode === 'days') {
    syncBody.days = normalizedDays;
  }
  setSyncProgressState({ visible: true, progress: 0, label: 'Starting scan…', error: false });
  startSyncPolling(syncId);
  try {
    const result = await api('/api/email/sync', {
      method: 'POST',
      body: JSON.stringify(syncBody)
    });
    const status = result.status || 'success';
    if (status === 'not_connected') {
      if (statusEl) {
        statusEl.textContent = 'Not connected';
      }
      emailState.lastSyncedAt = null;
      emailState.lastSyncStats = null;
      updateSyncHelperText();
    } else {
      if (statusEl) {
        statusEl.textContent = 'Complete';
      }
      emailState.lastSyncedAt =
        result.last_synced_at || result.lastSync?.last_synced_at || result.time_window_end || new Date().toISOString();
      emailState.lastSyncStats = result.last_sync || result;
      updateSyncHelperText();
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
    if (isGmailReconnectRequiredError(err)) {
      const reconnectMessage = 'Your Gmail connection expired. Please reconnect.';
      if (statusEl) {
        statusEl.textContent = 'Reconnect required';
      }
      if (syncErrorBanner && syncErrorMessage && syncErrorDetail) {
        syncErrorMessage.textContent = reconnectMessage;
        syncErrorDetail.textContent = 'Google no longer accepts the saved Gmail token. Reconnect to continue scanning.';
        syncErrorBanner.classList.remove('hidden');
        syncErrorDetail.classList.add('hidden');
      }
      if (syncErrorToggle) {
        syncErrorToggle.dataset.mode = 'reconnect';
        syncErrorToggle.textContent = 'Reconnect Gmail';
      }
      renderSyncSummary({ status: 'failed', rawDetails: reconnectMessage, label: 'Reconnect Gmail' });
      if (resultEl) {
        resultEl.textContent = reconnectMessage;
      }
      setSyncProgressState({ visible: true, progress: syncUiState.progress, label: 'Reconnect required', error: true });
      hideSyncProgress();
      await refreshEmailStatus().catch(() => {});
      return;
    }
    if (statusEl) {
      statusEl.textContent = 'Failed';
    }
    if (syncErrorBanner && syncErrorMessage && syncErrorDetail) {
      syncErrorMessage.textContent = 'Scan failed';
      syncErrorDetail.textContent = `${err?.message || 'Unexpected error'}${err?.detail ? `\n${err.detail}` : ''}`;
      syncErrorBanner.classList.remove('hidden');
      syncErrorDetail.classList.add('hidden');
    }
    const code = err?.code ? ` (${err.code})` : '';
    const rawDetails = `${err?.message || 'Unexpected error'}${code}${
      err?.detail ? `\n${err.detail}` : ''
    }`;
    renderSyncSummary({ status: 'failed', rawDetails, label: 'Scan failed' });
    if (resultEl) {
      resultEl.textContent = rawDetails;
    }
    setSyncProgressState({ visible: true, progress: syncUiState.progress, label: 'Scan failed', error: true });
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
    if (buttonEl === emailSync && syncMenuButton) {
      syncMenuButton.disabled = !emailState.connected;
    }
  }
}

async function runDashboardSyncOption(option) {
  if (!emailState.connected) {
    window.location.hash = '#account';
    return;
  }
  const value = String(option || 'since_last');
  if (value === 'since_last') {
    await runEmailSync({
      mode: 'since_last',
      statusEl: syncStatus,
      resultEl: syncResult,
      buttonEl: emailSync
    });
    return;
  }
  const days = Number(value);
  if (Number.isFinite(days) && days > 0) {
    await runEmailSync({
      mode: 'days',
      days,
      statusEl: syncStatus,
      resultEl: syncResult,
      buttonEl: emailSync
    });
  }
}

async function runQuickSync() {
  const statusEl = document.getElementById('empty-sync-status');
  if (statusEl) {
    statusEl.textContent = 'Scanning...';
  }
  if (syncErrorToggle) {
    syncErrorToggle.dataset.mode = 'details';
    syncErrorToggle.textContent = 'Show details';
  }
  renderSyncSummary({ status: 'running', rawDetails: 'Scan in progress…' });
  const syncId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  startSyncPolling(syncId);
  try {
    const result = await api('/api/email/sync', {
      method: 'POST',
      body: JSON.stringify({ mode: 'since_last', sync_id: syncId })
    });
    const status = result.status || 'success';
    const rawDetails = status === 'not_connected' ? 'Connect Gmail first.' : formatSyncSummary(result);
    if (statusEl) {
      statusEl.textContent = status === 'not_connected' ? 'Connect Gmail first.' : 'Complete';
    }
    if (status === 'not_connected') {
      emailState.lastSyncedAt = null;
      emailState.lastSyncStats = null;
    } else {
      emailState.lastSyncedAt =
        result.last_synced_at || result.lastSync?.last_synced_at || result.time_window_end || new Date().toISOString();
      emailState.lastSyncStats = result.last_sync || result;
    }
    updateSyncHelperText();
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
    if (isGmailReconnectRequiredError(err)) {
      if (statusEl) {
        statusEl.textContent = 'Reconnect Gmail to continue scanning.';
      }
      if (syncErrorBanner && syncErrorMessage && syncErrorDetail) {
        syncErrorMessage.textContent = 'Your Gmail connection expired. Please reconnect.';
        syncErrorDetail.textContent = 'Google no longer accepts the saved Gmail token. Reconnect to continue scanning.';
        syncErrorBanner.classList.remove('hidden');
        syncErrorDetail.classList.add('hidden');
      }
      if (syncErrorToggle) {
        syncErrorToggle.dataset.mode = 'reconnect';
        syncErrorToggle.textContent = 'Reconnect Gmail';
      }
      renderSyncSummary({
        status: 'failed',
        rawDetails: 'Your Gmail connection expired. Please reconnect.',
        label: 'Reconnect Gmail'
      });
      await refreshEmailStatus().catch(() => {});
      return;
    }
    if (statusEl) {
      const code = err?.code ? ` (${err.code})` : '';
      statusEl.textContent = `Scan failed: ${err?.message || 'Unexpected error'}${code}`;
      if (err?.detail) {
        statusEl.textContent += ` — ${err.detail}`;
      }
    }
    const code = err?.code ? ` (${err.code})` : '';
    const rawDetails = `${err?.message || 'Unexpected error'}${code}${
      err?.detail ? `\n${err.detail}` : ''
    }`;
    renderSyncSummary({ status: 'failed', rawDetails, label: 'Scan failed' });
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

function getSelectedApplicationIds() {
  return Array.from(state.table.selectedIds || []);
}

function clearTableSelection({ rerender = true } = {}) {
  if (!state.table.selectedIds || !state.table.selectedIds.size) {
    updateTableBulkBar();
    return;
  }
  state.table.selectedIds.clear();
  if (rerender && state.table.data.length) {
    renderApplicationsTable(sortApplications(state.table.data));
    return;
  }
  updateTableBulkBar();
}

function setTableSelectionBusy(isBusy) {
  bulkActionBusy = Boolean(isBusy);
  const disabled = bulkActionBusy || !state.table.selectedIds?.size;
  if (bulkArchiveBtn) {
    bulkArchiveBtn.disabled = disabled;
  }
  if (bulkDeleteBtn) {
    bulkDeleteBtn.disabled = disabled;
  }
  if (bulkClearBtn) {
    bulkClearBtn.disabled = bulkActionBusy;
  }
}

function updateTableBulkBar() {
  if (!tableBulkBar || !tableBulkCount) {
    return;
  }
  const count = state.table.selectedIds?.size || 0;
  tableBulkBar.classList.toggle('hidden', count === 0);
  tableBulkCount.textContent = `${count} selected`;
  setTableSelectionBusy(bulkActionBusy);
}

function setApplicationSelected(applicationId, selected, { rerender = true } = {}) {
  if (!applicationId) {
    return;
  }
  if (!state.table.selectedIds) {
    state.table.selectedIds = new Set();
  }
  if (selected) {
    state.table.selectedIds.add(applicationId);
  } else {
    state.table.selectedIds.delete(applicationId);
  }
  if (rerender && state.table.data.length) {
    renderApplicationsTable(sortApplications(state.table.data));
    return;
  }
  updateTableBulkBar();
}

function renderApplicationsTable(applications) {
  const visibleIdSet = new Set(applications.map((app) => app.id));
  state.table.selectedIds = new Set(
    Array.from(state.table.selectedIds || []).filter((id) => visibleIdSet.has(id))
  );

  if (!applications.length) {
    applicationsTable.innerHTML = getDashboardEmptyStateHtml();
    updateTableBulkBar();
    return;
  }

  const selectedCount = applications.filter((app) => state.table.selectedIds.has(app.id)).length;
  const allSelected = selectedCount > 0 && selectedCount === applications.length;
  const someSelected = selectedCount > 0 && !allSelected;
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
      <div class="table-select-header">
        <label class="table-select-header-label" aria-label="Select all applications on this page">
          <span class="table-select-control">
            <input class="table-select-input table-select-all" type="checkbox" ${allSelected ? 'checked' : ''} ${
              someSelected ? 'data-indeterminate="true"' : ''
            } />
            <span class="table-select-mark" aria-hidden="true"></span>
          </span>
          <span class="table-select-all-text">SELECT ALL</span>
        </label>
      </div>
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
      const isSelected = state.table.selectedIds.has(app.id);
      return `
        <div class="table-row${isSelected ? ' table-row-selected' : ''}" style="--stagger: ${index}" data-id="${app.id}">
          <div class="cell-company"><strong>${app.company_name || '—'}</strong></div>
          <div class="cell-role" title="${app.job_title || '—'}">${app.job_title || '—'}</div>
          <div>
            <div class="status-cell">${statusPill}</div>
            ${suggestionLabel ? `<div class="explanation">Suggestion: ${suggestionLabel}</div>` : ''}
          </div>
          <div>${activity}</div>
          <div class="table-select-cell">
            <label class="table-select-control" aria-label="Select application">
              <input class="table-select-input table-row-select" type="checkbox" data-id="${app.id}" ${
                isSelected ? 'checked' : ''
              } />
              <span class="table-select-mark" aria-hidden="true"></span>
            </label>
          </div>
        </div>
      `;
    })
    .join('');

  applicationsTable.innerHTML = header + rows;
  const selectAll = applicationsTable.querySelector('.table-select-all');
  if (selectAll) {
    selectAll.indeterminate = someSelected;
  }
  updateTableBulkBar();
}

async function runBulkArchive() {
  const ids = getSelectedApplicationIds();
  if (!ids.length || bulkActionBusy) {
    return;
  }
  setTableSelectionBusy(true);
  try {
    const result = await api('/api/applications/bulk-archive', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
    clearTableSelection({ rerender: false });
    await loadActiveApplications();
    await refreshArchivedApplications();
    const archivedCount = Number(result?.archivedCount || result?.updatedCount || ids.length || 0);
    showToast(`Archived ${archivedCount} application${archivedCount === 1 ? '' : 's'}.`, {
      tone: 'success'
    });
  } catch (err) {
    showNotice(err.message || 'Unable to archive selected applications.', 'Bulk archive failed');
  } finally {
    setTableSelectionBusy(false);
    updateTableBulkBar();
  }
}

function openBulkDeleteConfirm(ids) {
  const count = ids.length;
  if (!count || bulkActionBusy) {
    return;
  }

  const body = document.createElement('div');
  body.className = 'stack';
  const text = document.createElement('p');
  text.textContent = `This will remove ${count} application${count === 1 ? '' : 's'} from your dashboard.`;
  body.appendChild(text);
  const errorEl = document.createElement('div');
  errorEl.className = 'form-error hidden';
  body.appendChild(errorEl);

  const footer = buildModalFooter({
    confirmText: 'Delete',
    cancelText: 'Cancel'
  });
  const confirmButton = footer.querySelector('[data-role="confirm"]');
  if (confirmButton) {
    confirmButton.classList.remove('btn--primary');
    confirmButton.classList.add('btn--danger');
  }
  confirmButton?.addEventListener('click', async () => {
    setFormError(errorEl, '');
    setTableSelectionBusy(true);
    disableModalFooter(footer, true);
    try {
      const result = await api('/api/applications/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids })
      });
      closeModal('success');
      clearTableSelection({ rerender: false });
      await loadActiveApplications();
      await refreshArchivedApplications();
      const deletedCount = Number(result?.deletedCount || result?.updatedCount || ids.length || 0);
      showToast(`Deleted ${deletedCount} application${deletedCount === 1 ? '' : 's'}.`, {
        tone: 'danger'
      });
    } catch (err) {
      setFormError(errorEl, err.message || 'Unable to delete selected applications.');
      disableModalFooter(footer, false);
    } finally {
      setTableSelectionBusy(false);
      updateTableBulkBar();
    }
  });

  openModal({
    title: `Delete ${count} application${count === 1 ? '' : 's'}?`,
    description: 'This will remove them from your dashboard.',
    body,
    footer,
    allowBackdropClose: true
  });
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

function setTablePaginationLoading(isLoading) {
  if (!isLoading) {
    return;
  }
  if (tablePageInfo) {
    tablePageInfo.textContent = 'Page - of -';
  }
  if (tablePageInfoTop) {
    tablePageInfoTop.textContent = '- / -';
  }
  [tablePrev, tableNext, tablePrevTop, tableNextTop].forEach((button) => {
    if (button) {
      button.disabled = true;
    }
  });
}

function updateTablePagination() {
  if (!tablePageInfo) {
    return;
  }
  const hasRecords = state.table.total > 0;
  const currentPage = hasRecords ? Math.floor(state.table.offset / PAGE_SIZE) + 1 : null;
  const totalPages = hasRecords ? Math.max(Math.ceil(state.table.total / PAGE_SIZE), 1) : null;
  const pagination = document.getElementById('table-pagination');
  if (pagination) {
    pagination.classList.toggle('hidden', !hasRecords);
  }
  if (tablePageInfoTop) {
    tablePageInfoTop.textContent = hasRecords ? `${currentPage} / ${totalPages}` : '- / -';
  }
  tablePageInfo.textContent = hasRecords ? `Page ${currentPage} of ${totalPages}` : 'Page - of -';
  const canGoPrev = hasRecords && state.table.offset > 0;
  const canGoNext = hasRecords && state.table.offset + PAGE_SIZE < state.table.total;
  if (tablePrev) {
    tablePrev.disabled = !canGoPrev;
  }
  if (tableNext) {
    tableNext.disabled = !canGoNext;
  }
  if (tablePrevTop) {
    tablePrevTop.disabled = !canGoPrev;
  }
  if (tableNextTop) {
    tableNextTop.disabled = !canGoNext;
  }
}

async function goPrevPage() {
  if (state.table.offset <= 0) {
    return;
  }
  if (state.table.selectedIds?.size) {
    clearTableSelection({ rerender: false });
    showToast('Selection cleared on page change.');
  }
  state.table.offset = Math.max(state.table.offset - PAGE_SIZE, 0);
  await refreshTable();
}

async function goNextPage() {
  if (state.table.offset + PAGE_SIZE >= state.table.total) {
    return;
  }
  if (state.table.selectedIds?.size) {
    clearTableSelection({ rerender: false });
    showToast('Selection cleared on page change.');
  }
  state.table.offset += PAGE_SIZE;
  await refreshTable();
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
            <button class="btn btn--ghost btn--sm" data-action="attach" data-id="${event.id}">Attach</button>
            <button class="btn btn--ghost btn--sm" data-action="create" data-id="${event.id}"
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
  const safeEvents = Array.isArray(events)
    ? events
    : events && Array.isArray(events.rows)
    ? events.rows
    : [];
  lastDetailEvents = safeEvents;
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
            <button class="btn btn--ghost btn--sm" type="button" data-action="delete-cancel"${deleteBusy ? ' disabled' : ''}>Cancel</button>
            <button class="btn btn--danger btn--sm" type="button" data-action="delete-confirm"${deleteBusy ? ' disabled' : ''}>${deleteBusy ? 'Deleting…' : 'Delete permanently'}</button>
          </div>
        </div>
      `;
    } else {
      detailActions.innerHTML = `
        <button class="btn btn--ghost btn--sm" type="button" data-action="edit">Edit</button>
        <button class="btn btn--ghost btn--sm" type="button" data-action="archive">${application.archived ? 'Unarchive' : 'Archive'}</button>
        <button class="btn btn--danger btn--sm" type="button" data-action="delete">Delete</button>
      `;
    }
  }

  if (detailTimeline) {
    if (!safeEvents.length) {
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
      detailTimeline.innerHTML = safeEvents
        .map((eventItem) => {
          const eventDate = eventItem.internal_date || eventItem.created_at || null;
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
    if (DEBUG_APP && typeof window !== 'undefined') {
      window.__APP_DEBUG_DETAIL_ID = applicationId;
    }
    const data = await api(`/api/applications/${applicationId}`);
    currentDetail = data.application;
    renderDetail(currentDetail, data.events || []);
    setDrawerOpen(true);
  } catch (err) {
    if (DEBUG_APP) {
      // eslint-disable-next-line no-console
      console.error('[debug][app] openDetail failed', {
        applicationId,
        message: err?.message || String(err),
        stack: err?.stack || null
      });
    }
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
    btn.className = 'btn btn--ghost btn--sm';
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
    const res = await fetch(apiUrl('/api/resume-curator/resumes/upload'), {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include'
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
  pasteToggle.className = 'btn btn--ghost btn--sm';
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
  const routeKey = getCurrentRouteKey();
  const isPublicRoute =
    routeKey === 'privacy' || routeKey === 'terms' || routeKey === 'contact' || routeKey === 'about';

  if (!sessionUser) {
    setDrawerOpen(false);
    addToggle?.setAttribute('aria-expanded', 'false');
    if (isPublicRoute) {
      setView(routeKey);
      return;
    }
    // Always default to Sign in when unauthenticated (prevents accidental signup submissions after redirects).
    setAuthPanel('signin');
    setView('auth');
    return;
  }
  setDrawerOpen(false);
  addToggle?.setAttribute('aria-expanded', 'false');
  updateFilterSummary();
  if (routeKey === 'gmail') {
    setView('account');
    renderAccountPanel();
    void refreshEmailStatus();
  } else if (routeKey === 'privacy') {
    setView('privacy');
  } else if (routeKey === 'terms') {
    setView('terms');
  } else if (routeKey === 'contact') {
    setView('contact');
  } else if (routeKey === 'about') {
    setView('about');
  } else if (routeKey === 'archive') {
    setView('archive');
    state.archived.offset = 0;
    void refreshArchivedApplications().catch((err) => {
      if (DEBUG_APP) {
        // eslint-disable-next-line no-console
        console.debug('[archive] load failed', err);
      }
      showNotice('Unable to load archived applications.', 'Archive');
    });
  } else if (routeKey === 'account') {
    setView('account');
    renderAccountPanel();
    void refreshEmailStatus();
  } else if (routeKey === 'resume-curator') {
    setView('resume-curator');
    initResumeCurator();
  } else {
    setView('dashboard');
    void loadActiveApplications().catch((err) => {
      const authFailure = err?.status === 401 || err?.message === 'AUTH_REQUIRED';
      if (authFailure) {
        sessionUser = null;
        setAuthPanel('signin');
        setView('auth');
        return;
      }
      if (DEBUG_APP) {
        // eslint-disable-next-line no-console
        console.debug('[dashboard] load failed', err);
      }
      showNotice('Unable to load applications.', 'Dashboard');
    });
  }
}

function bindPasswordVisibilityToggles(root = document) {
  root.querySelectorAll('button[data-password-toggle]').forEach((button) => {
    if (button.dataset.bound) {
      return;
    }
    const targetId = button.dataset.passwordToggle;
    const input =
      (targetId && document.getElementById(targetId)) ||
      button.closest('.input-with-toggle')?.querySelector('input');
    if (!input) {
      return;
    }
    button.dataset.bound = '1';

    const syncState = () => {
      const visible = input.type === 'text';
      button.dataset.passwordVisible = visible ? '1' : '0';
      button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
      button.setAttribute('aria-pressed', visible ? 'true' : 'false');
      button.disabled = Boolean(input.disabled);
    };

    // Prevent mouse click from stealing focus from the input.
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });

    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (input.disabled) {
        return;
      }
      input.type = input.type === 'password' ? 'text' : 'password';
      syncState();
      input.focus({ preventScroll: true });
    });

    syncState();
  });
}

bindPasswordVisibilityToggles();

if (authView && !authView.dataset.authSwitchBound) {
  authView.dataset.authSwitchBound = '1';
  authView.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-auth-switch]');
    if (!button) {
      return;
    }
    event.preventDefault();
    const nextPanel = button.dataset.authSwitch;
    if (nextPanel !== 'signin' && nextPanel !== 'signup') {
      return;
    }
    if (DEBUG_AUTH) {
      // eslint-disable-next-line no-console
      console.debug('[auth] switch', { next: nextPanel, current: authMode });
    }
    setAuthPanel(nextPanel);
    const emailInput =
      nextPanel === 'signin'
        ? loginForm?.querySelector('input[name="email"]')
        : signupForm?.querySelector('input[name="email"]');
    emailInput?.focus();
  });
}

googleAuth?.addEventListener('click', () => {
  const target = apiUrl('/api/auth/google/start');
  if (DEBUG_AUTH) {
    // eslint-disable-next-line no-console
    console.debug('[auth] google start', { target });
  }
  window.location.href = target;
});

if (loginForm && !loginForm.dataset.bound) {
  loginForm.dataset.bound = '1';
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (authMode !== 'signin') return;
    if (loginForm.__submitting) return;
    loginForm.__submitting = true;
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    const formData = new FormData(loginForm);
    const payload = Object.fromEntries(formData.entries());
    try {
      if (DEBUG_AUTH) {
        // eslint-disable-next-line no-console
        console.debug('[auth] submit', { mode: authMode, endpoint: '/api/auth/login', email: payload.email });
      }
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
      await loadCsrfToken();
      const ok = await loadSession();
      if (!ok) {
        showNotice('Login succeeded but session not established (cookie not set).', 'Sign in issue');
        setAuthPanel('signin');
        return;
      }
      // Route only after session is confirmed to avoid the "dashboard flash then bounce".
      window.location.hash = '#dashboard';
      if (DEBUG_AUTH) {
        // eslint-disable-next-line no-console
        console.debug('[auth] login ok', { userId: sessionUser?.id });
      }
    } catch (err) {
      showNotice(authErrorMessage(err.message), 'Sign in failed');
      if (DEBUG_AUTH) {
        // eslint-disable-next-line no-console
        console.debug('[auth] login error', err);
      }
    } finally {
      loginForm.__submitting = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

if (signupForm && !signupForm.dataset.bound) {
  signupForm.dataset.bound = '1';
  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (authMode !== 'signup') return;
    if (signupForm.__submitting) return;
    signupForm.__submitting = true;
    const submitBtn = signupForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    const formData = new FormData(signupForm);
    const payload = Object.fromEntries(formData.entries());
    try {
      if (DEBUG_AUTH) {
        // eslint-disable-next-line no-console
        console.debug('[auth] submit', { mode: authMode, endpoint: '/api/auth/signup', email: payload.email });
      }
      await api('/api/auth/signup', { method: 'POST', body: JSON.stringify(payload) });
      await loadCsrfToken();
      const ok = await loadSession();
      if (!ok) {
        showNotice('Account created — please sign in to continue.', 'Signup succeeded');
        setAuthPanel('signin');
        const emailInput = loginForm?.querySelector('input[name="email"]');
        if (emailInput && payload.email) {
          emailInput.value = payload.email;
          emailInput.focus();
        }
        return;
      }
      window.location.hash = '#dashboard';
      if (DEBUG_AUTH) {
        // eslint-disable-next-line no-console
        console.debug('[auth] signup ok', { userId: sessionUser?.id });
      }
    } catch (err) {
      if (err.status === 409 || err.code === 'ACCOUNT_EXISTS') {
        showNotice('Account already exists — please sign in.', 'Sign up');
        setAuthPanel('signin');
        const emailInput = loginForm?.querySelector('input[name="email"]');
        if (emailInput && payload.email) {
          emailInput.value = payload.email;
          emailInput.focus();
        }
      } else {
        showNotice(authErrorMessage(err.message), 'Sign up failed');
      }
    } finally {
      signupForm.__submitting = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

if (contactForm && !contactForm.dataset.bound) {
  contactForm.dataset.bound = '1';
  contactForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (contactForm.__submitting) return;
    contactForm.__submitting = true;
    const submitBtn = contactForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    if (contactSuccess) {
      contactSuccess.textContent = '';
      contactSuccess.classList.add('hidden');
    }
    setFormError(contactError, '');

    const formData = new FormData(contactForm);
    const payload = Object.fromEntries(formData.entries());
    const name = String(payload.name || '').trim();
    const email = String(payload.email || '').trim();
    const message = String(payload.message || '').trim();

    const nameInput = contactForm.querySelector('input[name="name"]');
    const emailInput = contactForm.querySelector('input[name="email"]');
    const messageInput = contactForm.querySelector('textarea[name="message"]');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!name) {
      setFormError(contactError, contactErrorMessage('NAME_REQUIRED'));
      nameInput?.focus();
      contactForm.__submitting = false;
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    if (name.length > 120) {
      setFormError(contactError, contactErrorMessage('NAME_TOO_LONG'));
      nameInput?.focus();
      contactForm.__submitting = false;
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    if (!email) {
      setFormError(contactError, contactErrorMessage('EMAIL_REQUIRED'));
      emailInput?.focus();
      contactForm.__submitting = false;
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    if (email.length > 254) {
      setFormError(contactError, contactErrorMessage('EMAIL_TOO_LONG'));
      emailInput?.focus();
      contactForm.__submitting = false;
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    if (!emailRegex.test(email)) {
      setFormError(contactError, contactErrorMessage('INVALID_EMAIL'));
      emailInput?.focus();
      contactForm.__submitting = false;
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    if (!message) {
      setFormError(contactError, contactErrorMessage('MESSAGE_REQUIRED'));
      messageInput?.focus();
      contactForm.__submitting = false;
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    if (message.length > 4000) {
      setFormError(contactError, contactErrorMessage('MESSAGE_TOO_LONG'));
      messageInput?.focus();
      contactForm.__submitting = false;
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    try {
      await api('/api/contact', {
        method: 'POST',
        body: JSON.stringify({ name, email, message })
      });
      if (contactSuccess) {
        contactSuccess.textContent = 'Thanks — your message was sent.';
        contactSuccess.classList.remove('hidden');
      } else {
        showNotice('Thanks — your message was sent.', 'Contact');
      }
      contactForm.reset();
      nameInput?.focus();
    } catch (err) {
      setFormError(contactError, contactErrorMessage(err.message || err.code));
    } finally {
      contactForm.__submitting = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

if (accountEmailCopy && !accountEmailCopy.dataset.bound) {
  accountEmailCopy.dataset.bound = '1';
  accountEmailCopy.addEventListener('click', async () => {
    const email = sessionUser?.email || (accountEmail ? accountEmail.textContent : '');
    if (!email || email === '—') {
      return;
    }
    try {
      await navigator.clipboard.writeText(email);
    } catch (err) {
      const temp = document.createElement('textarea');
      temp.value = email;
      temp.style.position = 'fixed';
      temp.style.top = '-1000px';
      document.body.appendChild(temp);
      temp.focus();
      temp.select();
      try {
        document.execCommand('copy');
      } catch (copyErr) {
        // Ignore clipboard failures.
      }
      temp.remove();
    }
    accountEmailCopy.textContent = 'Copied';
    window.setTimeout(() => {
      if (accountEmailCopy) {
        accountEmailCopy.textContent = 'Copy';
      }
    }, 1200);
  });
}

if (accountPasswordButton && !accountPasswordButton.dataset.bound) {
  accountPasswordButton.dataset.bound = '1';
  accountPasswordButton.addEventListener('click', () => {
    openAccountPasswordModal();
  });
}

async function performLogout() {
  await api('/api/auth/logout', { method: 'POST' });
  sessionUser = null;
  closeProfileMenu();
  window.location.hash = '#account';
  setAuthPanel('signin');
  setView('auth');
  await loadCsrfToken();
}

accountLogout?.addEventListener('click', async () => {
  await performLogout();
});

accountAvatar?.addEventListener('click', (event) => {
  event.preventDefault();
  if (!sessionUser) {
    return;
  }
  setProfileMenuOpen(!profileMenuOpen);
});

profileMenuPanel?.addEventListener('click', async (event) => {
  const actionTarget = event.target.closest('[data-menu-action]');
  if (!actionTarget) {
    return;
  }
  event.preventDefault();
  const action = actionTarget.dataset.menuAction;
  if (action === 'account' || action === 'gmail') {
    closeProfileMenu();
    window.location.hash = '#account';
    return;
  }
  if (action === 'dashboard' || action === 'archive') {
    closeProfileMenu();
    window.location.hash = `#${action}`;
    return;
  }
  if (action === 'password') {
    closeProfileMenu();
    if (sessionUser) {
      openAccountPasswordModal();
    } else {
      window.location.hash = '#account';
    }
    return;
  }
  if (action === 'logout') {
    await performLogout();
  }
});

document.addEventListener('click', (event) => {
  if (profileMenuOpen && profileMenu) {
    if (!profileMenu.contains(event.target)) {
      closeProfileMenu();
    }
  }
  if (syncRangeMenuOpen && syncActionGroup) {
    if (!syncActionGroup.contains(event.target)) {
      closeSyncRangeMenu();
    }
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && profileMenuOpen) {
    closeProfileMenu();
  }
  if (event.key === 'Escape' && syncRangeMenuOpen) {
    closeSyncRangeMenu();
    syncMenuButton?.focus();
  }
});

document.addEventListener('click', (event) => {
  const backButton = event.target.closest('[data-action="legal-back"]');
  if (!backButton) {
    return;
  }
  event.preventDefault();
  if (sessionUser) {
    window.location.hash = '#dashboard';
    return;
  }
  setAuthPanel('signin');
  window.location.hash = '#account';
  setView('auth');
});

addToggle?.addEventListener('click', () => {
  openAddModal();
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
    updateSyncOptionSelection('since_last');
    await runDashboardSyncOption('since_last');
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
  if (state.table.selectedIds?.size) {
    clearTableSelection({ rerender: false });
  }
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

tablePrev?.addEventListener('click', goPrevPage);
tableNext?.addEventListener('click', goNextPage);
tablePrevTop?.addEventListener('click', goPrevPage);
tableNextTop?.addEventListener('click', goNextPage);

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
  if (event.target.closest('.table-select-control')) {
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

applicationsTable?.addEventListener('change', (event) => {
  const selectAll = event.target.closest('.table-select-all');
  if (selectAll) {
    const shouldSelect = Boolean(selectAll.checked);
    (state.table.data || []).forEach((application) => {
      setApplicationSelected(application.id, shouldSelect, { rerender: false });
    });
    renderApplicationsTable(sortApplications(state.table.data));
    return;
  }

  const rowSelect = event.target.closest('.table-row-select');
  if (!rowSelect) {
    return;
  }
  const applicationId = rowSelect.dataset.id;
  if (!applicationId) {
    return;
  }
  setApplicationSelected(applicationId, Boolean(rowSelect.checked));
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

bulkClearBtn?.addEventListener('click', () => {
  clearTableSelection();
});

bulkArchiveBtn?.addEventListener('click', async () => {
  await runBulkArchive();
});

bulkDeleteBtn?.addEventListener('click', () => {
  const ids = getSelectedApplicationIds();
  if (!ids.length) {
    return;
  }
  openBulkDeleteConfirm(ids);
});

emailConnect?.addEventListener('click', async () => {
  if (emailConnect.disabled) {
    return;
  }
  try {
    await startGmailConnectFlow();
  } catch (err) {
    showNotice(err.message, 'Unable to connect Gmail');
  }
});

emailDisconnect?.addEventListener('click', async () => {
  if (emailDisconnect.disabled) {
    return;
  }
  await disconnectGmailConnection(emailDisconnect);
});

emailSync?.addEventListener('click', async () => {
  updateSyncOptionSelection('since_last');
  await runDashboardSyncOption('since_last');
});

syncMenuButton?.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (syncMenuButton.disabled) {
    return;
  }
  setSyncRangeMenuOpen(!syncRangeMenuOpen);
  if (syncRangeMenuOpen) {
    const selected = syncRangeMenu?.querySelector('.sync-range-menu-item.is-selected');
    const first = syncRangeMenu?.querySelector('.sync-range-menu-item');
    (selected || first)?.focus();
  }
});

syncRangeMenu?.addEventListener('click', async (event) => {
  const item = event.target.closest('.sync-range-menu-item[data-sync-option]');
  if (!item) {
    return;
  }
  const option = item.dataset.syncOption || 'since_last';
  updateSyncOptionSelection(option);
  closeSyncRangeMenu();
  await runDashboardSyncOption(option);
});

syncRangeMenu?.addEventListener('keydown', async (event) => {
  const item = event.target.closest('.sync-range-menu-item[data-sync-option]');
  if (!item) {
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    const option = item.dataset.syncOption || 'since_last';
    updateSyncOptionSelection(option);
    closeSyncRangeMenu();
    await runDashboardSyncOption(option);
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closeSyncRangeMenu();
    syncMenuButton?.focus();
  }
});

syncErrorToggle?.addEventListener('click', async () => {
  if (syncErrorToggle?.dataset.mode === 'reconnect') {
    try {
      await startGmailConnectFlow();
    } catch (err) {
      showNotice(err.message, 'Unable to connect Gmail');
    }
    return;
  }
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
  const menuOption = ['7', '14', '30', '90'].includes(String(days)) ? String(days) : 'since_last';
  updateSyncOptionSelection(menuOption);
  await runEmailSync({
    mode: 'days',
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
  route();
  hideSplash();
  await loadCsrfToken();
  await loadSession();
  route();
  const authRedirectSuccess = consumeAuthRedirectSuccess();
  if (authRedirectSuccess?.gmailConnected) {
    showNotice('Gmail connected successfully.', 'Google sign-in');
  }
  const authRedirectError = consumeAuthRedirectError();
  if (authRedirectError) {
    showNotice(authErrorMessage(authRedirectError), 'Google sign-in');
  }
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
    btn.className = 'btn btn--ghost btn--sm';
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
    applyBtn.className = 'btn btn--secondary btn--sm';
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
    dismissBtn.className = 'btn btn--ghost btn--sm';
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
