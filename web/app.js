import { ensureAnimatedBackgroundLayout, removeAnimatedBackgroundLayout } from '/animated-background.js';

// Frontend choice: buildless HTML/JS keeps iteration fast while the API stabilizes.
const STATUS_LABELS = {
  APPLIED: 'Applied',
  UNDER_REVIEW: 'Under review',
  INTERVIEW_REQUESTED: 'Interview requested',
  INTERVIEW_SCHEDULED: 'Interview scheduled',
  INTERVIEW_COMPLETED: 'Interview completed',
  PHONE_SCREEN: 'Phone screen',
  ONSITE: 'Onsite interview',
  OFFER_RECEIVED: 'Offer received',
  OFFER_EXTENDED: 'Offer extended',
  REJECTED: 'Rejected',
  GHOSTED: 'Ghosted',
  UNKNOWN: 'Unknown'
};

const STATUS_FILTER_OPTIONS = [
  { value: '', api: '', label: 'Any status', tone: 'any' },
  { value: 'applied', api: 'APPLIED', label: 'Applied', tone: 'applied' },
  {
    value: 'interview_requested',
    api: 'INTERVIEW_REQUESTED',
    label: 'Interview requested',
    tone: 'interview_requested'
  },
  { value: 'offer_received', api: 'OFFER_RECEIVED', label: 'Offer received', tone: 'offer_received' },
  { value: 'rejected', api: 'REJECTED', label: 'Rejected', tone: 'rejected' },
  { value: 'ghosted', api: 'GHOSTED', label: 'Ghosted', tone: 'ghosted' }
];

const STATUS_FILTER_BY_UI = new Map(STATUS_FILTER_OPTIONS.map((option) => [option.value, option]));
const STATUS_FILTER_BY_API = new Map(STATUS_FILTER_OPTIONS.map((option) => [option.api, option]));
const MODAL_STATUS_OPTIONS = STATUS_FILTER_OPTIONS.filter((option) => option.api).map((option) => ({
  value: option.api,
  label: option.label,
  tone: option.tone
}));
const MODAL_STATUS_BY_VALUE = new Map(MODAL_STATUS_OPTIONS.map((option) => [option.value, option]));

const OFFER_KPI_STATUSES = new Set(['OFFER_RECEIVED', 'OFFER', 'OFFER_EXTENDED']);
const INTERVIEW_KPI_STATUSES = new Set([
  'INTERVIEW_REQUESTED',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_COMPLETED',
  'PHONE_SCREEN',
  'ONSITE'
]);

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
const INBOUND_DOMAIN_FALLBACK = 'mail.applictus.com';
const RESERVED_INBOX_USERNAMES = new Set([
  'support',
  'admin',
  'hello',
  'postmaster',
  'root',
  'mail',
  'noreply',
  'no-reply',
  'security',
  'billing'
]);
const ADMIN_EMAIL_ALLOWLIST = new Set([
  'jasonconklin.dev@gmail.com',
  'shaneconklin14@gmail.com'
]);

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
  if (upper.includes('INTERVIEW_COMPLETED')) return 'INTERVIEW_COMPLETED';
  if (upper.includes('INTERVIEW_SCHEDULED')) return 'INTERVIEW_SCHEDULED';
  if (upper.includes('INTERVIEW_REQUESTED')) return 'INTERVIEW_REQUESTED';
  if (upper.includes('PHONE_SCREEN')) return 'PHONE_SCREEN';
  if (upper.includes('ONSITE')) return 'ONSITE';
  if (upper.includes('INTERVIEW')) return 'INTERVIEW_REQUESTED';
  if (upper.includes('APPLIED')) return 'APPLIED';
  if (upper.includes('REJECT')) return 'REJECTED';
  if (upper.includes('REVIEW')) return 'UNDER_REVIEW';
  if (upper.includes('GHOST')) return 'GHOSTED';
  return STATUS_LABELS[upper] ? upper : 'UNKNOWN';
}

function isOfferStatus(status) {
  const normalized = normalizeStatusValue(status);
  return OFFER_KPI_STATUSES.has(normalized) || normalized.includes('OFFER');
}

