const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.JOBTRACK_DB_PATH = ':memory:';
process.env.JOBTRACK_LOG_LEVEL = 'error';

const { startServer, stopServer } = require('../src/index');

const publicUrls = [
  'https://applictus.com/',
  'https://applictus.com/about',
  'https://applictus.com/contact',
  'https://applictus.com/privacy',
  'https://applictus.com/terms',
  'https://applictus.com/blog',
  'https://applictus.com/blog/best-free-job-application-trackers-2026',
  'https://applictus.com/blog/job-application-tracker',
  'https://applictus.com/blog/track-job-applications-from-email',
  'https://applictus.com/blog/job-application-spreadsheet-alternative',
  'https://applictus.com/blog/interview-tracker',
  'https://applictus.com/blog/how-to-track-job-applications',
  'https://applictus.com/blog/best-job-application-trackers',
  'https://applictus.com/blog/how-to-use-gmail-filters-for-job-applications'
];

const blogPaths = publicUrls
  .filter((url) => url.includes('/blog'))
  .map((url) => new URL(url).pathname);

const googleTagPaths = publicUrls.map((url) => new URL(url).pathname);
const socialImageUrl = 'https://applictus.com/applictus-banner.png';
const rootDir = path.join(__dirname, '..', '..');

function assertGoogleAdsTag(html, path) {
  const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] || '';
  assert.match(
    head,
    /<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=AW-18215087830"><\/script>/,
    `${path} should load the Google Ads gtag script in the head`
  );
  assert.match(head, /gtag\('config', 'AW-18215087830'\);/, `${path} should initialize AW-18215087830`);
  assert.equal(
    (html.match(/googletagmanager\.com\/gtag\/js\?id=AW-18215087830/g) || []).length,
    1,
    `${path} should include the Google Ads script once`
  );
  assert.equal(
    (html.match(/gtag\('config', 'AW-18215087830'\);/g) || []).length,
    1,
    `${path} should configure AW-18215087830 once`
  );
}

function assertBlogTopNavigation(html) {
  const nav = html.match(/<div class="home-nav-actions">([\s\S]*?)<\/div>/)?.[1] || '';
  assert.match(nav, /<a class="home-link" href="\/about">About<\/a>/);
  assert.match(nav, /<a class="home-link" href="\/blog">Blog<\/a>/);
  assert.match(nav, /<a class="btn btn--secondary btn--sm" href="\/app">Login<\/a>/);
  assert.match(nav, /<a class="btn btn--primary btn--sm" href="\/app">Sign up<\/a>/);
  assert.doesNotMatch(nav, /href="\/privacy"|href="\/terms"/);
}

function assertSocialPreviewImage(html, path) {
  const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] || '';
  assert.match(
    head,
    new RegExp(`<meta\\s+property="og:image"\\s+content="${socialImageUrl}"\\s*\\/>`),
    `${path} should use the Applictus banner as its Open Graph image`
  );
  assert.match(
    head,
    new RegExp(`<meta\\s+name="twitter:image"\\s+content="${socialImageUrl}"\\s*\\/>`),
    `${path} should use the Applictus banner as its Twitter image`
  );
  assert.equal((head.match(/property="og:image"/g) || []).length, 1);
  assert.equal((head.match(/name="twitter:image"/g) || []).length, 1);
}

