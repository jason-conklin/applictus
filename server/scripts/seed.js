require('dotenv').config();

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { openDb, migrate } = require('../src/db');
const { ApplicationStatus } = require('../../shared/types');

const db = openDb();
migrate(db);

const DEFAULT_COUNT = 12;
const DEFAULT_EXTRA_EVENTS = 4;
const DEMO_PASSWORD = process.env.JOBTRACK_DEMO_PASSWORD || 'applictus-demo-123';

function nowIso() {
  return new Date().toISOString();
}

function seededRandom(seedValue) {
  let state = seedValue % 2147483647;
  if (state <= 0) {
    state += 2147483646;
  }
  return function next() {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

const seedCandidate = process.env.JOBTRACK_DEMO_SEED
  ? Number(process.env.JOBTRACK_DEMO_SEED)
  : Date.now();
const seedValue = Number.isFinite(seedCandidate) ? seedCandidate : Date.now();
const random = seededRandom(seedValue);

function randomInt(min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pick(list) {
  return list[Math.floor(random() * list.length)];
}

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 20);
}

function upsertUser(email, name) {
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (existing) {
    return existing;
  }
  const id = crypto.randomUUID();
  const now = nowIso();
  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 12);
  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, auth_provider, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, email, name, passwordHash, 'password', now, now);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function createApplication(userId, companyName, jobTitle, status, options = {}) {
  const id = crypto.randomUUID();
  const now = nowIso();
  const statusSource = options.statusSource || 'user';
  const statusConfidence =
    status === ApplicationStatus.UNKNOWN ? null : statusSource === 'user' ? 1.0 : 0.92;
  const appliedAt = options.appliedAt || (status !== ApplicationStatus.UNKNOWN ? now : null);
  const lastActivityAt = options.lastActivityAt || appliedAt || now;
  db.prepare(
    `INSERT INTO job_applications
      (id, user_id, company, role, status, status_source, company_name, job_title, applied_at,
       current_status, status_confidence, status_explanation, status_updated_at, last_activity_at,
       archived, user_override, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    companyName,
    jobTitle,
    status,
    statusSource,
    companyName,
    jobTitle,
    appliedAt,
    status,
    statusConfidence,
    statusConfidence ? 'Seeded demo data.' : null,
    now,
    lastActivityAt,
    options.archived ? 1 : 0,
    statusSource === 'user' ? 1 : 0,
    now,
    now
  );
  return db.prepare('SELECT * FROM job_applications WHERE id = ?').get(id);
}

function createEmailEvent(userId, applicationId, data) {
  const id = crypto.randomUUID();
  const createdAt = data.createdAt || nowIso();
  const messageId = `seed-${crypto.randomUUID()}`;
  db.prepare(
    `INSERT INTO email_events
     (id, user_id, application_id, provider, message_id, provider_message_id, sender, subject,
      internal_date, snippet, detected_type, confidence_score, explanation, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    applicationId,
    'gmail',
    messageId,
    messageId,
    data.sender || null,
    data.subject || null,
    data.internalDate || null,
    data.snippet || null,
    data.detectedType || null,
    data.confidenceScore || null,
    data.explanation || null,
    createdAt
  );
  return id;
}

const COMPANIES = [
  'Northwind',
  'Blue Peak Labs',
  'Lighthouse AI',
  'Orbit Health',
  'Riverbend Analytics',
  'Granite Systems',
  'Summit Robotics',
  'Harbor Bank',
  'Cedarworks',
  'Avalon Mobility',
  'Brightline Solar',
  'Pioneer Data'
];

const ROLES = [
  'Product Designer',
  'Frontend Engineer',
  'Data Analyst',
  'Growth Marketer',
  'Backend Engineer',
  'Product Manager',
  'UX Researcher',
  'QA Engineer',
  'Customer Success Lead',
  'Machine Learning Engineer',
  'Operations Analyst'
];

const LOCATIONS = ['Remote', 'New York, NY', 'Austin, TX', 'Seattle, WA', 'Chicago, IL'];
const SOURCES = ['greenhouse.io', 'lever.co', 'workable.com', 'ashbyhq.com', 'job-boards'];

const STATUS_POOL = [
  ApplicationStatus.APPLIED,
  ApplicationStatus.UNDER_REVIEW,
  ApplicationStatus.INTERVIEW_REQUESTED,
  ApplicationStatus.INTERVIEW_COMPLETED,
  ApplicationStatus.OFFER_RECEIVED,
  ApplicationStatus.REJECTED,
  ApplicationStatus.GHOSTED,
  ApplicationStatus.UNKNOWN
];

const EVENT_TEMPLATES = {
  confirmation: (company, role) => ({
    subject: `Application received for ${role}`,
    snippet: `Thank you for applying to ${company}.`,
    detectedType: 'confirmation',
    confidenceScore: 0.92,
    explanation: 'Seeded confirmation event.'
  }),
  interview: (company, role) => ({
    subject: `Interview invitation for ${role}`,
    snippet: `Please choose a time to interview with ${company}.`,
    detectedType: 'interview',
    confidenceScore: 0.9,
    explanation: 'Seeded interview event.'
  }),
  rejection: (company, role) => ({
    subject: `Update on your ${role} application`,
    snippet: `We are not moving forward with ${company}.`,
    detectedType: 'rejection',
    confidenceScore: 0.95,
    explanation: 'Seeded rejection event.'
  }),
  offer: (company, role) => ({
    subject: `Offer extended for ${role}`,
    snippet: `${company} is pleased to offer you the role.`,
    detectedType: 'offer',
    confidenceScore: 0.95,
    explanation: 'Seeded offer event.'
  }),
  recruiter_outreach: (company, role) => ({
    subject: `Opportunity with ${company}`,
    snippet: `Recruiter from ${company} reaching out about ${role}.`,
    detectedType: 'recruiter_outreach',
    confidenceScore: 0.8,
    explanation: 'Seeded recruiter outreach event.'
  }),
  other_job_related: (company) => ({
    subject: `Application status update`,
    snippet: `Check the candidate portal for ${company}.`,
    detectedType: 'other_job_related',
    confidenceScore: 0.72,
    explanation: 'Seeded job-related update.'
  })
};

const STATUS_TO_EVENTS = {
  [ApplicationStatus.APPLIED]: ['confirmation'],
  [ApplicationStatus.UNDER_REVIEW]: ['confirmation', 'other_job_related'],
  [ApplicationStatus.INTERVIEW_REQUESTED]: ['confirmation', 'interview'],
  [ApplicationStatus.INTERVIEW_COMPLETED]: ['confirmation', 'interview'],
  [ApplicationStatus.OFFER_RECEIVED]: ['confirmation', 'offer'],
  [ApplicationStatus.REJECTED]: ['confirmation', 'rejection'],
  [ApplicationStatus.GHOSTED]: ['confirmation'],
  [ApplicationStatus.UNKNOWN]: ['recruiter_outreach']
};

const user = upsertUser('demo@applictus.dev', 'Demo User');
const totalApplications = Number(process.env.JOBTRACK_DEMO_COUNT) || DEFAULT_COUNT;
const extraEvents = Number(process.env.JOBTRACK_DEMO_EXTRA_EVENTS) || DEFAULT_EXTRA_EVENTS;

const applications = [];

for (let i = 0; i < totalApplications; i += 1) {
  const companyName = pick(COMPANIES);
  const jobTitle = pick(ROLES);
  const status = pick(STATUS_POOL);
  const statusSource = random() > 0.6 ? 'inferred' : 'user';
  const lastActivity = daysAgo(randomInt(1, 60));
  const appliedAt = daysAgo(randomInt(10, 90));
  const application = createApplication(user.id, companyName, jobTitle, status, {
    statusSource,
    appliedAt,
    lastActivityAt: lastActivity,
    archived: random() > 0.85
  });
  application.job_location = pick(LOCATIONS);
  application.source = pick(SOURCES);
  db.prepare(
    'UPDATE job_applications SET job_location = ?, source = ? WHERE id = ?'
  ).run(application.job_location, application.source, application.id);
  applications.push(application);
}

for (const application of applications) {
  const types = STATUS_TO_EVENTS[application.current_status] || ['other_job_related'];
  const eventCount = randomInt(1, 3);
  for (let idx = 0; idx < eventCount; idx += 1) {
    const detectedType = types[Math.min(idx, types.length - 1)];
    const template = EVENT_TEMPLATES[detectedType];
    const data = template(application.company_name, application.job_title);
    const senderDomain = slugify(application.company_name) || 'example';
    const internalDate = Date.now() - (eventCount - idx) * 3 * 24 * 60 * 60 * 1000;
    createEmailEvent(user.id, application.id, {
      sender: `talent@${senderDomain}.com`,
      subject: data.subject,
      snippet: data.snippet,
      detectedType: data.detectedType,
      confidenceScore: data.confidenceScore,
      explanation: data.explanation,
      internalDate,
      createdAt: new Date(internalDate).toISOString()
    });
  }
}

for (let i = 0; i < extraEvents; i += 1) {
  const companyName = pick(COMPANIES);
  const jobTitle = pick(ROLES);
  const data = EVENT_TEMPLATES.recruiter_outreach(companyName, jobTitle);
  createEmailEvent(user.id, null, {
    sender: `recruiter@${slugify(companyName)}.com`,
    subject: data.subject,
    snippet: data.snippet,
    detectedType: data.detectedType,
    confidenceScore: data.confidenceScore,
    explanation: data.explanation,
    internalDate: Date.now() - randomInt(1, 20) * 24 * 60 * 60 * 1000,
    createdAt: nowIso()
  });
}

console.log('Seeded demo data for demo@applictus.dev');