function isInterviewStatus(status) {
  const normalized = normalizeStatusValue(status);
  return INTERVIEW_KPI_STATUSES.has(normalized) || normalized.includes('INTERVIEW');
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

function getStatusBandTone(status) {
  const normalized = normalizeStatusValue(status);
  if (normalized === 'REJECTED') {
    return 'rejected';
  }
  if (isOfferStatus(normalized)) {
    return 'offer';
  }
  if (isInterviewStatus(normalized)) {
    return 'interview';
  }
  if (normalized === 'APPLIED') {
    return 'applied';
  }
  if (normalized === 'UNDER_REVIEW') {
    return 'under_review';
  }
  return 'unknown';
}

function normalizeEmailClient(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeModalStatusValue(status) {
  const normalized = normalizeStatusValue(status);
  // Keep modal statuses intentionally compact and stable:
  // offer variants -> offer_received, interview variants -> interview_requested,
  // and legacy/ambiguous values -> applied.
  if (normalized === 'OFFER_RECEIVED' || normalized === 'OFFER_EXTENDED') {
    return 'OFFER_RECEIVED';
  }
  if (
    normalized === 'INTERVIEW_REQUESTED' ||
    normalized === 'INTERVIEW_SCHEDULED' ||
    normalized === 'INTERVIEW_COMPLETED' ||
    normalized === 'PHONE_SCREEN' ||
    normalized === 'ONSITE'
  ) {
    return 'INTERVIEW_REQUESTED';
  }
  if (normalized === 'REJECTED') {
    return 'REJECTED';
  }
  if (normalized === 'GHOSTED') {
    return 'GHOSTED';
  }
  return 'APPLIED';
}

function getModalStatusOption(value) {
  const normalized = normalizeModalStatusValue(value);
  return MODAL_STATUS_BY_VALUE.get(normalized) || MODAL_STATUS_OPTIONS[0];
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
const signupInboxUsernameInput = document.getElementById('signup-inbox-username');
const signupInboxPreview = document.getElementById('signup-inbox-preview');
const signupInboxHint = document.getElementById('signup-inbox-hint');
const signupInboxSuggestions = document.getElementById('signup-inbox-suggestions');
const googleAuth = document.getElementById('google-auth');
const accountLogout = document.getElementById('account-logout');
const accountEmail = document.getElementById('account-email');
const accountMethods = document.getElementById('account-methods');
const accountPasswordButton = document.getElementById('account-password-button');
const accountPasswordButtonLabel = document.getElementById('account-password-button-label');
const accountPasswordHint = document.getElementById('account-password-hint');
const accountHelpStatus = document.getElementById('account-help-status');
const accountHelpLastEmail = document.getElementById('account-help-last-email');
const accountHelpNote = document.getElementById('account-help-note');
const accountHelpSetupType = document.getElementById('account-help-setup-type');
const inboundStatusPill = document.getElementById('inbound-status-pill');
const inboundAddressLabel = document.getElementById('inbound-address-label');
const inboundAddressEmail = document.getElementById('inbound-address-email');
const inboundMetaLine = document.getElementById('inbound-meta-line');
const inboundOldAddressWarning = document.getElementById('inbound-old-address-warning');
const inboundOpenSetup = document.getElementById('inbound-open-setup');
const inboundRotateAddress = document.getElementById('inbound-rotate-address');
const inboundCopyAddress = document.getElementById('inbound-copy-address');
const inboundSendTest = document.getElementById('inbound-send-test');
const inboundProcessNow = document.getElementById('inbound-process-now');
const inboundWhyToggle = document.getElementById('inbound-why-toggle');
const inboundWhyPanel = document.getElementById('inbound-why-panel');
const inboundHelpOpenSetup = document.getElementById('inbound-help-open-setup');
const inboundHelpSendTest = document.getElementById('inbound-help-send-test');
const inboundHelpWhy = document.getElementById('inbound-help-why');
const inboundDiagnosticsWrap = document.getElementById('inbound-diagnostics-wrap');
const inboundDiagnosticsLink = document.getElementById('inbound-diagnostics-link');
const accountInboxUsernamePrompt = document.getElementById('account-inbox-username-prompt');
const accountInboxUsernameInput = document.getElementById('account-inbox-username-input');
const accountInboxUsernameSave = document.getElementById('account-inbox-username-save');
const accountInboxUsernameHint = document.getElementById('account-inbox-username-hint');
const accountInboxUsernameSuggestions = document.getElementById('account-inbox-username-suggestions');
const contactForm = document.getElementById('contact-form');
const contactError = document.getElementById('contact-error');
const contactSuccess = document.getElementById('contact-success');
const accountPlanName = document.getElementById('account-plan-name');
const accountPlanUsage = document.getElementById('account-plan-usage');
const accountPlanProgress = document.getElementById('account-plan-progress');
const accountPlanWarning = document.getElementById('account-plan-warning');
const accountUpgradeButton = document.getElementById('account-upgrade-button');
const accountPlanDetails = document.getElementById('account-plan-details');
const adminMetricSelect = document.getElementById('analytics-metric-select');
const adminRangeSelect = document.getElementById('analytics-range-select');
const adminChartSvgStatic = document.getElementById('analytics-chart');
const adminChartHintStatic = document.getElementById('analytics-chart-hint');

let adminEls = null;
function ensureAdminElements() {
  if (adminEls) return adminEls;
  adminEls = {
    section: document.getElementById('admin-analytics-section'),
    kpiTotalUsers: document.getElementById('admin-kpi-total-users'),
    kpiProUsers: document.getElementById('admin-kpi-pro-users'),
    kpiFreeUsers: document.getElementById('admin-kpi-free-users'),
    kpiTotalApps: document.getElementById('admin-kpi-total-apps'),
    kpiMonthEmails: document.getElementById('admin-kpi-month-emails'),
    kpiTodayEmails: document.getElementById('admin-kpi-today-emails'),
    kpiWeekEmails: document.getElementById('admin-kpi-week-emails'),
    kpiNewUsers: document.getElementById('admin-kpi-new-users'),
    metricSelect: adminMetricSelect || document.getElementById('analytics-metric-select'),
    rangeSelect: adminRangeSelect || document.getElementById('analytics-range-select'),
    chartSvg: adminChartSvgStatic || document.getElementById('analytics-chart'),
    chartHint: adminChartHintStatic || document.getElementById('analytics-chart-hint'),
    statusText: document.getElementById('admin-analytics-status')
  };
  return adminEls;
}

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
const filterStatusSelect = document.getElementById('filter-status-select');
const filterStatusTrigger = document.getElementById('filter-status-trigger');
const filterStatusMenu = document.getElementById('filter-status-menu');
const filterStatusLabel = document.getElementById('filter-status-label');
const filterStatusDot = document.getElementById('filter-status-dot');
const filterCompany = document.getElementById('filter-company');
const filterCompanyClear = document.getElementById('filter-company-clear');
const filterRole = document.getElementById('filter-role');
const filterRoleClear = document.getElementById('filter-role-clear');
const archivedFilterStatus = document.getElementById('archived-filter-status');
const archivedFilterStatusSelect = document.getElementById('archived-filter-status-select');
const archivedFilterStatusTrigger = document.getElementById('archived-filter-status-trigger');
const archivedFilterStatusMenu = document.getElementById('archived-filter-status-menu');
const archivedFilterStatusLabel = document.getElementById('archived-filter-status-label');
const archivedFilterStatusDot = document.getElementById('archived-filter-status-dot');
const archivedFilterCompany = document.getElementById('archived-filter-company');
const archivedFilterCompanyClear = document.getElementById('archived-filter-company-clear');
const archivedFilterRole = document.getElementById('archived-filter-role');
const archivedFilterRoleClear = document.getElementById('archived-filter-role-clear');
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
const syncProcessNow = document.getElementById('sync-process-now');
const syncStatus = document.getElementById('sync-status');
const syncResult = document.getElementById('sync-result');
const syncErrorBanner = document.getElementById('sync-error-banner');
const syncErrorMessage = document.getElementById('sync-error-message');
const syncErrorDetail = document.getElementById('sync-error-detail');
const syncErrorToggle = document.getElementById('sync-error-toggle');
const dashboardInboxStatus = document.getElementById('dashboard-inbox-status');
const dashboardInboxEmail = document.getElementById('dashboard-inbox-email');
const syncControls = document.getElementById('sync-controls');
const syncConnectCta = document.getElementById('sync-connect-cta');
const syncProgress = document.getElementById('sync-progress');
const syncProgressFill = document.getElementById('sync-progress-fill');
const syncProgressTrack = document.getElementById('sync-progress-track');
const syncProgressLabel = document.getElementById('sync-progress-label');
const syncProgressValue = document.getElementById('sync-progress-value');
const syncSummary = document.getElementById('sync-summary');
const syncSummaryMain = document.getElementById('sync-summary-main');
const syncSummaryStatus = document.getElementById('sync-summary-status');
const syncSummaryMetrics = document.getElementById('sync-summary-metrics');
const syncDetailsToggle = document.getElementById('sync-details-toggle');
const syncDetailsWrapper = document.getElementById('sync-details-wrapper');
const legacySyncDetails = document.getElementById('legacy-sync-details');
const kpiTotal = document.getElementById('kpi-total');
const kpiApplied = document.getElementById('kpi-applied');
const kpiOffers = document.getElementById('kpi-offers');
const kpiInterviews = document.getElementById('kpi-interviews');
const kpiRejected = document.getElementById('kpi-rejected');
const accountEmailSync = document.getElementById('account-email-sync');
const accountSyncMenuButton = document.getElementById('account-sync-menu-button');
const accountSyncRangeMenu = document.getElementById('account-sync-range-menu');
const accountSyncActionGroup = document.getElementById('account-sync-action-group');
const accountSyncHelperText = document.getElementById('account-sync-helper-text');
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
const modalHeader = modalRoot ? modalRoot.querySelector('.modal-header') : null;
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
const PLAN_LIMITS = {
  free: 75,
  pro: 500
};
let planState = null;
const planNoticeShown = {
  atLimit: false,
  global: false
};
let currentDetail = null;
let csrfToken = null;
const PAGE_SIZE = 25;
const SYNC_DETAILS_KEY = 'applictus:syncDetailsOpen';
const SESSION_NEW_APPLIED_KEY = 'applictus_new_applied';
const SESSION_NEW_OFFERS_KEY = 'applictus_new_offers';
const SESSION_NEW_INTERVIEWS_KEY = 'applictus_new_interviews';
const SESSION_KPI_DELTA_APPLIED_KEY = 'applictus_kpi_delta_applied';
const SESSION_KPI_DELTA_OFFERS_KEY = 'applictus_kpi_delta_offers';
const SESSION_KPI_DELTA_INTERVIEWS_KEY = 'applictus_kpi_delta_interviews';
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
  signals: {
    pulseOfferIds: new Set(),
    pulseInterviewIds: new Set(),
    pulseTimer: null,
    showAppliedNew: false,
    showOffersNew: false,
    showInterviewsNew: false,
    appliedDelta: 0,
    offersDelta: 0,
    interviewsDelta: 0
  },
  archived: {
    offset: 0,
    total: 0,
    filters: {
      status: '',
      company: '',
      role: ''
    }
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
const inboundState = {
  addressEmail: null,
  preferredAddressEmail: null,
  inboxUsername: null,
  isActive: false,
  forwardingReadiness: 'not_started',
  addressReachable: false,
  hasNonVerificationInbound: false,
  gmailVerificationPending: false,
  gmailVerification: null,
  confirmedAt: null,
  lastReceivedAt: null,
  lastReceivedSubject: null,
  messageCount7d: 0,
  pendingCount: 0,
  signalUpdatedAt: null,
  signalLastInboundAt: null,
  signalLastSubject: null,
  inactiveAddressWarning: false,
  inactiveAddressWarningMeta: null,
  setupState: 'not_started',
  connected: false,
  effectiveConnected: false,
  lastInboundSyncAt: null,
  lastInboundSync: null,
  diagnosticsAdmin: false
};
const syncUiState = {
  visible: false,
  progress: 0,
  label: '',
  error: false,
  indeterminate: false,
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
const inboundAutoSyncState = {
  timer: null,
  inFlight: false,
  lastTriggeredReceivedAt: null,
  lastTriggeredSignalAt: null,
  lastToastAt: 0,
  lastAutoSyncAt: 0
};
const signupUsernameState = {
  debounceTimer: null,
  requestToken: 0
};
const accountUsernameState = {
  debounceTimer: null,
  requestToken: 0
};
const INBOUND_AUTO_SYNC_INTERVAL_MS = 9000;
const INBOUND_AUTO_SYNC_DEBOUNCE_MS = 15000;
renderSyncSummary({ status: 'idle', rawDetails: '' });

function isInternalGmailMode(user = sessionUser) {
  if (!user) {
    return false;
  }
  if (user.gmail_internal_enabled === true) {
    return true;
  }
  return String(user.inbox_mode || '').trim().toLowerCase() === 'gmail';
}

let syncRangeMenuOpen = false;
let lastSyncOption = 'since_last';
updateSyncOptionSelection(lastSyncOption);
let accountSyncRangeMenuOpen = false;
let accountLastSyncOption = 'since_last';
updateAccountSyncOptionSelection(accountLastSyncOption);
clearKpiNewSignals();
clearKpiDeltaSignals();

let profileMenuOpen = false;
let modalState = {
  onClose: null,
  allowBackdropClose: false,
  focusable: [],
  lastFocused: null,
  keyHandler: null,
  variantClass: null
};
const APPLICATION_MODAL_VARIANT_CLASS = 'modal--application-form';

function openAddModal() {
  const form = document.createElement('form');
  form.className = 'modal-form form-grid modal-form--app-entry modal-form--add-app';

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
  const statusField = createModalStatusSelectField({
    label: 'Status',
    name: 'current_status',
    value: 'APPLIED'
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

  companyField.wrapper.classList.add('modal-field', 'modal-field--company');
  roleField.wrapper.classList.add('modal-field', 'modal-field--role');
  statusField.wrapper.classList.add('modal-field', 'modal-field--status');
  dateField.wrapper.classList.add('modal-field', 'modal-field--date');

  const statusDateRow = document.createElement('div');
  statusDateRow.className = 'modal-row-two modal-row-two--add-app';
  statusDateRow.append(statusField.wrapper, dateField.wrapper);

  form.append(companyField.wrapper, roleField.wrapper, statusDateRow, errorEl);

  const footer = buildModalFooter({ confirmText: 'Add application', formId: 'add-app-form' });
  form.id = 'add-app-form';
  openModal({
    title: 'Add application',
    description: 'Manually create a new application entry.',
    body: form,
    footer,
    allowBackdropClose: true,
    initialFocus: companyField.input,
    onClose: () => statusField.destroy(),
    variantClass: APPLICATION_MODAL_VARIANT_CLASS
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

function getAvatarInitials(user) {
  const rawName = typeof user?.name === 'string' ? user.name.trim() : '';
  if (!rawName) {
    return '';
  }
  const parts = rawName.split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => (part.match(/[A-Za-z0-9]/)?.[0] || ''))
    .join('')
    .toUpperCase();
  return initials || '';
}

function syncAccountAvatarIdentity(user) {
  if (avatarInitials) {
    avatarInitials.textContent = getAvatarInitials(user);
  }
  if (accountAvatar) {
    accountAvatar.title = user?.email || 'Account';
  }
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
  if (accountEmailSync) {
    accountEmailSync.disabled = isDisabled;
    accountEmailSync.setAttribute('aria-busy', String(!!isDisabled));
  }
  if (accountSyncMenuButton) {
    accountSyncMenuButton.disabled = isDisabled;
  }
  if (isDisabled) {
    closeAccountSyncRangeMenu();
  }
}

function isForwardingActive() {
  const readiness = resolveForwardingReadiness();
  if (readiness) {
    return readiness === 'forwarding_active';
  }
  return resolveInboundSetupState() === 'active' || inboundState.effectiveConnected;
}

function hasForwardingAddress(addressEmail = inboundState.addressEmail) {
  return Boolean(String(addressEmail || '').trim());
}

function resolveInboundSetupState(
  reportedSetupState = inboundState.setupState,
  {
    addressEmail = inboundState.addressEmail,
    confirmedAt = inboundState.confirmedAt,
    lastReceivedAt = inboundState.lastReceivedAt
  } = {}
) {
  if (lastReceivedAt) {
    return 'active';
  }
  if (confirmedAt) {
    return 'awaiting_first_email';
  }
  if (hasForwardingAddress(addressEmail)) {
    return 'awaiting_confirmation';
  }
  return reportedSetupState || 'not_started';
}

function resolveForwardingReadiness(
  reportedReadiness = inboundState.forwardingReadiness,
  {
    setupState = inboundState.setupState,
    lastReceivedAt = inboundState.lastReceivedAt,
    hasNonVerificationInbound = inboundState.hasNonVerificationInbound,
    gmailVerificationPending = inboundState.gmailVerificationPending
  } = {}
) {
  const normalizedReported = String(reportedReadiness || '').trim().toLowerCase();
  if (normalizedReported) {
    return normalizedReported;
  }
  if (hasNonVerificationInbound) {
    return 'forwarding_active';
  }
  if (gmailVerificationPending) {
    return 'gmail_verification_pending';
  }
  if (lastReceivedAt) {
    return 'address_reachable';
  }
  const normalizedSetupState = String(setupState || '').trim().toLowerCase();
  if (normalizedSetupState === 'active') {
    return 'forwarding_active';
  }
  if (normalizedSetupState === 'awaiting_first_email') {
    return 'awaiting_first_email';
  }
  if (normalizedSetupState === 'awaiting_confirmation') {
    return 'awaiting_confirmation';
  }
  return 'not_started';
}

function setInlineHintState(element, message, state = null) {
  if (!element) {
    return;
  }
  element.textContent = message || '';
  if (state) {
    element.dataset.state = state;
  } else {
    element.removeAttribute('data-state');
  }
}

function deriveDefaultInboxUsernameSeed() {
  if (!sessionUser) {
    return '';
  }
  const fromName = normalizeInboxUsernameInput(sessionUser.name || '');
  if (fromName) {
    return fromName;
  }
  const fromEmail = String(sessionUser.email || '').split('@')[0] || '';
  return normalizeInboxUsernameInput(fromEmail);
}

function renderSignupInboxUsernameUi({ checkAvailability = true } = {}) {
  if (!signupInboxUsernameInput) {
    return;
  }
  const normalized = normalizeInboxUsernameInput(signupInboxUsernameInput.value);
  if (signupInboxUsernameInput.value !== normalized) {
    signupInboxUsernameInput.value = normalized;
  }
  const previewAddress = buildInboxAddressPreview(normalized);
  if (signupInboxPreview) {
    signupInboxPreview.textContent = previewAddress || '—';
  }

  const emailInput = signupForm?.querySelector('input[name="email"]');
  const nameInput = signupForm?.querySelector('input[name="name"]');
  const suggestions = buildInboxUsernameSuggestions({
    name: nameInput?.value || '',
    email: emailInput?.value || '',
    currentValue: normalized
  });
  renderInboxSuggestionButtons(signupInboxSuggestions, suggestions, (value) => {
    signupInboxUsernameInput.value = value;
    renderSignupInboxUsernameUi({ checkAvailability: true });
    signupInboxUsernameInput.focus();
  });

  const validation = validateInboxUsernameInput(normalized, { allowEmpty: true });
  if (!normalized) {
    setInlineHintState(signupInboxHint, 'Optional. You can set this later from Account.', null);
    return;
  }
  if (!validation.ok) {
    setInlineHintState(signupInboxHint, authErrorMessage(validation.code), 'error');
    return;
  }
  if (!checkAvailability) {
    setInlineHintState(signupInboxHint, `Inbox address preview: ${previewAddress}`, null);
    return;
  }

  if (signupUsernameState.debounceTimer) {
    window.clearTimeout(signupUsernameState.debounceTimer);
    signupUsernameState.debounceTimer = null;
  }
  const expectedToken = ++signupUsernameState.requestToken;
  setInlineHintState(signupInboxHint, 'Checking availability…', null);
  signupUsernameState.debounceTimer = window.setTimeout(async () => {
    const availability = await checkInboxUsernameAvailability(normalized, {
      currentToken: signupUsernameState.requestToken,
      expectedToken
    }).catch(() => null);
    if (!availability || expectedToken !== signupUsernameState.requestToken) {
      return;
    }
    if (!availability.valid) {
      setInlineHintState(signupInboxHint, authErrorMessage(availability.error), 'error');
      return;
    }
    if (!availability.available) {
      setInlineHintState(signupInboxHint, 'That username is already taken.', 'error');
      return;
    }
    setInlineHintState(signupInboxHint, `${previewAddress} is available`, 'ok');
  }, 220);
}

function renderAccountInboxUsernamePrompt({ checkAvailability = true } = {}) {
  const showPrompt = Boolean(!isInternalGmailMode() && sessionUser && !sessionUser.inbox_username);
  if (!accountInboxUsernamePrompt) {
    return;
  }
  accountInboxUsernamePrompt.classList.toggle('hidden', !showPrompt);
  if (!showPrompt) {
    return;
  }

  if (accountInboxUsernameInput && !accountInboxUsernameInput.value.trim()) {
    accountInboxUsernameInput.value = deriveDefaultInboxUsernameSeed();
  }
  const normalized = normalizeInboxUsernameInput(accountInboxUsernameInput?.value || '');
  if (accountInboxUsernameInput && accountInboxUsernameInput.value !== normalized) {
    accountInboxUsernameInput.value = normalized;
  }

  const suggestions = buildInboxUsernameSuggestions({
    name: sessionUser?.name || '',
    email: sessionUser?.email || '',
    currentValue: normalized
  });
  renderInboxSuggestionButtons(accountInboxUsernameSuggestions, suggestions, (value) => {
    if (!accountInboxUsernameInput) {
      return;
    }
    accountInboxUsernameInput.value = value;
    renderAccountInboxUsernamePrompt({ checkAvailability: true });
    accountInboxUsernameInput.focus();
  });

  const validation = validateInboxUsernameInput(normalized, { allowEmpty: false });
  const previewAddress = buildInboxAddressPreview(normalized);
  if (!validation.ok) {
    setInlineHintState(
      accountInboxUsernameHint,
      authErrorMessage(validation.code) ||
        'Pick a unique username. Your inbox address will be username@mail.applictus.com.',
      'error'
    );
    if (accountInboxUsernameSave) {
      accountInboxUsernameSave.disabled = true;
    }
    return;
  }
  if (!checkAvailability) {
    setInlineHintState(accountInboxUsernameHint, `Inbox address: ${previewAddress}`, null);
    if (accountInboxUsernameSave) {
      accountInboxUsernameSave.disabled = false;
    }
    return;
  }

  if (accountUsernameState.debounceTimer) {
    window.clearTimeout(accountUsernameState.debounceTimer);
    accountUsernameState.debounceTimer = null;
  }
  const expectedToken = ++accountUsernameState.requestToken;
  setInlineHintState(accountInboxUsernameHint, 'Checking availability…', null);
  if (accountInboxUsernameSave) {
    accountInboxUsernameSave.disabled = true;
  }
  accountUsernameState.debounceTimer = window.setTimeout(async () => {
    const availability = await checkInboxUsernameAvailability(normalized, {
      currentToken: accountUsernameState.requestToken,
      expectedToken
    }).catch(() => null);
    if (!availability || expectedToken !== accountUsernameState.requestToken) {
      return;
    }
    if (!availability.valid) {
      setInlineHintState(accountInboxUsernameHint, authErrorMessage(availability.error), 'error');
      if (accountInboxUsernameSave) {
        accountInboxUsernameSave.disabled = true;
      }
      return;
    }
    if (!availability.available) {
      setInlineHintState(accountInboxUsernameHint, 'That username is already taken.', 'error');
      if (accountInboxUsernameSave) {
        accountInboxUsernameSave.disabled = true;
      }
      return;
    }
    setInlineHintState(accountInboxUsernameHint, `Inbox address: ${previewAddress}`, 'ok');
    if (accountInboxUsernameSave) {
      accountInboxUsernameSave.disabled = false;
    }
  }, 220);
}

function setDashboardScanButtonLabel(label) {
  if (!emailSync) {
    return;
  }
  const scanText = emailSync.querySelector('.scan-text');
  if (scanText) {
    scanText.textContent = label;
  } else {
    emailSync.textContent = label;
  }
}

function formatInboundMetaText() {
  if (isInternalGmailMode()) {
    const parts = [];
    const lastSync =
      emailState.lastSyncStats?.last_synced_at ||
      emailState.lastSyncedAt ||
      emailState.lastSyncStats?.time_window_end ||
      null;
    const lastSyncedAt = formatSyncDateTime(lastSync);
    if (lastSyncedAt) {
      parts.push(`Last inbox sync • ${lastSyncedAt}`);
    }
    if (emailState.email) {
      parts.push(`Connected Gmail • ${emailState.email}`);
    } else if (emailState.connected) {
      parts.push('Connected Gmail');
    } else {
      parts.push('Connect Gmail to start internal ingestion.');
    }
    return parts.join(' • ');
  }
  const readiness = resolveForwardingReadiness();
  const syncMeta = inboundState.lastInboundSync || null;
  const syncParts = [];
  if (syncMeta) {
    const syncedAt = formatSyncDateTime(syncMeta.last_inbound_sync_at || inboundState.lastInboundSyncAt);
    if (syncedAt) {
      syncParts.push(`Last inbox sync • ${syncedAt}`);
    } else {
      syncParts.push('Last inbox sync complete');
    }
    const processed = Number(syncMeta.last_inbound_processed_count ?? 0);
    const created = Number(syncMeta.last_inbound_created_count ?? 0);
    const updated = Number(syncMeta.last_inbound_updated_count ?? 0);
    const ignored = Number(syncMeta.last_inbound_ignored_count ?? 0);
    if (Number.isFinite(processed)) {
      syncParts.push(`Processed ${processed}`);
    }
    if (Number.isFinite(created)) {
      syncParts.push(`Added ${created}`);
    }
    if (Number.isFinite(updated)) {
      syncParts.push(`Updated ${updated}`);
    }
    if (Number.isFinite(ignored)) {
      syncParts.push(`Ignored ${ignored}`);
    }
  }

  const lastSeen = formatSyncDateTime(inboundState.lastReceivedAt);
  if (readiness === 'forwarding_active') {
    const parts = [];
    if (syncParts.length) {
      parts.push(syncParts.join(' · '));
    }
    if (lastSeen) {
      parts.push(`Last email received • ${lastSeen}`);
    }
    if (inboundState.lastReceivedSubject) {
      parts.push(`“${inboundState.lastReceivedSubject}”`);
    }
    if (Number.isFinite(inboundState.messageCount7d) && inboundState.messageCount7d > 0) {
      parts.push(`${inboundState.messageCount7d} in last 7 days`);
    }
    return parts.join(' • ') || 'Forwarding active. Waiting for new job-email updates.';
  }
  if (readiness === 'gmail_verification_pending') {
    const parts = [];
    if (lastSeen) {
      parts.push(`Address reachable • Last email received • ${lastSeen}`);
    } else {
      parts.push('Address reachable');
    }
    parts.push('Gmail verification pending');
    if (inboundState.gmailVerification?.confirmationUrl) {
      parts.push('Open the confirmation link in Step 2');
    }
    return parts.join(' • ');
  }
  if (readiness === 'address_reachable') {
    const parts = ['Address reachable'];
    if (lastSeen) {
      parts.push(`Last email received • ${lastSeen}`);
    }
    parts.push('Waiting for first non-verification forwarded email');
    return parts.join(' • ');
  }
  if (readiness === 'awaiting_first_email') {
    if (syncParts.length) {
      return `${syncParts.join(' · ')} • No forwarded emails yet.`;
    }
    return 'No forwarded emails yet. Forward one real application email or complete the Gmail forwarding confirmation to activate Applictus.';
  }
  if (readiness === 'awaiting_confirmation') {
    return 'Waiting for forwarding verification in Gmail. Complete Step 2 in setup.';
  }
  return 'No forwarding connected yet.';
}

function renderForwardingSummary() {
  if (!syncSummary || !syncSummaryStatus || !syncSummaryMetrics) {
    return;
  }
  if (isInternalGmailMode()) {
    syncSummaryStatus.textContent = emailState.connected
      ? '✅ Gmail Connected (Internal Mode)'
      : 'Internal Gmail mode not connected';
    syncSummaryMetrics.textContent = formatInboundMetaText();
    syncSummary.classList.remove('hidden');
    if (syncResult) {
      syncResult.textContent = '';
    }
    applySyncDetailsVisibility(false, false, false);
    return;
  }
  const setupState = inboundState.setupState || 'not_started';
  const readiness = resolveForwardingReadiness();
  let statusText = 'Inbox not connected';
  if (readiness === 'forwarding_active') {
    statusText = '✅ Forwarding active';
  } else if (readiness === 'gmail_verification_pending') {
    statusText = 'Address reachable • Gmail verification pending';
  } else if (readiness === 'address_reachable') {
    statusText = 'Address reachable';
  } else if (readiness === 'awaiting_first_email') {
    statusText = 'Forwarding set up — waiting for first email';
  } else if (readiness === 'awaiting_confirmation') {
    statusText = 'Waiting for forwarding verification';
  }
  syncSummaryStatus.textContent = statusText;
  if (readiness === 'forwarding_active' && Number(state.lastTotal || 0) === 0) {
    syncSummaryMetrics.textContent = 'Inbox connected. We’ll update your dashboard when job emails arrive.';
  } else if (setupState === 'not_started') {
    syncSummaryMetrics.textContent = 'Set up automatic forwarding in about 2 minutes — no Google login required.';
  } else {
    syncSummaryMetrics.textContent = formatInboundMetaText();
  }
  syncSummary.classList.remove('hidden');
  if (syncResult) {
    syncResult.textContent = '';
  }
  applySyncDetailsVisibility(false, false, false);
}

function updateDashboardPrimarySyncUI() {
  if (!emailSync) {
    return;
  }
  if (isInternalGmailMode()) {
    setDashboardScanButtonLabel(emailState.connected ? 'Sync inbox' : 'Connect Gmail');
    emailSync.dataset.forwardingMode = 'gmail_internal';
    emailSync.disabled = false;
    emailSync.setAttribute('aria-busy', 'false');
    if (syncMenuButton) {
      const showRangeControl = Boolean(emailState.connected);
      syncMenuButton.classList.toggle('hidden', !showRangeControl);
      syncMenuButton.disabled = !showRangeControl;
      syncMenuButton.setAttribute('aria-hidden', showRangeControl ? 'false' : 'true');
    }
    if (!emailState.connected && syncRangeMenuOpen) {
      closeSyncRangeMenu();
    }
    if (syncConnectCta) {
      syncConnectCta.classList.add('hidden');
    }
    if (syncControls) {
      syncControls.classList.remove('hidden');
    }
    if (syncProcessNow) {
      syncProcessNow.classList.add('hidden');
    }
    return;
  }
  const active = isForwardingActive();
  setDashboardScanButtonLabel(active ? 'Sync inbox' : 'Connect inbox');
  emailSync.dataset.forwardingMode = active ? 'sync' : 'connect';
  emailSync.disabled = false;
  emailSync.setAttribute('aria-busy', 'false');
  if (syncMenuButton) {
    syncMenuButton.classList.add('hidden');
    syncMenuButton.disabled = true;
    syncMenuButton.setAttribute('aria-hidden', 'true');
  }
  if (syncRangeMenuOpen) {
    closeSyncRangeMenu();
  }
  if (syncConnectCta) {
    syncConnectCta.classList.add('hidden');
  }
  if (syncControls) {
    syncControls.classList.remove('hidden');
  }
  if (syncProcessNow) {
    syncProcessNow.classList.remove('hidden');
  }
  if (legacySyncDetails) {
    legacySyncDetails.classList.toggle('legacy-sync-details--disabled', !emailState.connected);
  }
}

function updateInboundStatusPresentation() {
  if (isInternalGmailMode()) {
    const connected = Boolean(emailState.connected);
    const connectedEmail = emailState.email || sessionUser?.email || null;
    const statusText = connected ? 'Gmail Connected (Internal Mode)' : 'Internal Gmail not connected';
    const helpText = connected
      ? `Connected via Gmail API${connectedEmail ? ` · ${connectedEmail}` : ''}`
      : 'Internal mode uses Gmail API ingestion for allowlisted users only.';
    setPillState(inboundStatusPill, statusText, connected ? 'connected' : 'idle');
    setPillState(dashboardInboxStatus, statusText, connected ? 'connected' : 'idle');
    if (dashboardInboxEmail) {
      dashboardInboxEmail.textContent = connectedEmail || 'Connect Gmail to begin ingestion';
    }
    if (syncStatus) {
      syncStatus.textContent = connected ? 'Ready to sync' : 'Connect Gmail';
    }
    if (inboundAddressLabel) {
      inboundAddressLabel.textContent = 'Connected Gmail account';
    }
    if (inboundAddressEmail) {
      inboundAddressEmail.textContent = connectedEmail || '—';
    }
    if (inboundMetaLine) {
      inboundMetaLine.textContent = formatInboundMetaText();
    }
    if (inboundCopyAddress) {
      inboundCopyAddress.disabled = !connectedEmail;
      inboundCopyAddress.textContent = 'Copy';
    }
    if (inboundSendTest) {
      inboundSendTest.classList.add('hidden');
      inboundSendTest.disabled = true;
    }
    if (inboundProcessNow) {
      inboundProcessNow.classList.add('hidden');
      inboundProcessNow.disabled = !connected;
    }
    if (inboundRotateAddress) {
      inboundRotateAddress.classList.add('hidden');
      inboundRotateAddress.disabled = true;
    }
    if (inboundWhyToggle) {
      inboundWhyToggle.classList.add('hidden');
      inboundWhyToggle.setAttribute('aria-expanded', 'false');
    }
    if (inboundWhyPanel) {
      inboundWhyPanel.classList.add('hidden');
    }
    if (inboundOpenSetup) {
      inboundOpenSetup.textContent = connected ? 'Reconnect Gmail' : 'Connect Gmail';
    }
    if (accountHelpStatus) {
      accountHelpStatus.textContent = statusText;
    }
    if (accountHelpNote) {
      accountHelpNote.textContent = helpText;
    }
    if (accountHelpSetupType) {
      accountHelpSetupType.textContent = 'Internal Gmail API';
    }
    if (accountHelpLastEmail) {
      accountHelpLastEmail.textContent = connectedEmail || '—';
    }
    if (inboundHelpOpenSetup) {
      inboundHelpOpenSetup.textContent = connected ? 'Reconnect Gmail' : 'Connect Gmail';
    }
    if (inboundHelpSendTest) {
      inboundHelpSendTest.classList.add('hidden');
      inboundHelpSendTest.disabled = true;
    }
    if (inboundHelpWhy) {
      inboundHelpWhy.classList.add('hidden');
    }
    if (inboundOldAddressWarning) {
      inboundOldAddressWarning.classList.add('hidden');
    }
    renderForwardingSummary();
    updateDashboardPrimarySyncUI();
    renderAccountInboxUsernamePrompt({ checkAvailability: false });
    return;
  }
  const setupState = inboundState.setupState || 'not_started';
  const readiness = resolveForwardingReadiness();
  let pillText = 'Not connected';
  let pillState = 'idle';
  let dashboardText = 'Not connected';
  let dashboardState = 'idle';
  let syncText = 'Setup needed';
  let helpStatusText = 'Not connected';
  let helpNoteText = 'Applictus only processes emails you forward.';

  if (readiness === 'forwarding_active') {
    pillText = 'Receiving forwarded emails';
    pillState = 'connected';
    dashboardText = 'Connected';
    dashboardState = 'connected';
    syncText = 'Forwarding active';
    helpStatusText = 'Connected · Receiving forwarded emails';
    helpNoteText = 'Forwarding is active. New job-email updates are processed automatically.';
  } else if (readiness === 'gmail_verification_pending') {
    pillText = 'Address reachable — Gmail verification pending';
    pillState = 'info';
    dashboardText = 'Gmail verification pending';
    dashboardState = 'info';
    syncText = 'Address reachable';
    helpStatusText = 'Address reachable · Gmail verification pending';
    helpNoteText = 'Your inbox is reachable. Complete Gmail verification to finish setup.';
  } else if (readiness === 'address_reachable') {
    pillText = 'Address reachable';
    pillState = 'info';
    dashboardText = 'Address reachable';
    dashboardState = 'info';
    syncText = 'Address reachable';
    helpStatusText = 'Address reachable';
    helpNoteText = 'Applictus can receive forwarded mail. Forward one application email to activate full tracking.';
  } else if (readiness === 'awaiting_first_email') {
    pillText = 'Forwarding enabled — waiting for first email';
    pillState = 'info';
    dashboardText = 'Setup complete';
    dashboardState = 'info';
    syncText = 'Waiting for first email';
    helpStatusText = 'Waiting for first forwarded email';
    helpNoteText = 'Setup is complete. Forward one application email to activate tracking.';
  } else if (readiness === 'awaiting_confirmation') {
    pillText = 'Waiting for forwarding verification';
    pillState = 'idle';
    dashboardText = 'Waiting for verification';
    dashboardState = 'idle';
    syncText = 'Waiting for verification';
    helpStatusText = 'Waiting for forwarding verification';
    helpNoteText = 'Follow the setup guide to add and verify your Applictus inbox address.';
  }

  setPillState(inboundStatusPill, pillText, pillState);
  setPillState(dashboardInboxStatus, dashboardText, dashboardState);
  if (dashboardInboxEmail) {
    dashboardInboxEmail.textContent = inboundState.addressEmail
      ? `Forwarding to ${inboundState.addressEmail}`
      : 'Forwarding address not ready';
  }
  if (syncStatus) {
    syncStatus.textContent = syncText;
  }
  if (inboundAddressEmail) {
    inboundAddressEmail.textContent = inboundState.addressEmail || '—';
  }
  if (inboundMetaLine) {
    inboundMetaLine.textContent = formatInboundMetaText();
  }
  if (inboundCopyAddress) {
    inboundCopyAddress.disabled = !inboundState.addressEmail;
    inboundCopyAddress.textContent = 'Copy';
  }
  if (inboundSendTest) {
    inboundSendTest.classList.remove('hidden');
    inboundSendTest.disabled = !inboundState.addressEmail;
  }
  if (inboundProcessNow) {
    inboundProcessNow.classList.remove('hidden');
    inboundProcessNow.disabled = !inboundState.addressEmail;
  }
  if (inboundRotateAddress) {
    inboundRotateAddress.classList.remove('hidden');
    inboundRotateAddress.disabled = !inboundState.addressEmail;
  }
  if (inboundWhyToggle) {
    inboundWhyToggle.classList.remove('hidden');
  }
  if (inboundHelpSendTest) {
    inboundHelpSendTest.classList.remove('hidden');
  }
  if (inboundHelpWhy) {
    inboundHelpWhy.classList.remove('hidden');
  }
  if (inboundAddressLabel) {
    inboundAddressLabel.textContent = 'Your Applictus inbox address';
  }
  if (inboundOpenSetup) {
    inboundOpenSetup.textContent = setupState === 'active' ? 'View setup' : 'Open setup';
  }
  if (accountHelpStatus) {
    accountHelpStatus.textContent = helpStatusText;
  }
  if (accountHelpNote) {
    accountHelpNote.textContent = helpNoteText;
  }
  if (accountHelpSetupType) {
    accountHelpSetupType.textContent = 'Forwarding-based';
  }
  if (accountHelpLastEmail) {
    const lastSeen = formatSyncDateTime(inboundState.lastReceivedAt);
    if (!lastSeen) {
      accountHelpLastEmail.textContent = '—';
    } else {
      const subject = String(inboundState.lastReceivedSubject || '').trim();
      accountHelpLastEmail.textContent = subject ? `${lastSeen} · ${subject}` : lastSeen;
    }
  }
  if (inboundHelpSendTest) {
    inboundHelpSendTest.disabled = !inboundState.addressEmail;
  }
  if (inboundOldAddressWarning) {
    const showWarning = Boolean(inboundState.inactiveAddressWarning);
    inboundOldAddressWarning.classList.toggle('hidden', !showWarning);
    if (showWarning) {
      const warningMeta = inboundState.inactiveAddressWarningMeta || {};
      const warningParts = ['We detected mail arriving at an old forwarding address.'];
      if (warningMeta.address_email) {
        warningParts.push(`Address: ${warningMeta.address_email}.`);
      }
      const warningWhen = formatSyncDateTime(warningMeta.last_received_at);
      if (warningWhen) {
        warningParts.push(`Last email received: ${warningWhen}.`);
      }
      if (warningMeta.subject) {
        warningParts.push(`Subject: “${warningMeta.subject}”.`);
      }
      warningParts.push('Update your forwarding settings to your current address.');
      inboundOldAddressWarning.textContent = warningParts.join(' ');
    }
  }
  renderForwardingSummary();
  updateDashboardPrimarySyncUI();
  renderAccountInboxUsernamePrompt({ checkAvailability: false });
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

function setAccountSyncRangeMenuOpen(open) {
  accountSyncRangeMenuOpen = Boolean(open);
  if (accountSyncRangeMenu) {
    accountSyncRangeMenu.classList.toggle('hidden', !accountSyncRangeMenuOpen);
  }
  if (accountSyncMenuButton) {
    accountSyncMenuButton.setAttribute('aria-expanded', accountSyncRangeMenuOpen ? 'true' : 'false');
  }
}

function closeAccountSyncRangeMenu() {
  setAccountSyncRangeMenuOpen(false);
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

function updateAccountSyncOptionSelection(option) {
  const normalized = String(option || 'since_last');
  accountLastSyncOption = normalized;
  if (!accountSyncRangeMenu) {
    return;
  }
  const items = Array.from(accountSyncRangeMenu.querySelectorAll('[data-sync-option]'));
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
  if (isInternalGmailMode()) {
    if (syncHelperText) {
      syncHelperText.textContent = emailState.connected
        ? 'Internal Gmail mode is active for this account.'
        : 'Connect Gmail to enable internal ingestion mode.';
    }
    if (accountSyncHelperText) {
      accountSyncHelperText.textContent = formatInboundMetaText();
    }
    return;
  }
  const readiness = resolveForwardingReadiness();
  if (syncHelperText) {
    if (readiness === 'forwarding_active') {
      syncHelperText.textContent = 'Applictus monitors emails forwarded to your secure inbox address.';
    } else if (readiness === 'gmail_verification_pending') {
      syncHelperText.textContent = 'Address reachable. Gmail verification is still pending in Step 2.';
    } else if (readiness === 'address_reachable') {
      syncHelperText.textContent = 'Address reachable. Waiting for first non-verification forwarded email.';
    } else if (readiness === 'awaiting_first_email') {
      syncHelperText.textContent = 'Forwarding enabled — waiting for first email';
    } else if (readiness === 'awaiting_confirmation') {
      syncHelperText.textContent = 'Waiting for forwarding verification in Gmail. Complete Step 2 in setup.';
    } else {
      syncHelperText.textContent =
        'Set up automatic forwarding in about 2 minutes — no Google login required.';
    }
  }
  if (!accountSyncHelperText) {
    return;
  }
  accountSyncHelperText.textContent = formatInboundMetaText();
}

function updateAccountSyncResultLine() {
  if (!accountSyncResult) {
    return;
  }
  if (!emailState.connected || !emailState.lastSyncStats) {
    accountSyncResult.textContent = '';
    return;
  }
  const metricsLine = buildMetricsLine(deriveSyncMetrics(emailState.lastSyncStats, ''));
  accountSyncResult.textContent = metricsLine;
}

function getDashboardEmptyStateHtml() {
  return `
    <div class="empty-state">
      <h3>No applications yet</h3>
      <p class="muted">Connect inbox forwarding to import applications automatically, or add one manually.</p>
      <div class="empty-state-actions">
        <button class="btn btn--primary btn--md" type="button" data-action="sync-inbox">Sync inbox</button>
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

function openModal({
  title,
  description,
  body,
  footer,
  onClose,
  allowBackdropClose = false,
  initialFocus,
  variantClass = ''
}) {
  if (!modalRoot) {
    return;
  }
  if (modalState.variantClass) {
    modalRoot.classList.remove(modalState.variantClass);
  }
  const normalizedVariantClass = typeof variantClass === 'string' ? variantClass.trim() : '';
  if (normalizedVariantClass) {
    modalRoot.classList.add(normalizedVariantClass);
  }
  if (modalHeader) {
    Array.from(modalHeader.querySelectorAll('[data-modal-transient="true"]')).forEach((node) => {
      node.remove();
    });
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
    keyHandler: handleModalKeydown,
    variantClass: normalizedVariantClass || null
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
  if (modalState.variantClass) {
    modalRoot.classList.remove(modalState.variantClass);
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
    keyHandler: null,
    variantClass: null
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

let modalStatusSelectId = 0;
function createModalStatusSelectField({ label, name, value = 'APPLIED' }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'modal-field modal-field--status';

  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  wrapper.appendChild(labelEl);

  const hiddenInput = document.createElement('input');
  hiddenInput.type = 'hidden';
  hiddenInput.name = name;
  wrapper.appendChild(hiddenInput);

  const selectRoot = document.createElement('div');
  selectRoot.className = 'status-select modal-status-select';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'status-select__trigger modal-status-select__trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const triggerDot = document.createElement('span');
  triggerDot.className = 'status-select__dot';
  triggerDot.dataset.tone = 'applied';
  triggerDot.setAttribute('aria-hidden', 'true');

  const triggerLabel = document.createElement('span');
  triggerLabel.className = 'status-select__label';
  triggerLabel.textContent = 'Applied';

  const triggerChevron = document.createElement('span');
  triggerChevron.className = 'status-select__chevron';
  triggerChevron.setAttribute('aria-hidden', 'true');
  triggerChevron.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>';

  trigger.append(triggerDot, triggerLabel, triggerChevron);

  const menu = document.createElement('div');
  menu.className = 'status-menu modal-status-menu hidden';
  menu.role = 'listbox';
  const menuId = `modal-status-menu-${++modalStatusSelectId}`;
  menu.id = menuId;
  trigger.setAttribute('aria-controls', menuId);

  const items = MODAL_STATUS_OPTIONS.map((option) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'status-menu__item modal-status-menu__item';
    item.dataset.value = option.value;
    item.dataset.tone = option.tone;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', 'false');
    item.tabIndex = -1;

    const dot = document.createElement('span');
    dot.className = 'status-menu__dot';
    dot.dataset.tone = option.tone;
    dot.setAttribute('aria-hidden', 'true');

    const labelNode = document.createElement('span');
    labelNode.className = 'status-menu__label';
    labelNode.textContent = option.label;

    const check = document.createElement('span');
    check.className = 'status-menu__check';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = '✓';

    item.append(dot, labelNode, check);
    return item;
  });
  menu.append(...items);

  selectRoot.append(trigger, menu);
  wrapper.appendChild(selectRoot);

  let isOpen = false;
  let highlightIndex = -1;

  const setHighlight = (index, { focus = false } = {}) => {
    if (!items.length) {
      highlightIndex = -1;
      return;
    }
    const safeIndex = ((index % items.length) + items.length) % items.length;
    highlightIndex = safeIndex;
    items.forEach((item, itemIndex) => {
      item.classList.toggle('is-highlighted', itemIndex === safeIndex);
      item.tabIndex = itemIndex === safeIndex ? 0 : -1;
    });
    if (focus) {
      items[safeIndex].focus();
    }
  };

  const syncUi = () => {
    const selectedOption = getModalStatusOption(hiddenInput.value);
    hiddenInput.value = selectedOption.value;
    triggerLabel.textContent = selectedOption.label;
    triggerDot.dataset.tone = selectedOption.tone;
    items.forEach((item, index) => {
      const selected = item.dataset.value === selectedOption.value;
      item.setAttribute('aria-selected', selected ? 'true' : 'false');
      item.classList.toggle('is-selected', selected);
      item.tabIndex = selected ? 0 : -1;
      if (selected) {
        highlightIndex = index;
      }
    });
  };

  const setValue = (nextValue, { emit = true } = {}) => {
    const nextOption = getModalStatusOption(nextValue);
    const changed = hiddenInput.value !== nextOption.value;
    hiddenInput.value = nextOption.value;
    syncUi();
    if (emit && changed) {
      hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
      hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  const close = ({ focusTrigger = false } = {}) => {
    if (!isOpen) {
      return;
    }
    isOpen = false;
    highlightIndex = -1;
    selectRoot.classList.remove('is-open');
    menu.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
    if (focusTrigger) {
      trigger.focus();
    }
  };

  const controller = {
    root: selectRoot,
    close,
    isOpen: () => isOpen
  };

  const setOpen = (nextOpen, { focusSelected = false } = {}) => {
    const open = Boolean(nextOpen);
    if (!open) {
      close();
      return;
    }
    modalStatusSelectControllers.forEach((instance) => {
      if (instance !== controller) {
        instance.close();
      }
    });
    isOpen = true;
    selectRoot.classList.add('is-open');
    menu.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
    syncUi();
    const selectedIndex = items.findIndex((item) => item.getAttribute('aria-selected') === 'true');
    setHighlight(selectedIndex >= 0 ? selectedIndex : 0, { focus: focusSelected });
  };

  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(!isOpen, { focusSelected: !isOpen });
  });

  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      if (!isOpen) {
        setOpen(true, { focusSelected: true });
        return;
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight(highlightIndex + delta, { focus: true });
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(!isOpen, { focusSelected: !isOpen });
      return;
    }
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      close({ focusTrigger: true });
    }
  });

  menu.addEventListener('click', (event) => {
    const item = event.target.closest('.status-menu__item[data-value]');
    if (!item) {
      return;
    }
    event.preventDefault();
    setValue(item.dataset.value || 'APPLIED');
    close({ focusTrigger: true });
  });

  menu.addEventListener('keydown', (event) => {
    if (!items.length) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      const nextIndex = highlightIndex >= 0 ? highlightIndex + 1 : 0;
      setHighlight(nextIndex, { focus: true });
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      const nextIndex = highlightIndex >= 0 ? highlightIndex - 1 : items.length - 1;
      setHighlight(nextIndex, { focus: true });
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      const activeItem = items[highlightIndex] || event.target.closest('.status-menu__item[data-value]') || items[0];
      setValue(activeItem.dataset.value || 'APPLIED');
      close({ focusTrigger: true });
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close({ focusTrigger: true });
      return;
    }
    if (event.key === 'Tab') {
      close();
    }
  });

  menu.addEventListener('mousemove', (event) => {
    const item = event.target.closest('.status-menu__item[data-value]');
    if (!item) {
      return;
    }
    const itemIndex = items.indexOf(item);
    if (itemIndex >= 0 && itemIndex !== highlightIndex) {
      setHighlight(itemIndex);
    }
  });

  modalStatusSelectControllers.add(controller);
  setValue(value, { emit: false });

  return {
    wrapper,
    input: hiddenInput,
    select: {
      get value() {
        return hiddenInput.value;
      },
      set value(nextValue) {
        setValue(nextValue, { emit: false });
      }
    },
    destroy() {
      modalStatusSelectControllers.delete(controller);
    }
  };
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

function setSyncProgressState({ visible, progress, label, error = false, indeterminate = false }) {
  if (!syncProgress || !syncProgressFill || !syncProgressTrack || !syncProgressLabel || !syncProgressValue) {
    return;
  }
  syncUiState.visible = visible;
  if (typeof progress === 'number') {
    syncUiState.progress = progress;
  }
  syncUiState.indeterminate = Boolean(indeterminate);
  syncUiState.label = label || syncUiState.label;
  syncUiState.error = error;

  syncProgress.classList.toggle('hidden', !visible);
  syncProgress.classList.toggle(
    'is-indeterminate',
    Boolean(visible) && syncUiState.indeterminate && !error
  );
  const scanningActive =
    Boolean(visible) &&
    !error &&
    (syncUiState.state === 'running' ||
      syncUiState.state === 'finishing' ||
      /scan/i.test(String(syncUiState.label || '')));
  syncProgress.classList.toggle('is-scanning', scanningActive);
  syncProgressLabel.textContent = syncUiState.label || '';
  if (syncUiState.indeterminate && !error) {
    syncProgressValue.textContent = '…';
    syncProgressTrack.removeAttribute('aria-valuenow');
    syncProgressTrack.setAttribute('aria-valuetext', 'Syncing');
    syncProgressFill.style.width = '42%';
    syncProgressFill.classList.toggle('error', false);
    syncProgressFill.classList.toggle('is-scanning', true);
    return;
  }
  const rawPct = Math.max(0, Math.min(100, (syncUiState.progress || 0) * 100));
  const displayPct =
    syncUiState.state === 'finishing'
      ? Math.min(100, rawPct)
      : rawPct > 0 && rawPct < 1
      ? 1
      : Math.min(99.5, rawPct);
  syncProgressValue.textContent = `${Math.round(displayPct)}%`;
  syncProgressTrack.removeAttribute('aria-valuetext');
  syncProgressTrack.setAttribute('aria-valuenow', String(Math.round(displayPct)));
  syncProgressFill.style.width = `${displayPct}%`;
  syncProgressFill.classList.toggle('error', !!error);
  syncProgressFill.classList.toggle('is-scanning', scanningActive && !error);
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
  setSyncProgressState({ visible: false, progress: 0, label: '', error: false, indeterminate: false });
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
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  // Support both legacy 0..1 and new 0..100 confidence scales.
  const normalized = numeric > 1 ? numeric / 100 : numeric;
  return Math.max(0, Math.min(1, normalized));
}

function formatConfidencePercent(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '—';
  }
  const normalized = numeric > 1 ? numeric / 100 : numeric;
  const clamped = Math.max(0, Math.min(1, normalized));
  return `${Math.round(clamped * 100)}%`;
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
    INTERNAL_GMAIL_FORBIDDEN: 'This account is not allowed to use internal Gmail mode.',
    GMAIL_ACCOUNT_MISMATCH: 'Sign in to the same Gmail account as your Applictus account and try again.',
    USE_INTERNAL_GMAIL_CALLBACK: 'Internal Gmail connect uses a different callback path.',
    GMAIL_NOT_CONFIGURED: 'Gmail connect is not configured yet.',
    TOKEN_ENC_KEY_REQUIRED: 'Token encryption is not configured yet.',
    GMAIL_CONNECT_FAILED: 'Google sign-in worked, but Gmail connection could not be completed.',
    INBOX_USERNAME_REQUIRED: 'Choose an inbox username.',
    INBOX_USERNAME_INVALID:
      'Use 3-30 characters: lowercase letters, numbers, and hyphens (no leading/trailing or doubled hyphens).',
    INBOX_USERNAME_RESERVED: 'That inbox username is reserved. Please choose another.',
    INBOX_USERNAME_TAKEN: 'That inbox username is already taken.',
    INBOX_USERNAME_IMMUTABLE:
      'Your inbox username is locked after setup. Contact support if you need to change it.',
    DB_UNAVAILABLE: 'Service temporarily unavailable. Please retry in a moment.'
  };
  return messages[code] || 'Unable to sign in. Please try again.';
}

function getInboundDomainForDisplay() {
  const candidate = String(inboundState.addressEmail || '')
    .trim()
    .toLowerCase();
  const atIndex = candidate.lastIndexOf('@');
  if (atIndex > 0 && atIndex < candidate.length - 1) {
    return candidate.slice(atIndex + 1);
  }
  return INBOUND_DOMAIN_FALLBACK;
}

function normalizeInboxUsernameInput(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
  return normalized.slice(0, 30);
}

function validateInboxUsernameInput(value, { allowEmpty = true } = {}) {
  const normalized = normalizeInboxUsernameInput(value);
  if (!normalized) {
    if (allowEmpty) {
      return { ok: true, value: '', code: null };
    }
    return { ok: false, value: '', code: 'INBOX_USERNAME_REQUIRED' };
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) || normalized.length < 3 || normalized.length > 30) {
    return { ok: false, value: normalized, code: 'INBOX_USERNAME_INVALID' };
  }
  if (RESERVED_INBOX_USERNAMES.has(normalized)) {
    return { ok: false, value: normalized, code: 'INBOX_USERNAME_RESERVED' };
  }
  return { ok: true, value: normalized, code: null };
}

function buildInboxAddressPreview(username) {
  const normalized = normalizeInboxUsernameInput(username);
  if (!normalized) {
    return null;
  }
  return `${normalized}@${getInboundDomainForDisplay()}`;
}

function slugifyInboxSuggestion(value) {
  return normalizeInboxUsernameInput(value);
}

function buildInboxUsernameSuggestions({ name = '', email = '', currentValue = '' } = {}) {
  const suggestions = [];
  const normalizedCurrent = normalizeInboxUsernameInput(currentValue);
  const trimmedName = String(name || '').trim();
  const trimmedEmail = String(email || '').trim().toLowerCase();
  const emailLocal = trimmedEmail.includes('@') ? trimmedEmail.split('@')[0] : trimmedEmail;
  const baseName = slugifyInboxSuggestion(trimmedName);
  const compactName = slugifyInboxSuggestion(trimmedName.replace(/\s+/g, ''));
  const emailSlug = slugifyInboxSuggestion(emailLocal);
  const emailCompact = slugifyInboxSuggestion(emailLocal.replace(/[._-]+/g, ''));

  [normalizedCurrent, baseName, compactName, emailCompact, emailSlug].forEach((candidate) => {
    if (!candidate || suggestions.includes(candidate)) {
      return;
    }
    const validation = validateInboxUsernameInput(candidate, { allowEmpty: false });
    if (!validation.ok) {
      return;
    }
    suggestions.push(candidate);
  });

  if (suggestions.length < 3) {
    const fallbackSeed = suggestions[0] || emailCompact || compactName || 'applicant';
    for (let suffix = 1; suffix <= 12 && suggestions.length < 3; suffix += 1) {
      const candidate = slugifyInboxSuggestion(`${fallbackSeed}${suffix}`);
      if (!candidate || suggestions.includes(candidate)) {
        continue;
      }
      const validation = validateInboxUsernameInput(candidate, { allowEmpty: false });
      if (!validation.ok) {
        continue;
      }
      suggestions.push(candidate);
    }
  }

  return suggestions.slice(0, 3);
}

function renderInboxSuggestionButtons(container, suggestions, onPick) {
  if (!container) {
    return;
  }
  container.innerHTML = '';
  const values = Array.isArray(suggestions) ? suggestions.filter(Boolean) : [];
  if (!values.length) {
    container.classList.add('hidden');
    return;
  }
  values.forEach((value) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'signup-inbox-suggestion';
    button.textContent = value;
    button.addEventListener('click', () => onPick(value));
    container.appendChild(button);
  });
  container.classList.remove('hidden');
}

async function checkInboxUsernameAvailability(username, tokenRef) {
  const normalized = normalizeInboxUsernameInput(username);
  if (!normalized) {
    return { available: true, valid: true, inbox_username: '' };
  }
  const result = await api(`/api/inbound/username/availability?username=${encodeURIComponent(normalized)}`);
  if (tokenRef && tokenRef.currentToken !== tokenRef.expectedToken) {
    return null;
  }
  return result;
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
    auth: 'Sign in to Applictus to track job applications from forwarded inbox updates.',
    dashboard:
      'Applictus tracks application progress from forwarded inbox updates so you always know your current status.',
    account: 'Manage your Applictus account and forwarding inbox connection.',
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

function normalizeStatusFilterValue(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const byUi = STATUS_FILTER_BY_UI.get(raw.toLowerCase());
  if (byUi) {
    return byUi.api;
  }
  const byApi = STATUS_FILTER_BY_API.get(raw.toUpperCase());
  return byApi ? byApi.api : '';
}

function getStatusFilterOptionFromValue(value) {
  const apiValue = normalizeStatusFilterValue(value);
  return STATUS_FILTER_BY_API.get(apiValue) || STATUS_FILTER_OPTIONS[0];
}

function getStatusMenuItems() {
  if (!filterStatusMenu) return [];
  return Array.from(filterStatusMenu.querySelectorAll('.status-menu__item[data-value]'));
}

let statusMenuOpen = false;
let statusMenuHighlightIndex = -1;
const modalStatusSelectControllers = new Set();

function setStatusMenuHighlight(index, { focus = false } = {}) {
  const items = getStatusMenuItems();
  if (!items.length) {
    statusMenuHighlightIndex = -1;
    return;
  }
  const safeIndex = ((index % items.length) + items.length) % items.length;
  statusMenuHighlightIndex = safeIndex;
  items.forEach((item, itemIndex) => {
    item.classList.toggle('is-highlighted', itemIndex === safeIndex);
    item.tabIndex = itemIndex === safeIndex ? 0 : -1;
  });
  if (focus) {
    items[safeIndex].focus();
  }
}

function syncStatusFilterMenuUi() {
  const selectedOption = getStatusFilterOptionFromValue(filterStatus?.value || state.filters.status);
  if (filterStatus) {
    filterStatus.value = selectedOption.api;
  }
  if (filterStatusLabel) {
    filterStatusLabel.textContent = selectedOption.label;
  }
  if (filterStatusDot) {
    filterStatusDot.dataset.tone = selectedOption.tone;
  }
  const items = getStatusMenuItems();
  items.forEach((item, index) => {
    const isSelected = item.dataset.value === selectedOption.value;
    item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    item.classList.toggle('is-selected', isSelected);
    item.tabIndex = isSelected ? 0 : -1;
    if (isSelected) {
      statusMenuHighlightIndex = index;
    }
  });
}

function setStatusMenuOpen(nextOpen, { focusSelected = false } = {}) {
  const open = Boolean(nextOpen);
  statusMenuOpen = open;
  if (filterStatusSelect) {
    filterStatusSelect.classList.toggle('is-open', open);
  }
  if (filterStatusMenu) {
    filterStatusMenu.classList.toggle('hidden', !open);
  }
  if (filterStatusTrigger) {
    filterStatusTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (!open) {
    statusMenuHighlightIndex = -1;
    return;
  }
  syncStatusFilterMenuUi();
  const items = getStatusMenuItems();
  if (!items.length) {
    return;
  }
  const selectedIndex = items.findIndex((item) => item.getAttribute('aria-selected') === 'true');
  const startIndex = selectedIndex >= 0 ? selectedIndex : 0;
  setStatusMenuHighlight(startIndex, { focus: focusSelected });
}

function closeStatusMenu({ focusTrigger = false } = {}) {
  if (!statusMenuOpen) {
    return;
  }
  setStatusMenuOpen(false);
  if (focusTrigger) {
    filterStatusTrigger?.focus();
  }
}

function applyStatusFilterValue(uiValue) {
  const option = STATUS_FILTER_BY_UI.get(String(uiValue ?? '').toLowerCase()) || STATUS_FILTER_OPTIONS[0];
  const nextApiValue = option.api;
  if (!filterStatus) {
    return;
  }
  if (filterStatus.value !== nextApiValue) {
    filterStatus.value = nextApiValue;
    filterStatus.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    syncStatusFilterMenuUi();
  }
}

function getArchivedStatusMenuItems() {
  if (!archivedFilterStatusMenu) return [];
  return Array.from(archivedFilterStatusMenu.querySelectorAll('.status-menu__item[data-value]'));
}

let archiveStatusMenuOpen = false;
let archiveStatusMenuHighlightIndex = -1;

function setArchivedStatusMenuHighlight(index, { focus = false } = {}) {
  const items = getArchivedStatusMenuItems();
  if (!items.length) {
    archiveStatusMenuHighlightIndex = -1;
    return;
  }
  const safeIndex = ((index % items.length) + items.length) % items.length;
  archiveStatusMenuHighlightIndex = safeIndex;
  items.forEach((item, itemIndex) => {
    item.classList.toggle('is-highlighted', itemIndex === safeIndex);
    item.tabIndex = itemIndex === safeIndex ? 0 : -1;
  });
  if (focus) {
    items[safeIndex].focus();
  }
}

function syncArchivedStatusFilterMenuUi() {
  const selectedOption = getStatusFilterOptionFromValue(
    archivedFilterStatus?.value || state.archived.filters.status
  );
  if (archivedFilterStatus) {
    archivedFilterStatus.value = selectedOption.api;
  }
  if (archivedFilterStatusLabel) {
    archivedFilterStatusLabel.textContent = selectedOption.label;
  }
  if (archivedFilterStatusDot) {
    archivedFilterStatusDot.dataset.tone = selectedOption.tone;
  }
  const items = getArchivedStatusMenuItems();
  items.forEach((item, index) => {
    const isSelected = item.dataset.value === selectedOption.value;
    item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    item.classList.toggle('is-selected', isSelected);
    item.tabIndex = isSelected ? 0 : -1;
    if (isSelected) {
      archiveStatusMenuHighlightIndex = index;
    }
  });
}

function setArchivedStatusMenuOpen(nextOpen, { focusSelected = false } = {}) {
  const open = Boolean(nextOpen);
  archiveStatusMenuOpen = open;
  if (archivedFilterStatusSelect) {
    archivedFilterStatusSelect.classList.toggle('is-open', open);
  }
  if (archivedFilterStatusMenu) {
    archivedFilterStatusMenu.classList.toggle('hidden', !open);
  }
  if (archivedFilterStatusTrigger) {
    archivedFilterStatusTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (!open) {
    archiveStatusMenuHighlightIndex = -1;
    return;
  }
  syncArchivedStatusFilterMenuUi();
  const items = getArchivedStatusMenuItems();
  if (!items.length) {
    return;
  }
  const selectedIndex = items.findIndex((item) => item.getAttribute('aria-selected') === 'true');
  const startIndex = selectedIndex >= 0 ? selectedIndex : 0;
  setArchivedStatusMenuHighlight(startIndex, { focus: focusSelected });
}

function closeArchivedStatusMenu({ focusTrigger = false } = {}) {
  if (!archiveStatusMenuOpen) {
    return;
  }
  setArchivedStatusMenuOpen(false);
  if (focusTrigger) {
    archivedFilterStatusTrigger?.focus();
  }
}

function applyArchivedStatusFilterValue(uiValue) {
  const option = STATUS_FILTER_BY_UI.get(String(uiValue ?? '').toLowerCase()) || STATUS_FILTER_OPTIONS[0];
  const nextApiValue = option.api;
  if (!archivedFilterStatus) {
    return;
  }
  if (archivedFilterStatus.value !== nextApiValue) {
    archivedFilterStatus.value = nextApiValue;
    archivedFilterStatus.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    syncArchivedStatusFilterMenuUi();
  }
}

function updateDashboardMeta(total) {
  if (appCount) {
    appCount.textContent = `${total} tracked`;
  }
}

function getKpiSignalDescriptors() {
  return [
    {
      key: 'applied',
      card: document.querySelector('#dashboard-view .kpi-card.status-applied'),
      valueWrap: document.querySelector('#dashboard-view .kpi-card.status-applied .kpi-value-wrap'),
      showNew: state.signals.showAppliedNew,
      delta: state.signals.appliedDelta,
      deltaAriaLabel: (value) => `Applied increased by ${value} since last scan`
    },
    {
      key: 'offer',
      card: document.querySelector('#dashboard-view .kpi-card.status-offer'),
      valueWrap: document.querySelector('#dashboard-view .kpi-card.status-offer .kpi-value-wrap'),
      showNew: state.signals.showOffersNew,
      delta: state.signals.offersDelta,
      deltaAriaLabel: (value) => `Offers increased by ${value} since last scan`
    },
    {
      key: 'interview',
      card: document.querySelector('#dashboard-view .kpi-card.status-interview'),
      valueWrap: document.querySelector('#dashboard-view .kpi-card.status-interview .kpi-value-wrap'),
      showNew: state.signals.showInterviewsNew,
      delta: state.signals.interviewsDelta,
      deltaAriaLabel: (value) => `Interviews increased by ${value} since last scan`
    }
  ];
}

function clearKpiSignalNodes(card, valueWrap) {
  card?.querySelector('.kpi-new-tag[data-kpi-signal="true"]')?.remove();
  valueWrap?.querySelector('.kpi-delta[data-kpi-signal="true"]')?.remove();
}

function renderKpiSignalBadges() {
  const descriptors = getKpiSignalDescriptors();
  descriptors.forEach(({ key, card, valueWrap, showNew, delta, deltaAriaLabel }) => {
    if (!card || !valueWrap) {
      return;
    }
    clearKpiSignalNodes(card, valueWrap);
    const numericDelta = Math.max(0, Number(delta) || 0);
    if (!showNew || numericDelta <= 0) {
      return;
    }

    const newTag = document.createElement('span');
    newTag.className = `kpi-new-tag kpi-new-tag--${key}`;
    newTag.textContent = 'NEW';
    newTag.setAttribute('aria-hidden', 'true');
    newTag.dataset.kpiSignal = 'true';
    card.appendChild(newTag);

    const deltaBadge = document.createElement('span');
    deltaBadge.className = `kpi-delta kpi-delta--${key}`;
    deltaBadge.textContent = `+${numericDelta}`;
    deltaBadge.setAttribute('aria-label', deltaAriaLabel(numericDelta));
    deltaBadge.setAttribute('aria-live', 'polite');
    deltaBadge.dataset.kpiSignal = 'true';
    valueWrap.appendChild(deltaBadge);
  });
}

function markKpiNewSignals({ applied = false, offers = false, interviews = false } = {}) {
  state.signals.showAppliedNew = Boolean(applied);
  state.signals.showOffersNew = Boolean(offers);
  state.signals.showInterviewsNew = Boolean(interviews);
  if (offers) {
    try {
      window.sessionStorage?.setItem(SESSION_NEW_OFFERS_KEY, 'true');
    } catch (_) {
      // Ignore storage failures silently.
    }
  } else {
    try {
      window.sessionStorage?.removeItem(SESSION_NEW_OFFERS_KEY);
    } catch (_) {
      // Ignore storage failures silently.
    }
  }
  if (interviews) {
    try {
      window.sessionStorage?.setItem(SESSION_NEW_INTERVIEWS_KEY, 'true');
    } catch (_) {
      // Ignore storage failures silently.
    }
  } else {
    try {
      window.sessionStorage?.removeItem(SESSION_NEW_INTERVIEWS_KEY);
    } catch (_) {
      // Ignore storage failures silently.
    }
  }
  if (applied) {
    try {
      window.sessionStorage?.setItem(SESSION_NEW_APPLIED_KEY, 'true');
    } catch (_) {
      // Ignore storage failures silently.
    }
  } else {
    try {
      window.sessionStorage?.removeItem(SESSION_NEW_APPLIED_KEY);
    } catch (_) {
      // Ignore storage failures silently.
    }
  }
  renderKpiSignalBadges();
}

function clearKpiNewSignals() {
  state.signals.showAppliedNew = false;
  state.signals.showOffersNew = false;
  state.signals.showInterviewsNew = false;
  try {
    window.sessionStorage?.removeItem(SESSION_NEW_APPLIED_KEY);
    window.sessionStorage?.removeItem(SESSION_NEW_OFFERS_KEY);
    window.sessionStorage?.removeItem(SESSION_NEW_INTERVIEWS_KEY);
  } catch (_) {
    // Ignore storage failures silently.
  }
  renderKpiSignalBadges();
}

function markKpiDeltaSignals({ applied = 0, offers = 0, interviews = 0 } = {}) {
  const appliedDelta = Math.max(0, Number(applied) || 0);
  const offersDelta = Math.max(0, Number(offers) || 0);
  const interviewsDelta = Math.max(0, Number(interviews) || 0);
  state.signals.appliedDelta = appliedDelta;
  state.signals.offersDelta = offersDelta;
  state.signals.interviewsDelta = interviewsDelta;
  try {
    if (appliedDelta > 0) {
      window.sessionStorage?.setItem(SESSION_KPI_DELTA_APPLIED_KEY, String(appliedDelta));
    } else {
      window.sessionStorage?.removeItem(SESSION_KPI_DELTA_APPLIED_KEY);
    }
    if (offersDelta > 0) {
      window.sessionStorage?.setItem(SESSION_KPI_DELTA_OFFERS_KEY, String(offersDelta));
    } else {
      window.sessionStorage?.removeItem(SESSION_KPI_DELTA_OFFERS_KEY);
    }
    if (interviewsDelta > 0) {
      window.sessionStorage?.setItem(SESSION_KPI_DELTA_INTERVIEWS_KEY, String(interviewsDelta));
    } else {
      window.sessionStorage?.removeItem(SESSION_KPI_DELTA_INTERVIEWS_KEY);
    }
  } catch (_) {
    // Ignore storage failures silently.
  }
  renderKpiSignalBadges();
}

function clearKpiDeltaSignals() {
  state.signals.appliedDelta = 0;
  state.signals.offersDelta = 0;
  state.signals.interviewsDelta = 0;
  try {
    window.sessionStorage?.removeItem(SESSION_KPI_DELTA_APPLIED_KEY);
    window.sessionStorage?.removeItem(SESSION_KPI_DELTA_OFFERS_KEY);
    window.sessionStorage?.removeItem(SESSION_KPI_DELTA_INTERVIEWS_KEY);
  } catch (_) {
    // Ignore storage failures silently.
  }
  renderKpiSignalBadges();
}

function readNumericDelta(source, key) {
  if (!source || typeof source !== 'object') {
    return null;
  }
  const direct = source?.deltas?.[key];
  if (direct != null) {
    const parsed = Number(direct);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  const nested =
    source?.last_sync?.deltas?.[key] ??
    source?.lastSync?.deltas?.[key] ??
    source?.summary?.deltas?.[key];
  if (nested != null) {
    const parsed = Number(nested);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return null;
}

function getApplicationSignalSnapshot(applications = []) {
  const snapshot = new Map();
  for (const app of applications || []) {
    if (!app?.id) continue;
    const normalizedStatus = normalizeStatusValue(app.current_status || 'UNKNOWN');
    snapshot.set(String(app.id), {
      status: normalizedStatus,
      offer: isOfferStatus(normalizedStatus),
      interview: isInterviewStatus(normalizedStatus)
    });
  }
  return snapshot;
}

async function captureSignalSnapshot() {
  try {
    const applications = await fetchApplications({ includeArchived: false, limit: 5000 });
    return getApplicationSignalSnapshot(applications);
  } catch (_) {
    return new Map();
  }
}

function applyRowSignalPulse({ offerIds = [], interviewIds = [] } = {}) {
  if (state.signals.pulseTimer) {
    window.clearTimeout(state.signals.pulseTimer);
    state.signals.pulseTimer = null;
  }
  state.signals.pulseOfferIds = new Set((offerIds || []).map((id) => String(id)));
  state.signals.pulseInterviewIds = new Set((interviewIds || []).map((id) => String(id)));
  if (state.table.data.length) {
    renderApplicationsTable(sortApplications(state.table.data));
  }
  if (!state.signals.pulseOfferIds.size && !state.signals.pulseInterviewIds.size) {
    return;
  }
  state.signals.pulseTimer = window.setTimeout(() => {
    state.signals.pulseOfferIds.clear();
    state.signals.pulseInterviewIds.clear();
    state.signals.pulseTimer = null;
    if (state.table.data.length) {
      renderApplicationsTable(sortApplications(state.table.data));
    }
  }, 1200);
}

async function applyPostScanSignals(previousSnapshot, scanResult = null) {
  const before = previousSnapshot instanceof Map ? previousSnapshot : new Map();
  const applications = await fetchApplications({ includeArchived: false, limit: 5000 });
  const offerIds = [];
  const interviewIds = [];
  const appliedIds = [];

  for (const app of applications || []) {
    if (!app?.id) continue;
    const id = String(app.id);
    const prior = before.get(id) || { status: null, offer: false, interview: false };
    const normalizedStatus = normalizeStatusValue(app.current_status || 'UNKNOWN');
    const nowOffer = isOfferStatus(normalizedStatus);
    const nowInterview = isInterviewStatus(normalizedStatus);
    const nowApplied = normalizedStatus === 'APPLIED';
    if (nowOffer && !prior.offer) {
      offerIds.push(id);
    }
    if (nowInterview && !prior.interview) {
      interviewIds.push(id);
    }
    if (nowApplied && prior.status !== 'APPLIED') {
      appliedIds.push(id);
    }
  }

  const serverAppliedDelta = readNumericDelta(scanResult, 'applied');
  const serverOffersDelta = readNumericDelta(scanResult, 'offers') ?? readNumericDelta(scanResult, 'offer');
  const serverInterviewsDelta =
    readNumericDelta(scanResult, 'interviews') ?? readNumericDelta(scanResult, 'interview');
  const appliedDelta = serverAppliedDelta ?? appliedIds.length;
  const offersDelta = serverOffersDelta ?? offerIds.length;
  const interviewsDelta = serverInterviewsDelta ?? interviewIds.length;

  markKpiDeltaSignals({ applied: appliedDelta, offers: offersDelta, interviews: interviewsDelta });
  markKpiNewSignals({
    applied: appliedDelta > 0,
    offers: offersDelta > 0,
    interviews: interviewsDelta > 0
  });

  if (offerIds.length || interviewIds.length) {
    applyRowSignalPulse({ offerIds, interviewIds });
  } else {
    applyRowSignalPulse({ offerIds: [], interviewIds: [] });
  }
}

function updateKpiCounts({ total = 0, applied = 0, offers = 0, interviews = 0, rejected = 0 } = {}) {
  if (kpiTotal) {
    kpiTotal.textContent = String(total);
  }
  if (kpiApplied) {
    kpiApplied.textContent = String(applied);
  }
  if (kpiOffers) {
    kpiOffers.textContent = String(offers);
  }
  if (kpiInterviews) {
    kpiInterviews.textContent = String(interviews);
  }
  if (kpiRejected) {
    kpiRejected.textContent = String(rejected);
  }
  renderKpiSignalBadges();
}

function getKpiCountsFromColumns(columns) {
  const counts = { total: 0, applied: 0, offers: 0, interviews: 0, rejected: 0 };
  (columns || []).forEach((column) => {
    const count = column.count || 0;
    const status = String(column.status || '')
      .toUpperCase()
      .replace(/\s+/g, '_');
    counts.total += count;
    if (status === 'APPLIED') {
      counts.applied += count;
    } else if (status === 'REJECTED') {
      counts.rejected += count;
    } else if (OFFER_KPI_STATUSES.has(status) || status.includes('OFFER')) {
      counts.offers += count;
    } else if (INTERVIEW_KPI_STATUSES.has(status) || status.includes('INTERVIEW')) {
      counts.interviews += count;
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
  if (view === 'account') {
    updateAdminAnalyticsVisibility();
  }
  closeProfileMenu();

  if (nav) {
    const links = nav.querySelectorAll('.nav-link');
    links.forEach((link) => {
      const href = link.getAttribute('href') || '';
      link.classList.toggle('active', href === `#${view}`);
    });
  }
  if (view === 'dashboard') {
    syncInboundAutoPolling();
  } else {
    clearInboundAutoSyncPolling();
  }
  if (view === 'account') {
    updateAdminAnalyticsVisibility();
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
  if (panel === 'signup') {
    renderSignupInboxUsernameUi({ checkAvailability: true });
  }
}

function renderAccountPanel(user = sessionUser) {
  if (!user) {
    return;
  }
  if (accountEmail) {
    accountEmail.textContent = user.email || '—';
  }
  if (accountMethods) {
    const provider = user.auth_provider || 'password';
    const hasGoogle = String(provider).includes('google');
    const hasPassword = Boolean(user.has_password);
    const methodBadges = [
      {
        key: 'password',
        label: 'Password',
        enabled: hasPassword,
        icon:
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8.5" cy="15.5" r="3.5"></circle><path d="M12 15.5H21"></path><path d="M17 12.5V18.5"></path></svg>'
      },
      {
        key: 'google',
        label: 'Google',
        enabled: hasGoogle,
        icon:
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M4 12h16"></path><path d="M12 4c2.6 2.1 4 5 4 8s-1.4 5.9-4 8c-2.6-2.1-4-5-4-8s1.4-5.9 4-8z"></path></svg>'
      }
    ];
    accountMethods.innerHTML = methodBadges
      .map(
        (method) =>
          `<span class="auth-badge" data-provider="${method.key}" data-state="${
            method.enabled ? 'on' : 'off'
          }" aria-label="${method.label} ${method.enabled ? 'enabled' : 'not enabled'}">
            <span class="auth-badge-dot" aria-hidden="true"></span>
            <span class="auth-badge-icon" aria-hidden="true">${method.icon}</span>
            <span class="auth-badge-label">${method.label}</span>
          </span>`
      )
      .join('');
  }
  if (accountPasswordButtonLabel) {
    accountPasswordButtonLabel.textContent = user.has_password ? 'Change password' : 'Set password';
  } else if (accountPasswordButton) {
    accountPasswordButton.textContent = user.has_password ? 'Change password' : 'Set password';
  }
  if (accountPasswordHint) {
    accountPasswordHint.classList.remove('account-password-success');
    accountPasswordHint.textContent = user.has_password
      ? 'Update your password to keep your account secure.'
      : 'Set a password to sign in without Google.';
  }
  renderAccountInboxUsernamePrompt({ checkAvailability: true });
  renderPlanUsage(user);
  updateAdminAnalyticsVisibility();
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

function getPlanLimitForUser(user = sessionUser) {
  const source = user || planState || sessionUser;
  if (!source) return PLAN_LIMITS.free;
  if (Number.isFinite(source.monthly_tracked_email_limit) && source.monthly_tracked_email_limit > 0) {
    return source.monthly_tracked_email_limit;
  }
  if (Number.isFinite(source.plan_limit) && source.plan_limit > 0) {
    return source.plan_limit;
  }
  const tier = String(source.plan_tier || 'free').toLowerCase();
  return PLAN_LIMITS[tier] || PLAN_LIMITS.free;
}

function renderPlanUsage(user = sessionUser) {
  if (!accountPlanName || !accountPlanUsage || !accountPlanProgress) {
    return;
  }
  if (!user) {
    accountPlanName.textContent = 'Free';
    accountPlanUsage.textContent = '—';
    accountPlanProgress.style.width = '0%';
    accountPlanWarning.textContent = '';
    return;
  }
  const source = planState || user;
  const tier = String(source.plan_tier || 'free').toLowerCase();
  const limit = getPlanLimitForUser(source);
  const usage = Number(source.tracked_email_count_current_month || source.plan_usage || 0);
  accountPlanName.textContent = tier === 'pro' ? 'Pro' : 'Free';
  accountPlanUsage.textContent = `${usage} / ${limit} tracked emails this month`;
  const ratio = limit > 0 ? Math.min(1, usage / limit) : 0;
  accountPlanProgress.style.width = `${Math.round(ratio * 100)}%`;
  let warning = '';
  const globalBlocked = Boolean(source.global_blocked);
  if (globalBlocked) {
    warning = 'Free tracking is temporarily at capacity this month.';
  } else if (limit > 0) {
    if (ratio >= 1) {
      warning = 'You reached your monthly tracking limit. Upgrade to continue tracking new updates.';
    } else if (ratio >= 0.8) {
      warning = `You have used ${usage} of ${limit}. Consider upgrading to Pro.`;
    }
  }
  accountPlanWarning.textContent = warning;
  if (accountUpgradeButton) {
    accountUpgradeButton.disabled = tier === 'pro';
    accountUpgradeButton.textContent = tier === 'pro' ? 'Pro active' : 'Upgrade to Pro';
  }
}

let adminAnalyticsLoaded = false;
let adminTrendState = {
  metric: 'tracked_emails',
  range: '30d',
  points: []
};

function isAdminClient(user = sessionUser) {
  if (!user) return false;
  const email = normalizeEmailClient(user.email);
  return ADMIN_EMAIL_ALLOWLIST.has(email);
}

function renderAdminKpis(summary) {
  if (!summary) return;
  const els = ensureAdminElements();
  const setVal = (el, value) => {
    if (el) el.textContent = Number.isFinite(value) ? value.toLocaleString() : '—';
  };
  setVal(els.kpiTotalUsers, summary.total_users);
  setVal(els.kpiProUsers, summary.pro_users);
  setVal(els.kpiFreeUsers, summary.free_users);
  setVal(els.kpiTotalApps, summary.total_applications);
  setVal(els.kpiMonthEmails, summary.tracked_emails_month);
  setVal(els.kpiTodayEmails, summary.tracked_emails_today);
  setVal(els.kpiWeekEmails, summary.tracked_emails_week);
  setVal(els.kpiNewUsers, summary.new_users_month);
}

function renderAdminChart(trend) {
  const els = ensureAdminElements();
  const adminChartSvg = els.chartSvg;
  const adminChartHint = els.chartHint;
  if (!adminChartSvg || !adminChartHint) return;
  const points = Array.isArray(trend?.points) ? trend.points : [];
  if (!points.length) {
    adminChartSvg.innerHTML = '';
    adminChartHint.textContent = 'No data for this range.';
    return;
  }
  const numericPoints = points.map((p, idx) => ({
    x: idx,
    label: p.bucket,
    value: Number(p.value || 0)
  }));
  const maxVal = Math.max(...numericPoints.map((p) => p.value), 1);
  const width = adminChartSvg.clientWidth || 640;
  const height = 240;
  const pad = 26;
  const plotW = width - pad * 2;
  const plotH = height - pad * 2;
  const path = [];
  const circles = [];
  numericPoints.forEach((pt, idx) => {
    const x = pad + (plotW * idx) / Math.max(1, numericPoints.length - 1);
    const y = pad + plotH - (pt.value / maxVal) * plotH;
    path.push(`${idx === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
    circles.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3" fill="#2d5cff" opacity="0.9"></circle>`);
  });
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    y: pad + plotH - ratio * plotH,
    label: Math.round(maxVal * ratio)
  }));
  const xLabels = [numericPoints[0], numericPoints[numericPoints.length - 1]].filter(Boolean);
  adminChartSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  adminChartSvg.innerHTML = `
    <g stroke="rgba(20,40,80,0.15)" stroke-width="1">
      ${yTicks
        .map(
          (tick) =>
            `<line x1="${pad}" y1="${tick.y.toFixed(2)}" x2="${width - pad}" y2="${tick.y.toFixed(
              2
            )}" />`
        )
        .join('')}
    </g>
    <g fill="rgba(20,40,80,0.55)" font-size="10" font-weight="600">
      ${yTicks
        .map(
          (tick) =>
            `<text x="${pad - 8}" y="${tick.y.toFixed(2)}" text-anchor="end" dominant-baseline="middle">${tick.label.toLocaleString()}</text>`
        )
        .join('')}
      ${
        xLabels.length
          ? `<text x="${pad}" y="${height - 6}" text-anchor="start">${xLabels[0].label}</text>
             <text x="${width - pad}" y="${height - 6}" text-anchor="end">${xLabels[xLabels.length - 1].label}</text>`
          : ''
      }
    </g>
    <path d="${path.join(' ')}" fill="none" stroke="#2d5cff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
    ${circles.join('')}
  `;
  adminChartHint.textContent = `${trend.points.length} data points • ${trend.metric.replace(/_/g, ' ')} (${trend.range})`;
}

async function loadAdminAnalyticsSummary() {
  try {
    const summary = await api('/api/admin/analytics/summary');
    renderAdminKpis(summary);
    const els = ensureAdminElements();
    if (els.statusText) els.statusText.textContent = 'Admin KPIs loaded.';
    return true;
  } catch (err) {
    const els = ensureAdminElements();
    if (els.chartHint) {
      const code = err?.code || err?.status || 'error';
      els.chartHint.textContent = `Unable to load admin KPIs (${code}).`;
    }
    if (els.statusText) {
      const code = err?.code || err?.status || 'error';
      els.statusText.textContent = `KPIs error (${code}). Check session/login.`;
    }
    if (DEBUG_APP) {
      // eslint-disable-next-line no-console
      console.debug('[admin-analytics] summary failed', err);
    }
    return false;
  }
}

async function loadAdminTrend(metric = adminTrendState.metric, range = adminTrendState.range) {
  try {
    const els = ensureAdminElements();
    if (els.chartHint) els.chartHint.textContent = 'Loading trend…';
    const trendTimeout = setTimeout(() => {
      const el = ensureAdminElements().chartHint;
      if (el && el.textContent.includes('Loading')) {
        el.textContent = 'Trend load is taking longer than expected…';
      }
    }, 4000);
    const trend = await api(`/api/admin/analytics/trends?metric=${encodeURIComponent(metric)}&range=${encodeURIComponent(range)}`);
    clearTimeout(trendTimeout);
    adminTrendState = { ...adminTrendState, metric, range, points: trend.points || [] };
    renderAdminChart(trend);
    const els2 = ensureAdminElements();
    if (els2.statusText) {
      els2.statusText.textContent = `Trend loaded (${trend.points?.length || 0} points, ${metric}, ${range}).`;
    }
    return true;
  } catch (err) {
    const els = ensureAdminElements();
    if (els.chartHint) {
      const code = err?.code || err?.status || 'error';
      els.chartHint.textContent = `Unable to load trend (${code}).`;
    }
    if (els.statusText) {
      const code = err?.code || err?.status || 'error';
      els.statusText.textContent = `Trend error (${code}). Check session/login.`;
    }
    if (DEBUG_APP) {
      // eslint-disable-next-line no-console
      console.debug('[admin-analytics] trend failed', err);
    }
    return false;
  }
}

function updateAdminAnalyticsVisibility() {
  const els = ensureAdminElements();
  if (!els.section) return;
  const isAdmin = isAdminClient(sessionUser);
  els.section.classList.toggle('hidden', !isAdmin);
  els.section.style.display = isAdmin ? '' : 'none';
  els.section.setAttribute('aria-hidden', isAdmin ? 'false' : 'true');
  if (isAdmin) {
    void loadAdminAnalyticsSummary().then((ok) => {
      if (!ok) adminAnalyticsLoaded = false;
    });
    void loadAdminTrend().then((ok) => {
      if (!ok) adminAnalyticsLoaded = false;
    });
    adminAnalyticsLoaded = true;
  }
}

function buildPlanCard({ title, price, limit, features, ctaText, tier }) {
  const card = document.createElement('div');
  card.className = 'plan-card';
  const pill = document.createElement('div');
  pill.className = 'plan-pill';
  pill.textContent = tier === 'pro' ? 'Most popular' : 'Included';
  const h4 = document.createElement('h4');
  h4.textContent = title;
  const priceEl = document.createElement('div');
  priceEl.className = 'plan-price';
  priceEl.textContent = price;
  const limitEl = document.createElement('div');
  limitEl.className = 'muted small';
  limitEl.textContent = `${limit} tracked emails / month`;
  const ul = document.createElement('ul');
  ul.className = 'plan-features';
  features.forEach((feat) => {
    const li = document.createElement('li');
    li.textContent = feat;
    ul.appendChild(li);
  });
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = tier === 'pro' ? 'btn btn--primary btn--sm' : 'btn btn--ghost btn--sm';
  btn.textContent = ctaText;
  btn.addEventListener('click', () => {
    if (tier === 'pro') {
      requestUpgrade();
    } else {
      closeModal('confirm');
    }
  });
  card.append(pill, h4, priceEl, limitEl, ul, btn);
  return card;
}

function openPricingModal() {
  const container = document.createElement('div');
  container.className = 'plan-card-grid';
  const freeCard = buildPlanCard({
    title: 'Free',
    price: '$0 / month',
    limit: PLAN_LIMITS.free,
    features: [
      'Automatic tracking',
      'Application timelines',
      'Dashboard updates'
    ],
    ctaText: 'Stay on Free',
    tier: 'free'
  });
  const proCard = buildPlanCard({
    title: 'Pro',
    price: '$4 / month',
    limit: PLAN_LIMITS.pro,
    features: [
      'Up to 500 tracked emails / month',
      'Everything in Free',
      'Higher limits for active searches'
    ],
    ctaText: 'Upgrade to Pro',
    tier: 'pro'
  });
  container.append(freeCard, proCard);

  const body = document.createElement('div');
  body.appendChild(container);
  const footer = document.createElement('div');
  footer.className = 'modal-footer-actions';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn--ghost btn--sm';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => closeModal('cancel'));
  footer.appendChild(closeBtn);

  openModal({
    title: 'Pricing',
    description: 'Fair, transparent plans. Upgrade when you need more volume.',
    body,
    footer,
    allowBackdropClose: true
  });
}

async function refreshPlanUsage() {
  try {
    const data = await api('/api/account/plan');
    planState = data;
    if (sessionUser) {
      sessionUser.plan_tier = data.plan_tier;
      sessionUser.plan_status = data.plan_status;
      sessionUser.plan_limit = data.monthly_tracked_email_limit;
      sessionUser.plan_usage = data.tracked_email_count_current_month;
      sessionUser.plan_bucket = data.tracked_email_month_bucket;
      sessionUser.plan_global_blocked = data.global_blocked;
    }
    renderPlanUsage(sessionUser);

    if (data.global_blocked && !planNoticeShown.global) {
      planNoticeShown.global = true;
      showNotice('Free tracking is temporarily at capacity this month.', 'Tracking paused for Free');
    } else if (data.at_limit && !planNoticeShown.atLimit) {
      planNoticeShown.atLimit = true;
      showNotice(
        `You reached your monthly tracking limit (${data.tracked_email_count_current_month} of ${data.monthly_tracked_email_limit}). Upgrade to keep tracking new updates this month.`,
        'Tracking limit reached'
      );
    }
  } catch (err) {
    if (DEBUG_APP) {
      // eslint-disable-next-line no-console
      console.debug('[plan] refresh failed', err);
    }
  }
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
        syncAccountAvatarIdentity(sessionUser);
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
  syncAccountAvatarIdentity(sessionUser);
  updateAdminAnalyticsVisibility();
  updateFilterSummary();
  addToggle?.setAttribute('aria-expanded', 'false');
  void refreshPlanUsage();

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
  if (!isInternalGmailMode()) {
    await refreshInboundStatus({ ensureAddress: true });
  } else {
    inboundState.diagnosticsAdmin = false;
    updateInboundDiagnosticsVisibility();
    updateInboundStatusPresentation();
    updateSyncHelperText();
  }
  return true;
}

async function loadActiveApplications() {
  await refreshTable();
}

async function refreshTable() {
  if (!applicationsTable) {
    return;
  }
  const fetchPage = async (offset) => {
    const params = buildListParams();
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    const data = await api(`/api/applications?${params.toString()}`);
    const apps = normalizeApplicationsList(data);
    return {
      data,
      apps,
      total: Number(data?.total ?? apps.length ?? 0)
    };
  };
  const getLastPageOffset = (total) => {
    if (!total || total <= 0) {
      return 0;
    }
    return Math.floor((total - 1) / PAGE_SIZE) * PAGE_SIZE;
  };
  setTablePaginationLoading(true);
  try {
    applicationsTable.classList.remove('hidden');
    const pagination = document.getElementById('table-pagination');
    if (pagination) {
      pagination.classList.remove('hidden');
    }
    let page = await fetchPage(state.table.offset);
    let total = page.total;
    let apps = page.apps;
    const lastValidOffset = getLastPageOffset(total);

    // Deletions can shrink total pages; clamp to the last valid page and refetch.
    if (state.table.offset > lastValidOffset) {
      state.table.offset = lastValidOffset;
      page = await fetchPage(state.table.offset);
      total = page.total;
      apps = page.apps;
    } else if (!total && state.table.offset !== 0) {
      state.table.offset = 0;
    }

    const data = page.data;
    if (DEBUG_AUTH) {
      // eslint-disable-next-line no-console
      console.debug('[apps] table response', {
        status: data?.status,
        type: typeof data,
        isArray: Array.isArray(data)
      });
    }
    state.table.total = total;
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
  const fetchPage = async (offset) => {
    const params = buildListParams({
      status: state.archived.filters.status,
      company: state.archived.filters.company,
      role: state.archived.filters.role
    });
    params.set('archived', '1');
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    const data = await api(`/api/applications?${params.toString()}`);
    const apps = normalizeApplicationsList(data);
    return {
      data,
      apps,
      total: Number(data?.total ?? apps.length ?? 0)
    };
  };
  const getLastPageOffset = (total) => {
    if (!total || total <= 0) {
      return 0;
    }
    return Math.floor((total - 1) / PAGE_SIZE) * PAGE_SIZE;
  };
  let page = await fetchPage(state.archived.offset);
  let total = page.total;
  let apps = page.apps;
  const lastValidOffset = getLastPageOffset(total);

  if (state.archived.offset > lastValidOffset) {
    state.archived.offset = lastValidOffset;
    page = await fetchPage(state.archived.offset);
    total = page.total;
    apps = page.apps;
  } else if (!total && state.archived.offset !== 0) {
    state.archived.offset = 0;
  }

  const data = page.data;
  if (DEBUG_AUTH) {
    // eslint-disable-next-line no-console
    console.debug('[apps] archived response', {
      status: data?.status,
      type: typeof data,
      isArray: Array.isArray(data)
    });
  }
  state.archived.total = total;
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

function applyInboundStatusPayload(data = {}) {
  inboundState.addressEmail = data.address_email || null;
  inboundState.preferredAddressEmail = data.preferred_address_email || null;
  inboundState.inboxUsername = data.inbox_username || sessionUser?.inbox_username || null;
  inboundState.isActive = Boolean(data.is_active);
  inboundState.confirmedAt = data.confirmed_at || null;
  inboundState.lastReceivedAt = data.last_received_at || null;
  inboundState.lastReceivedSubject = data.last_received_subject || null;
  inboundState.messageCount7d = Number.isFinite(Number(data.message_count_7d))
    ? Number(data.message_count_7d)
    : 0;
  inboundState.pendingCount = Number.isFinite(Number(data.inbound_pending_count))
    ? Math.max(0, Number(data.inbound_pending_count))
    : 0;
  inboundState.signalUpdatedAt = data.inbound_signal_updated_at || null;
  inboundState.signalLastInboundAt = data.inbound_signal_last_inbound_at || null;
  inboundState.signalLastSubject = data.inbound_signal_last_subject || null;
  inboundState.inactiveAddressWarning = Boolean(data.inactive_address_warning);
  inboundState.inactiveAddressWarningMeta = data.inactive_address_warning_meta || null;
  inboundState.setupState = resolveInboundSetupState(data.setup_state || 'not_started', {
    addressEmail: data.address_email || null,
    confirmedAt: data.confirmed_at || null,
    lastReceivedAt: data.last_received_at || null
  });
  inboundState.gmailVerification = data.gmail_forwarding_verification
    ? {
        receivedAt: data.gmail_forwarding_verification.received_at || null,
        subject: data.gmail_forwarding_verification.subject || null,
        confirmationUrl: data.gmail_forwarding_verification.confirmation_url || null,
        confirmationCode: data.gmail_forwarding_verification.confirmation_code || null
      }
    : null;
  inboundState.addressReachable = Boolean(data.address_reachable || data.last_received_at);
  inboundState.hasNonVerificationInbound = Boolean(data.has_non_verification_inbound);
  inboundState.gmailVerificationPending = Boolean(data.gmail_verification_pending);
  inboundState.forwardingReadiness = resolveForwardingReadiness(data.forwarding_readiness || '', {
    setupState: inboundState.setupState,
    lastReceivedAt: inboundState.lastReceivedAt,
    hasNonVerificationInbound: inboundState.hasNonVerificationInbound,
    gmailVerificationPending: inboundState.gmailVerificationPending
  });
  inboundState.connected = Boolean(data.connected);
  inboundState.effectiveConnected = Boolean(data.effective_connected);
  inboundState.lastInboundSyncAt = data.last_inbound_sync_at || null;
  inboundState.lastInboundSync = data.last_inbound_sync || null;
  if (sessionUser && inboundState.inboxUsername && !sessionUser.inbox_username) {
    sessionUser.inbox_username = inboundState.inboxUsername;
  }
  updateInboundStatusPresentation();
  updateSyncHelperText();
  updateInboundDiagnosticsVisibility();
}

async function refreshInboundStatus({ ensureAddress = true } = {}) {
  if (isInternalGmailMode()) {
    clearInboundAutoSyncPolling();
    updateInboundStatusPresentation();
    updateSyncHelperText();
    return;
  }
  const endpoint = ensureAddress ? '/api/inbound/address' : '/api/inbound/status';
  try {
    const data = await api(endpoint);
    applyInboundStatusPayload(data || {});
  } catch (err) {
    inboundState.addressEmail = null;
    inboundState.preferredAddressEmail = null;
    inboundState.inboxUsername = sessionUser?.inbox_username || null;
    inboundState.isActive = false;
    inboundState.forwardingReadiness = 'not_started';
    inboundState.addressReachable = false;
    inboundState.hasNonVerificationInbound = false;
    inboundState.gmailVerificationPending = false;
    inboundState.gmailVerification = null;
    inboundState.confirmedAt = null;
    inboundState.lastReceivedAt = null;
    inboundState.lastReceivedSubject = null;
    inboundState.messageCount7d = 0;
    inboundState.pendingCount = 0;
    inboundState.signalUpdatedAt = null;
    inboundState.signalLastInboundAt = null;
    inboundState.signalLastSubject = null;
    inboundState.inactiveAddressWarning = false;
    inboundState.inactiveAddressWarningMeta = null;
    inboundState.setupState = 'not_started';
    inboundState.connected = false;
    inboundState.effectiveConnected = false;
    inboundState.lastInboundSyncAt = null;
    inboundState.lastInboundSync = null;
    updateInboundStatusPresentation();
    updateSyncHelperText();
  }
  syncInboundAutoPolling();
}

function updateInboundDiagnosticsVisibility() {
  if (!inboundDiagnosticsWrap) {
    return;
  }
  inboundDiagnosticsWrap.classList.toggle('hidden', !inboundState.diagnosticsAdmin);
}

async function refreshInboundDiagnosticsAccess() {
  if (isInternalGmailMode()) {
    inboundState.diagnosticsAdmin = false;
    updateInboundDiagnosticsVisibility();
    return;
  }
  if (!sessionUser) {
    inboundState.diagnosticsAdmin = false;
    updateInboundDiagnosticsVisibility();
    return;
  }
  try {
    await api('/api/inbound/recent?limit=1');
    inboundState.diagnosticsAdmin = true;
  } catch (err) {
    inboundState.diagnosticsAdmin = false;
  }
  updateInboundDiagnosticsVisibility();
}

function clearInboundAutoSyncPolling() {
  if (inboundAutoSyncState.timer) {
    window.clearInterval(inboundAutoSyncState.timer);
    inboundAutoSyncState.timer = null;
  }
}

function routeIsDashboard() {
  const routeKey = getCurrentRouteKey();
  return !routeKey || routeKey === 'dashboard';
}

function hasNewInboundSinceLastSync() {
  if (Number(inboundState.pendingCount || 0) > 0) {
    return true;
  }
  const receivedMs = Date.parse(inboundState.lastReceivedAt || '');
  if (!Number.isFinite(receivedMs)) {
    return false;
  }
  const lastSyncedMs = Date.parse(inboundState.lastInboundSyncAt || '');
  if (!Number.isFinite(lastSyncedMs)) {
    return true;
  }
  return receivedMs > lastSyncedMs;
}

async function pollInboundStatusForAutoSync() {
  if (!routeIsDashboard() || !sessionUser) {
    clearInboundAutoSyncPolling();
    return;
  }
  if (isInternalGmailMode()) {
    clearInboundAutoSyncPolling();
    return;
  }
  if (document.hidden) {
    return;
  }
  if (inboundAutoSyncState.inFlight) {
    return;
  }
  try {
    await refreshInboundStatus({ ensureAddress: false });
    if (!isForwardingActive()) {
      return;
    }
    if (!hasNewInboundSinceLastSync()) {
      return;
    }
    const pendingCount = Math.max(0, Number(inboundState.pendingCount || 0));
    const signalStamp =
      inboundState.signalUpdatedAt || inboundState.signalLastInboundAt || inboundState.lastReceivedAt || '';
    const receivedAt = inboundState.lastReceivedAt || '';
    if (signalStamp && inboundAutoSyncState.lastTriggeredSignalAt === signalStamp && pendingCount <= 0) {
      return;
    }
    if (!receivedAt && pendingCount <= 0) {
      return;
    }
    const nowMs = Date.now();
    if (nowMs - inboundAutoSyncState.lastAutoSyncAt < INBOUND_AUTO_SYNC_DEBOUNCE_MS) {
      return;
    }
    inboundAutoSyncState.lastTriggeredSignalAt = signalStamp || null;
    inboundAutoSyncState.lastTriggeredReceivedAt = receivedAt;
    inboundAutoSyncState.lastAutoSyncAt = nowMs;
    if (nowMs - inboundAutoSyncState.lastToastAt > 4000) {
      const toastMessage =
        pendingCount > 1
          ? `${pendingCount} new inbox updates received — syncing…`
          : 'New inbox update received — syncing…';
      showToast(toastMessage, { tone: 'info' });
      inboundAutoSyncState.lastToastAt = nowMs;
    }
    await refreshForwardingInbox({ autoTriggered: true, pendingCountHint: pendingCount });
  } catch (err) {
    if (DEBUG_APP) {
      // eslint-disable-next-line no-console
      console.debug('[inbound-auto-sync] poll failed', err);
    }
  }
}

function syncInboundAutoPolling() {
  if (isInternalGmailMode()) {
    clearInboundAutoSyncPolling();
    return;
  }
  const shouldPoll =
    Boolean(sessionUser) &&
    routeIsDashboard() &&
    !document.hidden &&
    (hasForwardingAddress() || inboundState.setupState !== 'not_started');
  if (!shouldPoll) {
    clearInboundAutoSyncPolling();
    return;
  }
  if (inboundAutoSyncState.timer) {
    return;
  }
  void pollInboundStatusForAutoSync();
  inboundAutoSyncState.timer = window.setInterval(() => {
    void pollInboundStatusForAutoSync();
  }, INBOUND_AUTO_SYNC_INTERVAL_MS);
}

const FORWARDING_FILTER_QUERY =
  '(subject:(application OR interview OR offer OR rejection) OR from:(workday OR greenhouse OR lever OR icims OR smartrecruiters OR workablemail OR linkedin.com))';

const OUTLOOK_FORWARDING_HELP = [
  'Outlook (optional): Settings → Mail → Forwarding.',
  'Add your Applictus address and save.',
  'You can add a rule later to narrow to job updates.'
].join('\n');

const GMAIL_SETUP_SCREENSHOTS = {
  sc1: '/applictus_setup_sc1.png',
  sc2: '/applictus_setup_sc2.png',
  sc3: '/applictus_setup_sc3.png',
  sc35: '/applictus_setup_sc3.5.png',
  sc4: '/applictus_setup_sc4.png',
  sc5: '/applictus_setup_sc5.png',
  sc6: '/applictus_setup_sc6.png'
};

function waitForMs(durationMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, Number(durationMs) || 0));
  });
}

function buildForwardingTestMailto(addressEmail) {
  const target = String(addressEmail || '').trim();
  if (!target) {
    return '';
  }
  const subject = encodeURIComponent('Applictus test');
  const body = encodeURIComponent('This is a forwarding test email for Applictus.');
  return `mailto:${encodeURIComponent(target)}?subject=${subject}&body=${body}`;
}

function createForwardingCollapsible({ title, open = false } = {}) {
  const details = document.createElement('details');
  details.className = 'forwarding-collapsible';
  details.open = Boolean(open);
  const summary = document.createElement('summary');
  summary.textContent = String(title || 'Details');
  const body = document.createElement('div');
  body.className = 'forwarding-collapsible-body';
  details.append(summary, body);
  return { details, body };
}

async function copyTextToClipboard(text, successMessage) {
  const value = String(text || '').trim();
  if (!value) {
    return false;
  }
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const input = document.createElement('textarea');
      input.value = value;
      input.setAttribute('readonly', 'true');
      input.style.position = 'absolute';
      input.style.left = '-9999px';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    if (successMessage) {
      showToast(successMessage, { tone: 'success' });
    }
    return true;
  } catch (err) {
    showToast('Unable to copy. Please copy manually.', { tone: 'warning' });
    return false;
  }
}

function renderInboundSetupHeaderAddressPanel() {
  if (!modalRoot || !modalHeader || !modalRoot.classList.contains('modal--inbound-setup')) {
    return;
  }
  let panel = modalHeader.querySelector('.inbound-setup-header-address');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'inbound-setup-header-address';
    panel.dataset.modalTransient = 'true';

    const label = document.createElement('div');
    label.className = 'inbound-setup-header-label muted small';
    label.textContent = 'Your Applictus inbox address';

    const row = document.createElement('div');
    row.className = 'inbound-setup-header-row';

    const code = document.createElement('code');
    code.className = 'inbound-setup-header-code';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn btn--ghost btn--sm inbound-setup-header-copy';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      void copyTextToClipboard(inboundState.addressEmail, 'Copied forwarding address');
    });

    row.append(code, copyBtn);
    panel.append(label, row);
    modalHeader.appendChild(panel);
  }

  const code = panel.querySelector('.inbound-setup-header-code');
  const copyBtn = panel.querySelector('.inbound-setup-header-copy');
  if (code) {
    code.textContent = inboundState.addressEmail || 'Loading…';
  }
  if (copyBtn) {
    copyBtn.disabled = !inboundState.addressEmail;
  }
}

function registerInboundSetupCleanup(setupContext, cleanupFn) {
  if (!setupContext || typeof cleanupFn !== 'function') {
    return;
  }
  if (!Array.isArray(setupContext.cleanupFns)) {
    setupContext.cleanupFns = [];
  }
  setupContext.cleanupFns.push(cleanupFn);
}

function buildForwardingTutorialFrame({ imageSrc, imageAlt, caption, trimBottom = false } = {}) {
  const frame = document.createElement('figure');
  frame.className = 'forwarding-tutorial-frame';
  if (trimBottom) {
    frame.classList.add('forwarding-tutorial-frame--trim-bottom');
  }

  const imageWrap = document.createElement('div');
  imageWrap.className = 'forwarding-tutorial-frame-image';
  const image = document.createElement('img');
  image.src = imageSrc || '';
  image.alt = imageAlt || 'Gmail setup screenshot';
  image.loading = 'lazy';
  image.decoding = 'async';
  imageWrap.appendChild(image);

  frame.append(imageWrap);
  if (caption) {
    const captionNode = document.createElement('figcaption');
    captionNode.className = 'forwarding-tutorial-caption muted small';
    captionNode.textContent = caption;
    frame.appendChild(captionNode);
  }
  return frame;
}

function buildForwardingAnimatedTutorial({
  frames = [],
  caption = '',
  setupContext,
  intervalMs = 1600,
  frameDurationMs = null,
  finalPauseMs = 2500,
  completionLabel = 'Done'
} = {}) {
  const card = document.createElement('div');
  card.className = 'forwarding-tutorial-sequence';

  const viewport = document.createElement('div');
  viewport.className = 'forwarding-tutorial-sequence-viewport';

  const frameNodes = frames
    .map((frame, index) => {
      const node = document.createElement('img');
      node.className = 'forwarding-tutorial-sequence-frame';
      node.src = frame?.src || '';
      node.alt = frame?.alt || `Gmail setup step ${index + 1}`;
      node.loading = index === 0 ? 'eager' : 'lazy';
      node.decoding = 'async';
      viewport.appendChild(node);
      return node;
    })
    .filter(Boolean);

  const highlightNodes = frames.map((frame) => {
    const highlight = frame?.highlight;
    if (!highlight || !Number.isFinite(highlight.x) || !Number.isFinite(highlight.y)) {
      return null;
    }
    const node = document.createElement('span');
    node.className = 'forwarding-tutorial-sequence-highlight';
    node.style.left = `${highlight.x}%`;
    node.style.top = `${highlight.y}%`;
    node.style.width = `${Math.max(8, Number(highlight.w) || 22)}%`;
    node.style.height = `${Math.max(8, Number(highlight.h) || 14)}%`;
    if (highlight.shape) {
      node.dataset.shape = String(highlight.shape);
    }
    viewport.appendChild(node);
    return node;
  });

  const completeBadge = document.createElement('div');
  completeBadge.className = 'forwarding-tutorial-sequence-complete';
  completeBadge.innerHTML = '<span aria-hidden="true">✓</span><span></span>';
  const completeLabel = completeBadge.querySelector('span:last-child');
  if (completeLabel) {
    completeLabel.textContent = String(completionLabel || 'Done');
  }
  viewport.appendChild(completeBadge);

  const meta = document.createElement('div');
  meta.className = 'forwarding-tutorial-sequence-meta';

  const dots = document.createElement('div');
  dots.className = 'forwarding-tutorial-sequence-dots';
  const dotNodes = frameNodes.map((_, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'forwarding-tutorial-sequence-dot';
    dot.setAttribute('aria-label', `Show step ${index + 1}`);
    dot.setAttribute('title', `Step ${index + 1}`);
    dot.dataset.index = String(index);
    dots.appendChild(dot);
    return dot;
  });
  if (dotNodes.length > 1) {
    meta.appendChild(dots);
  }

  const counter = document.createElement('span');
  counter.className = 'forwarding-tutorial-sequence-counter muted small';
  counter.textContent = frameNodes.length > 0 ? `1 / ${frameNodes.length}` : '';
  meta.appendChild(counter);

  const captionNode = document.createElement('p');
  captionNode.className = 'forwarding-tutorial-caption forwarding-tutorial-caption--frame muted small';
  captionNode.setAttribute('aria-live', 'polite');

  card.append(viewport);
  if (frameNodes.length > 1) {
    card.appendChild(meta);
  }
  if (caption || frames.some((frame) => frame?.caption)) {
    card.appendChild(captionNode);
  }

  let activeIndex = 0;
  let paused = false;
  let complete = false;
  let timer = null;
  let transitionTimer = null;

  const baseFrameDurationMs = Math.max(1600, Number(frameDurationMs ?? intervalMs) || 1850);
  const finalFramePauseMs = Math.max(2300, Number(finalPauseMs) || 2500);

  const getFrameCaption = (index) => {
    const frameCaption = frames[index]?.caption;
    return String(frameCaption || caption || '').trim();
  };

  const setCaption = (text) => {
    if (!captionNode) {
      return;
    }
    const nextText = String(text || '').trim();
    if (captionNode.textContent === nextText && captionNode.classList.contains('is-visible')) {
      return;
    }
    if (transitionTimer) {
      window.clearTimeout(transitionTimer);
      transitionTimer = null;
    }
    captionNode.classList.remove('is-visible');
    transitionTimer = window.setTimeout(() => {
      captionNode.textContent = nextText;
      captionNode.classList.add('is-visible');
      transitionTimer = null;
    }, 120);
  };

  const applyFrameState = () => {
    frameNodes.forEach((node, index) => {
      node.classList.toggle('is-active', index === activeIndex);
    });
    highlightNodes.forEach((node, index) => {
      if (!node) {
        return;
      }
      node.classList.toggle('is-active', index === activeIndex);
    });
    dotNodes.forEach((node, index) => {
      node.classList.toggle('is-active', index === activeIndex);
      node.setAttribute('aria-pressed', index === activeIndex ? 'true' : 'false');
    });
    if (counter) {
      counter.textContent = frameNodes.length ? `${activeIndex + 1} / ${frameNodes.length}` : '';
    }
    setCaption(getFrameCaption(activeIndex));
    completeBadge.classList.toggle('is-visible', complete && activeIndex === frameNodes.length - 1);
    card.classList.toggle('is-complete', complete);
  };

  const clearPlaybackTimer = () => {
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  const stop = () => {
    clearPlaybackTimer();
    if (transitionTimer) {
      window.clearTimeout(transitionTimer);
      transitionTimer = null;
    }
  };

  const scheduleNext = () => {
    clearPlaybackTimer();
    if (paused || complete || frameNodes.length < 2) {
      return;
    }
    const delayMs = activeIndex >= frameNodes.length - 1 ? finalFramePauseMs : baseFrameDurationMs;
    timer = window.setTimeout(() => {
      if (paused || complete) {
        return;
      }
      if (activeIndex >= frameNodes.length - 1) {
        complete = true;
        applyFrameState();
        return;
      }
      activeIndex += 1;
      applyFrameState();
      scheduleNext();
    }, delayMs);
  };

  const start = (restart = false) => {
    if (frameNodes.length < 2) {
      return;
    }
    if (restart) {
      activeIndex = 0;
      complete = false;
      applyFrameState();
    }
    scheduleNext();
  };

  const onMouseEnter = () => {
    paused = true;
    clearPlaybackTimer();
  };
  const onMouseLeave = () => {
    paused = false;
    scheduleNext();
  };
  const onClickAdvance = () => {
    if (frameNodes.length < 2) {
      return;
    }
    if (activeIndex >= frameNodes.length - 1) {
      start(true);
      return;
    }
    complete = false;
    activeIndex += 1;
    applyFrameState();
    scheduleNext();
  };

  viewport.addEventListener('mouseenter', onMouseEnter);
  viewport.addEventListener('mouseleave', onMouseLeave);
  viewport.addEventListener('click', onClickAdvance);
  const dotClickHandlers = [];
  dotNodes.forEach((dot) => {
    const handleDotClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const index = Number(dot.dataset.index);
      if (!Number.isFinite(index) || index < 0 || index >= frameNodes.length) {
        return;
      }
      activeIndex = index;
      complete = activeIndex >= frameNodes.length - 1;
      applyFrameState();
      if (!complete) {
        scheduleNext();
      } else {
        clearPlaybackTimer();
      }
    };
    dotClickHandlers.push(handleDotClick);
    dot.addEventListener('click', handleDotClick);
  });

  registerInboundSetupCleanup(setupContext, () => {
    stop();
    viewport.removeEventListener('mouseenter', onMouseEnter);
    viewport.removeEventListener('mouseleave', onMouseLeave);
    viewport.removeEventListener('click', onClickAdvance);
    dotNodes.forEach((dot, index) => {
      const handler = dotClickHandlers[index];
      if (handler) {
        dot.removeEventListener('click', handler);
      }
    });
  });

  complete = false;
  applyFrameState();
  start();
  return card;
}

function buildForwardingTutorialStepCard({ stepNumber, title, description, mediaNode } = {}) {
  const card = document.createElement('article');
  card.className = 'forwarding-tutorial-step-card';

  const header = document.createElement('div');
  header.className = 'forwarding-tutorial-step-head';

  const badge = document.createElement('span');
  badge.className = 'forwarding-tutorial-step-badge';
  badge.textContent = Number.isFinite(Number(stepNumber)) ? String(stepNumber) : '•';

  const meta = document.createElement('div');
  meta.className = 'forwarding-tutorial-step-meta';

  const label = document.createElement('div');
  label.className = 'forwarding-tutorial-step-label';
  label.textContent = Number.isFinite(Number(stepNumber)) ? `STEP ${stepNumber}` : 'STEP';

  const heading = document.createElement('h6');
  heading.className = 'forwarding-tutorial-step-title';
  heading.textContent = title || 'Next step';

  meta.append(label, heading);
  if (description) {
    const desc = document.createElement('p');
    desc.className = 'forwarding-tutorial-step-desc muted small';
    desc.textContent = description;
    meta.appendChild(desc);
  }

  header.append(badge, meta);
  card.appendChild(header);

  if (mediaNode) {
    const mediaWrap = document.createElement('div');
    mediaWrap.className = 'forwarding-tutorial-step-media';
    mediaWrap.appendChild(mediaNode);
    card.appendChild(mediaWrap);
  }

  return card;
}

function appendForwardingVerificationHelper(target) {
  if (!target) {
    return false;
  }
  const verificationData = inboundState.gmailVerification || null;
  const hasVerificationEmail =
    Boolean(verificationData?.receivedAt) ||
    /gmail forwarding confirmation/i.test(String(inboundState.lastReceivedSubject || ''));
  if (!hasVerificationEmail) {
    return false;
  }
  const helper = document.createElement('div');
  helper.className = 'forwarding-verification-helper';

  const verifiedNote = document.createElement('div');
  verifiedNote.className = 'forwarding-connected-note';
  verifiedNote.textContent = 'We received a forwarding confirmation email ✓';
  helper.appendChild(verifiedNote);

  const helperTitle = document.createElement('div');
  helperTitle.className = 'muted small';
  helperTitle.textContent = 'Finish Gmail verification from the message Gmail sent to your Applictus address.';
  helper.appendChild(helperTitle);

  const helperActions = document.createElement('div');
  helperActions.className = 'forwarding-step-actions';
  if (verificationData?.confirmationUrl) {
    const openVerification = document.createElement('a');
    openVerification.className = 'btn btn--secondary btn--sm';
    openVerification.href = verificationData.confirmationUrl;
    openVerification.target = '_blank';
    openVerification.rel = 'noopener noreferrer';
    openVerification.textContent = 'Open verification link';
    helperActions.appendChild(openVerification);
  }
  if (verificationData?.confirmationCode) {
    const copyCode = document.createElement('button');
    copyCode.type = 'button';
    copyCode.className = 'btn btn--ghost btn--sm';
    copyCode.textContent = 'Copy confirmation code';
    copyCode.addEventListener('click', () => {
      void copyTextToClipboard(verificationData.confirmationCode, 'Copied confirmation code');
    });
    helperActions.appendChild(copyCode);
  }
  if (helperActions.children.length) {
    helper.appendChild(helperActions);
  }
  target.appendChild(helper);
  return true;
}

function buildInboundSetupStep(step, setStep, setupContext) {
  const container = document.createElement('div');
  container.className = 'forwarding-setup-step';
  const progress = document.createElement('div');
  progress.className = 'forwarding-setup-progress muted small';
  progress.textContent = `Step ${step + 1} of 2`;
  container.appendChild(progress);

  if (step === 0) {
    const title = document.createElement('h4');
    title.textContent = 'Add your Applictus inbox to Gmail';
    const note = document.createElement('p');
    note.className = 'muted small';
    note.textContent = 'This is a one-time setup. After that, Applictus stays up to date automatically.';

    const tutorial = document.createElement('section');
    tutorial.className = 'forwarding-gmail-tutorial';
    const tutorialTitle = document.createElement('h5');
    tutorialTitle.textContent = 'What this looks like in Gmail';
    tutorial.appendChild(tutorialTitle);

    const navigationCard = buildForwardingTutorialStepCard({
      stepNumber: 1,
      title: 'Open Gmail settings',
      description: "Click the settings icon and select 'See all settings'.",
      mediaNode: buildForwardingTutorialFrame({
        imageSrc: GMAIL_SETUP_SCREENSHOTS.sc1,
        imageAlt: 'Open Gmail settings from quick settings menu.',
        trimBottom: true
      })
    });

    const forwardingTabCard = buildForwardingTutorialStepCard({
      stepNumber: 2,
      title: 'Go to Forwarding and POP/IMAP',
      description: "Click 'Add a forwarding address'.",
      mediaNode: buildForwardingTutorialFrame({
        imageSrc: GMAIL_SETUP_SCREENSHOTS.sc2,
        imageAlt: 'Go to Forwarding and POP/IMAP and click Add a forwarding address.',
        trimBottom: true
      })
    });

    const addAddressCard = buildForwardingTutorialStepCard({
      stepNumber: 3,
      title: 'Add your Applictus inbox address',
      description: 'Paste your address and continue. Gmail sends a one-time confirmation.',
      mediaNode: buildForwardingAnimatedTutorial({
        setupContext,
        frameDurationMs: 1850,
        finalPauseMs: 2600,
        completionLabel: 'Address added',
        frames: [
          {
            src: GMAIL_SETUP_SCREENSHOTS.sc3,
            alt: 'Forwarding modal ready for entering an inbox address.',
            caption: 'Open the add forwarding address dialog.'
          },
          {
            src: GMAIL_SETUP_SCREENSHOTS.sc35,
            alt: 'Forwarding modal with the Applictus inbox address entered.',
            caption: 'Paste your Applictus inbox address.'
          },
          {
            src: GMAIL_SETUP_SCREENSHOTS.sc4,
            alt: 'Gmail confirmation sent dialog after adding forwarding address.',
            caption: 'Gmail sends a one-time confirmation.'
          }
        ]
      })
    });

    tutorial.append(navigationCard, forwardingTabCard, addAddressCard);
    appendForwardingVerificationHelper(tutorial);

    container.append(title, note, tutorial);
    return container;
  }

  const title = document.createElement('h4');
  title.textContent = 'Verify your setup';
  const note = document.createElement('p');
  note.className = 'muted small';
  note.textContent = 'Forward one recent job email or send a quick test email, then verify.';

  const checklist = document.createElement('ol');
  checklist.className = 'forwarding-steps-list';
  checklist.innerHTML = `
    <li>Forward a real application update or send a test email to your Applictus inbox.</li>
    <li>Click Verify setup. We check for new forwarded mail automatically.</li>
  `;

  const forwardingSelectionBlock = buildForwardingTutorialStepCard({
    stepNumber: 4,
    title: 'Paste it in forwarding',
    description: 'After Gmail confirms it, paste your Applictus inbox in the forwarding entry box.',
    mediaNode: buildForwardingAnimatedTutorial({
      setupContext,
      frameDurationMs: 1850,
      finalPauseMs: 2500,
      completionLabel: 'Forwarding selected',
      frames: [
        {
          src: GMAIL_SETUP_SCREENSHOTS.sc5,
          alt: 'Forwarding settings before selecting Applictus inbox address.',
          caption: 'Open Forwarding and choose “Forward a copy of incoming mail to”.'
        },
        {
          src: GMAIL_SETUP_SCREENSHOTS.sc6,
          alt: 'Forwarding settings with Applictus inbox selected.',
          caption: 'Paste your Applictus inbox in the forwarding field.'
        }
      ]
    })
  });

  const actions = document.createElement('div');
  actions.className = 'forwarding-step-actions forwarding-verify-actions';
  const verifyBtn = document.createElement('button');
  verifyBtn.type = 'button';
  verifyBtn.className = 'btn btn--primary btn--sm';
  verifyBtn.textContent = setupContext?.verified
    ? 'Verified'
    : setupContext?.verifying
      ? 'Checking…'
      : 'Verify setup';
  verifyBtn.disabled = Boolean(setupContext?.verifying || setupContext?.verified);
  verifyBtn.addEventListener('click', () => {
    if (!setupContext || typeof setupContext.runVerificationCheck !== 'function') {
      return;
    }
    void setupContext.runVerificationCheck();
  });

  const sendTestBtn = document.createElement('button');
  sendTestBtn.type = 'button';
  sendTestBtn.className = 'btn btn--secondary btn--sm';
  sendTestBtn.textContent = 'Send test email';
  sendTestBtn.disabled = !inboundState.addressEmail || setupContext?.verifying;
  sendTestBtn.addEventListener('click', () => {
    const mailto = buildForwardingTestMailto(inboundState.addressEmail);
    if (!mailto) {
      return;
    }
    window.location.href = mailto;
  });
  actions.append(verifyBtn, sendTestBtn);

  container.append(title, note, checklist, actions, forwardingSelectionBlock);

  if (setupContext?.verifyMessage) {
    const verifyMessage = document.createElement('p');
    verifyMessage.className = 'forwarding-verify-message muted small';
    verifyMessage.textContent = setupContext.verifyMessage;
    container.appendChild(verifyMessage);
  }

  if (setupContext?.verified || isForwardingActive()) {
    const connected = document.createElement('div');
    connected.className = 'forwarding-connected-note';
    connected.textContent = 'Connected ✓ Your Applictus inbox is ready.';
    container.appendChild(connected);
  }

  const filterPanel = createForwardingCollapsible({
    title: 'Optional: forward only job emails',
    open: false
  });
  const filterIntro = document.createElement('p');
  filterIntro.className = 'muted small';
  filterIntro.textContent = 'Recommended so Applictus only receives application-related messages.';
  const filterSnippet = document.createElement('pre');
  filterSnippet.className = 'forwarding-filter-snippet';
  filterSnippet.textContent = FORWARDING_FILTER_QUERY;
  const filterActions = document.createElement('div');
  filterActions.className = 'forwarding-step-actions';
  const copyFilterBtn = document.createElement('button');
  copyFilterBtn.type = 'button';
  copyFilterBtn.className = 'btn btn--ghost btn--sm';
  copyFilterBtn.textContent = 'Copy filter query';
  copyFilterBtn.addEventListener('click', () => {
    void copyTextToClipboard(FORWARDING_FILTER_QUERY, 'Copied filter query');
  });
  filterActions.append(copyFilterBtn);
  filterPanel.body.append(filterIntro, filterSnippet, filterActions);
  container.appendChild(filterPanel.details);

  const outlookPanel = createForwardingCollapsible({
    title: 'Using Outlook instead?',
    open: false
  });
  const outlookSnippet = document.createElement('pre');
  outlookSnippet.className = 'forwarding-filter-snippet';
  outlookSnippet.textContent = OUTLOOK_FORWARDING_HELP;
  outlookPanel.body.append(outlookSnippet);
  container.appendChild(outlookPanel.details);

  return container;
}

function openInboundSetupModal({ startStep = 0 } = {}) {
  if (isInternalGmailMode()) {
    void startGmailConnectFlow().catch((err) => {
      showNotice(err.message || 'Unable to connect Gmail', 'Connect Gmail');
    });
    return;
  }
  let currentStep = Math.max(0, Math.min(1, Number(startStep) || 0));
  const initialReadiness = resolveForwardingReadiness();
  const initialVerifyMessage =
    initialReadiness === 'forwarding_active'
      ? 'Forwarding is active.'
      : initialReadiness === 'gmail_verification_pending'
        ? 'Address reachable. Gmail verification is still pending.'
        : initialReadiness === 'address_reachable'
          ? 'Address reachable. Forward one more non-verification email to complete activation.'
          : '';
  const setupContext = {
    verifying: false,
    verified: isForwardingActive(),
    verifyMessage: initialVerifyMessage,
    closed: false,
    closeTimer: null,
    runVerificationCheck: null,
    cleanupFns: []
  };

  const safeRender = () => {
    if (!setupContext.closed) {
      render();
    }
  };

  setupContext.runVerificationCheck = async () => {
    if (setupContext.verifying || setupContext.closed) {
      return;
    }
    setupContext.verifying = true;
    setupContext.verifyMessage = 'Checking for forwarded email…';
    safeRender();

    const maxAttempts = 6;
    const waitMs = 2500;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (setupContext.closed) {
        return;
      }
      await refreshInboundStatus({ ensureAddress: false });
      const receivedMs = Date.parse(inboundState.lastReceivedAt || '');
      const activeNow = isForwardingActive() && Number.isFinite(receivedMs);
      if (activeNow) {
        setupContext.verifying = false;
        setupContext.verified = true;
        setupContext.verifyMessage = 'Connected ✓ We are receiving forwarded emails.';
        showToast('Forwarding verified.', { tone: 'success' });
        safeRender();
        if (setupContext.closeTimer) {
          window.clearTimeout(setupContext.closeTimer);
        }
        setupContext.closeTimer = window.setTimeout(() => {
          if (!setupContext.closed) {
            closeModal('verified');
          }
        }, 900);
        return;
      }
      if (attempt < maxAttempts - 1) {
        setupContext.verifyMessage = `Waiting for forwarded email… (${attempt + 1}/${maxAttempts})`;
        safeRender();
        await waitForMs(waitMs);
      }
    }

    if (setupContext.closed) {
      return;
    }
    setupContext.verifying = false;
    const readiness = resolveForwardingReadiness();
    if (readiness === 'gmail_verification_pending') {
      setupContext.verifyMessage = 'Address reachable, but Gmail verification is still pending in Gmail.';
      showToast('Address reachable. Finish Gmail verification to complete setup.', { tone: 'info' });
    } else {
      setupContext.verifyMessage = 'No forwarded email detected yet. Forward one email, then try Verify setup again.';
      showToast('Still waiting for the first forwarded email.', { tone: 'info' });
    }
    safeRender();
  };

  const body = document.createElement('div');
  body.className = 'forwarding-setup-body';
  const footer = document.createElement('div');
  footer.className = 'modal-footer forwarding-setup-footer';
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn btn--ghost btn--sm';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'btn btn--primary btn--md';
  footer.append(backBtn, nextBtn);

  const render = () => {
    if (Array.isArray(setupContext.cleanupFns)) {
      setupContext.cleanupFns.forEach((cleanup) => {
        try {
          cleanup();
        } catch (_) {
          // no-op
        }
      });
      setupContext.cleanupFns = [];
    }
    body.innerHTML = '';
    body.appendChild(
      buildInboundSetupStep(currentStep, (nextStep) => {
        currentStep = Math.max(0, Math.min(1, Number(nextStep) || 0));
        render();
      }, setupContext)
    );
    const trustNote = document.createElement('div');
    trustNote.className = 'forwarding-trust-note muted small';
    trustNote.innerHTML = `
      <span>No inbox access required</span>
      <span>You control what gets forwarded</span>
      <span>Rotate anytime</span>
    `;
    body.appendChild(trustNote);
    renderInboundSetupHeaderAddressPanel();
    backBtn.textContent = currentStep === 0 ? 'Close' : 'Back';
    nextBtn.textContent = currentStep >= 1 ? 'Done' : 'Next';
    nextBtn.className = 'btn btn--primary btn--md';
    nextBtn.disabled = Boolean(setupContext.verifying);
  };

  backBtn.addEventListener('click', () => {
    if (currentStep === 0) {
      closeModal('cancel');
      return;
    }
    currentStep -= 1;
    render();
  });

  nextBtn.addEventListener('click', () => {
    if (setupContext.verifying) {
      return;
    }
    if (currentStep >= 1) {
      closeModal('done');
      return;
    }
    currentStep += 1;
    render();
  });

  openModal({
    title: 'Set up your Applictus inbox',
    description: 'A one-time setup that keeps your timeline updated automatically.',
    body,
    footer,
    allowBackdropClose: true,
    variantClass: 'modal--inbound-setup',
    onClose: () => {
      setupContext.closed = true;
      if (Array.isArray(setupContext.cleanupFns)) {
        setupContext.cleanupFns.forEach((cleanup) => {
          try {
            cleanup();
          } catch (_) {
            // no-op
          }
        });
        setupContext.cleanupFns = [];
      }
      if (setupContext.closeTimer) {
        window.clearTimeout(setupContext.closeTimer);
        setupContext.closeTimer = null;
      }
    }
  });
  render();
}

async function rotateInboundAddressFlow() {
  if (!inboundState.addressEmail) {
    return;
  }
  const confirmed = await new Promise((resolve) => {
    let resolved = false;
    const body = document.createElement('div');
    body.className = 'stack';
    const intro = document.createElement('p');
    intro.textContent = 'You’ll need to update Gmail forwarding to the new address.';
    const detail = document.createElement('p');
    detail.className = 'muted small';
    detail.textContent = 'The current address will stop being recommended for new forwarding setup.';
    body.append(intro, detail);
    const footer = buildModalFooter({ confirmText: 'Rotate address', cancelText: 'Cancel' });
    const confirmBtn = footer.querySelector('[data-role="confirm"]');
    if (confirmBtn) {
      confirmBtn.classList.remove('btn--primary');
      confirmBtn.classList.add('btn--danger');
      confirmBtn.addEventListener('click', () => closeModal('confirm'));
    }
    openModal({
      title: 'Rotate forwarding address?',
      description: '',
      body,
      footer,
      allowBackdropClose: true,
      onClose: (reason) => {
        if (resolved) {
          return;
        }
        resolved = true;
        resolve(reason === 'confirm');
      }
    });
  });
  if (!confirmed) {
    return;
  }
  if (inboundRotateAddress) {
    inboundRotateAddress.disabled = true;
  }
  try {
    const data = await api('/api/inbound/address/rotate', { method: 'POST' });
    applyInboundStatusPayload(data || {});
    showToast('Forwarding address rotated. Update your Gmail forwarding rule.', { tone: 'success' });
  } catch (err) {
    showNotice(err.message || 'Unable to rotate address.', 'Rotate address');
  } finally {
    if (inboundRotateAddress) {
      inboundRotateAddress.disabled = false;
    }
  }
}

async function saveAccountInboxUsername() {
  if (!sessionUser || !accountInboxUsernameInput) {
    return;
  }
  const validation = validateInboxUsernameInput(accountInboxUsernameInput.value, { allowEmpty: false });
  if (!validation.ok) {
    setInlineHintState(accountInboxUsernameHint, authErrorMessage(validation.code), 'error');
    if (accountInboxUsernameSave) {
      accountInboxUsernameSave.disabled = false;
    }
    return;
  }

  if (accountInboxUsernameSave) {
    accountInboxUsernameSave.disabled = true;
  }
  accountInboxUsernameInput.disabled = true;

  try {
    const payload = await api('/api/account/inbox-username', {
      method: 'POST',
      body: JSON.stringify({ inbox_username: validation.value })
    });
    if (payload?.user) {
      sessionUser = payload.user;
      renderAccountPanel(sessionUser);
      syncAccountAvatarIdentity(sessionUser);
    }
    if (payload?.inbound_status) {
      applyInboundStatusPayload(payload.inbound_status);
    } else {
      await refreshInboundStatus({ ensureAddress: true });
    }
    showToast('Inbox username saved.', { tone: 'success' });
  } catch (err) {
    setInlineHintState(accountInboxUsernameHint, authErrorMessage(err?.message || err?.code), 'error');
  } finally {
    accountInboxUsernameInput.disabled = false;
    renderAccountInboxUsernamePrompt({ checkAvailability: true });
  }
}

function formatDiagnosticsDate(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString([], {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

async function openInboundDiagnosticsModal() {
  if (!inboundState.diagnosticsAdmin) {
    return;
  }
  const escapeDiag = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  let payload = { messages: [] };
  try {
    payload = await api('/api/inbound/recent?limit=50');
  } catch (err) {
    showNotice(err.message || 'Unable to load diagnostics.', 'Diagnostics');
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'inbound-diagnostics';
  const signal = payload?.signal || null;
  if (signal && typeof signal === 'object') {
    const signalMeta = document.createElement('div');
    signalMeta.className = 'inbound-diagnostics-signal muted small';
    const pending = Math.max(0, Number(signal.pending_count || 0));
    const seenAt = formatDiagnosticsDate(signal.last_inbound_at || null);
    signalMeta.textContent = `Signal · pending ${pending} · last inbound ${seenAt}`;
    wrapper.appendChild(signalMeta);
    if (pending > 100) {
      const highPending = document.createElement('div');
      highPending.className = 'inbound-diagnostics-overload muted small';
      highPending.textContent = 'High pending volume detected (>100). Check forwarding rules and suppression patterns.';
      wrapper.appendChild(highPending);
    }
  }
  const table = document.createElement('div');
  table.className = 'inbound-diagnostics-table';
  const header = document.createElement('div');
  header.className = 'inbound-diagnostics-row inbound-diagnostics-row--head';
  header.innerHTML = `
    <div>Time</div>
    <div>From</div>
    <div>Subject</div>
    <div>Company</div>
    <div>Role</div>
    <div>Status</div>
    <div>State</div>
    <div>Reason</div>
  `;
  table.appendChild(header);

  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  if (!messages.length) {
    const empty = document.createElement('div');
    empty.className = 'muted small';
    empty.textContent = 'No inbound messages yet.';
    wrapper.appendChild(empty);
  } else {
    messages.forEach((message) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'inbound-diagnostics-row';
      const providerBadge = message.provider_id
        ? `<span class="inbound-provider-badge">${escapeDiag(message.provider_id)}</span>`
        : '';
      row.innerHTML = `
        <div>${formatDiagnosticsDate(message.received_at)}</div>
        <div title="${escapeDiag(message.from_email || '')}">${escapeDiag(message.from_email || '—')}</div>
        <div title="${escapeDiag(message.subject || '')}">${providerBadge}${escapeDiag(message.subject || '—')}</div>
        <div>${escapeDiag(message.derived_company || '—')}</div>
        <div>${escapeDiag(message.derived_role || '—')}</div>
        <div>${escapeDiag(message.derived_status || '—')}</div>
        <div>${escapeDiag(message.processing_state || '—')}</div>
        <div>${escapeDiag(message.suppress_reason || '—')}</div>
      `;

      const debugWrap = document.createElement('div');
      debugWrap.className = 'inbound-diagnostics-debug hidden';
      const debugPre = document.createElement('pre');
      debugPre.textContent = JSON.stringify(message.derived_debug_json || {}, null, 2);
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn btn--ghost btn--sm';
      copyBtn.textContent = 'Copy debug';
      copyBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void copyTextToClipboard(debugPre.textContent, 'Copied debug payload');
      });
      debugWrap.append(copyBtn, debugPre);

      row.addEventListener('click', () => {
        debugWrap.classList.toggle('hidden');
      });

      table.append(row, debugWrap);
    });
    wrapper.appendChild(table);
  }

  const footer = buildModalFooter({ confirmText: 'Close', cancelText: 'Close' });
  const confirmBtn = footer.querySelector('[data-role="confirm"]');
  const cancelBtn = footer.querySelector('[data-role="cancel"]');
  confirmBtn?.addEventListener('click', () => closeModal('close'));
  cancelBtn?.addEventListener('click', () => closeModal('close'));

  openModal({
    title: 'Inbound diagnostics',
    description: 'Recent forwarded messages and derivation reasoning.',
    body: wrapper,
    footer,
    allowBackdropClose: true
  });
}

async function refreshForwardingInbox({
  autoTriggered = false,
  pendingCountHint = 0,
  suppressSetupModalOnNotConnected = false
} = {}) {
  if (isInternalGmailMode()) {
    await runDashboardSyncOption('since_last');
    return;
  }
  if (!emailSync || emailSync.disabled || inboundAutoSyncState.inFlight) {
    return;
  }
  if (autoTriggered) {
    inboundAutoSyncState.lastAutoSyncAt = Date.now();
  }
  const preScanSnapshot = await captureSignalSnapshot();
  inboundAutoSyncState.inFlight = true;
  const scanText = emailSync.querySelector('.scan-text');
  const originalText = scanText?.textContent || 'Sync inbox';
  emailSync.disabled = true;
  emailSync.classList.add('is-scanning');
  if (scanText) {
    scanText.textContent = 'Syncing';
  }
  setSyncStatusText('Syncing…');
  renderSyncSummary({ status: 'running', rawDetails: 'Sync in progress…' });
  setSyncProgressState({
    visible: true,
    indeterminate: true,
    label: 'Syncing forwarded emails…',
    error: false
  });
  try {
    const result = await api('/api/inbound/sync', {
      method: 'POST',
      body: JSON.stringify({})
    });
    if (result?.status === 'not_connected') {
      const hasAddress = hasForwardingAddress();
      const notConnectedMessage = hasAddress
        ? 'Inbox connected. Waiting for first forwarded email before processing.'
        : 'Connect inbox forwarding to start syncing.';
      setSyncStatusText('Setup needed');
      renderSyncSummary({ status: 'not_connected', rawDetails: notConnectedMessage });
      if (syncResult) {
        syncResult.textContent = notConnectedMessage;
      }
      if (!autoTriggered && !suppressSetupModalOnNotConnected) {
        openInboundSetupModal({ startStep: 0 });
      }
      return;
    }

    const processedCount = Math.max(0, Number(result?.processed || 0));
    const createdCount = Math.max(0, Number(result?.created || 0));
    const updatedCount = Math.max(0, Number(result?.updated || 0));
    const ignoredCount = Math.max(0, Number(result?.ignored || 0));
    const summaryParts = [];
    if (createdCount > 0) {
      summaryParts.push(`${createdCount} new application${createdCount === 1 ? '' : 's'}`);
    }
    if (updatedCount > 0) {
      summaryParts.push(`${updatedCount} update${updatedCount === 1 ? '' : 's'}`);
    }
    if (ignoredCount > 0) {
      summaryParts.push(`${ignoredCount} ignored`);
    }
    if (!summaryParts.length && processedCount > 0) {
      summaryParts.push(`${processedCount} processed`);
    }
    const summaryLine = summaryParts.length ? `Sync complete — ${summaryParts.join(', ')}` : 'Up to date';
    const upToDateLine = 'Up to date';
    if (processedCount > 0) {
      renderSyncSummary({
        status: 'success',
        rawDetails: summaryLine
      });
      if (syncResult) {
        syncResult.textContent = summaryLine;
      }
      setSyncStatusText('Forwarding active');
    } else {
      renderSyncSummary({
        status: 'success',
        rawDetails: upToDateLine
      });
      if (syncResult) {
        syncResult.textContent = upToDateLine;
      }
      setSyncStatusText('Up to date');
    }

    await refreshInboundStatus({ ensureAddress: true });
    await loadActiveApplications();
    if (processedCount > 0) {
      await applyPostScanSignals(preScanSnapshot, result);
    } else {
      applyRowSignalPulse({ offerIds: [], interviewIds: [] });
      clearKpiNewSignals();
      clearKpiDeltaSignals();
    }
    await refreshEmailEvents();
    await refreshUnsortedEvents();
    const details = Array.isArray(result?.errors_detail) ? result.errors_detail : [];
    if (Number(result?.errors || 0) > 0) {
      const detailText = details
        .slice(0, 3)
        .map((item) => `${item.subject}: ${item.reason}`)
        .join('\n');
      renderSyncSummary({
        status: 'success',
        rawDetails: `${summaryLine}${detailText ? `\n${detailText}` : ''}`
      });
      showToast('Some messages could not be processed.', { tone: 'warning' });
    } else if (processedCount > 0) {
      showToast(summaryLine, { tone: 'success' });
    } else if (!autoTriggered && Number(pendingCountHint || 0) <= 1) {
      showToast('Up to date.', { tone: 'info' });
    }
  } catch (err) {
    if (err?.status === 409 || err?.code === 'SYNC_IN_PROGRESS' || String(err?.message || '').includes('SYNC_IN_PROGRESS')) {
      setSyncStatusText('Syncing…');
      renderSyncSummary({ status: 'running', rawDetails: 'Sync already in progress.' });
      return;
    }
    setSyncStatusText('Sync failed');
    renderSyncSummary({
      status: 'failed',
      rawDetails: err?.message || 'Unable to sync forwarded inbox.'
    });
    showNotice(err.message || 'Unable to refresh inbox status.', 'Sync inbox');
  } finally {
    hideSyncProgress();
    emailSync.classList.remove('is-scanning');
    emailSync.disabled = false;
    if (scanText) {
      scanText.textContent = originalText;
    }
    updateDashboardPrimarySyncUI();
    inboundAutoSyncState.inFlight = false;
  }
}

async function runManualInboundProcessNow() {
  if (isInternalGmailMode()) {
    if (!emailState.connected) {
      await startGmailConnectFlow();
      return;
    }
    await runDashboardSyncOption('since_last');
    return;
  }
  await refreshInboundStatus({ ensureAddress: true });
  if (!hasForwardingAddress()) {
    openInboundSetupModal({ startStep: 0 });
    return;
  }
  await refreshForwardingInbox({
    autoTriggered: false,
    pendingCountHint: Math.max(0, Number(inboundState.pendingCount || 0)),
    suppressSetupModalOnNotConnected: true
  });
}

async function refreshEmailStatus() {
  if (!isInternalGmailMode()) {
    emailState.configured = false;
    emailState.encryptionReady = false;
    emailState.connected = false;
    emailState.email = null;
    emailState.lastSyncedAt = null;
    emailState.lastSyncStats = null;
    return;
  }
  try {
    const data = await api('/api/email/status');
    emailState.configured = Boolean(data?.configured);
    emailState.encryptionReady = Boolean(data?.encryptionReady);
    emailState.connected = Boolean(data?.connected);
    emailState.email = data?.email || null;
    if (!emailState.connected) {
      emailState.lastSyncedAt = null;
      emailState.lastSyncStats = null;
    }
  } catch (err) {
    emailState.configured = false;
    emailState.encryptionReady = false;
    emailState.connected = false;
    emailState.email = null;
    emailState.lastSyncedAt = null;
    emailState.lastSyncStats = null;
  } finally {
    updateInboundStatusPresentation();
    updateSyncHelperText();
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
      metricsText = isInternalGmailMode()
        ? 'Connect Gmail to start syncing'
        : 'Connect inbox to start syncing';
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
  const isDashboardScanButton = buttonEl === emailSync;
  const isAccountScanButton = buttonEl === accountEmailSync;
  const isScanButton = Boolean(buttonEl?.classList.contains('btn-scan'));
  const scanTextEl = isScanButton ? buttonEl?.querySelector('.scan-text') : null;
  closeSyncRangeMenu();
  closeAccountSyncRangeMenu();
  if (isDashboardScanButton && syncMenuButton) {
    syncMenuButton.disabled = true;
  }
  if (isAccountScanButton && accountSyncMenuButton) {
    accountSyncMenuButton.disabled = true;
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
    if (isScanButton) {
      buttonEl.classList.add('is-scanning');
      buttonEl.dataset.originalScanText = scanTextEl?.textContent || 'Scan inbox';
      if (scanTextEl) {
        scanTextEl.textContent = 'Scanning';
      }
    } else {
      buttonEl.dataset.originalLabel = buttonEl.textContent;
      buttonEl.textContent = 'Scanning…';
    }
    buttonEl.classList.add('loading');
  }
  const preScanSnapshot = await captureSignalSnapshot();
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
    const rawDetails =
      status === 'not_connected'
        ? isInternalGmailMode()
          ? 'Connect Gmail first.'
          : 'Connect inbox first.'
        : formatSyncSummary(result);
    renderSyncSummary({
      status: status === 'not_connected' ? 'not_connected' : 'success',
      result,
      rawDetails
    });
    if (resultEl) {
      resultEl.textContent = rawDetails;
    }
    await loadActiveApplications();
    await applyPostScanSignals(preScanSnapshot, result);
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
      if (isScanButton) {
        buttonEl.classList.remove('is-scanning');
        if (scanTextEl) {
          scanTextEl.textContent = buttonEl.dataset.originalScanText || 'Scan inbox';
        }
        delete buttonEl.dataset.originalScanText;
      } else if (buttonEl.dataset.originalLabel) {
        buttonEl.textContent = buttonEl.dataset.originalLabel;
        delete buttonEl.dataset.originalLabel;
      }
      buttonEl.classList.remove('loading');
    }
    if (buttonEl === emailSync && syncMenuButton) {
      syncMenuButton.disabled = !emailState.connected;
    }
    if (buttonEl === accountEmailSync && accountSyncMenuButton) {
      accountSyncMenuButton.disabled = !emailState.connected;
    }
  }
}

async function runDashboardSyncOption(option) {
  if (!isInternalGmailMode()) {
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
    return;
  }

  if (!emailState.connected) {
    try {
      await startGmailConnectFlow();
    } catch (err) {
      showNotice(err.message || 'Unable to connect Gmail', 'Connect Gmail');
    }
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

async function runAccountSyncOption(option) {
  if (!emailState.connected) {
    if (isInternalGmailMode()) {
      await startGmailConnectFlow();
    }
    return;
  }
  const value = String(option || 'since_last');
  if (value === 'since_last') {
    await runEmailSync({
      mode: 'since_last',
      statusEl: accountSyncStatus,
      resultEl: accountSyncResult,
      buttonEl: accountEmailSync
    });
  } else {
    const days = Number(value);
    if (!Number.isFinite(days) || days <= 0) {
      return;
    }
    await runEmailSync({
      mode: 'days',
      days,
      statusEl: accountSyncStatus,
      resultEl: accountSyncResult,
      buttonEl: accountEmailSync
    });
  }
  if (accountSyncStatus?.textContent === 'Complete') {
    updateAccountSyncResultLine();
  }
}

async function runQuickSync() {
  if (isInternalGmailMode()) {
    await runDashboardSyncOption('since_last');
    return;
  }
  if (!isForwardingActive()) {
    openInboundSetupModal({ startStep: 0 });
    return;
  }
  await refreshForwardingInbox();
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
  form.className = 'modal-form form-grid modal-form--app-entry modal-form--edit-app';
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
  const manualToggleRow = document.createElement('label');
  manualToggleRow.className = 'checkbox-row modal-checkbox-row';
  const manualToggle = document.createElement('input');
  manualToggle.type = 'checkbox';
  manualToggle.checked = isManualStatus;
  const manualLabel = document.createElement('span');
  manualLabel.textContent = 'Manual status override';
  manualToggleRow.append(manualToggle, manualLabel);

  const statusFields = document.createElement('div');
  statusFields.className = `stack modal-edit-status ${isManualStatus ? '' : 'hidden'}`;
  const statusField = createModalStatusSelectField({
    label: 'Status',
    name: 'current_status',
    value: application.current_status || 'UNKNOWN'
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

  companyField.wrapper.classList.add('modal-field', 'modal-field--company');
  titleField.wrapper.classList.add('modal-field', 'modal-field--role');
  locationField.wrapper.classList.add('modal-field', 'modal-field--location');
  sourceField.wrapper.classList.add('modal-field', 'modal-field--source');
  statusField.wrapper.classList.add('modal-field', 'modal-field--status');
  noteField.wrapper.classList.add('modal-field', 'modal-field--note');

  const detailsRow = document.createElement('div');
  detailsRow.className = 'modal-row-two modal-row-two--edit-meta';
  detailsRow.append(locationField.wrapper, sourceField.wrapper);

  form.append(
    companyField.wrapper,
    titleField.wrapper,
    detailsRow,
    manualToggleRow,
    statusFields,
    errorEl
  );

  const footer = buildModalFooter({ confirmText: 'Save changes', formId: form.id });
  openModal({
    title: 'Edit application',
    description: 'Update the core details for this application.',
    body: form,
    footer,
    allowBackdropClose: false,
    initialFocus: companyField.input,
    onClose: () => statusField.destroy(),
    variantClass: APPLICATION_MODAL_VARIANT_CLASS
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
      const latestTimelineEventId =
        Array.isArray(lastDetailEvents) && lastDetailEvents.length ? lastDetailEvents[0]?.id : null;
      if (latestTimelineEventId) {
        payload.last_event_id = latestTimelineEventId;
      }
      if (application.last_inbound_message_id) {
        payload.last_inbound_message_id = application.last_inbound_message_id;
      }
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
    <div class="table-header sortable applications-header">
      <button type="button" class="sort-btn table-col-company${sortKey === 'company' ? ' active' : ''}" data-sort="company" aria-label="Sort by company">
        <span>Company</span>${sortKey === 'company' ? `<span class="arrow">${arrow}</span>` : ''}
      </button>
      <button type="button" class="sort-btn table-col-role${sortKey === 'role' ? ' active' : ''}" data-sort="role" aria-label="Sort by role">
        <span>Role</span>${sortKey === 'role' ? `<span class="arrow">${arrow}</span>` : ''}
      </button>
      <button type="button" class="sort-btn header-status table-col-status${sortKey === 'status' ? ' active' : ''}" data-sort="status" aria-label="Sort by status">
        <span>Status</span>${sortKey === 'status' ? `<span class="arrow">${arrow}</span>` : ''}
      </button>
      <button type="button" class="sort-btn header-activity table-col-activity${sortKey === 'lastActivity' ? ' active' : ''}" data-sort="lastActivity" aria-label="Sort by last activity">
        <span>Last activity</span>${sortKey === 'lastActivity' ? `<span class="arrow">${arrow}</span>` : ''}
      </button>
      <div class="table-select-header table-col-select">
        <label class="table-select-header-label" aria-label="Select all applications on this page">
          <span class="table-select-all-text">SELECT ALL</span>
          <span class="table-select-control">
            <input class="table-select-input table-select-all" type="checkbox" ${allSelected ? 'checked' : ''} ${
              someSelected ? 'data-indeterminate="true"' : ''
            } />
            <span class="table-select-mark" aria-hidden="true"></span>
          </span>
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
      const statusBandTone = getStatusBandTone(statusValue);
      const rowId = String(app.id);
      const isOffer = isOfferStatus(statusValue);
      const isInterview = isInterviewStatus(statusValue);
      const isNewSignal =
        state.signals.pulseOfferIds.has(rowId) || state.signals.pulseInterviewIds.has(rowId);
      return `
        <div class="table-row application-row${isSelected ? ' table-row-selected' : ''}${isOffer ? ' is-offer' : ''}${isInterview ? ' is-interview' : ''}${isNewSignal ? ' is-new-signal' : ''}" style="--stagger: ${index}" data-id="${app.id}" data-status-tone="${statusBandTone}">
          <div class="status-band" aria-hidden="true"></div>
          <div class="cell-company table-col-company"><strong>${app.company_name || '—'}</strong></div>
          <div class="cell-role table-col-role" title="${app.job_title || '—'}">${app.job_title || '—'}</div>
          <div class="table-col-status status-col">
            <div class="status-cell">${statusPill}</div>
            ${suggestionLabel ? `<div class="explanation">Suggestion: ${suggestionLabel}</div>` : ''}
          </div>
          <div class="table-col-activity">${activity}</div>
          <div class="table-select-cell table-col-select">
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
      const confidence = formatConfidencePercent(confidenceValue);
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
      const confidence = formatConfidencePercent(classificationConfidence);
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
      const confidence = formatConfidencePercent(classificationConfidence);
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
  const confidenceLabel = formatConfidencePercent(confidenceValue);
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
      const suggestionConfidence = formatConfidencePercent(application.suggested_confidence);
      detailSuggestionLabel.textContent = suggestionConfidence
        && suggestionConfidence !== '—'
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
        <button class="btn btn--ghost btn--sm" type="button" data-action="edit">
          <span class="btn-icon-left" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </span>
          <span class="btn-label">Edit</span>
        </button>
        <button class="btn btn--ghost btn--sm" type="button" data-action="archive">
          <span class="btn-icon-left" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 8v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8" />
              <path d="M1 3h22v5H1z" />
              <path d="M10 12h4" />
            </svg>
          </span>
          <span class="btn-label">${application.archived ? 'Unarchive' : 'Archive'}</span>
        </button>
        <button class="btn btn--danger btn--sm" type="button" data-action="delete">
          <span class="btn-icon-left" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18" />
              <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
              <path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
          </span>
          <span class="btn-label">Delete</span>
        </button>
      `;
    }
  }

  if (detailTimeline) {
    if (!safeEvents.length) {
      detailTimeline.innerHTML = '<div class="muted">No events yet.</div>';
    } else {
      const applicationNeedsDetails =
        String(application.company_name || '').toLowerCase() === 'direct outreach' ||
        ['intro call', 'technical opportunity'].includes(
          String(application.job_title || '').toLowerCase()
        );
      const formatTypeLabel = (type) => {
        const lower = String(type || '').toLowerCase();
        if (lower === 'interview_requested' || lower === 'interview_request') return 'Interview requested';
        if (lower === 'interview_scheduled') return 'Interview scheduled';
        if (lower === 'meeting_requested') return 'Meeting requested';
        if (lower === 'under_review') return 'Under review';
        return String(type || 'other')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (char) => char.toUpperCase());
      };
      const typeIcon = (type) => {
        const t = (type || '').toLowerCase();
        if (t === 'confirmation') {
          return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7 9 18l-5-5"/></svg>';
        }
        if (t === 'rejection') {
          return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></svg>';
        }
        if (t === 'interview_scheduled') {
          return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="m9 14 2 2 4-4"/></svg>';
        }
        if (t.includes('interview') || t === 'meeting_requested') {
          return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><circle cx="12" cy="14" r="3"/><path d="M12 12v2l1 1"/></svg>';
        }
        if (t.includes('offer')) {
          return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9z"/></svg>';
        }
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/></svg>';
      };
      detailTimeline.innerHTML = safeEvents
        .map((eventItem) => {
          const eventDate = eventItem.internal_date || eventItem.created_at || null;
          const classificationConfidence =
            eventItem.classification_confidence ?? eventItem.confidence_score ?? null;
          const confidence = formatConfidencePercent(classificationConfidence);
          const typeLabel = formatTypeLabel(eventItem.detected_type || 'other');
          return `
            <div class="timeline-card">
              <div class="timeline-card-top">
                <span class="timeline-icon">${typeIcon(eventItem.detected_type)}</span>
                <span class="timeline-type">${typeLabel}</span>
                <span class="timeline-needs-details${applicationNeedsDetails ? '' : ' hidden'}">Needs details</span>
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
    if (isInternalGmailMode()) {
      void refreshEmailStatus();
    } else {
      void refreshInboundStatus({ ensureAddress: true });
      void refreshInboundDiagnosticsAccess();
    }
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
    void refreshPlanUsage();
    if (isInternalGmailMode()) {
      void refreshEmailStatus();
    } else {
      void refreshInboundStatus({ ensureAddress: true });
      void refreshInboundDiagnosticsAccess();
    }
  } else if (routeKey === 'resume-curator') {
    setView('resume-curator');
    initResumeCurator();
  } else {
    clearKpiNewSignals();
    clearKpiDeltaSignals();
    setView('dashboard');
    if (isInternalGmailMode()) {
      void refreshEmailStatus();
    } else {
      void refreshInboundStatus({ ensureAddress: true });
    }
    void refreshPlanUsage();
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

accountUpgradeButton?.addEventListener('click', openPricingModal);
accountPlanDetails?.addEventListener('click', openPricingModal);

async function requestUpgrade() {
  try {
    const res = await api('/api/account/plan/upgrade', { method: 'POST' });
    if (res?.user) {
      sessionUser = res.user;
      renderAccountPanel(sessionUser);
      showNotice('Pro plan activated for your account.', 'Upgrade');
      await refreshPlanUsage();
    }
  } catch (err) {
    if (err?.status === 403) {
      showNotice('Upgrade requires billing setup and is currently disabled.', 'Upgrade');
      return;
    }
    showNotice('Unable to start upgrade right now.', 'Upgrade');
  }
}

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
    const inboxValidation = validateInboxUsernameInput(payload.inbox_username, { allowEmpty: true });
    if (!inboxValidation.ok) {
      showNotice(authErrorMessage(inboxValidation.code), 'Sign up failed');
      if (signupInboxUsernameInput) {
        signupInboxUsernameInput.focus();
      }
      signupForm.__submitting = false;
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    if (inboxValidation.value) {
      payload.inbox_username = inboxValidation.value;
    } else {
      delete payload.inbox_username;
    }
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

if (accountPasswordButton && !accountPasswordButton.dataset.bound) {
  accountPasswordButton.dataset.bound = '1';
  accountPasswordButton.addEventListener('click', () => {
    openAccountPasswordModal();
  });
}

async function performLogout() {
  await api('/api/auth/logout', { method: 'POST' });
  sessionUser = null;
  emailState.configured = false;
  emailState.encryptionReady = false;
  emailState.connected = false;
  emailState.email = null;
  emailState.lastSyncedAt = null;
  emailState.lastSyncStats = null;
  inboundState.diagnosticsAdmin = false;
  updateInboundDiagnosticsVisibility();
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
  if (action === 'inbox') {
    closeProfileMenu();
    if (isInternalGmailMode()) {
      if (!emailState.connected) {
        try {
          await startGmailConnectFlow();
        } catch (err) {
          showNotice(err.message || 'Unable to connect Gmail', 'Connect Gmail');
        }
      } else {
        window.location.hash = '#account';
      }
      return;
    }
    try {
      await refreshInboundStatus({ ensureAddress: true });
    } catch (_) {
      // keep modal accessible even if status refresh fails
    }
    openInboundSetupModal({ startStep: 0 });
    return;
  }
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
  if (accountSyncRangeMenuOpen && accountSyncActionGroup) {
    if (!accountSyncActionGroup.contains(event.target)) {
      closeAccountSyncRangeMenu();
    }
  }
  if (statusMenuOpen && filterStatusSelect) {
    if (!filterStatusSelect.contains(event.target)) {
      closeStatusMenu();
    }
  }
  if (archiveStatusMenuOpen && archivedFilterStatusSelect) {
    if (!archivedFilterStatusSelect.contains(event.target)) {
      closeArchivedStatusMenu();
    }
  }
  if (modalStatusSelectControllers.size) {
    modalStatusSelectControllers.forEach((controller) => {
      if (controller.isOpen() && !controller.root.contains(event.target)) {
        controller.close();
      }
    });
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
  if (event.key === 'Escape' && accountSyncRangeMenuOpen) {
    closeAccountSyncRangeMenu();
    accountSyncMenuButton?.focus();
  }
  if (event.key === 'Escape' && statusMenuOpen) {
    closeStatusMenu({ focusTrigger: true });
  }
  if (event.key === 'Escape' && archiveStatusMenuOpen) {
    closeArchivedStatusMenu({ focusTrigger: true });
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInboundAutoSyncPolling();
    return;
  }
  if (routeIsDashboard() && sessionUser) {
    syncInboundAutoPolling();
    void pollInboundStatusForAutoSync();
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
  if (action === 'sync-inbox') {
    if (isInternalGmailMode()) {
      await runDashboardSyncOption('since_last');
    } else if (isForwardingActive()) {
      await refreshForwardingInbox();
    } else {
      openInboundSetupModal({ startStep: 0 });
    }
    return;
  }
  if (action === 'manage-inbox') {
    window.location.hash = '#account';
    return;
  }
});

let filterCompanyTimer = null;
let filterRoleTimer = null;
let archivedFilterCompanyTimer = null;
let archivedFilterRoleTimer = null;
const applyFilters = async () => {
  if (state.table.selectedIds?.size) {
    clearTableSelection({ rerender: false });
  }
  state.table.offset = 0;
  updateFilterSummary();
  await loadActiveApplications();
};
const applyArchivedFilters = async () => {
  state.archived.offset = 0;
  await refreshArchivedApplications();
};

filterStatusTrigger?.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (!statusMenuOpen && archiveStatusMenuOpen) {
    closeArchivedStatusMenu();
  }
  setStatusMenuOpen(!statusMenuOpen, { focusSelected: statusMenuOpen ? false : true });
});

filterStatusTrigger?.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!statusMenuOpen) {
      setStatusMenuOpen(true, { focusSelected: true });
      return;
    }
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    setStatusMenuHighlight(statusMenuHighlightIndex + delta, { focus: true });
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (!statusMenuOpen && archiveStatusMenuOpen) {
      closeArchivedStatusMenu();
    }
    setStatusMenuOpen(!statusMenuOpen, { focusSelected: !statusMenuOpen });
    return;
  }
  if (event.key === 'Escape' && statusMenuOpen) {
    event.preventDefault();
    closeStatusMenu();
  }
});