test('vercel routes expose hidden testing page before homepage fallback', () => {
  const config = JSON.parse(fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8'));
  const routes = Array.isArray(config.routes) ? config.routes : [];
  const testingRouteIndex = routes.findIndex(
    (route) => route.src === '/testing' && route.dest === '/testing.html'
  );
  const fallbackIndex = routes.findIndex((route) => route.src === '/(.*)' && route.dest === '/index.html');

  assert.notEqual(testingRouteIndex, -1, 'Vercel should rewrite /testing to /testing.html');
  assert.notEqual(fallbackIndex, -1, 'Vercel should keep the homepage fallback route');
  assert.ok(testingRouteIndex < fallbackIndex, '/testing route must come before the homepage fallback');
});

test('sitemap.xml and robots.txt are served as crawlable SEO files', async (t) => {
  const server = await startServer(0, { log: false, host: '127.0.0.1' });
  const address = server.address();
  const baseUrl =
    address && typeof address === 'object' ? `http://localhost:${address.port}` : 'http://localhost';
  t.after(async () => {
    await stopServer();
  });

  const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`, { redirect: 'manual' });
  assert.equal(sitemapResponse.status, 200);
  assert.match(sitemapResponse.headers.get('content-type') || '', /application\/xml/);
  const sitemap = await sitemapResponse.text();
  assert.match(sitemap, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  for (const url of publicUrls) {
    assert.match(sitemap, new RegExp(`<loc>${url.replace(/\//g, '\\/')}</loc>`));
  }
  for (const excluded of ['/dashboard', '/account', '/auth/']) {
    assert.equal(sitemap.includes(excluded), false);
  }
  assert.equal(sitemap.includes('https://applictus.com/free-job-application-tracker'), false);
  assert.equal(sitemap.includes('https://applictus.com/testing'), false);

  const robotsResponse = await fetch(`${baseUrl}/robots.txt`, { redirect: 'manual' });
  assert.equal(robotsResponse.status, 200);
  assert.match(robotsResponse.headers.get('content-type') || '', /text\/plain/);
  const robots = await robotsResponse.text();
  assert.equal(
    robots.trim(),
    [
      'User-agent: *',
      'Allow: /',
      '',
      'Sitemap: https://applictus.com/sitemap.xml'
    ].join('\n')
  );
  assert.equal(robots.includes('Disallow: /applictus-banner.png'), false);

  const bannerResponse = await fetch(`${baseUrl}/applictus-banner.png`, { redirect: 'manual' });
  assert.equal(bannerResponse.status, 200);
  assert.match(bannerResponse.headers.get('content-type') || '', /image\/png/);

  const testingResponse = await fetch(`${baseUrl}/testing`, { redirect: 'manual' });
  assert.equal(testingResponse.status, 200);
  assert.match(testingResponse.headers.get('content-type') || '', /text\/html/);
  const testingHtml = await testingResponse.text();
  assert.match(testingHtml, /<meta name="robots" content="noindex, nofollow" \/>/);
  assert.match(testingHtml, /id="testing-cosmos"/);
  assert.match(testingHtml, /getContext\('webgl'/);
  assert.match(testingHtml, /testing-brand-lockup/);
  assert.match(testingHtml, /testing-brand-logo--frame1/);
  assert.match(testingHtml, /testing-brand-logo-blue--diagonal/);
  assert.match(testingHtml, /<span aria-hidden="true">pplictus<\/span>/);
  assert.match(testingHtml, /Application<\/span>\s*<span class="testing-brand-accent--status">Status<\/span>\s*<span>Tracker/);
  assert.match(testingHtml, /@keyframes testingBrandIcon/);
  assert.match(testingHtml, /class="holo-card/);
  assert.match(testingHtml, /Hidden experiment/);
  assert.doesNotMatch(testingHtml, /Track the signal in your job search/);
  assert.doesNotMatch(testingHtml, /living holographic\s+command center/);
  assert.doesNotMatch(testingHtml, /class="home-nav"|class="app-footer/);

  for (const path of blogPaths) {
    const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
    assert.equal(response.status, 200, `${path} should load directly`);
    assert.match(response.headers.get('content-type') || '', /text\/html/);
    const html = await response.text();
    assert.match(html, /<body class="home home-page blog-page/);
    assertBlogTopNavigation(html);
    assertSocialPreviewImage(html, path);
  }

  for (const path of googleTagPaths) {
    const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
    assert.equal(response.status, 200, `${path} should load for Google tag verification`);
    const csp = response.headers.get('content-security-policy') || '';
    assert.match(csp, /script-src[^;]*https:\/\/www\.googletagmanager\.com/);
    assert.match(csp, /script-src[^;]*'unsafe-inline'/);
    assert.match(csp, /connect-src[^;]*https:\/\/www\.googletagmanager\.com/);
    const html = await response.text();
    assertGoogleAdsTag(html, path);
    assertSocialPreviewImage(html, path);
  }

  const legacyFreeTrackerResponse = await fetch(`${baseUrl}/free-job-application-tracker`, {
    redirect: 'manual'
  });
  assert.equal(legacyFreeTrackerResponse.status, 301);
  assert.equal(
    legacyFreeTrackerResponse.headers.get('location'),
    '/blog/best-free-job-application-trackers-2026'
  );
});
