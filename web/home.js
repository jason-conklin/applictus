import { ensureAnimatedBackgroundLayout } from '/animated-background.js';

function supportsReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function supportsBackdropFilter() {
  if (!window.CSS || typeof window.CSS.supports !== 'function') {
    return false;
  }
  return (
    window.CSS.supports('backdrop-filter: blur(10px)') ||
    window.CSS.supports('-webkit-backdrop-filter: blur(10px)')
  );
}

function supportsMediaQuery(query) {
  if (!query || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

function prefersReducedTransparency() {
  return (
    supportsMediaQuery('(prefers-reduced-transparency: reduce)') ||
    supportsMediaQuery('(forced-colors: active)') ||
    supportsMediaQuery('(prefers-contrast: more)')
  );
}

function getRevealNodes() {
  const nodes = Array.from(document.querySelectorAll('.reveal, [data-reveal]'));
  return Array.from(new Set(nodes));
}

function setupScrollCtas(reducedMotion) {
  const triggers = document.querySelectorAll('[data-scrollto]');
  triggers.forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      const selector = trigger.getAttribute('data-scrollto');
      if (!selector) {
        return;
      }
      const target = document.querySelector(selector);
      if (!target) {
        return;
      }
      target.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'start'
      });
    });
  });
}

function normalizePathname(pathname) {
  if (typeof pathname !== 'string') {
    return '/';
  }
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
}

function isHomeRoute() {
  return normalizePathname(window.location.pathname) === '/';
}

function playHomeIntro(reducedEffects) {
  const hero = document.querySelector('[data-hero-banner]');
  if (!hero) {
    return;
  }
  hero.classList.remove('is-intro');
  if (reducedEffects || !isHomeRoute()) {
    return;
  }
  // Force reflow so repeated entries replay keyframes.
  void hero.offsetWidth;
  hero.classList.add('is-intro');
}

function setupHomeIntroPlayback(reducedEffects) {
  const hero = document.querySelector('[data-hero-banner]');
  if (!hero) {
    return;
  }

  const replay = () => playHomeIntro(reducedEffects);
  replay();

  window.addEventListener('pageshow', replay);
  window.addEventListener('popstate', replay);
  window.addEventListener('hashchange', replay);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      replay();
    }
  });

  if (!window.__homeIntroHistoryPatched) {
    ['pushState', 'replaceState'].forEach((method) => {
      const original = window.history[method];
      if (typeof original !== 'function') {
        return;
      }
      window.history[method] = function patchedHistoryMethod(...args) {
        const result = original.apply(this, args);
        window.dispatchEvent(new Event('home:intro-routechange'));
        return result;
      };
    });
    window.__homeIntroHistoryPatched = true;
  }

  window.addEventListener('home:intro-routechange', () => {
    window.requestAnimationFrame(replay);
  });

  document.addEventListener(
    'click',
    (event) => {
      const link = event.target.closest('a[href]');
      if (!link) {
        return;
      }
      let targetUrl = null;
      try {
        targetUrl = new URL(link.getAttribute('href'), window.location.href);
      } catch {
        return;
      }
      if (targetUrl.origin !== window.location.origin) {
        return;
      }
      if (normalizePathname(targetUrl.pathname) !== '/') {
        return;
      }
      window.setTimeout(replay, 0);
    },
    true
  );
}