filterStatusMenu?.addEventListener('click', (event) => {
  const item = event.target.closest('.status-menu__item[data-value]');
  if (!item) {
    return;
  }
  event.preventDefault();
  applyStatusFilterValue(item.dataset.value || '');
  closeStatusMenu({ focusTrigger: true });
});

filterStatusMenu?.addEventListener('keydown', (event) => {
  const items = getStatusMenuItems();
  if (!items.length) {
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    const nextIndex = statusMenuHighlightIndex >= 0 ? statusMenuHighlightIndex + 1 : 0;
    setStatusMenuHighlight(nextIndex, { focus: true });
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    const nextIndex = statusMenuHighlightIndex >= 0 ? statusMenuHighlightIndex - 1 : items.length - 1;
    setStatusMenuHighlight(nextIndex, { focus: true });
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    const activeItem =
      items[statusMenuHighlightIndex] || event.target.closest('.status-menu__item[data-value]') || items[0];
    if (activeItem) {
      applyStatusFilterValue(activeItem.dataset.value || '');
      closeStatusMenu({ focusTrigger: true });
    }
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closeStatusMenu({ focusTrigger: true });
    return;
  }
  if (event.key === 'Tab') {
    closeStatusMenu();
  }
});

filterStatusMenu?.addEventListener('mousemove', (event) => {
  const item = event.target.closest('.status-menu__item[data-value]');
  if (!item) {
    return;
  }
  const items = getStatusMenuItems();
  const index = items.indexOf(item);
  if (index >= 0 && index !== statusMenuHighlightIndex) {
    setStatusMenuHighlight(index);
  }
});

