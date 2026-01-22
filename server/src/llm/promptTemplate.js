let Ajv = require('ajv');
if (Ajv && Ajv.default) {
  Ajv = Ajv.default;
}

const SYSTEM_MESSAGE = `
You are a precise email parser. You must return ONLY a single JSON object matching the provided schema.
- If a value is not explicitly present, use null. NEVER guess or invent company names, job titles, or req IDs.
- Confidence must be 0.0-1.0 and evidence-based. Prefer precision over recall; null is better than a guess.
- Do not include Markdown, code fences, or any text outside the JSON object.
- The JSON must include exactly the keys required by the schema (no additional properties, no missing required fields).
- If a field is unknown, set it to null and still include the key.
- Evidence strings must be short pointers (e.g., "subject: thank you for applying", "signature: prudential") without quoting long text (>12 words).
- If the message is not job-related, set event_type to "non_job", is_job_related=false, and all entities null.
- Must follow the schema exactly with no additional properties anywhere.
`.trim();

const OUTPUT_SCHEMA = {
  $id: 'https://applictus.llm.schema/output',
  type: 'object',
  additionalProperties: false,
  required: [
    'is_job_related',
    'event_type',
    'company_name',
    'job_title',
    'external_req_id',
    'confidence',
    'signals',
    'evidence',
    'notes'
  ],
  properties: {
    is_job_related: { type: 'boolean' },
    event_type: {
      type: 'string',
      enum: [
        'confirmation',
        'rejection',
        'interview_request',
        'interview_completed',
        'offer',
        'under_review',
        'recruiter_outreach',
        'other_job_related',
        'non_job'
      ]
    },
    company_name: { type: ['string', 'null'] },
    job_title: { type: ['string', 'null'] },
    external_req_id: { type: ['string', 'null'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    signals: {
      type: 'object',
      additionalProperties: false,
      required: ['job_context_signals', 'rejection_signals', 'confirmation_signals'],
      properties: {
        job_context_signals: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 8
        },
        rejection_signals: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 8
        },
        confirmation_signals: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 8
        }
      }
    },
    evidence: {
      type: 'object',
      additionalProperties: false,
      required: ['company_source', 'role_source', 'decision_source'],
      properties: {
        company_source: {
          type: 'string',
          enum: ['from', 'subject', 'body', 'signature', 'unknown']
        },
        role_source: { type: 'string', enum: ['subject', 'body', 'unknown'] },
        decision_source: { type: 'string', enum: ['subject', 'body', 'combined', 'unknown'] }
      }
    },
    notes: { type: 'string', maxLength: 240 },
    safe_debug: {
      type: 'object',
      additionalProperties: false,
      required: ['provider_hint', 'matched_patterns'],
      properties: {
        provider_hint: { type: ['string', 'null'] },
        matched_patterns: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 10
        }
      }
    }
  }
};