function setupHeroBanner(reducedEffects) {
  const banner = document.querySelector('.hero-banner');
  const tiltEl = document.querySelector('.hero-banner__tilt');
  const bannerImg = document.querySelector('.hero-banner__img, .hero-brand-logo');
  if (bannerImg) {
    bannerImg.addEventListener('dragstart', (event) => event.preventDefault());
  }
  if (!banner || !tiltEl || reducedEffects) {
    return;
  }

  const desktopMedia = window.matchMedia('(min-width: 981px)');
  const pointerMedia = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (!desktopMedia.matches || !pointerMedia.matches) {
    return;
  }

  let rafId = 0;
  let currentRX = 0;
  let currentRY = 0;
  let currentTX = 0;
  let currentTY = 0;
  let targetRX = 0;
  let targetRY = 0;
  let targetTX = 0;
  let targetTY = 0;
  const smoothing = 0.08;
  const epsilon = 0.01;
  const maxTilt = 2;
  const maxShiftX = 6;
  const maxShiftY = 5;

  const applyTransform = () => {
    tiltEl.style.transform = `translate3d(${currentTX.toFixed(2)}px, ${currentTY.toFixed(2)}px, 0) rotateX(${currentRX.toFixed(3)}deg) rotateY(${currentRY.toFixed(3)}deg)`;
  };

  const tick = () => {
    currentRX += (targetRX - currentRX) * smoothing;
    currentRY += (targetRY - currentRY) * smoothing;
    currentTX += (targetTX - currentTX) * smoothing;
    currentTY += (targetTY - currentTY) * smoothing;
    applyTransform();

    const settled =
      Math.abs(targetRX - currentRX) < epsilon &&
      Math.abs(targetRY - currentRY) < epsilon &&
      Math.abs(targetTX - currentTX) < epsilon &&
      Math.abs(targetTY - currentTY) < epsilon;
    if (settled) {
      currentRX = targetRX;
      currentRY = targetRY;
      currentTX = targetTX;
      currentTY = targetTY;
      applyTransform();
      rafId = 0;
      return;
    }
    rafId = window.requestAnimationFrame(tick);
  };

  const startLoop = () => {
    if (!rafId) {
      rafId = window.requestAnimationFrame(tick);
    }
  };

  const resetTargets = () => {
    targetRX = 0;
    targetRY = 0;
    targetTX = 0;
    targetTY = 0;
    startLoop();
  };

  const setTargetsFromPointer = (event) => {
    if (!desktopMedia.matches || !pointerMedia.matches) {
      resetTargets();
      return;
    }
    const rect = banner.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      resetTargets();
      return;
    }
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    const clampedX = Math.max(-1, Math.min(1, nx));
    const clampedY = Math.max(-1, Math.min(1, ny));
    targetRY = clampedX * maxTilt;
    targetRX = -clampedY * maxTilt;
    targetTX = clampedX * maxShiftX;
    targetTY = clampedY * maxShiftY;
    startLoop();
  };

  banner.addEventListener('pointermove', setTargetsFromPointer, { passive: true });
  banner.addEventListener('pointerleave', resetTargets);
  window.addEventListener('blur', resetTargets);
  window.addEventListener('mouseout', (event) => {
    if (!event.relatedTarget) {
      resetTargets();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      resetTargets();
    }
  });
}