filterStatus?.addEventListener('change', async () => {
  const normalizedStatus = normalizeStatusFilterValue(filterStatus.value);
  state.filters.status = normalizedStatus;
  filterStatus.value = normalizedStatus;
  syncStatusFilterMenuUi();
  await applyFilters();
});

syncStatusFilterMenuUi();

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

archivedFilterStatusTrigger?.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (!archiveStatusMenuOpen && statusMenuOpen) {
    closeStatusMenu();
  }
  setArchivedStatusMenuOpen(!archiveStatusMenuOpen, {
    focusSelected: archiveStatusMenuOpen ? false : true
  });
});

archivedFilterStatusTrigger?.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!archiveStatusMenuOpen) {
      if (statusMenuOpen) {
        closeStatusMenu();
      }
      setArchivedStatusMenuOpen(true, { focusSelected: true });
      return;
    }
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    setArchivedStatusMenuHighlight(archiveStatusMenuHighlightIndex + delta, { focus: true });
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (!archiveStatusMenuOpen && statusMenuOpen) {
      closeStatusMenu();
    }
    setArchivedStatusMenuOpen(!archiveStatusMenuOpen, { focusSelected: !archiveStatusMenuOpen });
    return;
  }
  if (event.key === 'Escape' && archiveStatusMenuOpen) {
    event.preventDefault();
    closeArchivedStatusMenu();
  }
});

