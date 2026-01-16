const test = require('node:test');
const assert = require('node:assert/strict');

const { extractThreadIdentity, shouldAutoCreate, matchAndAssignEvent } = require('../src/matching');
const { extractJobTitle } = require('../../shared/matching');

test('extractThreadIdentity requires company, role, and matching domain', () => {
  const identity = extractThreadIdentity({
    subject: 'Application for Product Designer at Acme',
    sender: 'Careers <jobs@acme.com>'
  });
  assert.equal(identity.companyName, 'Acme');
  assert.equal(identity.jobTitle, 'Product Designer');
  assert.ok(identity.matchConfidence >= 0.9);
});

test('extractThreadIdentity rejects mismatched domain', () => {
  const identity = extractThreadIdentity({
    subject: 'Application for Product Designer at Acme',
    sender: 'Careers <jobs@otherco.com>'
  });
  assert.ok(identity.matchConfidence < 0.9);
});

test('extractThreadIdentity handles ATS sender without role', () => {
  const identity = extractThreadIdentity({
    subject: 'Thank you for applying to Lord Abbett',
    sender: 'Lord Abbett @ icims <no-reply@icims.com>'
  });
  assert.equal(identity.companyName, 'Lord Abbett');
  assert.equal(identity.jobTitle, null);
  assert.ok(identity.companyConfidence >= 0.9);
  assert.ok(identity.matchConfidence >= 0.9);
  assert.equal(identity.isAtsDomain, true);
});

test('extractThreadIdentity uses sender display name for generic subject', () => {
  const identity = extractThreadIdentity({
    subject: 'Application Received',
    sender: 'Theo Agency <no-reply@theoagency.com>'
  });
  assert.equal(identity.companyName, 'Theo Agency');
  assert.equal(identity.jobTitle, null);
  assert.ok(identity.companyConfidence >= 0.9);
});

test('extractThreadIdentity handles generic thanks subject with sender name', () => {
  const identity = extractThreadIdentity({
    subject: 'Thank you for applying!',
    sender: 'Network Temp Inc <no-reply@networktemp.com>'
  });
  assert.equal(identity.companyName, 'Network Temp');
  assert.equal(identity.jobTitle, null);
  assert.ok(identity.companyConfidence >= 0.9);
});

test('extractThreadIdentity handles greenhouse sender and subject company', () => {
  const identity = extractThreadIdentity({
    subject: 'Thank you for applying to Natera',
    sender: 'no-reply@us.greenhouse-mail.io'
  });
  assert.equal(identity.companyName, 'Natera');
  assert.equal(identity.jobTitle, null);
  assert.ok(identity.companyConfidence >= 0.9);
  assert.equal(identity.isAtsDomain, true);
});

test('extractThreadIdentity ignores provider sender name in favor of subject company', () => {
  const identity = extractThreadIdentity({
    subject: 'Thanks for applying to CubX Inc.',
    sender: 'Workable <noreply@candidates.workablemail.com>'
  });
  assert.equal(identity.companyName, 'CubX');
  assert.notEqual(identity.companyName, 'Workable');
  assert.ok(identity.companyConfidence >= 0.88);
});

test('extractThreadIdentity derives company from Workday body signature', () => {
  const identity = extractThreadIdentity({
    subject: 'Thank you for applying!',
    sender: 'Workday <pru@myworkday.com>',
    bodyText:
      'Thank you for applying.\n\nBest Regards,\nRecruiting Team\nPrudential and its affiliates'
  });
  assert.equal(identity.companyName, 'Prudential');
  assert.ok(identity.companyConfidence >= 0.85);
});

test('extractThreadIdentity handles inline Workday signature company', () => {
  const identity = extractThreadIdentity({
    subject: 'Thank you for applying!',
    sender: 'Workday <pru@myworkday.com>',
    bodyText: 'Best Regards, Recruiting Team Prudential'
  });
  assert.equal(identity.companyName, 'Prudential');
  assert.ok(identity.companyConfidence >= 0.85);
});

test('extractThreadIdentity extracts company from Talemetry sender', () => {
  const identity = extractThreadIdentity({
    subject: 'Application Status',
    sender: 'No Reply (Metropolitan Transportation Authority) via Talemetry <noreply@talemetry.com>'
  });
  assert.equal(identity.companyName, 'Metropolitan Transportation Authority');
  assert.ok(identity.companyConfidence >= 0.88);
  assert.ok(identity.matchConfidence >= 0.9);
});

test('extractThreadIdentity rejects greeting as company name', () => {
  const identity = extractThreadIdentity({
    subject: 'Hi Shane',
    sender: 'Hi Shane <noreply@gmail.com>',
    snippet: 'Just checking in.'
  });
  assert.equal(identity.companyName, null);
});

test('extractThreadIdentity ignores signature labels without company', () => {
  const identity = extractThreadIdentity({
    subject: 'Thank you for applying!',
    sender: 'Workday <pru@myworkday.com>',
    bodyText: 'Best Regards,\nRecruiting Team'
  });
  assert.equal(identity.companyName, null);
});

