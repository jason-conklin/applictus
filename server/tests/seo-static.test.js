const test = require('node:test');
const assert = require('node:assert/strict');

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

function assertBlogTopNavigation(html) {
  const nav = html.match(/<div class="home-nav-actions">([\s\S]*?)<\/div>/)?.[1] || '';
  assert.match(nav, /<a class="home-link" href="\/about">About<\/a>/);
  assert.match(nav, /<a class="home-link" href="\/blog">Blog<\/a>/);
  assert.match(nav, /<a class="btn btn--secondary btn--sm" href="\/app">Login<\/a>/);
  assert.match(nav, /<a class="btn btn--primary btn--sm" href="\/app">Sign up<\/a>/);
  assert.doesNotMatch(nav, /href="\/privacy"|href="\/terms"/);
}

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

  for (const path of blogPaths) {
    const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
    assert.equal(response.status, 200, `${path} should load directly`);
    assert.match(response.headers.get('content-type') || '', /text\/html/);
    const html = await response.text();
    assert.match(html, /<body class="home home-page blog-page/);
    assertBlogTopNavigation(html);
  }
});