archivedFilterStatusMenu?.addEventListener('click', (event) => {
  const item = event.target.closest('.status-menu__item[data-value]');
  if (!item) {
    return;
  }
  event.preventDefault();
  applyArchivedStatusFilterValue(item.dataset.value || '');
  closeArchivedStatusMenu({ focusTrigger: true });
});

archivedFilterStatusMenu?.addEventListener('keydown', (event) => {
  const items = getArchivedStatusMenuItems();
  if (!items.length) {
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    const nextIndex = archiveStatusMenuHighlightIndex >= 0 ? archiveStatusMenuHighlightIndex + 1 : 0;
    setArchivedStatusMenuHighlight(nextIndex, { focus: true });
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    const nextIndex = archiveStatusMenuHighlightIndex >= 0 ? archiveStatusMenuHighlightIndex - 1 : items.length - 1;
    setArchivedStatusMenuHighlight(nextIndex, { focus: true });
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    const activeItem =
      items[archiveStatusMenuHighlightIndex] ||
      event.target.closest('.status-menu__item[data-value]') ||
      items[0];
    if (activeItem) {
      applyArchivedStatusFilterValue(activeItem.dataset.value || '');
      closeArchivedStatusMenu({ focusTrigger: true });
    }
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closeArchivedStatusMenu({ focusTrigger: true });
    return;
  }
  if (event.key === 'Tab') {
    closeArchivedStatusMenu();
  }
});

