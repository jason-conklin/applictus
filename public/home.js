import { ensureAnimatedBackgroundLayout } from '/animated-background.js';

function supportsReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

function playHomeIntro(reducedMotion) {
  const hero = document.querySelector('[data-hero-banner]');
  if (!hero) {
    return;
  }
  hero.classList.remove('is-intro');
  if (reducedMotion || !isHomeRoute()) {
    return;
  }
  // Force reflow so repeated entries replay keyframes.
  void hero.offsetWidth;
  hero.classList.add('is-intro');
}

function setupHomeIntroPlayback(reducedMotion) {
  const hero = document.querySelector('[data-hero-banner]');
  if (!hero) {
    return;
  }

  const replay = () => playHomeIntro(reducedMotion);
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

function setupHeroBanner(reducedMotion) {
  const banner = document.querySelector('.hero-banner');
  const tiltEl = document.querySelector('.hero-banner__tilt');
  const bannerImg = document.querySelector('.hero-banner__img');
  if (bannerImg) {
    bannerImg.addEventListener('dragstart', (event) => event.preventDefault());
  }
  if (!banner || !tiltEl || reducedMotion) {
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
  document.body.classList.add('home-page', 'animated-bg-mode', 'animated-bg-auth');
  document.body.classList.add('animate-ready', 'reveal-ready');
  ensureAnimatedBackgroundLayout({ variant: 'auth' });

  setupHomeIntroPlayback(reducedMotion);
  setupHeroBanner(reducedMotion);
  setupScrollCtas(reducedMotion);
  setupScrollReveal(reducedMotion);

  if (reducedMotion) {
    document.body.classList.add('home-loaded');
    return;
  }

  window.requestAnimationFrame(() => {
    document.body.classList.add('home-loaded');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootHomepage, { once: true });
} else {
  bootHomepage();
}