test('extractThreadIdentity uses sender alias mapping for platform sender', () => {
  const identity = extractThreadIdentity({
    subject: 'Thank you for applying!',
    sender: 'Workday <pru@myworkday.com>',
    bodyText: ''
  });
  assert.equal(identity.companyName, 'Prudential');
  assert.ok(identity.companyConfidence >= 0.85);
});

test('shouldAutoCreate requires high confidence and allowed type', () => {
  const identity = extractThreadIdentity({
    subject: 'Application for Product Designer at Acme',
    sender: 'Careers <jobs@acme.com>'
  });
  const event = { detected_type: 'confirmation', classification_confidence: 0.92 };
  assert.equal(shouldAutoCreate(event, identity), true);
});

test('shouldAutoCreate allows confirmation with unknown role when company is strong', () => {
  const identity = extractThreadIdentity({
    subject: 'Thank you for applying to Lord Abbett',
    sender: 'Lord Abbett @ icims <no-reply@icims.com>'
  });
  const event = { detected_type: 'confirmation', classification_confidence: 0.92 };
  assert.equal(shouldAutoCreate(event, identity), true);
});

test('shouldAutoCreate uses classification confidence over legacy score', () => {
  const identity = extractThreadIdentity({
    subject: 'Application for Product Designer at Acme',
    sender: 'Careers <jobs@acme.com>'
  });
  const event = { detected_type: 'confirmation', confidence_score: 0.3, classification_confidence: 0.9 };
  assert.equal(shouldAutoCreate(event, identity), true);
});

test('shouldAutoCreate blocks low company confidence', () => {
  const identity = {
    companyName: 'Acme',
    jobTitle: null,
    companyConfidence: 0.8,
    matchConfidence: 0.8,
    domainConfidence: 0.9,
    isAtsDomain: true
  };
  const event = { detected_type: 'confirmation', classification_confidence: 0.92 };
  assert.equal(shouldAutoCreate(event, identity), false);
});

test('shouldAutoCreate blocks ambiguous sender domain', () => {
  const identity = {
    companyName: 'Acme',
    jobTitle: null,
    companyConfidence: 0.92,
    matchConfidence: 0.2,
    domainConfidence: 0.2,
    isAtsDomain: false
  };
  const event = { detected_type: 'confirmation', classification_confidence: 0.92 };
  assert.equal(shouldAutoCreate(event, identity), false);
});

test('matchAndAssignEvent returns reason detail for ambiguous sender', () => {
  const identity = {
    companyName: 'Acme',
    jobTitle: null,
    companyConfidence: 0.92,
    matchConfidence: 0.2,
    domainConfidence: 0.2,
    isAtsDomain: false
  };
  const event = {
    id: 'evt-1',
    detected_type: 'confirmation',
    classification_confidence: 0.92
  };
  const db = {
    prepare() {
      return {
        all() {
          return [];
        },
        get() {
          return null;
        },
        run() {
          return null;
        }
      };
    }
  };
  const result = matchAndAssignEvent({ db, userId: 'user-1', event, identity });
  assert.equal(result.action, 'unassigned');
  assert.equal(result.reason, 'ambiguous_sender');
  assert.ok(result.reasonDetail);
});

test('matchAndAssignEvent auto-creates for Workday confirmation with body company', () => {
  const subject = 'Thank you for applying!';
  const sender = 'Workday <pru@myworkday.com>';
  const bodyText =
    'Thank you for applying.\n\nBest Regards,\nRecruiting Team\nPrudential and its affiliates';
  const identity = extractThreadIdentity({ subject, sender, bodyText });
  assert.equal(identity.companyName, 'Prudential');

  const roleResult = extractJobTitle({
    subject,
    snippet: '',
    bodyText: 'We received your application for the Associate Software Engineer position.',
    sender,
    companyName: identity.companyName
  });
  assert.equal(roleResult.jobTitle, 'Associate Software Engineer');

  const db = {
    lastId: null,
    prepare(sql) {
      return {
        all() {
          return [];
        },
        get(id) {
          if (sql.startsWith('SELECT * FROM job_applications')) {
            return id === db.lastId ? { id } : null;
          }
          return null;
        },
        run(...args) {
          if (sql.startsWith('INSERT INTO job_applications')) {
            db.lastId = args[0];
          }
          return null;
        }
      };
    }
  };

  const event = {
    id: 'evt-1',
    detected_type: 'confirmation',
    classification_confidence: 0.92,
    created_at: new Date().toISOString(),
    role_title: roleResult.jobTitle,
    role_confidence: roleResult.confidence,
    role_source: roleResult.source,
    role_explanation: roleResult.explanation
  };
  const result = matchAndAssignEvent({ db, userId: 'user-1', event, identity });
  assert.equal(result.action, 'created_application');
});