const EXAMPLES = [
  {
    input: {
      from: 'no-reply@us.greenhouse-mail.io',
      subject: 'Thank you for applying to Affirm',
      snippet: 'We received your application for our Software Engineer, Early Career position.'
    },
    output: {
      is_job_related: true,
      event_type: 'confirmation',
      company_name: 'Affirm',
      job_title: 'Software Engineer, Early Career',
      external_req_id: null,
      confidence: 0.95,
      signals: {
        job_context_signals: ['received your application', 'software engineer'],
        rejection_signals: [],
        confirmation_signals: ['thank you for applying']
      },
      evidence: { company_source: 'subject', role_source: 'body', decision_source: 'combined' },
      notes: 'Affirm in subject; role in body.',
      safe_debug: { provider_hint: 'greenhouse', matched_patterns: ['thank you for applying'] }
    }
  },
  {
    input: {
      from: 'Lord Abbett @ icims <noreply@talent.icims.com>',
      subject: 'Thank you for applying to Lord Abbett',
      snippet: 'Technology Associate Rotational Program, Full-Time - Summer 2026 position'
    },
    output: {
      is_job_related: true,
      event_type: 'confirmation',
      company_name: 'Lord Abbett',
      job_title: 'Technology Associate Rotational Program, Full-Time - Summer 2026',
      external_req_id: null,
      confidence: 0.94,
      signals: {
        job_context_signals: ['application', 'position'],
        rejection_signals: [],
        confirmation_signals: ['thank you for applying']
      },
      evidence: { company_source: 'subject', role_source: 'body', decision_source: 'combined' },
      notes: 'Company in subject; role in snippet.',
      safe_debug: { provider_hint: 'icims', matched_patterns: ['thank you for applying'] }
    }
  },
  {
    input: {
      from: 'Workable <noreply@candidates.workablemail.com>',
      subject: 'Thanks for applying to CubX Inc.',
      snippet: 'Your application for the Full Stack Software Developer job was submitted successfully.'
    },
    output: {
      is_job_related: true,
      event_type: 'confirmation',
      company_name: 'CubX Inc.',
      job_title: 'Full Stack Software Developer',
      external_req_id: null,
      confidence: 0.93,
      signals: {
        job_context_signals: ['application', 'job'],
        rejection_signals: [],
        confirmation_signals: ['submitted successfully']
      },
      evidence: { company_source: 'subject', role_source: 'body', decision_source: 'combined' },
      notes: 'Company in subject; role in snippet.',
      safe_debug: { provider_hint: 'workable', matched_patterns: ['submitted successfully'] }
    }
  },
  {
    input: {
      from: 'Workday <pru@myworkday.com>',
      subject: 'Thank you for applying!',
      snippet: 'position of Software Engineer (Retirement Strategies), R-122404.',
      body_text: 'Best Regards, Recruiting Team, Prudential'
    },
    output: {
      is_job_related: true,
      event_type: 'confirmation',
      company_name: 'Prudential',
      job_title: 'Software Engineer (Retirement Strategies)',
      external_req_id: 'R-122404',
      confidence: 0.94,
      signals: {
        job_context_signals: ['position of', 'application'],
        rejection_signals: [],
        confirmation_signals: ['thank you for applying']
      },
      evidence: { company_source: 'signature', role_source: 'body', decision_source: 'combined' },
      notes: 'Company in signature; role and req in body.',
      safe_debug: { provider_hint: 'workday', matched_patterns: ['thank you for applying'] }
    }
  },
  {
    input: {
      from: '"Embrace Psychiatric Wellness Center" <noreply@indeed.com>',
      subject: 'An update on your application from Embrace Psychiatric Wellness Center',
      snippet:
        'Thank you for applying to the Outreach Coordinator/Marketer position... your application was not selected.'
    },
    output: {
      is_job_related: true,
      event_type: 'rejection',
      company_name: 'Embrace Psychiatric Wellness Center',
      job_title: 'Outreach Coordinator/Marketer',
      external_req_id: null,
      confidence: 0.96,
      signals: {
        job_context_signals: ['application', 'position'],
        rejection_signals: ['not selected', 'update on your application'],
        confirmation_signals: []
      },
      evidence: { company_source: 'subject', role_source: 'body', decision_source: 'combined' },
      notes: 'Company in subject; role in body; explicit not selected.',
      safe_debug: { provider_hint: 'indeed', matched_patterns: ['not selected'] }
    }
  },
  {
    input: {
      from: 'HOATalent <no-reply@hoatalent.breezy-mail.com>',
      subject: '[Job Title] Application Update',
      snippet: 'Hi Shane, Thank you for your interest in the Recruiter position. We’ve decided to move forward...'
    },
    output: {
      is_job_related: true,
      event_type: 'rejection',
      company_name: 'HOATalent',
      job_title: 'Recruiter',
      external_req_id: null,
      confidence: 0.95,
      signals: {
        job_context_signals: ['application update', 'interest in position'],
        rejection_signals: ['decided to move forward'],
        confirmation_signals: []
      },
      evidence: { company_source: 'from', role_source: 'body', decision_source: 'combined' },
      notes: 'Company from sender display; role in body; rejection phrase.',
      safe_debug: { provider_hint: 'breezy', matched_patterns: ['decided to move forward'] }
    }
  },
  {
    input: {
      from: 'Brilliant <recruiting@applytojob.com>',
      subject: 'Brilliant Agency - Social Media Manager',
      snippet: 'At this time, we have decided to go in a different direction.'
    },
    output: {
      is_job_related: true,
      event_type: 'rejection',
      company_name: 'Brilliant Agency',
      job_title: 'Social Media Manager',
      external_req_id: null,
      confidence: 0.94,
      signals: {
        job_context_signals: ['application', 'manager'],
        rejection_signals: ['go in a different direction'],
        confirmation_signals: []
      },
      evidence: { company_source: 'subject', role_source: 'subject', decision_source: 'subject' },
      notes: 'Company and role in subject; rejection phrase in snippet.',
      safe_debug: { provider_hint: 'applytojob', matched_patterns: ['different direction'] }
    }
  },
  {
    input: {
      from: 'LinkedIn Recruiter <recruiter@example.com>',
      subject: 'Opportunity to discuss a role',
      snippet: 'I saw your profile and would like to talk about a role at Acme Corp'
    },
    output: {
      is_job_related: true,
      event_type: 'recruiter_outreach',
      company_name: 'Acme Corp',
      job_title: null,
      external_req_id: null,
      confidence: 0.75,
      signals: {
        job_context_signals: ['opportunity', 'role'],
        rejection_signals: [],
        confirmation_signals: []
      },
      evidence: { company_source: 'body', role_source: 'unknown', decision_source: 'body' },
      notes: 'Outreach about a role; no status update.',
      safe_debug: { provider_hint: null, matched_patterns: ['opportunity'] }
    }
  },
  {
    input: {
      from: 'newsletter@example.com',
      subject: 'Weekly tips',
      snippet: 'Learn new skills each week'
    },
    output: {
      is_job_related: false,
      event_type: 'non_job',
      company_name: null,
      job_title: null,
      external_req_id: null,
      confidence: 0.98,
      signals: {
        job_context_signals: [],
        rejection_signals: [],
        confirmation_signals: []
      },
      evidence: { company_source: 'unknown', role_source: 'unknown', decision_source: 'unknown' },
      notes: 'Newsletter content; no job context.',
      safe_debug: { provider_hint: null, matched_patterns: [] }
    }
  }
];