function setupHeroPlatformMarqueeInteraction({ reducedMotion = false } = {}) {
  const marquee = document.querySelector('[data-platform-marquee]');
  const track = marquee?.querySelector('[data-platform-track]');
  if (!marquee || !track) {
    return;
  }

  marquee.querySelectorAll('img').forEach((img) => {
    img.setAttribute('draggable', 'false');
    img.addEventListener('dragstart', (event) => event.preventDefault());
  });

  let cycleWidth = 0;
  let autoVelocityPxPerMs = 0;
  let positionPx = 0;
  let inertiaVelocityPxPerMs = 0;

  let rafId = 0;
  let lastFrameTs = 0;

  let dragging = false;
  let activePointerId = null;
  let lastPointerX = 0;
  let lastPointerTs = 0;
  let pointerVelocityPxPerMs = 0;

  const MAX_INERTIA_VELOCITY = 3.4;
  const MIN_INERTIA_VELOCITY = 0.02;
  const FRICTION_PER_16MS = 0.9;

  const parseAnimationDurationMs = (value) => {
    const raw = String(value || '').split(',')[0].trim();
    if (!raw) return 42000;
    if (raw.endsWith('ms')) {
      const parsedMs = Number.parseFloat(raw);
      return Number.isFinite(parsedMs) && parsedMs > 0 ? parsedMs : 42000;
    }
    if (raw.endsWith('s')) {
      const parsedSeconds = Number.parseFloat(raw);
      return Number.isFinite(parsedSeconds) && parsedSeconds > 0 ? parsedSeconds * 1000 : 42000;
    }
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : 42000;
  };

  const wrapPosition = (value) => {
    if (!cycleWidth || !Number.isFinite(value)) {
      return 0;
    }
    let wrapped = value % cycleWidth;
    if (wrapped > 0) {
      wrapped -= cycleWidth;
    }
    return wrapped;
  };

  const applyTransform = () => {
    track.style.transform = `translate3d(${positionPx.toFixed(2)}px, 0, 0)`;
  };

  const recalcMetrics = () => {
    const totalWidth = track.scrollWidth || 0;
    cycleWidth = totalWidth > 0 ? totalWidth / 2 : 0;
    if (!cycleWidth) {
      autoVelocityPxPerMs = 0;
      return;
    }
    const durationMs = parseAnimationDurationMs(window.getComputedStyle(track).animationDuration);
    autoVelocityPxPerMs = durationMs > 0 ? -(cycleWidth / durationMs) : -(cycleWidth / 42000);
    positionPx = wrapPosition(positionPx);
    applyTransform();
  };

  const startLoop = () => {
    if (rafId) return;
    lastFrameTs = performance.now();
    rafId = window.requestAnimationFrame(tick);
  };

  const stopLoop = () => {
    if (!rafId) return;
    window.cancelAnimationFrame(rafId);
    rafId = 0;
  };

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    activePointerId = null;
    marquee.classList.remove('is-dragging');
    inertiaVelocityPxPerMs = Math.max(
      -MAX_INERTIA_VELOCITY,
      Math.min(MAX_INERTIA_VELOCITY, pointerVelocityPxPerMs)
    );
    pointerVelocityPxPerMs = 0;
    startLoop();
  };

  function tick(now) {
    const deltaMs = Math.max(1, Math.min(64, now - lastFrameTs));
    lastFrameTs = now;

    if (!cycleWidth) {
      recalcMetrics();
    }

    if (!dragging) {
      if (Math.abs(inertiaVelocityPxPerMs) > MIN_INERTIA_VELOCITY) {
        positionPx = wrapPosition(positionPx + inertiaVelocityPxPerMs * deltaMs);
        const decay = Math.pow(FRICTION_PER_16MS, deltaMs / 16);
        inertiaVelocityPxPerMs *= decay;
        if (Math.abs(inertiaVelocityPxPerMs) <= MIN_INERTIA_VELOCITY) {
          inertiaVelocityPxPerMs = 0;
        }
      } else if (!reducedMotion) {
        positionPx = wrapPosition(positionPx + autoVelocityPxPerMs * deltaMs);
      }
      applyTransform();
    }

    rafId = window.requestAnimationFrame(tick);
  }

  const onPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    dragging = true;
    activePointerId = event.pointerId;
    lastPointerX = event.clientX;
    lastPointerTs = event.timeStamp || performance.now();
    pointerVelocityPxPerMs = 0;
    inertiaVelocityPxPerMs = 0;
    marquee.classList.add('is-dragging');
    marquee.setPointerCapture?.(event.pointerId);
    startLoop();
    event.preventDefault();
  };

  const onPointerMove = (event) => {
    if (!dragging || event.pointerId !== activePointerId) {
      return;
    }
    const nowTs = event.timeStamp || performance.now();
    const deltaX = event.clientX - lastPointerX;
    const deltaMs = Math.max(1, nowTs - lastPointerTs);

    positionPx = wrapPosition(positionPx + deltaX);
    applyTransform();

    pointerVelocityPxPerMs = deltaX / deltaMs;
    lastPointerX = event.clientX;
    lastPointerTs = nowTs;
    event.preventDefault();
  };

  const onPointerUpOrCancel = (event) => {
    if (!dragging || event.pointerId !== activePointerId) {
      return;
    }
    marquee.releasePointerCapture?.(event.pointerId);
    endDrag();
  };

  track.style.animation = 'none';
  recalcMetrics();
  applyTransform();
  startLoop();

  marquee.addEventListener('pointerdown', onPointerDown);
  marquee.addEventListener('pointermove', onPointerMove);
  marquee.addEventListener('pointerup', onPointerUpOrCancel);
  marquee.addEventListener('pointercancel', onPointerUpOrCancel);
  marquee.addEventListener('lostpointercapture', endDrag);
  window.addEventListener('resize', recalcMetrics, { passive: true });
  window.addEventListener('blur', endDrag);
  window.addEventListener('pagehide', stopLoop, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      endDrag();
    }
  });
}

