const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function assertTopNavigation(html) {
  const navBlocks = [...html.matchAll(/<div class="home-nav-actions">([\s\S]*?)<\/div>/g)].map(
    (match) => match[1]
  );
  assert.ok(navBlocks.length > 0);
  for (const nav of navBlocks) {
    assert.match(nav, /<a class="home-link" href="\/about">About<\/a>/);
    assert.match(nav, /<a class="home-link" href="\/blog">Blog<\/a>/);
    assert.match(nav, /<a class="btn btn--secondary btn--sm" href="\/app">Login<\/a>/);
    assert.match(nav, /<a class="btn btn--primary btn--sm" href="\/app">Sign up<\/a>/);
    assert.doesNotMatch(nav, /href="\/privacy"|href="\/terms"/);
  }
}

function extractFooterLinks(html) {
  return html.match(/<nav class="app-footer-links"[^>]*>([\s\S]*?)<\/nav>/)?.[1] || '';
}

function assertTrimmedFooterLinks(html) {
  const footer = extractFooterLinks(html);
  assert.match(footer, /<a class="app-footer-link" href="\/contact">CONTACT<\/a>/);
  assert.match(footer, /<a class="app-footer-link" href="\/privacy">PRIVACY<\/a>/);
  assert.match(footer, /<a class="app-footer-link" href="\/terms">TERMS<\/a>/);
  assert.doesNotMatch(footer, /href="\/blog"|FREE TRACKERS|href="\/about"/);
}

function assertPlatformCarousel(html) {
  const platformLogos = [
    ['/linkedin-logo.png', 'LinkedIn', 1280, 320],
    ['/indeed-logo.png', 'Indeed', 960, 259],
    ['/workday-logo.png', 'Workday', 1280, 513],
    ['/greenhouse-logo.png', 'Greenhouse', 2208, 652],
    ['/glassdoor-logo.png', 'Glassdoor', 960, 288],
    ['/zip-logo.png', 'ZipRecruiter', 840, 224],
    ['/monster-logo.png', 'Monster', 1200, 405],
    ['/Dice_Logo.png', 'Dice', 1942, 1017],
    ['/Built_In_Logo.png', 'Built In', 1017, 532],
    ['/showbiz-logo.png', 'ShowbizJobs', 994, 522]
  ];
  const groups = [...html.matchAll(/<div class="home-hero-platforms__group"[^>]*>([\s\S]*?)<\/div>/g)].map(
    (match) => match[1]
  );
  assert.equal(groups.length, 2);
  for (const [src, alt, width, height] of platformLogos) {
    assert.ok(fs.existsSync(path.join(rootDir, 'public', src.slice(1))));
    assert.match(
      groups[0],
      new RegExp(`src="${src}" alt="${alt}" width="${width}" height="${height}" loading="lazy"`)
    );
    assert.match(
      groups[1],
      new RegExp(`src="${src}" alt="" width="${width}" height="${height}" loading="lazy"`)
    );
  }
}

