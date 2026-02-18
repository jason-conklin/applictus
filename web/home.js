import { ensureAnimatedBackgroundLayout } from '/animated-background.js';

function supportsReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

function revealAllSections() {
  const revealNodes = document.querySelectorAll('[data-reveal]');
  revealNodes.forEach((node) => node.classList.add('is-visible'));
}

function setupScrollReveal(reducedMotion) {
  const revealNodes = Array.from(document.querySelectorAll('[data-reveal]'));
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
