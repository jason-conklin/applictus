const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..');

const articles = [
  ['job-application-tracker', 'Job Application Tracker | Applictus'],
  ['track-job-applications-from-email', 'Track Job Applications From Email Automatically | Applictus'],
  ['job-application-spreadsheet-alternative', 'Job Application Spreadsheet Alternative | Applictus'],
  ['interview-tracker', 'Interview Tracker for Job Seekers | Applictus'],
  ['how-to-track-job-applications', 'How To Track Job Applications Effectively | Applictus'],
  ['best-job-application-trackers', 'Best Job Application Trackers for Job Seekers in 2026 | Applictus'],
  ['how-to-use-gmail-filters-for-job-applications', 'How To Use Gmail Filters For Job Applications | Applictus']
];

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function assertBlogTopNavigation(html) {
  const nav = html.match(/<div class="home-nav-actions">([\s\S]*?)<\/div>/)?.[1] || '';
  assert.match(nav, /<a class="home-link" href="\/about">About<\/a>/);
  assert.match(nav, /<a class="home-link" href="\/blog">Blog<\/a>/);
  assert.match(nav, /<a class="btn btn--secondary btn--sm" href="\/app">Login<\/a>/);
  assert.match(nav, /<a class="btn btn--primary btn--sm" href="\/app">Sign up<\/a>/);
  assert.doesNotMatch(nav, /href="\/privacy"|href="\/terms"/);
}

test('blog hub and articles are static, linked, and SEO-ready', () => {
  const hub = readProjectFile('web/blog/index.html');
  const publicHub = readProjectFile('public/blog/index.html');
  const styles = readProjectFile('web/styles.css');
  const publicStyles = readProjectFile('public/styles.css');

  assert.equal(publicHub, hub);
  assert.equal(publicStyles, styles);
  assert.match(hub, /<title>Applictus Blog \| Job Application Tracking Guides<\/title>/);
  assert.match(hub, /Practical guides for tracking job applications, managing interview steps/);
  assert.match(hub, /class="blog-hero-logo"/);
  assert.match(hub, /class="blog-hero-topics"/);
  assert.match(hub, /class="blog-card-grid"/);
  assert.match(hub, /class="blog-card-footer"/);
  assertBlogTopNavigation(hub);

  for (const [slug, title] of articles) {
    assert.match(hub, new RegExp(`href="/blog/${slug}"`));
    const sourcePath = `web/blog/${slug}/index.html`;
    const publicPath = `public/blog/${slug}/index.html`;
    const article = readProjectFile(sourcePath);
    assert.equal(readProjectFile(publicPath), article);
    assertBlogTopNavigation(article);
    assert.match(article, new RegExp(`<title>${title.replace(/[|]/g, '\\|')}<\\/title>`));
    assert.match(article, /<meta name="description" content="[^"]+"/);
    assert.match(article, /<link rel="canonical" href="https:\/\/applictus\.com\/blog\//);
    assert.match(article, /<a href="\/">Home<\/a>/);
    assert.match(article, /<a href="\/blog">Blog<\/a>/);
    assert.match(article, /class="blog-article-kicker"/);
    assert.match(article, /class="blog-article-title"/);
    assert.match(article, /class="blog-related"/);
    assert.match(article, /class="blog-cta"/);
    assert.doesNotMatch(article, /\/dashboard|\/account|\/auth\//);
  }

  for (const selector of [
    '.blog-hero',
    '.blog-card',
    '.blog-cta',
    '.blog-hero-logo',
    '.blog-hero-topics',
    '.blog-article-kicker',
    '.blog-related',
    '.blog-article-layout'
  ]) {
    assert.match(styles, new RegExp(selector.replace('.', '\\.')));
  }
});
