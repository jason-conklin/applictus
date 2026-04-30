(function () {
  document.documentElement.classList.remove('no-js');
  document.documentElement.classList.add('js');

  window.__applictusLandingIntroFallback = window.setTimeout(function () {
    if (!document.body) {
      return;
    }
    document.body.classList.remove('landing-intro-preload', 'landing-intro-running');
    document.body.classList.add('landing-intro-complete', 'home-loaded');
  }, 7000);
})();
