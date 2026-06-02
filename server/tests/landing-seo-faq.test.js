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

function extractView(html, viewId) {
  return html.match(new RegExp(`<section class="view" id="${viewId}" hidden>([\\s\\S]*?)<\\/section>\\s*<section class="view"`, 'i'))?.[1] || '';
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

function assertPrivacyPolicy(html) {
  const privacy = extractView(html, 'privacy-view');
  assert.match(privacy, /<div class="privacy-page">/);
  assert.match(privacy, /<section class="privacy-hero" aria-labelledby="privacy-title">/);
  assert.match(privacy, /<h2 id="privacy-title">Privacy Policy<\/h2>/);
  assert.match(privacy, /Last updated: June 2026/);
  assert.match(privacy, /user-controlled forwarding, secure sign-in, and transparent job application tracking/);
  assert.match(privacy, /No full inbox access required/);
  assert.match(privacy, /User-controlled forwarding/);
  assert.match(privacy, /Data stays tied to your account/);
  for (const heading of [
    'Overview',
    'How Applictus receives job emails',
    'Information we collect',
    'How we use information',
    'What we do not do',
    'Google sign-in and limited permissions',
    'Data retention',
    'Security',
    'Third-party services',
    'Your controls',
    'Contact'
  ]) {
    assert.match(privacy, new RegExp(`<h3>${heading}<\\/h3>`));
  }
  assert.match(privacy, /standard product workflow is forwarding-based/);
  assert.match(privacy, /Forwarded job-related emails sent to your Applictus address/);
  assert.match(privacy, /Derived application data such as company, role, status, timeline events, confidence, and explanation metadata/);
  assert.match(privacy, /We do not require full Gmail inbox access for standard tracking/);
  assert.match(privacy, /We do not access non-forwarded emails in the standard forwarding workflow/);
  assert.match(privacy, /A separate legacy, admin, or internal mode may use Gmail read-only access/);
  assert.match(privacy, /That mode is not the standard user workflow/);
  assert.doesNotMatch(privacy, /Last updated: Feb 2026|Gmail Read.?Only Access|permitted read.?only mailbox access|disconnect Gmail|stops reading/);
}

function assertTermsOfService(html) {
  const terms = extractView(html, 'terms-view');
  assert.match(terms, /<div class="privacy-page terms-page">/);
  assert.match(terms, /<section class="privacy-hero terms-hero" aria-labelledby="terms-title">/);
  assert.match(terms, /<h2 id="terms-title">Terms of Service<\/h2>/);
  assert.match(terms, /Last updated: June 2026/);
  assert.match(terms, /These terms explain how Applictus works, what users are responsible for, and how we provide the service/);
  assert.match(terms, /User-controlled forwarding/);
  assert.match(terms, /Secure account access/);
  assert.match(terms, /Best-effort application tracking/);
  for (const heading of [
    'Overview',
    'How Applictus Works',
    'Account Responsibilities',
    'Subscription Plans and Billing',
    'Acceptable Use',
    'Application Tracking Accuracy',
    'Service Availability',
    'Termination',
    'Changes to These Terms',
    'Contact'
  ]) {
    assert.match(terms, new RegExp(`<h3>${heading}<\\/h3>`));
  }
  assert.match(terms, /standard Applictus workflow uses user-controlled email forwarding/);
  assert.match(terms, /Applictus processes forwarded job-related emails to organize applications, interviews, offers, rejections, assessments, and hiring updates/);
  assert.match(terms, /Google sign-in is used for authentication/);
  assert.match(terms, /A separate legacy, admin, or internal mode may support Gmail read-only access/);
  assert.match(terms, /That mode is not the default user workflow/);
  assert.match(terms, /Applictus may offer a free plan and paid plans/);
  assert.match(terms, /Paid plan billing is handled through Stripe/);
  assert.match(terms, /Classification is best-effort and may not always be perfect/);
  assert.match(terms, /Applictus should not be your sole source of truth for employment opportunities/);
  assert.doesNotMatch(terms, /Last updated: Feb 2026|Gmail Connection \(Optional\)|Connecting Gmail is optional|uses <strong>read.?only<\/strong> access|disconnect Gmail/);
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
    assertPrivacyPolicy(shellHtml);
    assertTermsOfService(shellHtml);
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
  assert.match(sourceCss, /\.privacy-page/);
  assert.match(sourceCss, /\.privacy-hero/);
  assert.match(sourceCss, /\.privacy-trust-card/);
  assert.match(sourceCss, /\.privacy-card/);
  assert.match(sourceCss, /\.about-banner/);
  assert.match(sourceCss, /\.about-banner-image/);
  assert.doesNotMatch(sourceCss, /about-hero-copy|about-eyebrow|about-subtitle|about-hero-points/);
  assert.match(sourceCss, /\.profile-badges/);
  assert.match(sourceCss, /\.profile-badge--founder/);
  assert.match(sourceCss, /\.about-trust-callout/);
  assert.match(sourceCss, /\.about-cta-card/);
  assert.doesNotMatch(sourceCss, /about-hero-visual|about-logo-tile|about-signal-card/);
});