archivedFilterStatusMenu?.addEventListener('mousemove', (event) => {
  const item = event.target.closest('.status-menu__item[data-value]');
  if (!item) {
    return;
  }
  const items = getArchivedStatusMenuItems();
  const index = items.indexOf(item);
  if (index >= 0 && index !== archiveStatusMenuHighlightIndex) {
    setArchivedStatusMenuHighlight(index);
  }
});

archivedFilterStatus?.addEventListener('change', async () => {
  const normalizedStatus = normalizeStatusFilterValue(archivedFilterStatus.value);
  state.archived.filters.status = normalizedStatus;
  archivedFilterStatus.value = normalizedStatus;
  syncArchivedStatusFilterMenuUi();
  await applyArchivedFilters();
});

syncArchivedStatusFilterMenuUi();

if (archivedFilterCompany) {
  archivedFilterCompany.value = state.archived.filters.company || '';
}
archivedFilterCompanyClear?.classList.toggle('hidden', !archivedFilterCompany?.value);

archivedFilterCompany?.addEventListener('input', () => {
  if (archivedFilterCompanyClear) {
    archivedFilterCompanyClear.classList.toggle('hidden', !archivedFilterCompany.value);
  }
  clearTimeout(archivedFilterCompanyTimer);
  archivedFilterCompanyTimer = setTimeout(async () => {
    state.archived.filters.company = archivedFilterCompany.value.trim();
    await applyArchivedFilters();
  }, 180);
});