function buildPrompt({ from, subject, snippet, bodyText }) {
  const schemaStr = JSON.stringify(OUTPUT_SCHEMA, null, 2);
  const examplesStr = EXAMPLES.map((ex, idx) => {
    return [
      `Example ${idx + 1} Input: ${JSON.stringify(ex.input)}`,
      `Example ${idx + 1} Output: ${JSON.stringify(ex.output)}`
    ].join('\n');
  }).join('\n\n');

  const userContent = [
    'Use the following schema:',
    schemaStr,
    '',
    'Examples:',
    examplesStr,
    '',
    'Classify this email:',
    JSON.stringify({ from, subject, snippet, body_text: bodyText || null })
  ].join('\n');

  return [
    { role: 'system', content: SYSTEM_MESSAGE },
    { role: 'user', content: userContent }
  ];
}

function ensureJsonOnly(text) {
  if (text.includes('```')) {
    throw new Error('Unexpected markdown fence');
  }
  const trimmed = text.trim();
  if (!(trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    throw new Error('Output is not pure JSON');
  }
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new Error('Invalid JSON');
  }
  return parsed;
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(OUTPUT_SCHEMA);

function normalizeOutput(obj) {
  const out = {};
  // Map common aliases for event_type
  const eventAlias = {
    job_application: 'confirmation',
    application: 'confirmation',
    application_confirmation: 'confirmation',
    job_rejection: 'rejection'
  };
  const allowedKeys = new Set([
    'is_job_related',
    'event_type',
    'company_name',
    'job_title',
    'external_req_id',
    'confidence',
    'signals',
    'evidence',
    'notes',
    'safe_debug'
  ]);
  for (const key of Object.keys(obj || {})) {
    if (!allowedKeys.has(key)) continue;
    out[key] = obj[key];
  }
  if (out.event_type && eventAlias[out.event_type]) {
    out.event_type = eventAlias[out.event_type];
  }
  if (out.signals) {
    out.signals = {
      job_context_signals: Array.isArray(out.signals.job_context_signals)
        ? out.signals.job_context_signals
        : out.signals.job_context_signals
        ? [String(out.signals.job_context_signals)]
        : undefined,
      rejection_signals: Array.isArray(out.signals.rejection_signals)
        ? out.signals.rejection_signals
        : out.signals.rejection_signals
        ? [String(out.signals.rejection_signals)]
        : undefined,
      confirmation_signals: Array.isArray(out.signals.confirmation_signals)
        ? out.signals.confirmation_signals
        : out.signals.confirmation_signals
        ? [String(out.signals.confirmation_signals)]
        : undefined
    };
  }
  if (out.evidence) {
    out.evidence = {
      company_source: out.evidence.company_source,
      role_source: out.evidence.role_source,
      decision_source: out.evidence.decision_source
    };
  }
  return out;
}

function validateOrThrow(outputText) {
  const parsed = ensureJsonOnly(outputText);
  const normalized = normalizeOutput(parsed);
  const valid = validate(normalized);
  if (!valid) {
    const detail = (validate.errors || []).map((e) => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`Schema validation failed: ${detail}`);
  }
  return normalized;
}

module.exports = {
  SYSTEM_MESSAGE,
  OUTPUT_SCHEMA,
  EXAMPLES,
  buildPrompt,
  validateOrThrow
};