test('landing page metadata and FAQ content are SEO-ready', () => {
  const sourceHtml = readProjectFile('web/home.html');
  const publicHtml = readProjectFile('public/index.html');
  const appShellHtml = readProjectFile('web/index.html');
  const webAppShellHtml = readProjectFile('web/app/index.html');
  const publicAppShellHtml = readProjectFile('public/app/index.html');
  const sourceCss = readProjectFile('web/styles.css');
  const publicCss = readProjectFile('public/styles.css');

  assert.equal(publicHtml, sourceHtml);
  assert.equal(publicCss, sourceCss);
  assert.match(sourceHtml, /<title>Applictus \| Automatic Job Application Tracker<\/title>/);
  assertTopNavigation(sourceHtml);
  assertTopNavigation(appShellHtml);
  assertTopNavigation(webAppShellHtml);
  assertTopNavigation(publicAppShellHtml);
  assertTrimmedFooterLinks(sourceHtml);
  assertPlatformCarousel(sourceHtml);

  const metaDescription = sourceHtml.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1] || '';
  for (const keyword of [
    'job application tracker',
    'interview tracker',
    'job search',
    'application timeline'
  ]) {
    assert.match(metaDescription.toLowerCase(), new RegExp(keyword));
  }

  const permissionsIndex = sourceHtml.indexOf('Secure sign-in with minimal permissions');
  const faqIndex = sourceHtml.indexOf('Frequently asked questions');
  const ctaIndex = sourceHtml.indexOf('Stop missing important job updates');
  assert.ok(permissionsIndex > -1);
  assert.ok(faqIndex > permissionsIndex);
  assert.ok(ctaIndex > faqIndex);
  assert.match(sourceHtml, /<p class="home-faq-label">FAQ<\/p>/);
  assert.match(
    sourceHtml,
    /Answers to common questions about setup, privacy, and automatic job application tracking\./
  );

  const faqItemCount = (sourceHtml.match(/class="home-faq-item"/g) || []).length;
  assert.equal(faqItemCount, 6);
  for (const question of [
    'Does Applictus have access to my Gmail inbox?',
    'What job boards does Applictus support?',
    'How does Applictus track my applications?',
    'Can Applictus detect interview requests?',
    'Can I stop forwarding emails anytime?',
    'Is Applictus free?'
  ]) {
    assert.match(sourceHtml, new RegExp(question.replace(/[?]/g, '\\?')));
  }
  assert.match(
    sourceHtml,
    /Applictus offers a free plan so you can start organizing your job search without paying upfront\./
  );

  assert.match(sourceCss, /\.home-panel-faq/);
  assert.match(sourceCss, /\.home-faq-layout/);
  assert.match(sourceCss, /@keyframes homeFaqReveal/);

  for (const shellHtml of [appShellHtml, webAppShellHtml, publicAppShellHtml]) {
    assertTrimmedFooterLinks(shellHtml);
    assert.match(shellHtml, /<section class="view" id="about-view" hidden>/);
    assert.match(shellHtml, /<div class="about-page">/);
    assert.match(shellHtml, /<h1 class="sr-only">About Applictus<\/h1>/);
    assert.match(shellHtml, /<section class="about-banner" aria-label="About Applictus">/);
    assert.match(shellHtml, /class="about-banner-image"/);
    assert.match(shellHtml, /src="\/about-page-banner\.png"/);
    assert.match(
      shellHtml,
      /alt="Applictus workflow banner showing job emails flowing into an organized application dashboard"/
    );
    assert.match(shellHtml, /width="1969"/);
    assert.match(shellHtml, /height="629"/);
    assert.doesNotMatch(shellHtml, /about-hero-copy|about-eyebrow|about-subtitle|about-hero-points/);
    assert.match(shellHtml, /<section class="about-section about-mission">/);
    assert.match(shellHtml, /<section class="about-section about-team-section">/);
    assert.match(shellHtml, /<div class="profile-badges" aria-label="Jason Conklin roles">/);
    assert.match(shellHtml, /<span class="profile-badge profile-badge--founder">Co-Founder<\/span>/);
    assert.match(shellHtml, /<span class="profile-badge">Product \+ Engineering<\/span>/);
    assert.match(shellHtml, /<div class="profile-badges" aria-label="Shane Conklin roles">/);
    assert.match(shellHtml, /<span class="profile-badge">Marketing \+ Strategy<\/span>/);
    assert.doesNotMatch(shellHtml, /Co-Founder, Product \+ Engineering|Co-Founder, Marketing \+ Strategy|Founder, Product \+ Engineering|Product \+ Operations/);
    assert.match(shellHtml, /<section class="about-section about-principles-section">/);
    assert.match(shellHtml, /<section class="about-trust-callout">/);
    assert.match(shellHtml, /<section class="about-cta-card">/);
    assert.doesNotMatch(shellHtml, /class="card about"/);
    assert.doesNotMatch(shellHtml, /about-hero-visual|about-logo-tile|about-signal-card/);
  }

  assert.match(sourceCss, /\.about-page/);
  assert.match(sourceCss, /\.about-banner/);
  assert.match(sourceCss, /\.about-banner-image/);
  assert.doesNotMatch(sourceCss, /about-hero-copy|about-eyebrow|about-subtitle|about-hero-points/);
  assert.match(sourceCss, /\.profile-badges/);
  assert.match(sourceCss, /\.profile-badge--founder/);
  assert.match(sourceCss, /\.about-trust-callout/);
  assert.match(sourceCss, /\.about-cta-card/);
  assert.doesNotMatch(sourceCss, /about-hero-visual|about-logo-tile|about-signal-card/);
});
