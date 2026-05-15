const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('Account forwarding help uses the shared Gmail verification CTA state', () => {
  const webIndex = readProjectFile('web/index.html');
  const publicIndex = readProjectFile('public/app/index.html');
  const appJs = readProjectFile('web/app.js');

  assert.match(webIndex, /id="account-help-verification"/);
  assert.match(publicIndex, /id="account-help-verification"/);
  assert.match(appJs, /function normalizeForwardingVerificationState/);
  assert.match(appJs, /function getForwardingVerificationState/);
  assert.match(appJs, /appendForwardingVerificationHelper\(accountHelpVerification,\s*\{\s*requireVerificationLink: true/s);
  assert.match(appJs, /verificationState\.hasVerificationLink/);
  assert.match(appJs, /verificationState\.isForwardingVerified/);
  assert.match(appJs, /FORWARDING_SETUP_STATUS_POLL_MS/);
  assert.match(appJs, /routeKey === 'account' \|\| isInboundSetupModalVisible\(\)/);
});

