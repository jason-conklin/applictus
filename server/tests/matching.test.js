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

test('extractThreadIdentity captures role and company from rejection template', () => {
  const identity = extractThreadIdentity({
    subject: 'Application update',
    sender: 'Embrace <no-reply@embrace.com>',
    snippet:
      'Thank you for applying to the Outreach Coordinator/Marketer position at Embrace Psychiatric Wellness Center. Unfortunately, Embrace Psychiatric Wellness Center has moved to the next step in their hiring process, and your application was not selected at this time.'
  });
  assert.equal(identity.companyName, 'Embrace Psychiatric Wellness Center');
  assert.equal(identity.jobTitle, 'Outreach Coordinator/Marketer');
  assert.ok(identity.companyConfidence >= 0.9);
  assert.ok(identity.matchConfidence >= 0.9);
});

test('extractThreadIdentity handles Indeed rejection subject pattern', () => {
  const identity = extractThreadIdentity({
    subject: 'An update on your application from Embrace Psychiatric Wellness Center',
    sender: 'Embrace Psychiatric Wellness Center <noreply@indeed.com>',
    snippet:
      'Thank you for applying to the Outreach Coordinator/Marketer position at Embrace Psychiatric Wellness Center. Unfortunately, your application was not selected at this time.'
  });
  assert.equal(identity.companyName, 'Embrace Psychiatric Wellness Center');
  assert.equal(identity.jobTitle, 'Outreach Coordinator/Marketer');
});

test('extractThreadIdentity handles Breezy rejection without greeting pollution', () => {
  const identity = extractThreadIdentity({
    subject: '[Job Title] Application Update',
    sender: 'HOATalent <no-reply@hoatalent.breezy-mail.com>',
    bodyText:
      'Hi Shane,\nThank you for your interest in the Recruiter position. After reviewing your application, we’ve decided to move forward with candidates.'
  });
  assert.equal(identity.companyName, 'HOATalent');
  assert.equal(identity.jobTitle, 'Recruiter');
});

test('extractThreadIdentity handles applytojob subject company-role pattern', () => {
  const identity = extractThreadIdentity({
    subject: 'Brilliant Agency - Social Media Manager',
    sender: 'Brilliant <recruiting@applytojob.com>',
    snippet: 'At this time, we have decided to go in a different direction.'
  });
  assert.equal(identity.companyName, 'Brilliant Agency');
  assert.equal(identity.jobTitle, 'Social Media Manager');
});

