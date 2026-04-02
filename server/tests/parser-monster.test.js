const test = require('node:test');
const assert = require('node:assert/strict');

const { parseJobEmail } = require('../src/parseJobEmail');

test('monster parser extracts Synergistic as company instead of Monster branding', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'Monster.com <no-reply@ses.monster.com>',
    fromDomain: 'ses.monster.com',
    subject: 'Application confirmation',
    text: [
      'Congratulations!',
      'Synergistic it has received your application for Junior Java developer/Entry level Data Scientist/AI engineer in New York, NY'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'monster');
  assert.equal(parsed.status, 'applied');
  assert.equal(parsed.company, 'Synergistic');
  assert.notEqual(String(parsed.company || '').toLowerCase(), 'monster');
  assert.equal(parsed.role, 'Junior Java developer/Entry level Data Scientist/AI engineer');
  assert.equal(parsed.parserDebug?.company_source, 'monster_confirmation_sentence');
  assert.equal(parsed.parserDebug?.matched_monster_company_pattern, 'company_has_received_application_for');
});

test('monster parser extracts Commonpoint as company instead of Monster branding', async () => {
  const parsed = await parseJobEmail({
    fromEmail: 'Monster.com <no-reply@ses.monster.com>',
    fromDomain: 'ses.monster.com',
    subject: 'Application confirmation',
    text: [
      'Congratulations!',
      'Commonpoint has received your application for IT Support Specialist in Forest Hills, NY'
    ].join('\n')
  });

  assert.equal(parsed.providerId, 'monster');
  assert.equal(parsed.status, 'applied');
  assert.equal(parsed.company, 'Commonpoint');
  assert.notEqual(String(parsed.company || '').toLowerCase(), 'monster');
  assert.equal(parsed.role, 'IT Support Specialist');
  assert.equal(parsed.parserDebug?.company_source, 'monster_confirmation_sentence');
  assert.equal(parsed.parserDebug?.matched_monster_company_pattern, 'company_has_received_application_for');
});