archivedFilterCompanyClear?.addEventListener('click', async () => {
  if (!archivedFilterCompany) return;
  archivedFilterCompany.value = '';
  archivedFilterCompanyClear.classList.add('hidden');
  state.archived.filters.company = '';
  await applyArchivedFilters();
});

if (archivedFilterRole) {
  archivedFilterRole.value = state.archived.filters.role || '';
}
archivedFilterRoleClear?.classList.toggle('hidden', !archivedFilterRole?.value);

archivedFilterRole?.addEventListener('input', () => {
  if (archivedFilterRoleClear) {
    archivedFilterRoleClear.classList.toggle('hidden', !archivedFilterRole.value);
  }
  clearTimeout(archivedFilterRoleTimer);
  archivedFilterRoleTimer = setTimeout(async () => {
    state.archived.filters.role = archivedFilterRole.value.trim();
    await applyArchivedFilters();
  }, 180);
});

archivedFilterRoleClear?.addEventListener('click', async () => {
  if (!archivedFilterRole) return;
  archivedFilterRole.value = '';
  archivedFilterRoleClear.classList.add('hidden');
  state.archived.filters.role = '';
  await applyArchivedFilters();
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

adminMetricSelect?.addEventListener('change', async () => {
  const els = ensureAdminElements();
  const metric = (els.metricSelect || adminMetricSelect)?.value || adminTrendState.metric;
  adminTrendState.metric = metric;
  await loadAdminTrend(metric, (els.rangeSelect || adminRangeSelect)?.value || '30d');
});

adminRangeSelect?.addEventListener('change', async () => {
  const els = ensureAdminElements();
  const range = (els.rangeSelect || adminRangeSelect)?.value || adminTrendState.range;
  adminTrendState.range = range;
  await loadAdminTrend((els.metricSelect || adminMetricSelect)?.value || adminTrendState.metric, range);
});

// If admin elements exist at load time, bootstrap listeners for them as well
(() => {
  const els = ensureAdminElements();
  if (els.metricSelect && !els.metricSelect.dataset.bound) {
    els.metricSelect.dataset.bound = '1';
    els.metricSelect.addEventListener('change', async () => {
      const metric = els.metricSelect.value || adminTrendState.metric;
      adminTrendState.metric = metric;
      await loadAdminTrend(metric, (els.rangeSelect || adminRangeSelect)?.value || '30d');
    });
  }
  if (els.rangeSelect && !els.rangeSelect.dataset.bound) {
    els.rangeSelect.dataset.bound = '1';
    els.rangeSelect.addEventListener('change', async () => {
      const range = els.rangeSelect.value || adminTrendState.range;
      adminTrendState.range = range;
      await loadAdminTrend((els.metricSelect || adminMetricSelect)?.value || adminTrendState.metric, range);
    });
  }
})();

emailSync?.addEventListener('click', async () => {
  if (isInternalGmailMode()) {
    await runDashboardSyncOption('since_last');
    return;
  }
  if (isForwardingActive()) {
    await refreshForwardingInbox();
    return;
  }
  openInboundSetupModal({ startStep: 0 });
});

syncMenuButton?.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (syncMenuButton.disabled) {
    return;
  }
  closeAccountSyncRangeMenu();
  setSyncRangeMenuOpen(!syncRangeMenuOpen);
  if (syncRangeMenuOpen) {
    const selected = syncRangeMenu?.querySelector('.sync-range-menu-item.is-selected');
    const first = syncRangeMenu?.querySelector('.sync-range-menu-item');
    (selected || first)?.focus();
  }
});

