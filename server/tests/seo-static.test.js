const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.JOBTRACK_DB_PATH = ':memory:';
process.env.JOBTRACK_LOG_LEVEL = 'error';

const { startServer, stopServer } = require('../src/index');

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
  for (const url of [
    'https://applictus.com/',
    'https://applictus.com/about',
    'https://applictus.com/contact',
    'https://applictus.com/privacy',
    'https://applictus.com/terms'
  ]) {
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
});
