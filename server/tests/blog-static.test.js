const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..');

const articles = [
  [
    'job-application-tracker',
    'Job Application Tracker | Applictus',
    '/applictus-blog-image1.png',
    'Application tracking dashboard showing job statuses, interviews, offers, and rejections'
  ],
  [
    'track-job-applications-from-email',
    'Track Job Applications From Email Automatically | Applictus',
    '/applictus-blog-image2.png',
    'Inbox-powered job application timeline organized from forwarded email updates'
  ],
  [
    'job-application-spreadsheet-alternative',
    'Job Application Spreadsheet Alternative | Applictus',
    '/applictus-blog-image3.png',
    'Job application spreadsheet alternative with an organized automatic tracking timeline'
  ],
  [
    'interview-tracker',
    'Interview Tracker for Job Seekers | Applictus',
    '/applictus-blog-image4.png',
    'Interview tracker showing upcoming hiring steps and application status updates'
  ],
  [
    'how-to-track-job-applications',
    'How To Track Job Applications Effectively | Applictus',
    '/applictus-blog-image5.png',
    'Organized job search workflow for tracking applications, follow-ups, and outcomes'
  ],
  [
    'best-job-application-trackers',
    'Best Job Application Trackers for Job Seekers in 2026 | Applictus',
    '/applictus-blog-image6.png',
    'Comparison of job application tracker tools for organizing a modern job search'
  ],
  [
    'how-to-use-gmail-filters-for-job-applications',
    'How To Use Gmail Filters For Job Applications | Applictus',
    '/applictus-blog-image7.png',
    'Gmail filters workflow for forwarding job application emails into Applictus'
  ]
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

  for (const [slug, title, imageSrc, imageAlt] of articles) {
    assert.ok(fs.existsSync(path.join(rootDir, 'public', imageSrc.replace(/^\//, ''))));
    assert.match(hub, new RegExp(`href="/blog/${slug}"`));
    assert.match(
      hub,
      new RegExp(`<img src="${imageSrc.replace(/\//g, '\\/')}" alt="${imageAlt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" loading="lazy" width="960" height="540"`)
    );
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
    assert.match(article, /class="blog-article-hero-inner"/);
    assert.match(article, /class="blog-article-hero-copy"/);
    assert.match(article, /class="blog-article-hero-image"/);
    assert.match(
      article,
      new RegExp(`<img src="${imageSrc.replace(/\//g, '\\/')}" alt="${imageAlt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" loading="eager" width="960" height="540"`)
    );
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
    '.blog-card-thumb',
    '.blog-card-content',
    '.blog-article-hero-inner',
    '.blog-article-hero-image',
    '.blog-related',
    '.blog-article-layout'
  ]) {
    assert.match(styles, new RegExp(selector.replace('.', '\\.')));
  }

  assert.doesNotMatch(styles, /\.blog-article-kicker/);
  assert.match(
    styles,
    /body\.blog-page \.blog-article-header\s*\{[\s\S]*padding: clamp\(40px, 4\.8vw, 56px\) clamp\(48px, 5\.2vw, 64px\);/
  );
  assert.match(
    styles,
    /body\.blog-page \.blog-article-hero-inner\s*\{[\s\S]*grid-template-columns: 1fr;/
  );
  assert.match(
    styles,
    /body\.blog-page \.blog-article-hero-image img\s*\{[\s\S]*object-fit: contain;/
  );
});