function setupHowStepperConnector() {
  const steppers = Array.from(document.querySelectorAll('.how-stepper'));
  if (!steppers.length) {
    return;
  }

  let rafId = 0;

  const measure = () => {
    steppers.forEach((stepper) => {
      const nodes = stepper.querySelectorAll('.info-step__node');
      if (nodes.length < 2) {
        stepper.style.removeProperty('--connector-top');
        stepper.style.removeProperty('--connector-bottom-offset');
        return;
      }

      const wrapperRect = stepper.getBoundingClientRect();
      const firstRect = nodes[0].getBoundingClientRect();
      const lastRect = nodes[nodes.length - 1].getBoundingClientRect();
      const top = firstRect.top + firstRect.height / 2 - wrapperRect.top;
      const bottomOffset = wrapperRect.bottom - (lastRect.top + lastRect.height / 2);

      stepper.style.setProperty('--connector-top', `${Math.max(0, top).toFixed(2)}px`);
      stepper.style.setProperty('--connector-bottom-offset', `${Math.max(0, bottomOffset).toFixed(2)}px`);
    });
  };

  const scheduleMeasure = () => {
    if (rafId) {
      return;
    }
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      measure();
    });
  };

  scheduleMeasure();
  window.addEventListener('resize', scheduleMeasure, { passive: true });
  window.addEventListener('orientationchange', scheduleMeasure);
  window.addEventListener('load', scheduleMeasure);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      scheduleMeasure();
    }
  });
  if (document.fonts?.ready) {
    document.fonts.ready.then(scheduleMeasure).catch(() => {});
  }
}

function getSetupVideoEmbedUrl(videoUrl, { autoplay = false } = {}) {
  if (!videoUrl) {
    return '';
  }
  try {
    const url = new URL(videoUrl, window.location.href);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let videoId = '';
    if (host === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0] || '';
    } else if (host.endsWith('youtube.com')) {
      if (url.pathname.startsWith('/embed/')) {
        videoId = url.pathname.split('/').filter(Boolean)[1] || '';
      } else {
        videoId = url.searchParams.get('v') || '';
      }
    }
    if (!videoId) {
      return '';
    }
    const embedUrl = new URL(`https://www.youtube.com/embed/${videoId}`);
    const shareId = url.searchParams.get('si');
    if (shareId) {
      embedUrl.searchParams.set('si', shareId);
    }
    embedUrl.searchParams.set('rel', '0');
    embedUrl.searchParams.set('modestbranding', '1');
    if (autoplay) {
      embedUrl.searchParams.set('autoplay', '1');
    }
    return embedUrl.toString();
  } catch {
    return '';
  }
}

