const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyEmail,
  isRelevantApplicationEmail,
  isLinkedInJobsUpdateEmail,
  isLinkedInJobsApplicationSentEmail
} = require('../../shared/emailClassifier');

test('classifyEmail rejects newsletters via denylist', () => {
  const result = classifyEmail({
    subject: 'Weekly newsletter',
    snippet: 'Unsubscribe here'
  });
  assert.equal(result.isJobRelated, false);
});

test('classifyEmail detects application confirmation', () => {
  const result = classifyEmail({
    subject: 'Application received',
    snippet: 'Thank you for applying to Acme'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'confirmation');
  assert.ok(result.confidenceScore >= 0.85);
});

test('classifyEmail detects generic thanks for applying', () => {
  const result = classifyEmail({
    subject: 'Thank you for applying!',
    snippet: ''
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'confirmation');
});

test('classifyEmail detects interview request', () => {
  const result = classifyEmail({
    subject: 'Interview invitation',
    snippet: 'Please select a time for an interview'
  });
  assert.equal(result.isJobRelated, true);
  assert.ok(['interview', 'interview_requested'].includes(result.detectedType));
});

test('classifyEmail detects high-signal human scheduling outreach', () => {
  const result = classifyEmail({
    subject: 'Can we schedule time this week?',
    snippet: 'I would like to speak with you for an hour about a technical opportunity.',
    sender: 'recruiter@gmail.com',
    body: `Hi Jason,

I would like to speak with you for an hour and can send a Zoom invitation.
Please let me know what time works for you.

Mon 3/2 3-5 pm
Tue 3/3 5-6 pm
Wed 3/4 4:00 pm

Please share your resume and transcript before the call.
Thanks`
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'interview_requested');
  assert.ok(result.confidenceScore >= 0.9);
});

test('classifyEmail ignores outbound scheduling replies from authenticated user', () => {
  const result = classifyEmail({
    subject: 'Re: Interview availability',
    snippet: 'Tuesday, March 3rd at 4:00 PM works for me.',
    sender: 'Jason Conklin <jasonconklin.dev@gmail.com>',
    body: `Hi Mike,

Tuesday, March 3rd at 4:00 PM works for me.
Please send the Zoom invite.

Best,
Jason`,
    authenticatedUserEmail: 'jasonconklin.dev@gmail.com',
    messageLabels: ['SENT']
  });
  assert.equal(result.isJobRelated, false);
  assert.equal(result.reason, 'outbound_sender');
  assert.notEqual(result.detectedType, 'interview_requested');
});

test('classifyEmail detects interview_scheduled when invite confirmation is explicit', () => {
  const result = classifyEmail({
    subject: 'Interview scheduled confirmation',
    snippet: 'Calendar invite has been sent.',
    sender: 'hiring@startup.com',
    body: `Great speaking with you.
Your interview is scheduled for 3/8 at 4:00 pm and a calendar invite has been sent.`
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'interview_scheduled');
  assert.ok(result.confidenceScore >= 0.9);
});

test('classifyEmail falls back to meeting_requested when scheduling context lacks job terms', () => {
  const result = classifyEmail({
    subject: 'Let’s schedule a call',
    snippet: 'Here are some times.',
    sender: 'founder@gmail.com',
    body: `Let's schedule.
What time works for you?
Mon 3/2 3-4 pm
Tue 3/3 5-6 pm`
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'meeting_requested');
});

test('classifyEmail keeps application submitted confirmations as applied despite vague next-step language', () => {
  const result = classifyEmail({
    subject: 'Application submitted',
    sender: 'no-reply@indeed.com',
    snippet: 'Application submitted. Good luck. The employer may reach out.',
    body: `Application submitted
Thanks for applying to Data Analyst at Acme.
Good luck.
The employer may reach out if they would like to move forward.`
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'confirmation');
  assert.notEqual(result.detectedType, 'interview_requested');
});

test("classifyEmail keeps Indeed o'clock confirmation updates as applied", () => {
  const subject = 'Indeed Application: Sr. Analyst, Business Management';
  const snippet = "Indeed o'clock Application submitted Sr. Analyst, Business Management";
  const body = [
    "Indeed o'clock",
    'Application submitted',
    'Sr. Analyst, Business Management',
    'company logo',
    'Valley National Bank - New Jersey United States',
    'star rating 3.2 602 reviews',
    'The following items were sent to Valley National Bank. Good luck!',
    '• Application',
    '• Resume',
    'Next steps',
    '• The employer or job advertiser may reach out to you about your application.'
  ].join('\n');

  const relevance = isRelevantApplicationEmail({
    subject,
    snippet,
    body,
    sender: 'indeedapply@indeed.com'
  });
  assert.equal(relevance.isRelevant, true);

  const result = classifyEmail({
    subject,
    snippet,
    body,
    sender: 'indeedapply@indeed.com'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'confirmation');
  assert.notEqual(result.detectedType, 'interview_requested');
});

test('classifyEmail keeps Pereless ATS review confirmations as applied and relevant', () => {
  const subject = 'Jobs Applied to on 04/02/2026';
  const body = [
    'ID: 255074 - Front End Web Application Developer',
    'ID: 110365 - Product Support Specialist / Web Based Software',
    '',
    'Dear Jason,',
    '',
    'Thank you for inquiring about employment opportunities with Pereless Systems.',
    'We are currently reviewing your resume and evaluating your professional credentials.',
    'If there is a match between our requirements and your experience, we will contact you to discuss the position in further detail.',
    'We wish you the best in your employment search!'
  ].join('\n');

  const relevance = isRelevantApplicationEmail({
    subject,
    body,
    sender: 'recruiting@pereless.com'
  });
  assert.equal(relevance.isRelevant, true);
  assert.ok(Array.isArray(relevance.matchedKeywords));
  assert.ok(relevance.matchedKeywords.includes('job_id_title_line'));

  const result = classifyEmail({
    subject,
    body,
    sender: 'recruiting@pereless.com'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'confirmation');
  assert.notEqual(result.detectedType, 'interview_requested');
});

test('classifyEmail keeps CBRE-style received/under-review confirmations as applied and relevant', () => {
  const subject = 'Thank you for applying at CBRE - 267657 Data Center Change Management Coordinator';
  const body = [
    'Hello Michelle,',
    '',
    'Thank you for applying to the Data Center Change Management Coordinator role. We have successfully received your application and it is currently under review.',
    '',
    'Over the coming weeks, we will be assessing applicants for this role. If your qualifications prove to be a match, we will reach out to you to schedule an interview.',
    '',
    'We may invite you to some or all of the below recruitment stages, as they help us to get a more accurate picture of who you are. Some of your interactions with us may include:',
    '- A screening interview',
    '- Face-to-face interview or Zoom Call',
    '- Assessment exercises',
    '',
    'To check the status of your application at any time, login to your profile by clicking here.',
    '',
    'Thank you,',
    'CBRE Talent Acquisition'
  ].join('\n');

  const relevance = isRelevantApplicationEmail({
    subject,
    body,
    sender: 'CBRE Talent Acquisition <donotreply@cbre.com>'
  });
  assert.equal(relevance.isRelevant, true);
  assert.ok(Array.isArray(relevance.matchedKeywords));
  assert.ok(
    relevance.matchedKeywords.includes('thank_you_for_applying_at') ||
      relevance.matchedKeywords.includes('thank_you_for_applying')
  );

  const result = classifyEmail({
    subject,
    body,
    sender: 'CBRE Talent Acquisition <donotreply@cbre.com>'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'confirmation');
  assert.notEqual(result.detectedType, 'interview_requested');
  assert.ok(Array.isArray(result?.debug?.appliedMatches));
  assert.ok(
    result.debug.appliedMatches.includes('thank_you_for_applying_at') ||
      result.debug.appliedMatches.includes('thank_you_for_applying')
  );
  assert.ok(Array.isArray(result?.debug?.negativeMatches));
  assert.ok(result.debug.negativeMatches.includes('recruitment_stages_overview'));
});

test('classifyEmail keeps employer-branded SmartRecruiters confirmations as applied despite footer unsubscribe text', () => {
  const subject = 'Thank you for applying for the Digital Marketing Summer Intern (Remote & Paid) position';
  const body = [
    'Thank you for applying for the Digital Marketing Summer Intern (Remote & Paid) position.',
    'We look forward to reviewing your application and will be in touch soon.',
    'Access My Application',
    '',
    'Our mission is to build an inclusive workplace.',
    'Follow us on social media for company updates.',
    'Privacy Policy · Terms',
    'Unsubscribe',
    'Powered by SmartRecruiters'
  ].join('\n');

  const relevance = isRelevantApplicationEmail({
    subject,
    body,
    sender: 'Acme Recruiting <notifications@smartrecruiters.com>'
  });
  assert.equal(relevance.isRelevant, true);
  assert.ok(Array.isArray(relevance.matchedKeywords));
  assert.ok(
    relevance.matchedKeywords.includes('thank_you_for_applying_for_position') ||
      relevance.matchedKeywords.includes('thank_you_for_applying')
  );

  const result = classifyEmail({
    subject,
    body,
    sender: 'Acme Recruiting <notifications@smartrecruiters.com>'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'confirmation');
  assert.notEqual(result.reason, 'denylisted');
  assert.ok(Array.isArray(result?.debug?.appliedMatches));
  assert.ok(
    result.debug.appliedMatches.includes('look_forward_reviewing_application') ||
      result.debug.appliedMatches.includes('access_my_application')
  );
});

test('classifyEmail keeps careers marketing newsletter ignored when it lacks application-specific signals', () => {
  const subject = 'Thanks for your interest in Acme careers';
  const body = [
    'Thanks for your interest in Acme.',
    'Jobs for you this week',
    'Recommended jobs based on your search',
    'View more jobs',
    'Read more',
    'Unsubscribe'
  ].join('\n');

  const relevance = isRelevantApplicationEmail({
    subject,
    body,
    sender: 'careers-news@acme.com'
  });
  assert.equal(relevance.isRelevant, false);
  assert.equal(relevance.reason, 'not_relevant');

  const result = classifyEmail({
    subject,
    body,
    sender: 'careers-news@acme.com'
  });
  assert.equal(result.isJobRelated, false);
  assert.ok(['denylisted', 'newsletter_digest'].includes(String(result.reason || '')));
});

test('classifyEmail detects job-platform message notifications as message_received', () => {
  const subject = 'New Message from United OM - Sales and Marketing Associate for Retail Pharmacy';
  const body = [
    "You've received a new message from United OM.",
    'View Message',
    'This message is nonrepliable. View this message and reply from your account.',
    'Indeed'
  ].join('\n');

  const relevance = isRelevantApplicationEmail({
    subject,
    body,
    sender: 'alerts@indeed.com'
  });
  assert.equal(relevance.isRelevant, true);
  assert.ok(
    relevance.matchedKeywords.includes('new_message_from') ||
      relevance.matchedKeywords.includes('received_new_message')
  );

  const result = classifyEmail({
    subject,
    body,
    sender: 'alerts@indeed.com'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'message_received');
  assert.ok(result.confidenceScore >= 0.84);
  assert.equal(result.reason, 'message_notification');
});

test('classifyEmail does not classify generic non-job messages as message_received', () => {
  const subject = 'New message from Community Team';
  const body = [
    'You have a new message in your account.',
    'View message',
    'Community digest',
    'Unsubscribe'
  ].join('\n');

  const relevance = isRelevantApplicationEmail({
    subject,
    body,
    sender: 'updates@example.com'
  });
  assert.equal(relevance.isRelevant, false);

  const result = classifyEmail({
    subject,
    body,
    sender: 'updates@example.com'
  });
  assert.equal(result.isJobRelated, false);
  assert.notEqual(result.detectedType, 'message_received');
});

test('classifyEmail keeps rejection/interview precedence over message_received', () => {
  const rejectionResult = classifyEmail({
    subject: 'New message from Acme Recruiting',
    body: [
      "You've received a new message from Acme.",
      'View Message',
      'We have decided to pursue other candidates for this role.'
    ].join('\n'),
    sender: 'messages@indeed.com'
  });
  assert.equal(rejectionResult.isJobRelated, true);
  assert.equal(rejectionResult.detectedType, 'rejection');

  const interviewResult = classifyEmail({
    subject: 'New message from Acme Recruiting',
    body: [
      "You've received a new message from Acme.",
      'Please share your availability for an interview this week.',
      'What time works for you? Tue 3/5 2:00 PM',
      'View Message'
    ].join('\n'),
    sender: 'messages@indeed.com'
  });
  assert.equal(interviewResult.isJobRelated, true);
  assert.ok(['interview', 'interview_requested', 'interview_scheduled'].includes(interviewResult.detectedType));
});

test('classifyEmail detects interview-stage assessment invite emails as interview requested', () => {
  const subject = 'Thank you for your interest in Remote Accounts Receivable Specialist role';
  const body = [
    'Thank you for your interest in joining our team. We’re pleased to invite you to the next step in our hiring process.',
    '',
    'Attached, you’ll find the screening test and job description, which together will serve as your initial interview.',
    'We kindly ask that you review and respond to the attached questions at your earliest convenience.',
    'Please submit your responses via email. Your answers will play a key role in helping us determine your progression to the next stage of the process.',
    '',
    'We look forward to reviewing your submission.',
    '',
    'Kind Regards,',
    'Adrian Berley',
    'Human Resources Team | HR Manager',
    'Fulcrum Vets, LLC'
  ].join('\n');

  const relevance = isRelevantApplicationEmail({
    subject,
    body,
    sender: 'Adrian Berley <adrian.berley@fulcrumvets.com>'
  });
  assert.equal(relevance.isRelevant, true);
  assert.ok(Array.isArray(relevance.matchedKeywords));
  assert.ok(
    relevance.matchedKeywords.includes('next_step_hiring_process') ||
      relevance.matchedKeywords.includes('initial_interview') ||
      relevance.matchedKeywords.includes('screening_test')
  );

  const result = classifyEmail({
    subject,
    body,
    sender: 'Adrian Berley <adrian.berley@fulcrumvets.com>'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'interview_requested');
  assert.equal(result.reason, 'interview_stage_assessment');
  assert.ok(Array.isArray(result?.debug?.interviewMatches));
  assert.ok(
    result.debug.interviewMatches.includes('next_step_hiring_process') ||
      result.debug.interviewMatches.includes('invite_next_step_hiring_process')
  );
  assert.ok(result.debug.interviewMatches.includes('screening_test'));
  assert.ok(result.debug.interviewMatches.includes('initial_interview'));
  assert.ok(result.debug.interviewMatches.includes('submit_responses'));
});

test('classifyEmail detects written assessment invitation as interview requested without scheduling link', () => {
  const result = classifyEmail({
    subject: 'Next step in our hiring process',
    sender: 'Hiring Team <careers@northstarlabs.com>',
    body: [
      'We are pleased to invite you to the next step in our hiring process for the Product Analyst role.',
      'This assessment will serve as your initial interview.',
      'Please review and respond to the attached questions and submit your responses by email.'
    ].join('\n')
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'interview_requested');
  assert.equal(result.reason, 'interview_stage_assessment');
});

test('classifyEmail keeps generic ATS process-stage language as confirmation without interview upgrade', () => {
  const subject = 'Thank you for applying at Acme Corp - 99123 Product Analyst';
  const body = [
    'Thank you for applying to the Product Analyst role.',
    'We have successfully received your application and it is currently under review.',
    'If your qualifications are a match, we will contact you.',
    'We may invite you to some or all of the below recruitment stages:',
    '- Screening interview',
    '- Team interview',
    '- Assessment'
  ].join('\n');

  const result = classifyEmail({
    subject,
    body,
    sender: 'Acme Talent Acquisition <donotreply@acme.com>'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'confirmation');
  assert.notEqual(result.detectedType, 'interview_requested');
});

test('isRelevantApplicationEmail treats "Thanks for applying" confirmations as relevant', () => {
  const relevance = isRelevantApplicationEmail({
    subject: 'Thanks for applying to EarthCam',
    sender: 'noreply@candidates.workablemail.com',
    body: [
      'EarthCam',
      'Your application for the Jr. Python Developer job was submitted successfully.'
    ].join('\n')
  });
  assert.equal(relevance.isRelevant, true);
  assert.ok(Array.isArray(relevance.matchedKeywords));
  assert.ok(relevance.matchedKeywords.includes('thanks_for_applying'));
});

test('isRelevantApplicationEmail ignores job-alert digests with multiple listings', () => {
  const relevance = isRelevantApplicationEmail({
    subject: '12 new jobs for you in New York',
    sender: 'alerts@jobplatform.com',
    snippet: 'Recommended jobs based on your search',
    body: `Job alert
Recommended jobs for you
Data Analyst - Apply now
Business Analyst - Apply now
QA Analyst - Apply now
View more jobs`
  });
  assert.equal(relevance.isRelevant, false);
  assert.equal(relevance.reason, 'not_relevant');
  assert.ok(Array.isArray(relevance.rejectedKeywords));
  assert.ok(
    relevance.rejectedKeywords.includes('jobs_for_you') ||
      relevance.rejectedKeywords.includes('recommended_jobs') ||
      relevance.rejectedKeywords.includes('job_alert')
  );
});

test('isRelevantApplicationEmail keeps Indeed recommended-jobs alerts ignored', () => {
  const relevance = isRelevantApplicationEmail({
    subject: '20 new jobs for you - Indeed',
    sender: 'alerts@indeed.com',
    snippet: 'Recommended jobs based on your search',
    body: [
      'Job alert',
      'Recommended jobs',
      'Data Analyst - Apply now',
      'Operations Analyst - Apply now',
      'Program Analyst - Apply now',
      'View more jobs'
    ].join('\n')
  });
  assert.equal(relevance.isRelevant, false);
  assert.equal(relevance.reason, 'not_relevant');
});

test('classifyEmail detects explicit schedule-an-interview requests', () => {
  const result = classifyEmail({
    subject: 'Schedule an interview with the hiring manager',
    sender: 'recruiting@company.com',
    snippet: 'Please share your availability for a phone screen.',
    body: `We would like to speak with you and invite you to interview for the role.
Please share your availability this week.
Mon 4/6 10:00 am
Tue 4/7 2:00 pm`
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'interview_requested');
});

test('classifyEmail suppresses Glassdoor-style community digest interview snippets', () => {
  const result = classifyEmail({
    subject: 'General strike concerns in QA hiring | Tech Buzz',
    snippet: 'I have an interview for the role of Lead QA and need advice.',
    sender: 'community@glassdoor.com',
    body: `Tech Buzz
View more posts
I have an interview for the role of Lead QA and need advice.
Read more
23 comments
Discover your next job
Manage Settings
Unsubscribe`
  });
  assert.equal(result.isJobRelated, false);
  assert.equal(result.reason, 'newsletter_digest');
  assert.notEqual(result.detectedType, 'interview_requested');
});

test('classifyEmail detects under review updates', () => {
  const result = classifyEmail({
    subject: 'Application status: Under review',
    snippet: 'Your application is under review.'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'under_review');
});

test('classifyEmail detects under consideration updates', () => {
  const result = classifyEmail({
    subject: 'Application update',
    snippet: 'Your application is under consideration.'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'under_review');
});

test('classifyEmail detects rejection', () => {
  const result = classifyEmail({
    subject: 'Application update',
    snippet: 'We regret to inform you that the position has been filled.'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'rejection');
});

test('classifyEmail detects rejection via moving forward language', () => {
  const result = classifyEmail({
    subject: 'Application update',
    snippet: 'We will not be moving forward with your application.'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'rejection');
});

test('classifyEmail detects detailed rejection template with job context', () => {
  const result = classifyEmail({
    subject: 'Application update',
    snippet:
      'Thank you for applying to the Outreach Coordinator/Marketer position at Embrace Psychiatric Wellness Center. Unfortunately, Embrace Psychiatric Wellness Center has moved to the next step in their hiring process, and your application was not selected at this time.'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'rejection');
  assert.ok(result.confidenceScore >= 0.95);
});

test('classifyEmail detects Indeed-style rejection', () => {
  const result = classifyEmail({
    subject: 'An update on your application from Embrace Psychiatric Wellness Center',
    snippet:
      'Thank you for applying to the Outreach Coordinator/Marketer position at Embrace Psychiatric Wellness Center. Unfortunately, your application was not selected at this time.'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'rejection');
  assert.ok(result.confidenceScore >= 0.9);
});

test('classifyEmail detects Breezy rejection', () => {
  const result = classifyEmail({
    subject: '[Job Title] Application Update',
    snippet:
      'Thank you for your interest in the Recruiter position. After reviewing your application, we have decided to move forward with candidates.'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'rejection');
  assert.ok(result.confidenceScore >= 0.9);
});

test('classifyEmail detects applytojob rejection', () => {
  const result = classifyEmail({
    subject: 'Brilliant Agency - Social Media Manager',
    snippet: 'At this time, we have decided to go in a different direction.'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'rejection');
  assert.ok(result.confidenceScore >= 0.9);
});

test('classifyEmail detects offer', () => {
  const result = classifyEmail({
    subject: 'Offer letter',
    snippet: 'We are pleased to offer you the role.'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'offer');
});

test('classifyEmail detects recruiter outreach', () => {
  const result = classifyEmail({
    subject: 'Recruiter from Acme',
    snippet: 'Reaching out about a new opportunity'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'recruiter_outreach');
});

test('classifyEmail detects other job related signals', () => {
  const result = classifyEmail({
    subject: 'Application status update',
    snippet: 'Check the candidate portal for your application.'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'other_job_related');
});

test('LinkedIn social notification is not interview (share their thoughts)', () => {
  const result = classifyEmail({
    subject: 'Ronald A. Brokenshire, PE, SE and others share their thoughts on LinkedIn',
    snippet: 'See their reaction and join the conversation',
    sender: 'notifications@linkedin.com'
  });
  assert.notEqual(result.detectedType, 'interview');
});

test('LinkedIn social notification reacted to post is not interview', () => {
  const result = classifyEmail({
    subject: 'Alex reacted to this post',
    snippet: 'View Alex’s post and your next steps',
    sender: 'notifications-noreply@linkedin.com'
  });
  assert.notEqual(result.detectedType, 'interview');
});

test('Phone screen invite with scheduling context stays interview', () => {
  const result = classifyEmail({
    subject: 'Phone screen availability',
    snippet: 'Please select a time for a phone screen with our recruiter',
    sender: 'recruiter@company.com',
    body: 'We would like to schedule a phone screen. Please share your availability or use Calendly.'
  });
  assert.ok(['interview', 'interview_requested'].includes(result.detectedType));
});

test('classifyEmail denylist overrides allowlist', () => {
  const result = classifyEmail({
    subject: 'Application received newsletter',
    snippet: 'Unsubscribe from updates'
  });
  assert.equal(result.isJobRelated, false);
});

test('classifyEmail does not treat unsubscribe-only as rejection', () => {
  const result = classifyEmail({
    subject: 'Not moving forward',
    snippet: 'Unsubscribe'
  });
  assert.equal(result.isJobRelated, false);
});

test('classifyEmail avoids rejection when no job context', () => {
  const result = classifyEmail({
    subject: 'Selection update',
    snippet: 'You were not selected for the giveaway.'
  });
  assert.notEqual(result.detectedType, 'rejection');
});

test('classifyEmail captures job id signals', () => {
  const result = classifyEmail({
    subject: 'Job ID 12345',
    snippet: ''
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'other_job_related');
});

test('classifyEmail stays conservative with neutral content', () => {
  const result = classifyEmail({
    subject: 'Hello there',
    snippet: 'Just checking in'
  });
  assert.equal(result.isJobRelated, false);
});

test('classifyEmail detects LinkedIn Easy Apply confirmation', () => {
  const result = classifyEmail({
    subject: 'Jason, your application was sent to BeaconFire Inc.',
    snippet: 'Your application was sent to BeaconFire Inc. Applied on January 23, 2026.',
    sender: 'jobs-noreply@linkedin.com'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'confirmation');
  assert.ok(result.confidenceScore >= 0.95);
  assert.equal(result.reason, 'linkedin_application_sent_confirmation');
});

test('classifyEmail detects LinkedIn confirmation from subject + body envelope', () => {
  const result = classifyEmail({
    subject: 'Jason, your application was sent to Tata Consultancy Services',
    snippet: 'Your application was sent to Tata Consultancy Services',
    body:
      'Tata Consultancy Services\nArtificial Intelligence Engineer - Entry Level\nTata Consultancy Services · Edison, NJ (On-site)\nApplied on February 6, 2026',
    sender: 'jobs-noreply@linkedin.com'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'confirmation');
  assert.ok(result.confidenceScore >= 0.95);
  assert.equal(result.reason, 'linkedin_application_sent_confirmation');
});

test('isLinkedInJobsUpdateEmail detects LinkedIn jobs update envelope', () => {
  const detected = isLinkedInJobsUpdateEmail({
    subject: 'Your application to Software Engineer at Concorde Research Technologies',
    snippet: 'Your update from Concorde Research Technologies.',
    sender: 'jobs-noreply@linkedin.com'
  });
  const notDetected = isLinkedInJobsUpdateEmail({
    subject: 'Top jobs this week on LinkedIn',
    snippet: 'Unsubscribe from these updates.',
    sender: 'notifications-noreply@linkedin.com'
  });
  assert.equal(detected, true);
  assert.equal(notDetected, false);
});

test('isLinkedInJobsApplicationSentEmail detects confirmation envelope', () => {
  const detected = isLinkedInJobsApplicationSentEmail({
    subject: 'Jason, your application was sent to Tata Consultancy Services',
    snippet: 'Your application was sent to Tata Consultancy Services',
    body: 'Applied on February 6, 2026',
    sender: 'jobs-noreply@linkedin.com'
  });
  const notDetected = isLinkedInJobsApplicationSentEmail({
    subject: 'Top jobs this week on LinkedIn',
    snippet: 'Unsubscribe from these updates.',
    sender: 'notifications-noreply@linkedin.com'
  });
  assert.equal(detected, true);
  assert.equal(notDetected, false);
});

test('classifyEmail detects LinkedIn rejection update (Concorde Research Technologies)', () => {
  const result = classifyEmail({
    subject: 'Your application to Software Engineer at Concorde Research Technologies',
    snippet:
      'Your update from Concorde Research Technologies. Unfortunately, we will not be moving forward with your application at this time.',
    sender: 'jobs-noreply@linkedin.com'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'rejection');
  assert.ok(result.confidenceScore >= 0.95);
});

test('classifyEmail detects LinkedIn rejection update (Tata Consultancy Services)', () => {
  const result = classifyEmail({
    subject: 'Your application to Data Analyst at Tata Consultancy Services',
    snippet:
      'Your update from Tata Consultancy Services. We will not be moving forward with your application.',
    sender: 'jobs-noreply@linkedin.com'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'rejection');
  assert.ok(result.confidenceScore >= 0.95);
});

test('classifyEmail detects LinkedIn rejection when phrase appears in body only', () => {
  const result = classifyEmail({
    subject: 'Your application to Full Stack Engineer at Concorde Research Technologies',
    snippet: 'Your update from Concorde Research Technologies.',
    body:
      'Thanks for your interest. Unfortunately, we will not be moving forward with your application at this time.',
    sender: 'jobs-noreply@linkedin.com'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'rejection');
  assert.ok(result.confidenceScore >= 0.97);
  assert.equal(result.reason, 'linkedin_jobs_rejection_phrase_body');
});

test('classifyEmail keeps LinkedIn jobs rejection allowlisted even with unsubscribe footer', () => {
  const result = classifyEmail({
    subject: 'Your application to Full Stack Engineer at Concorde Research Technologies',
    snippet:
      'Your update from Concorde Research Technologies. Unfortunately, we will not be moving forward with your application.',
    body:
      'Your update from Concorde Research Technologies. Unfortunately, we will not be moving forward with your application. Unsubscribe from these updates anytime.',
    sender: 'jobs-noreply@linkedin.com'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'rejection');
  assert.ok(result.confidenceScore >= 0.95);
  assert.notEqual(result.reason, 'denylisted');
});

test('classifyEmail allowlists LinkedIn jobs updates before denylist-only content', () => {
  const result = classifyEmail({
    subject: 'Your application to Software Engineer at Concorde Research Technologies',
    snippet: 'Your update from Concorde Research Technologies.',
    body: 'Your update from Concorde Research Technologies. Unsubscribe from these updates.',
    sender: 'jobs-noreply@linkedin.com'
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'other_job_related');
  assert.equal(result.reason, 'linkedin_jobs_update_allowlisted');
});

test('classifyEmail keeps LinkedIn newsletter/social notices out of rejection', () => {
  const result = classifyEmail({
    subject: 'Top jobs this week on LinkedIn',
    snippet: 'Unsubscribe from these updates at any time.',
    sender: 'notifications-noreply@linkedin.com'
  });
  assert.notEqual(result.detectedType, 'rejection');
});

test('classifyEmail rejection wins when body contains rejection cues', () => {
  const result = classifyEmail({
    subject: 'Application Update',
    snippet: 'Thank you for applying for the Full Stack role',
    body: 'We appreciate your interest. Unfortunately we are unable to move forward with your application at this time.'
  });
  assert.equal(result.detectedType, 'rejection');
});

test('classifyEmail detects Workday-style polite rejection and exposes decision debug', () => {
  const result = classifyEmail({
    subject: 'Application Update',
    sender: 'Arch Workday <arch@myworkday.com>',
    snippet: 'Thank you for your interest in Arch and taking the time to submit your application.',
    body: [
      'Hello Jason,',
      'Thank you for your interest in Arch and taking the time to submit your application for the Data Quality Analyst, Statistical Reporting, Workers Compensation position.',
      'We have carefully reviewed your application. At this time we have decided to pursue other candidates who we believe most closely meet the current needs of Arch at this time.',
      'If you have applied for other positions, please note that this message is only in reference to the Data Quality Analyst, Statistical Reporting, Workers Compensation position.',
      'We wish you all the best and hope you consider Arch for future career opportunities.'
    ].join('\n')
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'rejection');
  assert.ok(Array.isArray(result.debug?.rejectionMatches));
  assert.ok(result.debug.rejectionMatches.length > 0);
  assert.ok(Array.isArray(result.debug?.appliedMatches));
  assert.ok(result.debug.appliedMatches.length > 0);
  assert.equal(result.debug?.finalDecision, 'rejection');
});

test('classifyEmail treats pursue-other-candidates language as rejection', () => {
  const result = classifyEmail({
    subject: 'Application Update',
    snippet: 'Thank you for applying to the Data Analyst role.',
    body: [
      'Thank you for your application.',
      'After review, we decided to pursue other candidates at this time.',
      'We wish you all the best in your search.'
    ].join('\n')
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'rejection');
});

test('classifyEmail stays confirmation when no rejection cues present', () => {
  const result = classifyEmail({
    subject: 'Application Update',
    snippet: 'Thank you for applying for the Backend Engineer role',
    body: 'We received your application and will review soon.'
  });
  assert.equal(result.detectedType, 'confirmation');
});

test('classifyEmail does not misclassify conditional not selected in receipts', () => {
  const result = classifyEmail({
    subject: 'Thank you for your application to Figma',
    snippet: 'We received your application for the Product Engineer role.',
    body: 'If you are not selected for this position, we will keep your information on file. Thank you for applying.'
  });
  assert.equal(result.detectedType, 'confirmation');
});

test('classifyEmail keeps confirmation when interview language is conditional in receipt copy', () => {
  const result = classifyEmail({
    subject: 'Thank you for your submission',
    snippet: 'We have received your application.',
    body: [
      'Thank you for your submission.',
      'We have received your application.',
      'You will be contacted if we need additional information or wish to schedule an interview with you.',
      'We look forward to reviewing your application.'
    ].join('\n')
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'confirmation');
  assert.ok(
    Array.isArray(result.debug?.matchedKeywords)
      ? result.debug.matchedKeywords.includes('received_application')
      : true
  );
});

test('classifyEmail still rejects decisive not selected wording', () => {
  const result = classifyEmail({
    subject: 'Application update',
    snippet: 'Your application was not selected.',
    body: 'After careful consideration, your application was not selected for this role.'
  });
  assert.equal(result.detectedType, 'rejection');
});

test('classifyEmail detects profile submitted confirmation', () => {
  const subject = 'Profile submitted to Vertafore for Software Engineer I / #606810';
  const body =
    'We have received the profile you submitted for the Software Engineer I position. If your profile matches the requirements of the position, a member of the recruiting team will contact you.';
  const result = classifyEmail({
    subject,
    snippet: 'Profile submitted to Vertafore for Software Engineer I / #606810',
    body
  });
  assert.equal(result.detectedType, 'confirmation');
  assert.ok(result.confidenceScore >= 0.85);
});

test('classifyEmail keeps Indeed application submitted confirmation actionable', () => {
  const result = classifyEmail({
    subject: 'Indeed Application: Mobile Developer',
    sender: 'Indeed Apply <indeedapply@indeed.com>',
    snippet: 'Application submitted',
    body: `Application submitted
Mobile Developer
Visual Computer Solutions`
  });
  assert.equal(result.isJobRelated, true);
  assert.equal(result.detectedType, 'confirmation');
});