test('extractThreadIdentity prefers signature company over generic sender', () => {
  const body = `
Thank you for applying to the 2026 Technology Early Career Development Program - Full Stack Development.
We appreciate your interest.
Best Regards,
Healthfirst Talent Acquisition Team
`;
  const identity = extractThreadIdentity({
    subject: 'Thank you for applying',
    sender: 'Opportunities <opportunities@careeralerts.healthfirst.org>',
    snippet: 'Thank you for applying to the 2026 Technology Early Career Development Program - Full Stack Development',
    bodyText: body
  });
  assert.equal(identity.companyName, 'Healthfirst');
  assert.ok(identity.jobTitle && identity.jobTitle.length > 0);
  assert.notEqual(identity.companyName.toLowerCase(), 'opportunities');
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

test('matchAndAssignEvent returns reason detail for ambiguous sender', async () => {
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
  const result = await matchAndAssignEvent({ db, userId: 'user-1', event, identity });
  assert.equal(result.action, 'unassigned');
  assert.equal(result.reason, 'ambiguous_sender');
  assert.ok(result.reasonDetail);
});

test('matchAndAssignEvent auto-creates for Workday confirmation with body company', async () => {
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
  const result = await matchAndAssignEvent({ db, userId: 'user-1', event, identity });
  assert.equal(result.action, 'created_application');
});

test('extractThreadIdentity parses LinkedIn application sent confirmation', () => {
  const subject = 'Jason, your application was sent to BeaconFire Inc.';
  const sender = 'jobs-noreply@linkedin.com';
  const bodyText = `Jason, your application was sent to BeaconFire Inc.
Junior Java Developer · BeaconFire Inc. · Jersey City, NJ
Applied on January 23, 2026`;

  const identity = extractThreadIdentity({ subject, sender, bodyText });
  assert.equal(identity.companyName, 'BeaconFire Inc');
  assert.equal(identity.jobTitle, 'Junior Java Developer');
  assert.ok(identity.companyConfidence >= 0.85);
});

test('extractThreadIdentity parses LinkedIn rejection update template', () => {
  const subject = 'Your application to Software Engineer at Concorde Research Technologies';
  const sender = 'jobs-noreply@linkedin.com';
  const snippet =
    'Your update from Concorde Research Technologies. Unfortunately, we will not be moving forward with your application at this time.';

  const identity = extractThreadIdentity({ subject, sender, snippet });
  assert.equal(identity.companyName, 'Concorde Research Technologies');
  assert.equal(identity.jobTitle, 'Software Engineer');
  assert.ok(identity.companyConfidence >= 0.85);
  assert.ok((identity.roleConfidence || 0) >= 0.8);
});

test('matchAndAssignEvent auto-creates for LinkedIn Easy Apply confirmation', async () => {
  const subject = 'Jason, your application was sent to BeaconFire Inc.';
  const sender = 'jobs-noreply@linkedin.com';
  const bodyText = `Jason, your application was sent to BeaconFire Inc.
Junior Java Developer · BeaconFire Inc. · Jersey City, NJ
Applied on January 23, 2026`;
  const identity = extractThreadIdentity({ subject, sender, bodyText });

  const applications = {};
  const db = {
    prepare(sql) {
      return {
        all() {
          return [];
        },
        get(id) {
          if (sql.startsWith('SELECT * FROM job_applications')) {
            return applications[id] || null;
          }
          return null;
        },
        run(...args) {
          if (sql.startsWith('INSERT INTO job_applications')) {
            const id = args[0];
            applications[id] = { id };
          }
          return null;
        }
      };
    }
  };

  const event = {
    id: 'evt-2',
    detected_type: 'confirmation',
    classification_confidence: 0.93,
    created_at: new Date().toISOString(),
    role_title: identity.jobTitle,
    role_confidence: identity.roleConfidence,
    role_source: 'identity',
    role_explanation: identity.explanation
  };

  const result = await matchAndAssignEvent({ db, userId: 'user-1', event, identity });
  assert.equal(result.action, 'created_application');
});

test('buildUnassignedReason handles missing domain safely', async () => {
  const event = { detected_type: 'confirmation', subject: 'Test', sender: null, classification_confidence: 0.9 };
  const identity = { companyName: 'Acme', companyConfidence: 0.9, matchConfidence: 0.9, domainConfidence: 0 };
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
  const result = await matchAndAssignEvent({ db, userId: 'user-1', event, identity });
  assert.ok(result.action === 'unassigned' || result.action === 'created_application');
});

test('Workday confirmation does not fall into ambiguous sender and auto-creates', async () => {
  const subject = 'Thank You For Your Application!';
  const sender = 'pureinsurance@myworkday.com';
  const bodyText =
    'Thank you for your application to our Technology Analyst position.\nKind Regards,\nPURE’s Talent Acquisition Team';
  const identity = extractThreadIdentity({ subject, sender, bodyText });
  assert.ok(identity.companyName, 'company should be extracted');
  assert.ok(/pure/i.test(identity.companyName), `unexpected company ${identity.companyName}`);
  const db = {
    lastId: null,
    records: {},
    prepare(sql) {
      return {
        all() {
          return [];
        },
        get(id) {
          if (sql.startsWith('SELECT * FROM job_applications')) {
            return this.records ? this.records[id] : null;
          }
          return null;
        },
        run(...args) {
          if (sql.startsWith('INSERT INTO job_applications')) {
            const id = args[0];
            db.records[id] = { id };
          }
          return null;
        },
        records: db.records
      };
    }
  };

  const event = {
    id: 'evt-3',
    detected_type: 'confirmation',
    classification_confidence: 0.94,
    created_at: new Date().toISOString(),
    role_title: 'Technology Analyst',
    role_confidence: 0.9,
    role_source: 'body',
    role_explanation: 'Workday confirmation body'
  };

  const result = await matchAndAssignEvent({ db, userId: 'user-1', event, identity });
  assert.equal(result.action, 'created_application');
});

test('matchAndAssignEvent tolerates postgres-like .all() return shape (Promise/{rows})', async () => {
  const db = {
    isAsync: true,
    prepare(sql) {
      return {
        all() {
          if (sql.includes('SELECT id, job_title, role FROM job_applications')) {
            return Promise.resolve({
              rows: [{ id: 'existing-app-1', job_title: 'Full Stack Developer', role: null }]
            });
          }
          return Promise.resolve({ rows: [] });
        },
        get(id) {
          if (String(sql).startsWith('SELECT * FROM job_applications WHERE id')) {
            return Promise.resolve({ id, job_title: 'Data Engineer', role: 'Data Engineer' });
          }
          return Promise.resolve(null);
        },
        run() {
          return Promise.resolve({ changes: 1 });
        }
      };
    }
  };

  const identity = {
    companyName: 'Acme',
    companyConfidence: 0.95,
    jobTitle: 'Data Engineer',
    roleConfidence: 0.9,
    matchConfidence: 0.9,
    domainConfidence: 0.6,
    senderDomain: 'acme.com',
    isAtsDomain: false,
    isPlatformEmail: false
  };

  const event = {
    id: 'evt-1',
    sender: 'no-reply@acme.com',
    subject: 'Thanks for applying',
    snippet: '',
    detected_type: 'confirmation',
    confidence_score: 0.92,
    classification_confidence: 0.92,
    role_title: 'Data Engineer',
    role_confidence: 0.9,
    role_source: 'subject',
    created_at: new Date().toISOString()
  };

  const result = await matchAndAssignEvent({ db, userId: 'user-1', event, identity });
  assert.equal(result.action, 'created_application');
  assert.ok(result.applicationId);
});

test('matchAndAssignEvent binds archived/user_override as booleans in postgres mode', async () => {
  let insertedArgs = null;
  const db = {
    isAsync: true,
    lastId: null,
    prepare(sql) {
      return {
        all() {
          return [];
        },
        get(id) {
          if (String(sql).startsWith('SELECT * FROM job_applications WHERE id')) {
            return id === db.lastId ? { id } : null;
          }
          return null;
        },
        run(...args) {
          if (String(sql).startsWith('INSERT INTO job_applications')) {
            insertedArgs = args;
            db.lastId = args[0];
          }
          return null;
        }
      };
    }
  };

  const identity = {
    companyName: 'Acme',
    companyConfidence: 0.95,
    matchConfidence: 0.95,
    domainConfidence: 0.95,
    isAtsDomain: true,
    senderDomain: 'acme.com'
  };

  const event = {
    id: 'evt-1',
    sender: 'Acme <no-reply@acme.com>',
    subject: 'Thanks for applying',
    snippet: 'We received your application.',
    detected_type: 'confirmation',
    classification_confidence: 0.92,
    created_at: new Date().toISOString(),
    role_title: 'Engineer',
    role_confidence: 0.95,
    role_source: 'body',
    role_explanation: 'test'
  };

  const result = await matchAndAssignEvent({ db, userId: 'user-1', event, identity });
  assert.equal(result.action, 'created_application');
  assert.ok(insertedArgs);
  // archived + user_override are the 24th and 25th positional params in the INSERT.
  assert.equal(typeof insertedArgs[23], 'boolean');
  assert.equal(typeof insertedArgs[24], 'boolean');
  assert.equal(insertedArgs[23], false);
  assert.equal(insertedArgs[24], false);
});
