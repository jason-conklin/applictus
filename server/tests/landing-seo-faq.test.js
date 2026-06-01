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

test('landing page metadata and FAQ content are SEO-ready', () => {
  const sourceHtml = readProjectFile('web/home.html');
  const publicHtml = readProjectFile('public/index.html');
  const appShellHtml = readProjectFile('web/index.html');
  const publicAppShellHtml = readProjectFile('public/app/index.html');
  const sourceCss = readProjectFile('web/styles.css');
  const publicCss = readProjectFile('public/styles.css');

  assert.equal(publicHtml, sourceHtml);
  assert.equal(publicCss, sourceCss);
  assert.match(sourceHtml, /<title>Applictus \| Automatic Job Application Tracker<\/title>/);
  assertTopNavigation(sourceHtml);
  assertTopNavigation(appShellHtml);
  assertTopNavigation(publicAppShellHtml);
  assert.match(sourceHtml, /<a class="app-footer-link" href="\/blog">BLOG<\/a>/);
  assert.match(sourceHtml, /<a class="app-footer-link" href="\/privacy">PRIVACY<\/a>/);
  assert.match(sourceHtml, /<a class="app-footer-link" href="\/terms">TERMS<\/a>/);

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

  assert.match(sourceCss, /\.home-panel-faq/);
  assert.match(sourceCss, /\.home-faq-layout/);
  assert.match(sourceCss, /@keyframes homeFaqReveal/);
});