function setupSetupWalkthroughVideo() {
  const triggers = Array.from(document.querySelectorAll('[data-setup-video-open]'));
  if (!triggers.length) {
    return;
  }

  let modalEl = null;
  let frameEl = null;
  let closeButton = null;
  let activeTrigger = null;
  let keyHandler = null;

  const closeModal = () => {
    if (!modalEl) {
      return;
    }
    modalEl.classList.remove('is-open');
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('setup-video-modal-open');
    if (frameEl) {
      frameEl.replaceChildren();
    }
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
    if (activeTrigger && document.contains(activeTrigger)) {
      activeTrigger.focus();
    }
    activeTrigger = null;
  };

  const ensureModal = () => {
    if (modalEl) {
      return;
    }
    modalEl = document.createElement('div');
    modalEl.className = 'setup-video-modal';
    modalEl.setAttribute('aria-hidden', 'true');
    modalEl.innerHTML = `
      <button class="setup-video-modal__backdrop" type="button" data-setup-video-close aria-label="Close setup walkthrough"></button>
      <div class="setup-video-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="setup-video-modal-title">
        <div class="setup-video-modal__frame" data-setup-video-frame></div>
        <div class="setup-video-modal__meta">
          <div class="setup-video-modal__text">
            <p class="setup-video-modal__title" id="setup-video-modal-title">Watch setup walkthrough</p>
            <p class="setup-video-modal__copy">Connect Gmail forwarding once, then Applictus keeps your timeline updated.</p>
          </div>
          <button class="setup-video-modal__close" type="button" data-setup-video-close>Close</button>
        </div>
      </div>
    `;
    frameEl = modalEl.querySelector('[data-setup-video-frame]');
    closeButton = modalEl.querySelector('.setup-video-modal__close');
    modalEl.querySelectorAll('[data-setup-video-close]').forEach((control) => {
      control.addEventListener('click', closeModal);
    });
    document.body.append(modalEl);
  };

  const openModal = (trigger, embedUrl) => {
    ensureModal();
    if (!modalEl || !frameEl) {
      return;
    }
    activeTrigger = trigger;
    frameEl.replaceChildren();
    const iframe = document.createElement('iframe');
    iframe.src = embedUrl;
    iframe.title = 'Applictus setup walkthrough video';
    iframe.loading = 'lazy';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    frameEl.append(iframe);
    modalEl.classList.add('is-open');
    modalEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('setup-video-modal-open');
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler);
    }
    keyHandler = (event) => {
      if (event.key === 'Escape') {
        closeModal();
      }
    };
    document.addEventListener('keydown', keyHandler);
    window.requestAnimationFrame(() => {
      closeButton?.focus();
    });
  };

  triggers.forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const videoUrl = trigger.dataset.videoUrl || trigger.getAttribute('href') || '';
      const embedUrl = getSetupVideoEmbedUrl(videoUrl, { autoplay: true });
      if (!embedUrl) {
        return;
      }
      event.preventDefault();
      openModal(trigger, embedUrl);
    });
  });
}

