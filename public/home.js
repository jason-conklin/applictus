import { ensureAnimatedBackgroundLayout } from '/animated-background.js';

function bootHomepage() {
  if (!document?.body) {
    return;
  }
  document.body.classList.add('home-page', 'animated-bg-mode', 'animated-bg-auth');
  ensureAnimatedBackgroundLayout({ variant: 'auth' });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootHomepage, { once: true });
} else {
  bootHomepage();
}