accountEmailSync?.addEventListener('click', async () => {
  updateAccountSyncOptionSelection('since_last');
  await runAccountSyncOption('since_last');
});

signupInboxUsernameInput?.addEventListener('input', () => {
  renderSignupInboxUsernameUi({ checkAvailability: true });
});

signupForm?.querySelector('input[name="name"]')?.addEventListener('input', () => {
  renderSignupInboxUsernameUi({ checkAvailability: false });
});

signupForm?.querySelector('input[name="email"]')?.addEventListener('input', () => {
  renderSignupInboxUsernameUi({ checkAvailability: false });
});

accountInboxUsernameInput?.addEventListener('input', () => {
  renderAccountInboxUsernamePrompt({ checkAvailability: true });
});

accountInboxUsernameInput?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') {
    return;
  }
  event.preventDefault();
  void saveAccountInboxUsername();
});

accountInboxUsernameSave?.addEventListener('click', async () => {
  await saveAccountInboxUsername();
});

inboundOpenSetup?.addEventListener('click', () => {
  if (isInternalGmailMode()) {
    void startGmailConnectFlow().catch((err) => {
      showNotice(err.message || 'Unable to connect Gmail', 'Connect Gmail');
    });
    return;
  }
  openInboundSetupModal({ startStep: 0 });
});

inboundHelpOpenSetup?.addEventListener('click', () => {
  if (isInternalGmailMode()) {
    void startGmailConnectFlow().catch((err) => {
      showNotice(err.message || 'Unable to connect Gmail', 'Connect Gmail');
    });
    return;
  }
  openInboundSetupModal({ startStep: 0 });
});

inboundCopyAddress?.addEventListener('click', () => {
  const target = isInternalGmailMode() ? emailState.email : inboundState.addressEmail;
  const message = isInternalGmailMode() ? 'Copied Gmail address' : 'Copied forwarding address';
  void copyTextToClipboard(target, message);
});

function sendInboundTestEmail() {
  const target = isInternalGmailMode() ? emailState.email : inboundState.addressEmail;
  if (!target) {
    return;
  }
  const subject = encodeURIComponent('Applictus test');
  const body = encodeURIComponent(
    isInternalGmailMode()
      ? 'This is a Gmail internal-mode test email for Applictus.'
      : 'This is a forwarding test email for Applictus.'
  );
  window.location.href = `mailto:${encodeURIComponent(target)}?subject=${subject}&body=${body}`;
}

inboundSendTest?.addEventListener('click', () => {
  sendInboundTestEmail();
});

inboundHelpSendTest?.addEventListener('click', () => {
  sendInboundTestEmail();
});

inboundProcessNow?.addEventListener('click', async () => {
  await runManualInboundProcessNow();
});

inboundRotateAddress?.addEventListener('click', async () => {
  await rotateInboundAddressFlow();
});

inboundWhyToggle?.addEventListener('click', () => {
  if (!inboundWhyPanel) {
    return;
  }
  const next = inboundWhyPanel.classList.contains('hidden');
  inboundWhyPanel.classList.toggle('hidden', !next);
  inboundWhyToggle.setAttribute('aria-expanded', next ? 'true' : 'false');
});

inboundHelpWhy?.addEventListener('click', () => {
  if (!inboundWhyPanel || !inboundWhyToggle) {
    return;
  }
  inboundWhyPanel.classList.remove('hidden');
  inboundWhyToggle.setAttribute('aria-expanded', 'true');
  inboundWhyPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

inboundDiagnosticsLink?.addEventListener('click', () => {
  void openInboundDiagnosticsModal();
});

syncProcessNow?.addEventListener('click', async () => {
  await runManualInboundProcessNow();
});

accountSyncMenuButton?.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (accountSyncMenuButton.disabled) {
    return;
  }
  closeSyncRangeMenu();
  setAccountSyncRangeMenuOpen(!accountSyncRangeMenuOpen);
  if (accountSyncRangeMenuOpen) {
    const selected = accountSyncRangeMenu?.querySelector('.sync-range-menu-item.is-selected');
    const first = accountSyncRangeMenu?.querySelector('.sync-range-menu-item');
    (selected || first)?.focus();
  }
});

accountSyncRangeMenu?.addEventListener('click', async (event) => {
  const item = event.target.closest('.sync-range-menu-item[data-sync-option]');
  if (!item) {
    return;
  }
  const option = item.dataset.syncOption || 'since_last';
  updateAccountSyncOptionSelection(option);
  closeAccountSyncRangeMenu();
  await runAccountSyncOption(option);
});

accountSyncRangeMenu?.addEventListener('keydown', async (event) => {
  const item = event.target.closest('.sync-range-menu-item[data-sync-option]');
  if (!item) {
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    const option = item.dataset.syncOption || 'since_last';
    updateAccountSyncOptionSelection(option);
    closeAccountSyncRangeMenu();
    await runAccountSyncOption(option);
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closeAccountSyncRangeMenu();
    accountSyncMenuButton?.focus();
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

const modalCloseButton = modalRoot?.querySelector('[data-action="close"]');
modalCloseButton?.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  closeModal('close');
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