function setupProductPreview(reducedMotion) {
  const preview = document.querySelector('[data-product-preview]');
  if (!preview) {
    return;
  }

  const rowsEl = preview.querySelector('[data-preview-rows]');
  if (!rowsEl) {
    return;
  }

  const kpiEls = {
    total: preview.querySelector('[data-preview-kpi="total"]'),
    applied: preview.querySelector('[data-preview-kpi="applied"]'),
    interviews: preview.querySelector('[data-preview-kpi="interviews"]'),
    offers: preview.querySelector('[data-preview-kpi="offers"]'),
    rejected: preview.querySelector('[data-preview-kpi="rejected"]')
  };

  const deltaEls = {
    total: preview.querySelector('[data-preview-kpi-delta="total"]'),
    applied: preview.querySelector('[data-preview-kpi-delta="applied"]'),
    interviews: preview.querySelector('[data-preview-kpi-delta="interviews"]'),
    offers: preview.querySelector('[data-preview-kpi-delta="offers"]'),
    rejected: preview.querySelector('[data-preview-kpi-delta="rejected"]')
  };

  const kpiKeys = ['total', 'applied', 'interviews', 'offers', 'rejected'];

  const doneTextEl = preview.querySelector('.product-preview__sync-text--done');
  const scaleEl = preview.querySelector('[data-preview-scale]');

  const previewStates = [
    {
      scanCompleteCopy: 'Update detected: +1 interview request',
      kpis: { total: 36, applied: 24, interviews: 4, offers: 1, rejected: 7 },
      deltas: { interviews: '+1' },
      rows: [
        {
          company: 'Commonpoint',
          role: 'IT Support Specialist',
          statusKey: 'offer_received',
          statusLabel: 'Offer',
          lastActivity: 'Today'
        },
        {
          company: 'Fulcrum Vets, LLC',
          role: 'Remote Accounts Receivable Specialist',
          statusKey: 'interview_requested',
          statusLabel: 'Interview requested',
          lastActivity: 'Yesterday',
          isPriority: true,
          isNew: true
        },
        {
          company: 'Valley National Bank',
          role: 'Sr. Analyst, Business Management',
          statusKey: 'applied',
          statusLabel: 'Applied',
          lastActivity: '2d ago'
        },
        {
          company: 'Arch',
          role: 'Data Quality Analyst',
          statusKey: 'rejected',
          statusLabel: 'Rejected',
          lastActivity: '3d ago'
        },
        {
          company: 'Greenhouse Labs',
          role: 'Front End Web Application Developer',
          statusKey: 'under_review',
          statusLabel: 'Under review',
          lastActivity: '4d ago'
        }
      ]
    },
    {
      scanCompleteCopy: 'Update detected: +1 newly tracked application',
      kpis: { total: 37, applied: 25, interviews: 4, offers: 1, rejected: 7 },
      deltas: { applied: '+1' },
      rows: [
        {
          company: 'Commonpoint',
          role: 'IT Support Specialist',
          statusKey: 'offer_received',
          statusLabel: 'Offer',
          lastActivity: 'Today',
          isNew: true
        },
        {
          company: 'Fulcrum Vets, LLC',
          role: 'Remote Accounts Receivable Specialist',
          statusKey: 'interview_requested',
          statusLabel: 'Interview requested',
          lastActivity: 'Yesterday',
          isPriority: true
        },
        {
          company: 'Valley National Bank',
          role: 'Sr. Analyst, Business Management',
          statusKey: 'applied',
          statusLabel: 'Applied',
          lastActivity: '2d ago'
        },
        {
          company: 'Arch',
          role: 'Data Quality Analyst',
          statusKey: 'rejected',
          statusLabel: 'Rejected',
          lastActivity: '3d ago'
        },
        {
          company: 'Greenhouse Labs',
          role: 'Front End Web Application Developer',
          statusKey: 'under_review',
          statusLabel: 'Under review',
          lastActivity: '4d ago'
        }
      ]
    },
    {
      scanCompleteCopy: 'Update detected: +1 offer update',
      kpis: { total: 38, applied: 25, interviews: 4, offers: 2, rejected: 7 },
      deltas: { offers: '+1' },
      rows: [
        {
          company: 'Commonpoint',
          role: 'IT Support Specialist',
          statusKey: 'offer_received',
          statusLabel: 'Offer',
          lastActivity: 'Today',
          isNew: true
        },
        {
          company: 'Fulcrum Vets, LLC',
          role: 'Remote Accounts Receivable Specialist',
          statusKey: 'interview_requested',
          statusLabel: 'Interview requested',
          lastActivity: 'Yesterday',
          isPriority: true
        },
        {
          company: 'Valley National Bank',
          role: 'Sr. Analyst, Business Management',
          statusKey: 'applied',
          statusLabel: 'Applied',
          lastActivity: '2d ago'
        },
        {
          company: 'Arch',
          role: 'Data Quality Analyst',
          statusKey: 'rejected',
          statusLabel: 'Rejected',
          lastActivity: '3d ago'
        },
        {
          company: 'Greenhouse Labs',
          role: 'Front End Web Application Developer',
          statusKey: 'under_review',
          statusLabel: 'Under review',
          lastActivity: '4d ago'
        }
      ]
    }
  ];

  const timing = {
    idleMs: 1300,
    scanMs: 2500,
    swapOutMs: 200,
    swapInMs: 320,
    updatedMs: 2100,
    settleMs: 900
  };

  const statusClassByKey = {
    applied: 'appl-status-applied',
    interview_requested: 'appl-status-interview_requested',
    rejected: 'appl-status-rejected',
    offer_received: 'appl-status-offer_received',
    under_review: 'appl-status-under_review'
  };

  const timeoutIds = new Set();
  let rafId = 0;
  let isStopped = false;
  let stateIndex = 0;

  const escapeHtml = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const setScanProgress = (value) => {
    const clamped = Math.max(0, Math.min(1, Number(value) || 0));
    preview.style.setProperty('--scan-progress', clamped.toFixed(3));
  };

  const wait = (ms) =>
    new Promise((resolve) => {
      const id = window.setTimeout(() => {
        timeoutIds.delete(id);
        resolve();
      }, ms);
      timeoutIds.add(id);
    });

  const animateProgress = (durationMs) =>
    new Promise((resolve) => {
      const start = performance.now();
      const tick = (now) => {
        if (isStopped) {
          resolve();
          return;
        }
        const progress = Math.min(1, (now - start) / durationMs);
        setScanProgress(progress);
        if (progress >= 1) {
          rafId = 0;
          resolve();
          return;
        }
        rafId = window.requestAnimationFrame(tick);
      };
      setScanProgress(0);
      rafId = window.requestAnimationFrame(tick);
    });

  const renderRows = (rows) =>
    rows
      .map((row) => {
        const rowClasses = [];
        if (row.isPriority || row.statusKey === 'interview_requested') {
          rowClasses.push('product-preview__row--priority');
        }
        if (row.isNew) {
          rowClasses.push('product-preview__row--new');
        }
        const statusClass = statusClassByKey[row.statusKey] || 'appl-status-unknown';
        const newChip = row.isNew ? '<span class="product-preview__row-update is-active">NEW</span>' : '';
        return `
          <tr${rowClasses.length ? ` class="${rowClasses.join(' ')}"` : ''}>
            <td>${escapeHtml(row.company)}</td>
            <td>${escapeHtml(row.role)}</td>
            <td>${newChip}<span class="appl-statusPill ${statusClass}"><span class="dot" aria-hidden="true"></span>${escapeHtml(row.statusLabel)}</span></td>
            <td class="product-preview__date">${escapeHtml(row.lastActivity || '')}</td>
          </tr>
        `;
      })
      .join('');

  const applyState = (state) => {
    if (doneTextEl && state.scanCompleteCopy) {
      doneTextEl.textContent = state.scanCompleteCopy;
    }

    if (scaleEl) {
      const visibleCount = Array.isArray(state.rows) ? state.rows.length : 0;
      const totalCount = Number(state.kpis?.total || 0);
      const safeTotal = totalCount > 0 ? totalCount : visibleCount;
      scaleEl.textContent = `Showing ${visibleCount} of ${safeTotal} tracked`;
    }

    kpiKeys.forEach((key) => {
      const kpiEl = kpiEls[key];
      if (kpiEl) {
        kpiEl.textContent = String(state.kpis?.[key] ?? '--');
      }
      const deltaEl = deltaEls[key];
      if (deltaEl) {
        const deltaText = state.deltas?.[key] || '';
        deltaEl.textContent = deltaText;
        deltaEl.classList.toggle('is-active', Boolean(deltaText));
      }
    });

    rowsEl.innerHTML = renderRows(state.rows || []);
  };

  const swapToState = async (nextStateIndex) => {
    preview.classList.add('is-swapping-out');
    await wait(timing.swapOutMs);
    if (isStopped) {
      return;
    }
    stateIndex = nextStateIndex;
    applyState(previewStates[stateIndex]);
    preview.classList.remove('is-swapping-out');
    preview.classList.add('is-swapping-in');
    await wait(timing.swapInMs);
    preview.classList.remove('is-swapping-in');
  };

  const cleanup = () => {
    isStopped = true;
    timeoutIds.forEach((id) => window.clearTimeout(id));
    timeoutIds.clear();
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  applyState(previewStates[stateIndex]);

  if (reducedMotion) {
    preview.classList.remove('is-scanning', 'is-swapping-out', 'is-swapping-in');
    preview.classList.add('is-updated');
    setScanProgress(1);
    window.addEventListener('pagehide', cleanup, { once: true });
    return;
  }

  const runLoop = async () => {
    while (!isStopped) {
      if (document.visibilityState === 'hidden') {
        preview.classList.remove('is-scanning');
        setScanProgress(0);
        await wait(600);
        continue;
      }

      preview.classList.remove('is-updated', 'is-swapping-out', 'is-swapping-in');
      setScanProgress(0);
      await wait(timing.idleMs);
      if (isStopped) {
        return;
      }

      preview.classList.add('is-scanning');
      await animateProgress(timing.scanMs);
      preview.classList.remove('is-scanning');
      if (isStopped) {
        return;
      }

      const nextStateIndex = (stateIndex + 1) % previewStates.length;
      await swapToState(nextStateIndex);
      if (isStopped) {
        return;
      }

      preview.classList.add('is-updated');
      await wait(timing.updatedMs);
      await wait(timing.settleMs);
    }
  };

  runLoop().catch(() => {});
  window.addEventListener('pagehide', cleanup, { once: true });
}

function revealAllSections() {
  const revealNodes = getRevealNodes();
  revealNodes.forEach((node) => node.classList.add('is-visible'));
}

function setupScrollReveal(reducedMotion) {
  const revealNodes = getRevealNodes();
  if (!revealNodes.length) {
    return;
  }
  if (reducedMotion || !('IntersectionObserver' in window)) {
    revealAllSections();
    return;
  }

  revealNodes.forEach((node, index) => {
    node.style.setProperty('--reveal-delay', `${Math.min(index * 70, 320)}ms`);
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.15,
      rootMargin: '0px 0px -8% 0px'
    }
  );

  revealNodes.forEach((node) => observer.observe(node));
}

function bootHomepage() {
  if (!document?.body) {
    return;
  }

  const reducedMotion = supportsReducedMotion();
  const reducedTransparency = prefersReducedTransparency();
  const hasBackdropFilter = supportsBackdropFilter();
  const reducedEffects = reducedMotion || reducedTransparency || !hasBackdropFilter;
  const clearIntroFallback = () => {
    if (!window.__applictusLandingIntroFallback) {
      return;
    }
    window.clearTimeout(window.__applictusLandingIntroFallback);
    window.__applictusLandingIntroFallback = null;
  };

  document.body.classList.add('home-page', 'animated-bg-mode', 'animated-bg-auth');
  document.body.classList.add('animate-ready', 'reveal-ready');
  document.body.classList.toggle('reduced-motion', reducedMotion);
  document.body.classList.toggle('reduced-transparency', reducedTransparency);
  document.body.classList.toggle('no-backdrop-filter', !hasBackdropFilter);
  document.body.classList.toggle('home-effects-fallback', reducedEffects);
  ensureAnimatedBackgroundLayout({ variant: 'auth' });

  setupHomeIntroPlayback(reducedEffects);
  setupHeroBanner(reducedEffects);
  setupHeroPlatformMarqueeInteraction({ reducedMotion });
  setupHowStepperConnector();
  setupSetupWalkthroughVideo();
  setupProductPreview(reducedMotion);
  setupScrollCtas(reducedMotion);
  setupScrollReveal(reducedMotion);

  if (reducedMotion) {
    document.body.classList.remove('landing-intro-preload', 'landing-intro-running');
    document.body.classList.add('home-loaded', 'landing-intro-complete');
    clearIntroFallback();
    return;
  }

  window.requestAnimationFrame(() => {
    document.body.classList.remove('landing-intro-preload');
    document.body.classList.add('landing-intro-running', 'home-loaded');
    window.setTimeout(() => {
      document.body.classList.remove('landing-intro-running');
      document.body.classList.add('landing-intro-complete');
      clearIntroFallback();
    }, 4300);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootHomepage, { once: true });
} else {
  bootHomepage();
}
