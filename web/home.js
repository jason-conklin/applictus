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

function setupHeroBanner(reducedMotion) {
  const banner = document.querySelector('.hero-banner');
  const bannerImg = document.querySelector('.hero-banner__img');
  if (bannerImg) {
    bannerImg.addEventListener('dragstart', (event) => event.preventDefault());
  }
  if (!banner || reducedMotion) {
    return;
  }

  const desktopMedia = window.matchMedia('(min-width: 981px)');
  const pointerMedia = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (!desktopMedia.matches || !pointerMedia.matches) {
    return;
  }

  let rafId = 0;
  const state = { x: 0, y: 0 };
  const maxTilt = 1.5;
  const maxShiftX = 7;
  const maxShiftY = 5;

  const applyTransform = () => {
    rafId = 0;
    banner.style.setProperty('--hero-tilt-x', `${(-state.y * maxTilt).toFixed(3)}deg`);
    banner.style.setProperty('--hero-tilt-y', `${(state.x * maxTilt).toFixed(3)}deg`);
    banner.style.setProperty('--hero-parallax-x', `${(state.x * maxShiftX).toFixed(2)}px`);
    banner.style.setProperty('--hero-parallax-y', `${(state.y * maxShiftY).toFixed(2)}px`);
  };

  const requestApply = () => {
    if (!rafId) {
      rafId = window.requestAnimationFrame(applyTransform);
    }
  };

  const resetTransform = () => {
    state.x = 0;
    state.y = 0;
    requestApply();
  };

  window.addEventListener(
    'pointermove',
    (event) => {
      if (!desktopMedia.matches || !pointerMedia.matches) {
        resetTransform();
        return;
      }
      const nx = (event.clientX / window.innerWidth - 0.5) * 2;
      const ny = (event.clientY / window.innerHeight - 0.5) * 2;
      state.x = Math.max(-1, Math.min(1, nx));
      state.y = Math.max(-1, Math.min(1, ny));
      requestApply();
    },
    { passive: true }
  );

  window.addEventListener('blur', resetTransform);
  window.addEventListener('mouseout', (event) => {
    if (!event.relatedTarget) {
      resetTransform();
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
