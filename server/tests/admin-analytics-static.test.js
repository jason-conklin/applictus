const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('admin analytics UI and analytics client are wired into served assets', () => {
  const sourceApp = readProjectFile('web/app/index.html');
  const publicApp = readProjectFile('public/app/index.html');
  const routerApp = readProjectFile('web/index.html');
  const sourceJs = readProjectFile('web/app.js');
  const publicJs = readProjectFile('public/app.js');
  const sourceCss = readProjectFile('web/styles.css');
  const publicCss = readProjectFile('public/styles.css');
  const analyticsJs = readProjectFile('web/analytics.js');

  assert.equal(publicJs, sourceJs);
  assert.equal(publicCss, sourceCss);
  assert.equal(readProjectFile('public/analytics.js'), analyticsJs);

  for (const html of [sourceApp, publicApp, routerApp]) {
    assert.match(html, /Growth Funnel/);
    assert.match(html, /Traffic & Acquisition/);
    assert.match(html, /Product Usage/);
    assert.match(html, /Revenue/);
    assert.match(html, /System & Ingestion Health/);
    assert.match(html, /id="admin-growth-funnel"/);
    assert.match(html, /id="admin-traffic-sources-list"/);
    assert.match(html, /30-day visitor and page-view mix by referrer, UTM source, and ad identifiers\./);
    assert.match(html, /id="admin-kpi-mrr"/);
    assert.match(html, /<option value="unique_visitors">Unique visitors<\/option>/);
    assert.match(html, /<script src="\/analytics\.js\?v=1" defer><\/script>/);
  }

  assert.match(sourceJs, /unique_visitors: 'Unique visitors'/);
  assert.match(sourceJs, /metric: 'unique_visitors'/);
  assert.match(sourceJs, /function renderAdminFunnel/);
  assert.match(sourceJs, /function renderAdminTrafficSources/);
  assert.match(sourceJs, /Other breakdown/);
  assert.match(sourceJs, /visitors/);
  assert.match(sourceJs, /growth_funnel/);
  assert.match(sourceJs, /traffic_acquisition/);
  assert.match(sourceJs, /other_breakdown_30d/);
  assert.match(sourceJs, /product_usage/);
  assert.match(sourceJs, /revenue/);
  assert.match(sourceJs, /system_ingestion_health/);

  assert.match(sourceCss, /\.admin-analytics-block/);
  assert.match(sourceCss, /\.analytics-kpi-grid--five/);
  assert.match(sourceCss, /\.admin-funnel-row/);
  assert.match(sourceCss, /\.admin-source-row/);
  assert.match(sourceCss, /\.admin-source-other-breakdown/);
  assert.match(sourceCss, /\.admin-analytics-two-col/);

  assert.match(analyticsJs, /event_name: EVENT_NAME/);
  assert.match(analyticsJs, /utm_source/);
  assert.match(analyticsJs, /gclid/);
  assert.match(analyticsJs, /visitor_id/);

  for (const relativePath of [
    'web/home.html',
    'public/index.html',
    'web/blog/index.html',
    'public/blog/index.html',
    'web/blog/job-application-tracker/index.html',
    'public/blog/job-application-tracker/index.html'
  ]) {
    assert.match(readProjectFile(relativePath), /<script src="\/analytics\.js\?v=1" defer><\/script>/);
  }
});
