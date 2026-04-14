const DENYLIST = [
  /unsubscribe/i,
  /newsletter/i,
  /promotion/i,
  /sale\b/i,
  /discount/i,
  /marketing/i
];

const NEWSLETTER_SUBJECT_PATTERNS = [
  /\bnewsletter\b/i,
  /\bdigest\b/i,
  /\bcommunity update\b/i,
  /\btech buzz\b/i,
  /\btop posts?\b/i,
  /\bjobs you may like\b/i,
  /\bdiscover your next job\b/i
];

const NEWSLETTER_FEED_PATTERNS = [
  /\bview more posts?\b/i,
  /\bread more\b/i,
  /\bcomments?\b/i,
  /\bdiscover your next job\b/i,
  /\bjobs you may like\b/i,
  /\btop posts?\b/i,
  /\btech buzz\b/i,
  /\bcommunity digest\b/i,
  /\bmanage settings\b/i,
  /\bprivacy policy\b/i,
  /\bthis message was sent to\b/i
];

const NEWSLETTER_INTERVIEW_BLOCK_PATTERNS = [
  /\bcommunity\b/i,
  /\bnewsletter\b/i,
  /\bdigest\b/i,
  /\bweekly\b/i,
  /\btop posts?\b/i,
  /\bread more\b/i,
  /\bcomments?\b/i,
  /\bdiscover your next job\b/i,
  /\bjobs you may like\b/i,
  /\bview more posts?\b/i,
  /\btech buzz\b/i,
  /\bmanage settings\b/i
];

const RELEVANCE_KEEP_SIGNALS = [
  { pattern: /\bindeed application:\s*.+/i, label: 'indeed_application_subject' },
  { pattern: /\bjobs applied to on\s+\d{1,2}\/\d{1,2}\/\d{2,4}\b/i, label: 'jobs_applied_to_subject' },
  { pattern: /\bid[:#]?\s*[A-Z0-9-]{3,}\s*[-–—]\s*[A-Za-z]/i, label: 'job_id_title_line' },
  { pattern: /\bthank you for applying at\b/i, label: 'thank_you_for_applying_at' },
  {
    pattern: /\bthank you for applying for\b.{0,160}\b(?:role|position)\b/i,
    label: 'thank_you_for_applying_for_position'
  },
  { pattern: /\bapplication submitted\b/i, label: 'application_submitted' },
  {
    pattern: /\byour application for\b.{0,140}\bwas submitted successfully\b/i,
    label: 'application_for_was_submitted_successfully'
  },
  { pattern: /\byour application was sent\b/i, label: 'application_was_sent' },
  { pattern: /\bthank you for applying\b/i, label: 'thank_you_for_applying' },
  { pattern: /\bthanks for applying\b/i, label: 'thanks_for_applying' },
  { pattern: /\bthank you for your application\b/i, label: 'thank_you_for_your_application' },
  {
    pattern: /\bwe have successfully received your application\b/i,
    label: 'successfully_received_application'
  },
  { pattern: /\bhas received your application for\b/i, label: 'has_received_your_application_for' },
  {
    pattern: /\b(?:it is|your application is)\s+currently under review\b/i,
    label: 'currently_under_review'
  },
  {
    pattern: /\bwe will be assessing applicants\b/i,
    label: 'assessing_applicants'
  },
  {
    pattern: /\bcheck the status of your application\b/i,
    label: 'check_application_status'
  },
  {
    pattern: /\bthank you for your interest in\s+.+\s+(?:role|position)\b/i,
    label: 'thank_you_interest_in_role'
  },
  {
    pattern: /\bwe look forward to reviewing your application\b/i,
    label: 'look_forward_reviewing_application'
  },
  { pattern: /\baccess my application\b/i, label: 'access_my_application' },
  {
    pattern: /\byour application for\b.{0,120}\b(?:role|position)\b/i,
    label: 'your_application_for_role_position'
  },
  { pattern: /\bnew message from\b/i, label: 'new_message_from' },
  { pattern: /\byou(?:'|’)ve received a new message(?:\s+from)?\b/i, label: 'received_new_message' },
  { pattern: /\bview message\b/i, label: 'view_message' },
  { pattern: /\breply from your account\b/i, label: 'reply_from_account' },
  { pattern: /\b(?:we(?:'|’)re|we are)\s+pleased to invite you to\b/i, label: 'pleased_to_invite' },
  { pattern: /\bnext step in our hiring process\b/i, label: 'next_step_hiring_process' },
  { pattern: /\binitial interview\b/i, label: 'initial_interview' },
  { pattern: /\bscreening test\b/i, label: 'screening_test' },
  { pattern: /\battached questions?\b/i, label: 'attached_questions' },
  { pattern: /\bsubmit your responses?\b/i, label: 'submit_responses' },
  { pattern: /\bprogression to the next stage\b/i, label: 'progression_next_stage' },
  { pattern: /\bjob description\b/i, label: 'job_description' },
  {
    pattern: /\bthank you for inquiring about employment opportunities\b/i,
    label: 'thank_you_inquiring_employment_opportunities'
  },
  { pattern: /\bwe (?:have )?received your application\b/i, label: 'received_application' },
  { pattern: /\bwe are currently reviewing your resume\b/i, label: 'reviewing_resume' },
  { pattern: /\bevaluating your professional credentials\b/i, label: 'evaluating_credentials' },
  {
    pattern: /\bif there is a match between our requirements and your experience\b/i,
    label: 'requirements_experience_match'
  },
  { pattern: /\bwe wish you the best in your employment search\b/i, label: 'employment_search_wish' },
  { pattern: /\bthe following items were sent to\b/i, label: 'items_sent_to_employer' },
  { pattern: /\bapplication (?:received|update)\b/i, label: 'application_update' },
  { pattern: /\bwe (?:will not|are not) moving forward\b/i, label: 'moving_forward_rejection' },
  { pattern: /\bnot selected\b/i, label: 'not_selected' },
  { pattern: /\bpursue other candidates\b/i, label: 'pursue_other_candidates' },
  { pattern: /\boffer (?:letter|extended|received)\b/i, label: 'offer_signal' },
  { pattern: /\b(interview|phone screen|screening call)\b/i, label: 'interview_context' },
  { pattern: /\binvite you to (?:an )?interview\b/i, label: 'interview_invite' }
];

const RELEVANCE_IGNORE_SIGNALS = [
  { pattern: /\bjobs? for you\b/i, label: 'jobs_for_you' },
  { pattern: /\brecommended jobs?\b/i, label: 'recommended_jobs' },
  { pattern: /\bbased on your search\b/i, label: 'based_on_your_search' },
  { pattern: /\bjob alert\b/i, label: 'job_alert' },
  { pattern: /\bnew jobs? in\b/i, label: 'new_jobs_in' },
  { pattern: /\bjobs you may like\b/i, label: 'jobs_you_may_like' },
  { pattern: /\bview (?:all|more) jobs?\b/i, label: 'view_more_jobs' },
  { pattern: /\bdiscover your next job\b/i, label: 'discover_next_job' }
];

const RELEVANCE_MARKETING_SIGNALS = [
  { pattern: /\bunsubscribe\b/i, label: 'unsubscribe' },
  { pattern: /\bnewsletter\b/i, label: 'newsletter' },
  { pattern: /\bdigest\b/i, label: 'digest' },
  { pattern: /\brecommended for you\b/i, label: 'recommended_for_you' }
];

const MESSAGE_RELEVANCE_LABELS = new Set([
  'new_message_from',
  'received_new_message',
  'view_message',
  'reply_from_account'
]);

const INTERVIEW_CONTEXT_SIGNAL_PATTERNS = [
  { pattern: /\binterview\b/i, label: 'interview_keyword' },
  { pattern: /\bphone screen\b|\bscreening call\b/i, label: 'phone_screen' },
  { pattern: /\b(?:we|i) would like to speak with you\b/i, label: 'speak_with_you' },
  { pattern: /\binvite you to (?:an )?interview\b/i, label: 'invite_to_interview' },
  { pattern: /\btime to meet\b/i, label: 'time_to_meet' }
];

const INTERVIEW_ACTION_SIGNAL_PATTERNS = [
  { pattern: /\bschedule\b/i, label: 'schedule' },
  { pattern: /\bavailability\b/i, label: 'availability' },
  { pattern: /\bwhat time works\b/i, label: 'what_time_works' },
  { pattern: /\bselect (?:a|your) time\b/i, label: 'select_time' },
  { pattern: /\bbook (?:a )?time\b/i, label: 'book_time' },
  { pattern: /\bcalendar invite\b/i, label: 'calendar_invite' },
  { pattern: /\bzoom (?:invitation|invite)\b/i, label: 'zoom_invite' }
];

const INTERVIEW_DIRECT_CTA_PATTERNS = [
  { pattern: /\bplease (?:share|send|provide).{0,40}\b(?:availability|time slots?)\b/i, label: 'share_availability' },
  { pattern: /\bplease (?:select|choose|book).{0,25}\b(?:time|slot)\b/i, label: 'select_slot' },
  { pattern: /\bare you available\b/i, label: 'are_you_available' },
  { pattern: /\bhere are some times?\b/i, label: 'here_are_times' }
];

const INTERVIEW_STAGE_INVITE_PATTERNS = [
  { pattern: /\b(?:we(?:'|’)re|we are)\s+pleased to invite you to\b/i, label: 'pleased_to_invite' },
  { pattern: /\binvite you to the next step in our hiring process\b/i, label: 'invite_next_step_hiring_process' },
  { pattern: /\bnext step in our hiring process\b/i, label: 'next_step_hiring_process' }
];

const INTERVIEW_STAGE_ASSESSMENT_PATTERNS = [
  { pattern: /\binitial interview\b/i, label: 'initial_interview' },
  { pattern: /\bscreening test\b/i, label: 'screening_test' },
  { pattern: /\battached questions?\b/i, label: 'attached_questions' },
  { pattern: /\bassessment\b/i, label: 'assessment' },
  { pattern: /\bjob description\b/i, label: 'job_description' }
];

const INTERVIEW_STAGE_ACTION_PATTERNS = [
  { pattern: /\bsubmit your responses?\b/i, label: 'submit_responses' },
  { pattern: /\breview and respond\b/i, label: 'review_and_respond' },
  { pattern: /\bat your earliest convenience\b/i, label: 'earliest_convenience' },
  { pattern: /\bprogression to the next stage\b/i, label: 'progression_to_next_stage' },
  { pattern: /\breviewing your submission\b/i, label: 'reviewing_submission' }
];

const INTERVIEW_VAGUE_SIGNAL_PATTERNS = [
  { pattern: /\bnext steps\b/i, label: 'next_steps' },
  { pattern: /\bmay reach out\b/i, label: 'may_reach_out' },
  { pattern: /\bwe will contact you\b/i, label: 'will_contact_you' },
  { pattern: /\breviewing your application\b/i, label: 'reviewing_application' },
  { pattern: /\bunder consideration\b/i, label: 'under_consideration' }
];

const INTERVIEW_PROCESS_ONLY_SIGNAL_PATTERNS = [
  { pattern: /\bover the coming weeks\b/i, label: 'future_process_timeline' },
  {
    pattern: /\bif your qualifications (?:prove to be|are) a match\b/i,
    label: 'conditional_match_language'
  },
  {
    pattern: /\bwe (?:are|(?:'|’)re)? planning to schedule interviews?\b/i,
    label: 'planning_future_interviews'
  },
  {
    pattern: /\binterviews?\b.{0,40}\b(?:in|over)\s+the\s+next\s+\d+\s+(?:day|days|week|weeks|month|months)\b/i,
    label: 'future_interview_window'
  },
  {
    pattern: /\bwe (?:may|might) invite you to some or all of the (?:below )?recruitment stages\b/i,
    label: 'recruitment_stages_overview'
  },
  {
    pattern: /\bsome of your interactions with us may include\b/i,
    label: 'process_stage_examples'
  },
  { pattern: /\bwe will be assessing applicants\b/i, label: 'assessment_phase_language' }
];

const INTERVIEW_CONDITIONAL_SIGNAL_PATTERNS = [
  {
    pattern: /\bif\b.{0,140}\b(?:wish|want|would like|plan|need)\b.{0,60}\bschedule\b.{0,40}\binterview\b/i,
    label: 'if_wish_to_schedule_interview'
  },
  {
    pattern: /\bif we need additional information or wish to schedule an interview\b/i,
    label: 'if_need_info_or_schedule_interview'
  },
  {
    pattern: /\bif you are among the qualified candidates\b/i,
    label: 'if_among_qualified_candidates'
  },
  {
    pattern: /\byou will receive an email\b.{0,120}\bschedule\b.{0,40}\binterview\b/i,
    label: 'will_receive_email_to_schedule_interview'
  },
  {
    pattern: /\bif selected for (?:an )?interview\b/i,
    label: 'if_selected_for_interview'
  },
  {
    pattern: /\b(?:may|might|will)\s+contact you\b.{0,90}\b(?:schedule\b.{0,30}\binterview|interview)\b/i,
    label: 'may_contact_you_to_interview'
  },
  {
    pattern: /\bwe will contact you if\b.{0,120}\binterview\b/i,
    label: 'will_contact_you_if_interview'
  }
];

const MESSAGE_NOTIFICATION_SIGNAL_PATTERNS = [
  { pattern: /\bnew message from\b/i, label: 'new_message_from' },
  {
    pattern: /\byou(?:'|’)ve received a new message(?:\s+from)?\b/i,
    label: 'received_new_message'
  },
  { pattern: /\bview message\b/i, label: 'view_message' },
  { pattern: /\breply from your account\b/i, label: 'reply_from_account' },
  { pattern: /\b(?:non[- ]?repliable|do not reply directly)\b/i, label: 'non_repliable' }
];

const MESSAGE_NOTIFICATION_NEGATIVE_PATTERNS = [
  /\b(commented on|reacted to|liked your post|community|digest|newsletter)\b/i,
  /\bpassword reset\b/i,
  /\bsecurity alert\b/i,
  /\border (?:update|confirmation)\b/i,
  /\bsupport ticket\b/i
];

const LINKEDIN_NON_JOB_NOTIFICATION_SIGNAL_PATTERNS = [
  { pattern: /\byour posts? got\b/i, label: 'linkedin_posts_got' },
  { pattern: /\bimpressions?\b/i, label: 'linkedin_impressions' },
  { pattern: /\byour audience showed up\b/i, label: 'linkedin_audience_showed_up' },
  { pattern: /\bview all analytics\b/i, label: 'linkedin_view_all_analytics' },
  { pattern: /\bstart your next post\b/i, label: 'linkedin_start_next_post' },
  { pattern: /\bposting at least once a week\b/i, label: 'linkedin_posting_once_week' },
  { pattern: /\bcommenting on posts?\b/i, label: 'linkedin_commenting_on_posts' },
  { pattern: /\badding an image to your post\b/i, label: 'linkedin_add_image_post' },
  { pattern: /\bprofile views?\b/i, label: 'linkedin_profile_views' },
  { pattern: /\bfollowers?\b/i, label: 'linkedin_followers' },
  {
    pattern: /\breactions?, comments?, and reposts?\b/i,
    label: 'linkedin_reactions_comments_reposts'
  },
  { pattern: /\bcontent(?:\s+)?performance\b/i, label: 'linkedin_content_performance' },
  { pattern: /\bcreator(?:\s+)?analytics\b/i, label: 'linkedin_creator_analytics' }
];

const SOCIAL_ANALYTICS_SIGNAL_PATTERNS = [
  { pattern: /\bimpressions?\b/i, label: 'social_impressions' },
  { pattern: /\bprofile views?\b/i, label: 'social_profile_views' },
  { pattern: /\bfollowers?\b/i, label: 'social_followers' },
  { pattern: /\breactions?\b/i, label: 'social_reactions' },
  { pattern: /\bcomments?\b/i, label: 'social_comments' },
  { pattern: /\breposts?\b/i, label: 'social_reposts' },
  { pattern: /\bview all analytics\b/i, label: 'social_view_all_analytics' },
  { pattern: /\bstart your next post\b/i, label: 'social_start_next_post' },
  { pattern: /\bpost performance\b/i, label: 'social_post_performance' },
  { pattern: /\baudience\b/i, label: 'social_audience' }
];

const INTERVIEW_DIRECT_INTENT_PATTERNS = [
  /\bi would like to speak with you\b/i,
  /\bwe would like to speak with you\b/i,
  /\bcan speak with you\b/i,
  /\binvite you to (?:an )?interview\b/i,
  /\blet(?:'|’)s schedule\b/i,
  /\bare you available\b/i,
  /\bhere are some times?\b/i,
  /\bwhat time works\b/i,
  /\bzoom (?:invitation|invite)\b/i,
  /\bcalendar invite\b/i,
  /\bphone screen\b|\bscreening call\b/i,
  /\bplease select (?:a|your) time\b/i,
  /\bschedule (?:an?|your)\s+(?:interview|call|phone screen)\b/i,
  /\bsend (?:a )?(?:zoom|calendar) (?:invitation|invite)\b/i
];

const INTERVIEW_SUBJECT_SIGNAL_PATTERN =
  /\b(interview(?:\s+(?:request|invitation|invite|availability|schedule|scheduled|scheduling))?|phone screen|screening call|next steps|invitation)\b/i;

const CANDIDATE_PERSONALIZATION_PATTERNS = [
  /(?:^|\n)\s*(?:hi|hello|dear)\s+[a-z][a-z' -]{1,40}[,!\s]/i,
  /\byour application\b/i,
  /\byour resume\b/i,
  /\byour candidacy\b/i,
  /\bposition you applied(?: for)?\b/i,
  /\byou applied\b/i,
  /\bfor your application\b/i
];

const LINKEDIN_CONFIRMATION_RULE = {
  name: 'linkedin_application_sent_confirmation',
  detectedType: 'confirmation',
  confidence: 0.95,
  requiresJobContext: false,
  senderPattern: /jobs-noreply@linkedin\.com/i,
  subjectPattern: /^(?:.+,\s*)?your application was sent to\s+.+$/i,
  bodyPatterns: [/your application was sent to/i, /applied on\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}/i]
};

const LINKEDIN_REJECTION_RULE = {
  name: 'linkedin_application_rejection_update',
  detectedType: 'rejection',
  confidence: 0.97,
  senderPattern: /jobs-noreply@linkedin\.com/i,
  subjectPattern: /^your application to\s+.+\s+at\s+.+/i,
  bodyPatterns: [
    /unfortunately,\s*we will not be moving forward with your application/i,
    /we will not be moving forward with your application/i,
    /not be moving forward with your application/i
  ]
};

const STRONG_REJECTION_SIGNALS = [
  { pattern: /unable to move forward/i, label: 'unable to move forward' },
  { pattern: /we are unable to move forward/i, label: 'we are unable to move forward' },
  { pattern: /not move forward with your application/i, label: 'not move forward with your application' },
  { pattern: /decided to pursue other candidates/i, label: 'decided to pursue other candidates' },
  { pattern: /moving forward with other candidates/i, label: 'moving forward with other candidates' },
  { pattern: /we will not be moving forward/i, label: 'we will not be moving forward' },
  { pattern: /we(?:'| )?ve decided to pursue other candidates/i, label: "we've decided to pursue other candidates" },
  {
    pattern: /after careful consideration[, ]+(?:we )?(?:are )?(?:not|unable|declined|declining|will not)/i,
    label: 'after careful consideration'
  },
  {
    pattern: /unfortunately[, ]+(?:we )?(?:are )?(?:not|unable|declined|declining|will not|can(?:not|'t) move forward|pursue other candidates)/i,
    label: 'unfortunately ... not moving forward'
  },
  {
    pattern: /\bwe (?:have )?decided to pursue other candidates\b/i,
    label: 'we have decided to pursue other candidates'
  },
  { pattern: /\bpursue other candidates\b/i, label: 'pursue other candidates' },
  {
    pattern: /\bwe will not be moving forward with your (?:application|candidacy)\b/i,
    label: 'we will not be moving forward with your candidacy'
  },
  {
    pattern: /\bwe are not moving forward with your (?:application|candidacy)\b/i,
    label: 'we are not moving forward with your candidacy'
  }
];

const SOFT_REJECTION_SIGNALS = [
  {
    pattern: /\bwe have carefully reviewed your application\b/i,
    label: 'we have carefully reviewed your application'
  },
  {
    pattern: /\bwe wish you all the best\b/i,
    label: 'we wish you all the best'
  },
  {
    pattern: /\bhope you consider\b.{0,120}\bfuture career opportunities\b/i,
    label: 'hope you consider us for future career opportunities'
  },
  {
    pattern: /\b(?:this message is )?only in reference to\b/i,
    label: 'only in reference to this position'
  }
];

const APPLIED_COURTESY_SIGNALS = [
  { pattern: /\bthank you for your interest\b/i, label: 'thank you for your interest' },
  { pattern: /\bthank you for your application\b/i, label: 'thank you for your application' },
  { pattern: /\bthank you for applying\b/i, label: 'thank you for applying' },
  {
    pattern: /\bthank you for .*submit your application\b/i,
    label: 'thank you for taking the time to submit your application'
  }
];

const APPLIED_CONFIRMATION_SIGNAL_PATTERNS = [
  { pattern: /\bthank you for applying at\b/i, label: 'thank_you_for_applying_at' },
  {
    pattern: /\bthank you for applying for\b.{0,160}\b(?:role|position)\b/i,
    label: 'thank_you_for_applying_for_position'
  },
  { pattern: /\bapplication submitted\b/i, label: 'application_submitted' },
  {
    pattern: /\byour application for\b.{0,140}\bwas submitted successfully\b/i,
    label: 'application_for_was_submitted_successfully'
  },
  { pattern: /\byour application was sent\b/i, label: 'application_was_sent' },
  { pattern: /\bhas received your application for\b/i, label: 'has_received_your_application_for' },
  { pattern: /\bwe have successfully received your application\b/i, label: 'successfully_received_application' },
  { pattern: /\b(?:it is|your application is)\s+currently under review\b/i, label: 'currently_under_review' },
  { pattern: /\bwe will be assessing applicants\b/i, label: 'assessing_applicants' },
  { pattern: /\bcheck the status of your application\b/i, label: 'check_application_status' },
  { pattern: /\bwe (?:have )?received your application\b/i, label: 'received_application' },
  { pattern: /\bthanks for applying\b/i, label: 'thanks_for_applying' },
  { pattern: /\bjobs applied to on\s+\d{1,2}\/\d{1,2}\/\d{2,4}\b/i, label: 'jobs_applied_to_subject' },
  { pattern: /\bid[:#]?\s*[A-Z0-9-]{3,}\s*[-–—]\s*[A-Za-z]/i, label: 'job_id_title_line' },
  {
    pattern: /\bthank you for inquiring about employment opportunities\b/i,
    label: 'thank_you_inquiring_employment_opportunities'
  },
  { pattern: /\bwe are currently reviewing your resume\b/i, label: 'reviewing_resume' },
  { pattern: /\bevaluating your professional credentials\b/i, label: 'evaluating_credentials' },
  {
    pattern: /\bif there is a match between our requirements and your experience\b/i,
    label: 'requirements_experience_match'
  },
  { pattern: /\bwe wish you the best in your employment search\b/i, label: 'employment_search_wish' },
  { pattern: /\bthe following items were sent to\b/i, label: 'items_sent_to_employer' },
  { pattern: /\bgood luck(?: with| in)? (?:your )?(?:application|job search|search)?\b/i, label: 'good_luck' },
  { pattern: /\bindeed application:\s*.+/i, label: 'indeed_application_subject' },
  {
    pattern: /\bwe look forward to reviewing your application\b/i,
    label: 'look_forward_reviewing_application'
  },
  { pattern: /\baccess my application\b/i, label: 'access_my_application' },
  {
    pattern: /\byour application for\b.{0,120}\b(?:role|position)\b/i,
    label: 'your_application_for_role_position'
  },
  {
    pattern: /\b(?:employer|job advertiser) may reach out to you about your application\b/i,
    label: 'may_reach_out_about_application'
  }
];

const APPLIED_DENYLIST_OVERRIDE_SIGNAL_LABELS = new Set([
  'thank_you_for_applying_at',
  'thank_you_for_applying_for_position',
  'thank_you_for_applying',
  'thanks_for_applying',
  'thank_you_for_your_application',
  'application_submitted',
  'application_for_was_submitted_successfully',
  'application_was_sent',
  'successfully_received_application',
  'has_received_your_application_for',
  'received_application',
  'your_application_for_role_position',
  'look_forward_reviewing_application',
  'access_my_application'
]);

const SCHEDULING_INTENT_PATTERNS = [
  { pattern: /i would like to speak with you/i, score: 18 },
  { pattern: /can speak with you/i, score: 14 },
  { pattern: /let(?:'|’)s schedule/i, score: 16 },
  { pattern: /\bavailable\b/i, score: 10 },
  { pattern: /here are some times?/i, score: 16 },
  { pattern: /what time works/i, score: 16 },
  { pattern: /zoom (?:invitation|invite)/i, score: 15 },
  { pattern: /calendar invite/i, score: 15 },
  { pattern: /phone screen|screening call/i, score: 16 },
  { pattern: /\binterview\b/i, score: 12 },
  { pattern: /\b(schedule|scheduling)\b/i, score: 10 }
];

const SCHEDULING_JOB_CONTEXT_PATTERNS = [
  /\bresume\b/i,
  /\btranscript\b/i,
  /\btechnical\b/i,
  /\bposition\b/i,
  /\brole\b/i,
  /\bopportunity\b/i,
  /\bprojects?\b/i,
  /\bclasses?\b/i
];

const DAY_ABBR_PATTERN =
  /\b(?:mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)\b/i;
const TIME_SLOT_PATTERN =
  /\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\d{1,2}\s*(?:-|–|to)\s*\d{1,2}\s*(?:am|pm)\b|\d{1,2}:\d{2}\b)/i;
const DATE_SLOT_PATTERN = /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/;
const TIME_SLOT_PATTERN_GLOBAL =
  /\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\d{1,2}\s*(?:-|–|to)\s*\d{1,2}\s*(?:am|pm)\b|\d{1,2}:\d{2}\b)/gi;
const DATE_SLOT_PATTERN_GLOBAL = /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/gi;
const EXPLICIT_SCHEDULED_PATTERNS = [
  /calendar invite (?:has been|was) sent/i,
  /invite has been sent/i,
  /scheduled for\b/i,
  /confirmed for\b/i
];

const PROFILE_SUBMITTED_RULE = {
  name: 'profile_submitted_confirmation',
  detectedType: 'confirmation',
  confidence: 0.92,
  requiresJobContext: true,
  patterns: [
    /\bprofile submitted to\b/i,
    /\bprofile submitted to\s+.+\s+for\s+.+\s*[\/|]\s*#?\d+/i,
    /\bwe have received the profile you submitted\b/i,
    /\breceived the profile you submitted for the\b/i,
    /\bif your profile matches the requirements\b/i
  ]
};

function isConditionalNotSelected(text) {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  const exact = /\bif\s+you(?:'re|\s+are)\s+not\s+selected\b/;
  if (exact.test(lower)) return true;
  const phrases = [
    /\bif you are not selected for this (?:position|role)\b/,
    /\bshould you not be selected\b/,
    /\bin the event you are not selected\b/
  ];
  if (phrases.some((p) => p.test(lower))) return true;
  const conditionalWindow =
    /(if|should|in the event|whether|may|might|could|please note that if)[^]{0,80}?not selected/;
  return conditionalWindow.test(lower);
}

function hasConfirmationReceiptCues(text) {
  if (!text) return false;
  return (
    /we (?:have )?received your application/i.test(text) ||
    /thank you for your application/i.test(text) ||
    /thank you for applying/i.test(text) ||
    /application received/i.test(text)
  );
}

function hasDecisionRejectionCues(text) {
  if (!text) return false;
  const strongMatches = collectSignalMatches(STRONG_REJECTION_SIGNALS, text);
  if (strongMatches.length > 0) {
    return true;
  }
  const softMatches = collectSignalMatches(SOFT_REJECTION_SIGNALS, text);
  return softMatches.length >= 2;
}

function hasAppliedConfirmationSignals(text) {
  if (!text) return false;
  const indeedConfirmationEnvelope =
    /\bindeed application:\s*.+/i.test(text) &&
    /\b(?:application submitted|the following items were sent to|good luck)\b/i.test(text);
  const atsReviewConfirmationEnvelope =
    /\bjobs applied to on\s+\d{1,2}\/\d{1,2}\/\d{2,4}\b/i.test(text) &&
    /\bid[:#]?\s*[A-Z0-9-]{3,}\s*[-–—]\s*[A-Za-z]/i.test(text) &&
    /\b(?:reviewing your resume|evaluating your professional credentials|thank you for inquiring about employment opportunities)\b/i.test(
      text
    );
  return (
    /\bthank you for applying at\b/i.test(text) ||
    /\bthank you for applying for\b.{0,160}\b(?:role|position)\b/i.test(text) ||
    /\bapplication submitted\b/i.test(text) ||
    /\byour application for\b.{0,140}\bwas submitted successfully\b/i.test(text) ||
    /\byour application was sent\b/i.test(text) ||
    /\bhas received your application for\b/i.test(text) ||
    /\bwe have successfully received your application\b/i.test(text) ||
    /\b(?:it is|your application is)\s+currently under review\b/i.test(text) ||
    /\bwe will be assessing applicants\b/i.test(text) ||
    /\bcheck the status of your application\b/i.test(text) ||
    /\bthank you for applying\b/i.test(text) ||
    /\bthanks for applying\b/i.test(text) ||
    /\bwe (?:have )?received your application\b/i.test(text) ||
    /\bthank you for inquiring about employment opportunities\b/i.test(text) ||
    /\bwe are currently reviewing your resume\b/i.test(text) ||
    /\bevaluating your professional credentials\b/i.test(text) ||
    /\bif there is a match between our requirements and your experience\b/i.test(text) ||
    /\bwe look forward to reviewing your application\b/i.test(text) ||
    /\baccess my application\b/i.test(text) ||
    /\byour application for\b.{0,120}\b(?:role|position)\b/i.test(text) ||
    /\bwe wish you the best in your employment search\b/i.test(text) ||
    /\bgood luck(?: with| in)? (?:your )?(?:application|job search|search)?\b/i.test(text) ||
    indeedConfirmationEnvelope ||
    atsReviewConfirmationEnvelope
  );
}

function collectAppliedConfirmationSignals(text) {
  return collectSignalMatches(APPLIED_CONFIRMATION_SIGNAL_PATTERNS, text);
}

function hasStrongAppliedConfirmationBypass(matches, text) {
  const signalLabels = Array.isArray(matches) ? matches : [];
  const strongCount = signalLabels.filter((label) =>
    APPLIED_DENYLIST_OVERRIDE_SIGNAL_LABELS.has(String(label || ''))
  ).length;
  const sourceText = String(text || '');
  const hasApplicationContext = /\b(?:application|applied)\b/i.test(sourceText);
  const hasRoleContext = /\b(?:role|position)\b/i.test(sourceText);
  const hasPortalCue = /\baccess my application\b/i.test(sourceText);
  const hasReviewCue = /\bwe look forward to reviewing your application\b/i.test(sourceText);
  return strongCount >= 2 || (strongCount >= 1 && hasApplicationContext && hasRoleContext && (hasPortalCue || hasReviewCue));
}

const RULES = [
  {
    name: 'offer',
    detectedType: 'offer',
    confidence: 0.95,
    patterns: [
    /offer (?:letter|extended|of employment)/i,
    /we (?:are|re) pleased to offer/i,
    /congratulations.+offer/i,
    /offer(?:ing)? you the (?:position|role)/i
  ]
  },
  {
    name: 'rejection',
    detectedType: 'rejection',
    confidence: 0.95,
    requiresJobContext: true,
  patterns: [
    /not moving forward/i,
    /no longer under consideration/i,
    /not selected/i,
    /regret to inform/i,
    /unable to move forward/i,
    /we are unable to move forward/i,
    /after careful consideration/i,
    /after reviewing your application,? we(?:'| have)?(?:\s+)?decided to move forward/i,
    /we (?:have )?decided to move forward with other candidates/i,
    /we(?:'| have)?(?:\s+)?decided to pursue other candidates/i,
    /we (?:have )?decided to pursue other candidates/i,
    /decided to pursue other candidates/i,
    /pursue other candidates/i,
    /we (?:have )?chosen other candidates/i,
    /we (?:have )?chosen other applicants/i,
    /we (?:will not|won't) be moving forward/i,
    /we are not moving forward with your (?:application|candidacy)/i,
    /we have carefully reviewed your application/i,
    /we wish you all the best/i,
    /hope you consider .* future career opportunities/i,
    /(?:this message is )?only in reference to/i,
    /we(?:'| have)?(?:\s+)?decided to go in a different direction/i,
    /moved to the next step in (?:their )?hiring process/i,
    /will not be moving forward/i,
    /we will not be moving forward/i,
    /application (?:was|has been) not selected/i,
    /your application was not selected/i,
      /unfortunately.+(?:application|candidacy|role|position)/i,
      /position has been filled/i,
      /application (?:was|has been) rejected/i,
      /application (?:was|has been) declined/i,
      /declined\b/i
    ]
  },
  {
    name: 'interview',
    detectedType: 'interview',
    confidence: 0.9,
    requiresJobContext: true,
    negativePatterns: [
      /\blinkedin\b/i,
      /\breacted to this post\b/i,
      /\bcommented on\b/i,
      /\bshare their thoughts\b/i,
      /\bview .* post\b/i,
      /\bnew (?:followers|connections|notifications)\b/i,
      /\bliked your post\b/i
    ],
    patterns: [
      /schedule (?:an|your) interview/i,
      /interview (?:invite|invitation|confirmed|availability)/i,
      /interview (?:schedule|scheduled|scheduling)/i,
      /video interview/i,
      /thank you for interviewing/i,
      /thank you for (?:the )?interview/i,
      /select (?:a|your) time for an interview/i,
      /(?=.*phone screen)(?=.*(schedule|calendly|availability|select a time|invite|interview|recruiter|talent|hiring))/i
    ]
  },
  {
    name: 'confirmation',
    detectedType: 'confirmation',
    confidence: 0.92,
    patterns: [
      /application (?:received|confirmation)/i,
      /application (?:submitted|submission received)/i,
      /your application for .* was submitted successfully/i,
      /thank you for applying/i,
      /thank you for inquiring about employment opportunities/i,
      /thank you for your interest in the (?:position|role|opportunity)/i,
      /thank you for your application/i,
      /thanks for applying/i,
      /we (?:have )?received your application/i,
      /we received your application/i,
      /has received your application for/i,
      /will review your (?:application|resume)/i,
      /we are currently reviewing your resume/i,
      /evaluating your professional credentials/i,
      /thank you for applying to/i,
      /jobs applied to on\s+\d{1,2}\/\d{1,2}\/\d{2,4}/i,
      /your application for the .* position/i,
      /application received/i,
      /an update on your application/i
    ]
  },
  {
    name: 'under_review',
    detectedType: 'under_review',
    confidence: 0.9,
    patterns: [
      /application (?:is )?under review/i,
      /application status[: ]+under review/i,
      /your application is in review/i,
      /application (?:is )?under consideration/i,
      /application (?:is )?being reviewed/i
    ]
  },
  {
    name: 'recruiter_outreach',
    detectedType: 'recruiter_outreach',
    confidence: 0.8,
    patterns: [
      /recruiter (?:from|at)/i,
      /talent acquisition/i,
      /reaching out about/i
    ]
  },
  {
    name: 'other_job_related',
    detectedType: 'other_job_related',
    confidence: 0.72,
    patterns: [
      /job application/i,
      /application status/i,
      /application received/i,
      /application was viewed/i,
      /your candidacy/i,
      /candidate portal/i,
      /candidate/i,
      /candidacy/i,
      /requisition/i,
      /job id[: ]*\d+/i,
      /position id[: ]*\d+/i,
      /assessment/i,
      /coding challenge/i,
      /take[- ]home/i,
      /hirevue/i,
      /skill survey/i,
      /next steps/i,
      /position you applied/i,
      /application update/i,
      /update on your application/i,
      /application progress/i
    ]
  }
];

const STRONG_REJECTION_RULE = {
  name: 'rejection_strong',
  detectedType: 'rejection',
  confidence: 0.98,
  requiresJobContext: true,
  patterns: [
    /not selected/i,
    /moved to the next step in (?:their )?hiring process/i,
    /we (?:will not|won't) be moving forward/i,
    /we are not moving forward with your (?:application|candidacy)/i,
    /move forward with other candidates/i,
    /we (?:have )?decided to pursue other candidates/i,
    /regret to inform/i,
    /go in a different direction/i
  ]
};

function normalize(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function extractSenderEmail(sender) {
  const raw = String(sender || '');
  const bracket = raw.match(/<([^>]+)>/);
  if (bracket && bracket[1]) {
    return String(bracket[1]).trim().toLowerCase();
  }
  const direct = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return direct ? String(direct[0]).trim().toLowerCase() : raw.toLowerCase();
}

function extractSenderDomain(sender) {
  const senderEmail = extractSenderEmail(sender);
  if (!senderEmail || !senderEmail.includes('@')) {
    return '';
  }
  const parts = senderEmail.split('@');
  return String(parts[parts.length - 1] || '').toLowerCase();
}

function extractSenderLocalPart(sender) {
  const senderEmail = extractSenderEmail(sender);
  if (!senderEmail || !senderEmail.includes('@')) {
    return '';
  }
  return String(senderEmail.split('@')[0] || '').toLowerCase();
}

function isLinkedInDomainSender(sender) {
  const domain = extractSenderDomain(sender);
  return /(?:^|\.)linkedin\.com$/.test(domain);
}

function hasStrongJobLifecycleEvidence(text) {
  const sourceText = String(text || '');
  if (!sourceText) {
    return false;
  }
  return (
    /\bthank you for applying\b/i.test(sourceText) ||
    /\bthanks for applying\b/i.test(sourceText) ||
    /\bthank you for your application\b/i.test(sourceText) ||
    /\bapplication (?:submitted|received|was submitted successfully|was sent|confirmation)\b/i.test(sourceText) ||
    /\bwe (?:have )?received your application\b/i.test(sourceText) ||
    /\bhas received your application for\b/i.test(sourceText) ||
    /\byour application (?:was sent to|to|for)\b/i.test(sourceText) ||
    /\baccess my application\b/i.test(sourceText) ||
    /\bjobs applied to on\b/i.test(sourceText) ||
    /\bnew message from\b/i.test(sourceText) ||
    /\byou(?:'|’)ve received a new message\b/i.test(sourceText) ||
    /\breply from your account\b/i.test(sourceText) ||
    /\binterview (?:invite|invitation|requested|scheduled|schedule|availability)\b/i.test(sourceText) ||
    /\bschedule (?:an|your) interview\b/i.test(sourceText) ||
    /\bselect (?:a|your) time\b/i.test(sourceText) ||
    /\bshare your availability\b/i.test(sourceText) ||
    /\boffer (?:letter|extended|received)\b/i.test(sourceText) ||
    /\bnot selected\b/i.test(sourceText) ||
    /\b(?:will not|not) be moving forward with your application\b/i.test(sourceText)
  );
}

function hasSentLabel(messageLabels) {
  if (!Array.isArray(messageLabels)) {
    return false;
  }
  return messageLabels.some((label) => String(label || '').toUpperCase() === 'SENT');
}

function isOutboundUserMessage({ sender, authenticatedUserEmail, messageLabels }) {
  const senderEmail = normalizeEmail(extractSenderEmail(sender));
  const authEmail = normalizeEmail(authenticatedUserEmail);
  if (senderEmail && authEmail && senderEmail === authEmail) {
    return true;
  }
  if (hasSentLabel(messageLabels)) {
    return true;
  }
  return false;
}

function countMatches(pattern, text) {
  const sourceText = String(text || '');
  if (!sourceText) {
    return 0;
  }
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const globalPattern = new RegExp(pattern.source, flags);
  const matches = sourceText.match(globalPattern);
  return matches ? matches.length : 0;
}

function collectSignalMatches(signals, text) {
  const sourceText = String(text || '');
  if (!sourceText || !Array.isArray(signals) || !signals.length) {
    return [];
  }
  return signals.filter((signal) => signal.pattern.test(sourceText)).map((signal) => signal.label);
}

function countJobListingLikeLines(text) {
  const sourceText = String(text || '');
  if (!sourceText) {
    return 0;
  }
  const lines = sourceText
    .split(/\r?\n/)
    .map((line) => String(line || '').trim())
    .filter(Boolean);
  return lines.filter((line) => {
    return (
      /\b(?:apply now|view job|save job)\b/i.test(line) ||
      /\b(?:\d+\+?\s+new jobs?|jobs? for you|recommended jobs?)\b/i.test(line) ||
      /^(?:[-*•]|\d+\.)\s+.+(?:engineer|developer|analyst|manager|designer|specialist)\b/i.test(line)
    );
  }).length;
}

function isRelevantApplicationEmail({ subject, snippet, sender, body } = {}) {
  const textSource = [
    normalize(subject),
    normalize(snippet),
    normalize(body || ''),
    normalize(sender || '')
  ]
    .filter(Boolean)
    .join('\n');
  if (!textSource) {
    return {
      isRelevant: false,
      reason: 'not_relevant',
      matchedKeywords: [],
      rejectedKeywords: ['empty_text']
    };
  }

  const linkedInJobsEnvelope =
    isLinkedInJobsUpdateEmail({ subject, snippet, sender, body }) ||
    isLinkedInJobsApplicationSentEmail({ subject, snippet, sender, body });
  const senderIsLinkedIn = isLinkedInDomainSender(sender);
  const senderLocalPart = extractSenderLocalPart(sender);
  const hasStrongLifecycleEvidence = hasStrongJobLifecycleEvidence(textSource) || linkedInJobsEnvelope;
  const linkedInAnalyticsSignals = collectSignalMatches(
    LINKEDIN_NON_JOB_NOTIFICATION_SIGNAL_PATTERNS,
    textSource
  );
  const socialAnalyticsSignals = collectSignalMatches(SOCIAL_ANALYTICS_SIGNAL_PATTERNS, textSource);
  const linkedInNotificationSender =
    senderIsLinkedIn &&
    /(?:^|[-._])(notifications?|updates?|digest|news|notify)(?:[-._]|$)/i.test(senderLocalPart);

  if (
    linkedInNotificationSender &&
    !linkedInJobsEnvelope &&
    linkedInAnalyticsSignals.length >= 2 &&
    !hasStrongLifecycleEvidence
  ) {
    return {
      isRelevant: false,
      reason: 'excluded_non_job_linkedin_notification',
      matchedKeywords: [],
      rejectedKeywords: Array.from(new Set(linkedInAnalyticsSignals))
    };
  }

  if (
    socialAnalyticsSignals.length >= 3 &&
    !hasStrongLifecycleEvidence &&
    !/\b(?:application|applied|candidate|hiring|job\s+application|interview|offer|rejection)\b/i.test(textSource)
  ) {
    return {
      isRelevant: false,
      reason: 'excluded_social_analytics_email',
      matchedKeywords: [],
      rejectedKeywords: Array.from(new Set(socialAnalyticsSignals))
    };
  }

  const matchedKeywords = collectSignalMatches(RELEVANCE_KEEP_SIGNALS, textSource);
  const rejectedKeywords = collectSignalMatches(RELEVANCE_IGNORE_SIGNALS, textSource);
  const marketingKeywords = collectSignalMatches(RELEVANCE_MARKETING_SIGNALS, textSource);
  const listingLineCount = countJobListingLikeLines(textSource);
  const listingCtaCount =
    countMatches(/\b(?:apply now|view job|save job)\b/i, textSource) +
    countMatches(/\b(?:jobs? for you|recommended jobs?|new jobs? in)\b/i, textSource);
  const hasMessageJobAnchor =
    /\b(?:application|position|role|candidate|hiring|job|interview|offer|rejection)\b/i.test(
      textSource
    ) || /\bnew message from\b.{0,140}[-–—].{0,140}\b(?:associate|specialist|engineer|developer|analyst|manager|intern)\b/i.test(
      textSource
    );
  const hasOnlyMessageSignals =
    matchedKeywords.length > 0 &&
    matchedKeywords.every((label) => MESSAGE_RELEVANCE_LABELS.has(String(label || '')));
  if (hasOnlyMessageSignals && !hasMessageJobAnchor) {
    return {
      isRelevant: false,
      reason: 'not_relevant',
      matchedKeywords,
      rejectedKeywords: ['message_notification_missing_job_context']
    };
  }
  const hasOnlyInterviewContextSignal =
    matchedKeywords.length > 0 &&
    matchedKeywords.every((label) => String(label || '') === 'interview_context');
  const hasInterviewActionContext =
    /\b(?:schedule|availability|select (?:a|your) time|book (?:a )?time|invite you to|next step in our hiring process|initial interview|screening test|submit your responses?)\b/i.test(
      textSource
    );
  if (hasOnlyInterviewContextSignal && !hasInterviewActionContext) {
    return {
      isRelevant: false,
      reason: 'not_relevant',
      matchedKeywords,
      rejectedKeywords: ['interview_context_without_action']
    };
  }
  const hasRoleCompanyReference =
    /\byour application to\s+.+\s+at\s+.+/i.test(textSource) ||
    /\b(?:position|role)\b.{0,90}\b(?:at|with)\b/i.test(textSource);
  const hasLifecycleAnchor =
    /\b(?:application|applied|candidacy|offer|interview|rejection|not selected|moving forward)\b/i.test(textSource);
  const hasStrongKeepSignal = matchedKeywords.length > 0 || (hasRoleCompanyReference && hasLifecycleAnchor);
  const looksLikeAlert = rejectedKeywords.length > 0 || listingLineCount >= 3 || listingCtaCount >= 4;
  const strongMarketingEnvelope = marketingKeywords.length >= 2 && (listingLineCount >= 2 || rejectedKeywords.length > 0);

  if ((looksLikeAlert || strongMarketingEnvelope) && !hasStrongKeepSignal) {
    return {
      isRelevant: false,
      reason: 'not_relevant',
      matchedKeywords,
      rejectedKeywords: Array.from(
        new Set([
          ...rejectedKeywords,
          ...marketingKeywords,
          ...(listingLineCount >= 3 ? ['multi_listing_email'] : []),
          ...(listingCtaCount >= 4 ? ['listing_cta_burst'] : [])
        ])
      )
    };
  }

  if (hasStrongKeepSignal) {
    return {
      isRelevant: true,
      matchedKeywords,
      rejectedKeywords
    };
  }

  return {
    isRelevant: false,
    reason: 'not_relevant',
    matchedKeywords,
    rejectedKeywords: Array.from(new Set([...rejectedKeywords, ...marketingKeywords, 'missing_application_specific_context']))
  };
}

function hasNewsletterHeaderSignal(headers) {
  if (!headers) {
    return false;
  }
  const haystack = [];
  if (Array.isArray(headers)) {
    for (const header of headers) {
      if (!header) continue;
      if (typeof header === 'string') {
        haystack.push(header.toLowerCase());
        continue;
      }
      const name = String(header.name || '').toLowerCase();
      const value = String(header.value || '').toLowerCase();
      haystack.push(`${name}:${value}`);
    }
  } else if (typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers)) {
      haystack.push(`${String(key).toLowerCase()}:${String(value || '').toLowerCase()}`);
    }
  } else {
    haystack.push(String(headers).toLowerCase());
  }
  return haystack.some((entry) => {
    return (
      entry.includes('list-unsubscribe') ||
      /precedence:\s*bulk/.test(entry) ||
      /auto-submitted:\s*auto-generated/.test(entry)
    );
  });
}

function isNewsletterOrDigestEmail({ subject, snippet, sender, body, headers, linkedInJobsUpdate }) {
  if (linkedInJobsUpdate) {
    return false;
  }

  const senderEmail = extractSenderEmail(sender);
  const senderParts = senderEmail.split('@');
  const senderLocalPart = senderParts[0] || '';
  const senderDomain = senderParts[1] || '';
  const textSource = `${String(subject || '')}\n${String(snippet || '')}\n${String(body || '')}`;
  const loweredText = textSource.toLowerCase();
  const loweredSubject = String(subject || '').toLowerCase();

  const hasSubjectMarker = NEWSLETTER_SUBJECT_PATTERNS.some((pattern) => pattern.test(loweredSubject));
  const hasFeedMarkers = NEWSLETTER_FEED_PATTERNS.filter((pattern) => pattern.test(loweredText)).length;
  const readMoreCount = countMatches(/\bread more\b/i, loweredText);
  const commentsCount = countMatches(/\bcomments?\b/i, loweredText);
  const unsubscribeCount = countMatches(/\bunsubscribe\b/i, loweredText);
  const hasDigestSenderHint =
    /(glassdoor\.com|linkedin\.com|indeed\.com)$/.test(senderDomain) &&
    /(notification|notifications|alert|alerts|digest|newsletter|community|updates?|notify)/.test(
      senderLocalPart
    );
  const headerSignal = hasNewsletterHeaderSignal(headers);

  if (headerSignal) {
    return true;
  }
  if (hasSubjectMarker && (hasFeedMarkers >= 1 || hasDigestSenderHint || unsubscribeCount >= 1)) {
    return true;
  }
  if (hasDigestSenderHint && (hasFeedMarkers >= 1 || readMoreCount >= 2 || commentsCount >= 2)) {
    return true;
  }
  if (hasFeedMarkers >= 3) {
    return true;
  }
  if (readMoreCount >= 2 && commentsCount >= 1) {
    return true;
  }
  if (
    unsubscribeCount >= 1 &&
    /\b(view more posts?|discover your next job|jobs you may like|top posts?|community|tech buzz)\b/i.test(
      loweredText
    )
  ) {
    return true;
  }
  return false;
}

function isLinkedInJobsSender(sender) {
  return /jobs-noreply@linkedin\.com/i.test(String(sender || ''));
}

function isLinkedInJobsApplicationSentEmail({ subject, snippet, sender, body }) {
  if (!isLinkedInJobsSender(sender)) {
    return false;
  }
  const normalizedSubject = normalize(subject);
  const combinedText = `${normalize(snippet)}\n${normalize(body || '')}`;
  const hasSubjectEnvelope =
    /^.+,\s*your application was sent to\s+.+$/i.test(normalizedSubject) ||
    /^your application was sent to\s+.+$/i.test(normalizedSubject);
  const hasBodyEnvelope = /your application was sent to\s+.+/i.test(combinedText);
  const hasAppliedOn = /applied on\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}/i.test(combinedText);
  return hasSubjectEnvelope && (hasBodyEnvelope || hasAppliedOn);
}

function isLinkedInJobsUpdateEmail({ subject, snippet, sender, body }) {
  if (!isLinkedInJobsSender(sender)) {
    return false;
  }
  if (isLinkedInJobsApplicationSentEmail({ subject, snippet, sender, body })) {
    return true;
  }
  const normalizedSubject = normalize(subject);
  const combinedText = `${normalizedSubject}\n${normalize(snippet)}\n${normalize(body || '')}`;
  return /^your application to\s+/i.test(normalizedSubject) || /your update from\s+.+/i.test(combinedText);
}

function isLinkedInSocialNotification(text, sender = '') {
  const lower = text.toLowerCase();
  const senderLower = String(sender || '').toLowerCase();
  const isLinkedInSender = senderLower.includes('linkedin.com');
  const socialCues = [
    /reacted to this post/i,
    /commented on/i,
    /share their thoughts/i,
    /view .* post/i,
    /new follower/i,
    /connections?/i,
    /notifications?/i,
    /liked your post/i,
    /see what you missed/i
  ];
  const hasSocialCue = socialCues.some((p) => p.test(lower));
  return isLinkedInSender && hasSocialCue;
}

function hasJobContext(text) {
  return /\b(application|apply|applied|position|role|job|candidate|candidacy|hiring|recruit|recruiter|recruiting|interview|screen|screening)\b/i.test(
    text
  );
}

function hasSubjectRolePattern(subject) {
  return /\b[A-Z][A-Za-z0-9 '&/.()-]{2,}\s*[-–—]\s*[A-Z][A-Za-z0-9 '&/.()-]{2,}/.test(
    subject || ''
  );
}

function detectSchedulingInterview({ subject, snippet, sender, body }) {
  const rawSubject = String(subject || '');
  const rawSnippet = String(snippet || '');
  const rawBody = String(body || '');
  const textSource = `${rawSubject}\n${rawSnippet}\n${rawBody}`.trim();
  if (!textSource) {
    return null;
  }

  const intentHits = [];
  let schedulingScore = 0;
  for (const rule of SCHEDULING_INTENT_PATTERNS) {
    if (rule.pattern.test(textSource)) {
      intentHits.push(rule.pattern.source);
      schedulingScore += rule.score;
    }
  }
  if (!intentHits.length) {
    return null;
  }

  const interviewContextHits = collectSignalMatches(INTERVIEW_CONTEXT_SIGNAL_PATTERNS, textSource);
  const interviewActionHits = collectSignalMatches(INTERVIEW_ACTION_SIGNAL_PATTERNS, textSource);
  const directCtaHits = collectSignalMatches(INTERVIEW_DIRECT_CTA_PATTERNS, textSource);
  const vagueInterviewHits = collectSignalMatches(INTERVIEW_VAGUE_SIGNAL_PATTERNS, textSource);
  const processOnlyInterviewHits = collectSignalMatches(INTERVIEW_PROCESS_ONLY_SIGNAL_PATTERNS, textSource);
  const conditionalInterviewHits = collectSignalMatches(INTERVIEW_CONDITIONAL_SIGNAL_PATTERNS, textSource);
  const relevanceScreen = isRelevantApplicationEmail({
    subject: rawSubject,
    snippet: rawSnippet,
    sender,
    body: rawBody
  });
  const rejectedRelevanceKeywords = Array.isArray(relevanceScreen.rejectedKeywords)
    ? relevanceScreen.rejectedKeywords
    : [];
  const listingPenaltySignals = rejectedRelevanceKeywords.filter((label) =>
    ['multi_listing_email', 'listing_cta_burst', 'jobs_for_you', 'recommended_jobs', 'job_alert', 'jobs_you_may_like'].includes(
      String(label || '')
    )
  );

  const lines = textSource
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const dayLineCount = lines.filter((line) => DAY_ABBR_PATTERN.test(line)).length;
  const timeLineCount = lines.filter((line) => TIME_SLOT_PATTERN.test(line)).length;

  const allDateMatches = textSource.match(DATE_SLOT_PATTERN_GLOBAL) || [];
  const allTimeMatches = textSource.match(TIME_SLOT_PATTERN_GLOBAL) || [];
  const explicitScheduled = EXPLICIT_SCHEDULED_PATTERNS.some((pattern) => pattern.test(textSource));

  const hasStrongTimeEvidence =
    dayLineCount >= 2 ||
    timeLineCount >= 2 ||
    allTimeMatches.length >= 2 ||
    (allDateMatches.length >= 2 && /\b(available|times?|slots?)\b/i.test(textSource));
  const hasAnyTimeEvidence = hasStrongTimeEvidence || dayLineCount >= 1 || allDateMatches.length >= 1;

  const hasDirectIntent = INTERVIEW_DIRECT_INTENT_PATTERNS.some((pattern) => pattern.test(textSource));
  const hasPersonalizationSignal = CANDIDATE_PERSONALIZATION_PATTERNS.some((pattern) =>
    pattern.test(textSource)
  );
  const hasSubjectInterviewSignal = INTERVIEW_SUBJECT_SIGNAL_PATTERN.test(rawSubject);
  const hasExplicitDirectRequest =
    /\b(?:we|i)\s+(?:would like|want)\s+to\s+(?:speak|interview)\s+with\s+you\b/i.test(textSource) ||
    /\binvite you to (?:an )?interview\b/i.test(textSource);
  const hasSecondPersonSignal =
    /\b(?:you|your)\b/i.test(textSource) &&
    /\b(?:availability|schedule|time works|calendar invite|zoom|phone screen|interview)\b/i.test(textSource);
  const hasStrongInterviewContext = interviewContextHits.length > 0;
  const hasActionIntent = interviewActionHits.length > 0 || directCtaHits.length > 0;
  const hasStrongMeetingIntent =
    /\blet(?:'|’)s schedule\b/i.test(textSource) ||
    /\bschedule (?:a|the)?\s*(?:call|chat|meeting)\b/i.test(textSource) ||
    /\bhere are some times?\b/i.test(textSource) ||
    /\bwhat time works\b/i.test(textSource);

  const hasCandidateOwnershipSignal =
    hasPersonalizationSignal || hasSecondPersonSignal || hasExplicitDirectRequest || hasAnyTimeEvidence;
  const hasCandidateDirectSignal = hasDirectIntent || hasExplicitDirectRequest || hasSubjectInterviewSignal;
  const hasExplicitSchedulingRequest = hasStrongTimeEvidence || directCtaHits.length > 0 || hasExplicitDirectRequest;
  const interviewSuppressedByProcessOnlyLanguage =
    processOnlyInterviewHits.length > 0 && !hasExplicitSchedulingRequest;
  const interviewSuppressedByConditionalLanguage =
    conditionalInterviewHits.length > 0 &&
    !hasExplicitSchedulingRequest &&
    !hasStrongTimeEvidence;
  if (interviewSuppressedByProcessOnlyLanguage || interviewSuppressedByConditionalLanguage) {
    return null;
  }
  const passesInterviewGate =
    hasCandidateDirectSignal && hasCandidateOwnershipSignal && hasStrongInterviewContext && hasActionIntent;
  const passesMeetingGate =
    !hasStrongInterviewContext &&
    hasStrongMeetingIntent &&
    hasCandidateOwnershipSignal &&
    (hasAnyTimeEvidence || hasActionIntent) &&
    listingPenaltySignals.length === 0;

  if (!passesInterviewGate && !passesMeetingGate) {
    return null;
  }

  const hasDigestNegativeMarker = NEWSLETTER_INTERVIEW_BLOCK_PATTERNS.some((pattern) =>
    pattern.test(textSource)
  );
  if (hasDigestNegativeMarker) {
    return null;
  }

  if (!hasAnyTimeEvidence && !explicitScheduled && !hasDirectIntent && !hasExplicitDirectRequest) {
    return null;
  }

  const jobContextHits = SCHEDULING_JOB_CONTEXT_PATTERNS.filter((pattern) => pattern.test(textSource));
  const hasInterviewContext = /\b(interview|phone screen|screening|recruit(?:er|ing)|hiring)\b/i.test(textSource);

  schedulingScore += hasStrongTimeEvidence ? 28 : 14;
  schedulingScore += Math.min(jobContextHits.length * 5, 15);
  if (explicitScheduled) {
    schedulingScore += 10;
  }
  if (hasInterviewContext) {
    schedulingScore += 8;
  }
  if (directCtaHits.length > 0) {
    schedulingScore += 8;
  }
  if (listingPenaltySignals.length > 0) {
    schedulingScore -= 28;
  }
  if (vagueInterviewHits.length > 0 && !hasExplicitDirectRequest && !hasStrongTimeEvidence) {
    schedulingScore -= 18;
  }
  if (!hasActionIntent) {
    schedulingScore -= 24;
  }

  if (vagueInterviewHits.length > 0 && !passesInterviewGate && !hasStrongTimeEvidence) {
    return null;
  }
  let detectedType = passesInterviewGate ? 'interview_requested' : 'meeting_requested';
  if (detectedType === 'interview_requested' && explicitScheduled && (hasInterviewContext || hasStrongTimeEvidence)) {
    detectedType = 'interview_scheduled';
  } else if (detectedType === 'interview_requested' && !hasInterviewContext && jobContextHits.length === 0) {
    detectedType = 'meeting_requested';
  }

  const threshold = detectedType === 'meeting_requested' ? 50 : 58;
  if (schedulingScore < threshold) {
    return null;
  }

  const confidenceBase = 0.74 + Math.min(schedulingScore, 100) * 0.0022;
  const confidenceScore = Math.max(
    detectedType === 'meeting_requested' ? 0.78 : 0.9,
    Math.min(
      detectedType === 'meeting_requested' ? 0.89 : detectedType === 'interview_scheduled' ? 0.97 : 0.96,
      confidenceBase + (detectedType === 'interview_scheduled' ? 0.02 : 0)
    )
  );

  const details = [
    `scheduling score ${Math.round(schedulingScore)}`,
    `${intentHits.length} intent phrase${intentHits.length === 1 ? '' : 's'}`,
    hasStrongTimeEvidence ? 'strong time-slot evidence' : 'time-slot evidence',
    jobContextHits.length ? `${jobContextHits.length} job-context signal${jobContextHits.length === 1 ? '' : 's'}` : 'no strong job-context signals',
    interviewContextHits.length ? `${interviewContextHits.length} interview-context signal${interviewContextHits.length === 1 ? '' : 's'}` : 'no interview-context signals',
    interviewActionHits.length || directCtaHits.length
      ? `${interviewActionHits.length + directCtaHits.length} scheduling action signal${interviewActionHits.length + directCtaHits.length === 1 ? '' : 's'}`
      : 'no scheduling actions'
  ];

  return {
    isJobRelated: true,
    detectedType,
    confidenceScore,
    explanation: `Detected recruiting scheduling request (${details.join(', ')}).`,
    reason: 'human_recruiting_scheduling',
    debug: {
      interviewMatches: Array.from(new Set([...interviewContextHits, ...interviewActionHits, ...directCtaHits])),
      rejectedKeywords: Array.from(
        new Set([...vagueInterviewHits, ...listingPenaltySignals, ...conditionalInterviewHits])
      ),
      negativeMatches: [...processOnlyInterviewHits, ...conditionalInterviewHits],
      finalDecision: detectedType
    }
  };
}

function detectAssessmentInterviewStage({ subject, snippet, sender, body }) {
  const rawSubject = String(subject || '');
  const rawSnippet = String(snippet || '');
  const rawBody = String(body || '');
  const textSource = `${rawSubject}\n${rawSnippet}\n${rawBody}`.trim();
  if (!textSource) {
    return null;
  }

  const inviteHits = collectSignalMatches(INTERVIEW_STAGE_INVITE_PATTERNS, textSource);
  const assessmentHits = collectSignalMatches(INTERVIEW_STAGE_ASSESSMENT_PATTERNS, textSource);
  const actionHits = collectSignalMatches(INTERVIEW_STAGE_ACTION_PATTERNS, textSource);
  const vagueHits = collectSignalMatches(INTERVIEW_VAGUE_SIGNAL_PATTERNS, textSource);
  const processOnlyHits = collectSignalMatches(INTERVIEW_PROCESS_ONLY_SIGNAL_PATTERNS, textSource);
  const relevanceScreen = isRelevantApplicationEmail({
    subject: rawSubject,
    snippet: rawSnippet,
    sender,
    body: rawBody
  });
  const rejectedRelevanceKeywords = Array.isArray(relevanceScreen.rejectedKeywords)
    ? relevanceScreen.rejectedKeywords
    : [];
  const listingPenaltySignals = rejectedRelevanceKeywords.filter((label) =>
    ['multi_listing_email', 'listing_cta_burst', 'jobs_for_you', 'recommended_jobs', 'job_alert', 'jobs_you_may_like'].includes(
      String(label || '')
    )
  );
  const hasDigestNegativeMarker = NEWSLETTER_INTERVIEW_BLOCK_PATTERNS.some((pattern) =>
    pattern.test(textSource)
  );
  if (hasDigestNegativeMarker || listingPenaltySignals.length > 0) {
    return null;
  }

  const hasStrongInvite = inviteHits.length > 0;
  const hasStrongAssessment =
    assessmentHits.some((label) => ['initial_interview', 'screening_test', 'attached_questions'].includes(label)) ||
    /\bserve as your initial interview\b/i.test(textSource);
  const hasAssessmentContext = hasStrongAssessment || assessmentHits.length >= 2;
  const hasActionPrompt =
    actionHits.length > 0 || /\bsubmit (?:your )?(?:answers?|responses?)\b/i.test(textSource);
  const hasJobSignal = hasJobContext(textSource);
  const processOnlyWithoutInvite = processOnlyHits.length > 0 && !hasStrongInvite;
  const vagueOnlySignal = vagueHits.length > 0 && !hasStrongInvite && !hasActionPrompt;
  if (processOnlyWithoutInvite || vagueOnlySignal) {
    return null;
  }

  if (!(hasStrongInvite && hasAssessmentContext && hasActionPrompt && hasJobSignal)) {
    return null;
  }

  const combinedInterviewHits = Array.from(new Set([...inviteHits, ...assessmentHits, ...actionHits]));
  const confidenceBoost = Math.min(0.06, combinedInterviewHits.length * 0.01);
  return {
    isJobRelated: true,
    detectedType: 'interview_requested',
    confidenceScore: Math.min(0.96, 0.9 + confidenceBoost),
    explanation:
      'Detected interview-stage assessment invite (next-step invitation with screening/initial interview instructions).',
    reason: 'interview_stage_assessment',
    debug: {
      interviewMatches: combinedInterviewHits,
      rejectedKeywords: Array.from(new Set([...vagueHits, ...listingPenaltySignals])),
      negativeMatches: processOnlyHits,
      finalDecision: 'interview_requested',
      decisionReason: 'assessment_interview_stage_signals'
    }
  };
}

function detectMessageReceivedEvent({ subject, snippet, sender, body }) {
  const rawSubject = String(subject || '');
  const rawSnippet = String(snippet || '');
  const rawBody = String(body || '');
  const textSource = `${rawSubject}\n${rawSnippet}\n${rawBody}`.trim();
  if (!textSource) {
    return null;
  }

  if (hasAppliedConfirmationSignals(textSource)) {
    return null;
  }

  if (MESSAGE_NOTIFICATION_NEGATIVE_PATTERNS.some((pattern) => pattern.test(textSource))) {
    return null;
  }

  const messageMatches = collectSignalMatches(MESSAGE_NOTIFICATION_SIGNAL_PATTERNS, textSource);
  if (!messageMatches.length) {
    return null;
  }

  const hasSubjectEnvelope =
    /\bnew message from\b/i.test(rawSubject) ||
    /\byou(?:'|’)ve received a new message\b/i.test(rawSubject);
  const hasActionCue =
    /\bview message\b/i.test(textSource) || /\breply from your account\b/i.test(textSource);
  const hasPlatformContext =
    /\b(?:indeed|linkedin|smartrecruiters|workday|greenhouse|lever|icims|workable|monster|ziprecruiter|glassdoor|jobvite|successfactors|taleo|ashby)\b/i.test(
      `${sender || ''}\n${textSource}`
    );
  const hasJobContextCue =
    /\b(?:application|position|role|interview|offer|rejection|candidate|hiring|job)\b/i.test(
      textSource
    ) || /\bnew message from\b.{0,140}[-–—].{0,140}\b(?:associate|specialist|engineer|developer|analyst|manager|intern)\b/i.test(
      textSource
    );

  const hasMinimumEnvelope = hasSubjectEnvelope || (messageMatches.length >= 2 && hasActionCue);
  const hasJobAnchor = hasJobContextCue || hasPlatformContext;
  if (!hasMinimumEnvelope || !hasJobAnchor) {
    return null;
  }

  const confidence = Math.min(
    0.92,
    0.84 +
      Math.min(0.04, messageMatches.length * 0.01) +
      (hasActionCue ? 0.02 : 0) +
      (hasPlatformContext ? 0.02 : 0)
  );
  return {
    isJobRelated: true,
    detectedType: 'message_received',
    confidenceScore: confidence,
    explanation: 'Detected job-platform employer message notification.',
    reason: 'message_notification',
    debug: {
      messageMatches,
      matchedKeywords: messageMatches,
      rejectedKeywords: [],
      finalDecision: 'message_received',
      decisionReason: 'message_notification_signals'
    }
  };
}

function findRuleMatch(rules, text, minConfidence, jobContext) {
  for (const rule of rules) {
    if (rule.confidence < minConfidence) {
      continue;
    }
    if (rule.requiresJobContext && !jobContext) {
      continue;
    }
    if (rule.negativePatterns && rule.negativePatterns.some((p) => p.test(text))) {
      continue;
    }
    const matched = rule.patterns.find((pattern) => pattern.test(text));
    if (matched) {
      return { rule, matched };
    }
  }
  return null;
}

function classifyEmail({ subject, snippet, sender, body, headers, authenticatedUserEmail, messageLabels }) {
  if (isOutboundUserMessage({ sender, authenticatedUserEmail, messageLabels })) {
    return {
      isJobRelated: false,
      explanation: 'Outbound message from authenticated user suppressed.',
      reason: 'outbound_sender'
    };
  }
  const normalizedSnippet = normalize(snippet);
  const normalizedBody = normalize(body || '');
  const textSource = `${normalize(body || '')} ${normalize(snippet)} ${normalize(subject)} ${normalize(
    sender
  )}`.trim();
  const normalizedSubject = normalize(subject);
  const text = textSource.toLowerCase();
  if (!text) {
    return { isJobRelated: false, explanation: 'Empty subject/snippet.' };
  }

  const linkedInJobsUpdate = isLinkedInJobsUpdateEmail({ subject, snippet, sender, body });
  const linkedInApplicationSent = isLinkedInJobsApplicationSentEmail({ subject, snippet, sender, body });
  const interviewSuppressionMatches = collectSignalMatches(INTERVIEW_PROCESS_ONLY_SIGNAL_PATTERNS, textSource);
  const appliedConfirmationMatches = collectAppliedConfirmationSignals(textSource);
  const senderIsLinkedIn = isLinkedInDomainSender(sender);
  const senderLocalPart = extractSenderLocalPart(sender);
  const linkedInNotificationSender =
    senderIsLinkedIn &&
    /(?:^|[-._])(notifications?|updates?|digest|news|notify)(?:[-._]|$)/i.test(senderLocalPart);
  const linkedInAnalyticsSignals = collectSignalMatches(
    LINKEDIN_NON_JOB_NOTIFICATION_SIGNAL_PATTERNS,
    textSource
  );
  const socialAnalyticsSignals = collectSignalMatches(SOCIAL_ANALYTICS_SIGNAL_PATTERNS, textSource);
  const hasStrongLifecycleEvidence =
    hasStrongJobLifecycleEvidence(textSource) || linkedInJobsUpdate || linkedInApplicationSent;

  if (
    linkedInNotificationSender &&
    !linkedInJobsUpdate &&
    linkedInAnalyticsSignals.length >= 2 &&
    !hasStrongLifecycleEvidence
  ) {
    return {
      isJobRelated: false,
      explanation: 'LinkedIn non-job analytics notification excluded.',
      reason: 'excluded_non_job_linkedin_notification'
    };
  }

  if (
    socialAnalyticsSignals.length >= 3 &&
    !hasStrongLifecycleEvidence &&
    !hasJobContext(textSource)
  ) {
    return {
      isJobRelated: false,
      explanation: 'Social analytics notification excluded.',
      reason: 'excluded_social_analytics_email'
    };
  }

  // Early guard: LinkedIn social/notification emails should not be classified as interview.
  if (!linkedInJobsUpdate && isLinkedInSocialNotification(textSource, sender)) {
    return {
      isJobRelated: false,
      explanation: 'LinkedIn social notification excluded.',
      reason: 'excluded_social_analytics_email'
    };
  }

  // Dedicated LinkedIn rejection template override for jobs updates.
  const linkedInRejectionInSnippet = LINKEDIN_REJECTION_RULE.bodyPatterns.some((pattern) =>
    pattern.test(normalizedSnippet)
  );
  const linkedInRejectionInBody = LINKEDIN_REJECTION_RULE.bodyPatterns.some((pattern) =>
    pattern.test(normalizedBody)
  );
  const linkedInRejectionSignal =
    linkedInRejectionInSnippet ||
    linkedInRejectionInBody ||
    LINKEDIN_REJECTION_RULE.bodyPatterns.some((pattern) => pattern.test(textSource));
  if (linkedInJobsUpdate && LINKEDIN_REJECTION_RULE.subjectPattern.test(normalizedSubject) && linkedInRejectionSignal) {
    const bodyOnlyReason = linkedInRejectionInBody && !linkedInRejectionInSnippet;
    return {
      isJobRelated: true,
      detectedType: LINKEDIN_REJECTION_RULE.detectedType,
      confidenceScore: LINKEDIN_REJECTION_RULE.confidence,
      explanation: 'LinkedIn rejection update detected.',
      reason: bodyOnlyReason ? 'linkedin_jobs_rejection_phrase_body' : LINKEDIN_REJECTION_RULE.name
    };
  }

  if (linkedInApplicationSent && LINKEDIN_CONFIRMATION_RULE.subjectPattern.test(normalizedSubject)) {
    const hasLinkedInBodySignal = LINKEDIN_CONFIRMATION_RULE.bodyPatterns.some((p) => p.test(textSource));
    if (hasLinkedInBodySignal) {
      return {
        isJobRelated: true,
        detectedType: LINKEDIN_CONFIRMATION_RULE.detectedType,
        confidenceScore: LINKEDIN_CONFIRMATION_RULE.confidence,
        explanation: 'LinkedIn application sent confirmation detected.',
        reason: LINKEDIN_CONFIRMATION_RULE.name
      };
    }
  }

  const newsletterDigest = isNewsletterOrDigestEmail({
    subject,
    snippet,
    sender,
    body,
    headers,
    linkedInJobsUpdate
  });
  if (newsletterDigest) {
    return {
      isJobRelated: false,
      explanation: 'Newsletter/digest content suppressed.',
      reason: 'newsletter_digest'
    };
  }

  const schedulingSignal = detectSchedulingInterview({ subject, snippet, sender, body });
  const assessmentInterviewSignal = schedulingSignal
    ? null
    : detectAssessmentInterviewStage({ subject, snippet, sender, body });
  const messageNotificationSignal = detectMessageReceivedEvent({ subject, snippet, sender, body });

  const minConfidence = 0.6;
  const rules = [PROFILE_SUBMITTED_RULE, ...RULES];
  const jobContext = hasJobContext(text) || hasSubjectRolePattern(normalize(subject));

  // Conditional "not selected" disclaimers in receipts should not be treated as rejection.
  if (
    isConditionalNotSelected(textSource) &&
    hasConfirmationReceiptCues(textSource) &&
    !hasDecisionRejectionCues(textSource)
  ) {
    return {
      isJobRelated: true,
      detectedType: 'confirmation',
      confidenceScore: 0.9,
      explanation: 'Conditional not selected disclaimer treated as confirmation.',
      reason: 'conditional_not_selected_receipt'
    };
  }

  // Strong rejection override regardless of confirmation cues.
  const strongRejectionMatches = collectSignalMatches(STRONG_REJECTION_SIGNALS, textSource);
  const softRejectionMatches = collectSignalMatches(SOFT_REJECTION_SIGNALS, textSource);
  const appliedCourtesyMatches = collectSignalMatches(APPLIED_COURTESY_SIGNALS, textSource);
  const decisiveRejection =
    strongRejectionMatches.length > 0 ||
    (softRejectionMatches.length >= 2 && /application|candidate|candidacy|position|role/i.test(text));
  if (decisiveRejection) {
    const primaryMatch =
      strongRejectionMatches[0] ||
      softRejectionMatches[0] ||
      'rejection_signal_cluster';
    const rejectionWonOverApplied = appliedCourtesyMatches.length > 0;
    return {
      isJobRelated: true,
      detectedType: 'rejection',
      confidenceScore: 0.97,
      explanation: rejectionWonOverApplied
        ? 'Rejection signal override: decisive rejection language beats courtesy intro phrasing.'
        : 'Strong rejection phrase detected.',
      reason: 'rejection_override',
      debug: {
        rejectionMatches: Array.from(new Set([...strongRejectionMatches, ...softRejectionMatches])),
        appliedMatches: appliedCourtesyMatches,
        finalDecision: 'rejection',
        decisionReason: rejectionWonOverApplied
          ? 'strong_rejection_overrides_applied_intro'
          : strongRejectionMatches.length
            ? `strong_rejection:${primaryMatch}`
            : `soft_rejection_cluster:${primaryMatch}`
      }
    };
  }

  const strongRejection = findRuleMatch([STRONG_REJECTION_RULE], text, 0.95, jobContext);
  if (strongRejection) {
    return {
      isJobRelated: true,
      detectedType: strongRejection.rule.detectedType,
      confidenceScore: strongRejection.rule.confidence,
      explanation: `Matched ${strongRejection.rule.name} via ${strongRejection.matched}.`,
      reason: strongRejection.rule.name
    };
  }

  // Denylist overrides generic allowlist, unless we have strong multi-signal applied confirmation evidence.
  const denylistBypassForAppliedConfirmation = hasStrongAppliedConfirmationBypass(
    appliedConfirmationMatches,
    textSource
  );
  for (const pattern of DENYLIST) {
    if (pattern.test(text)) {
      if (linkedInJobsUpdate) {
        return {
          isJobRelated: true,
          detectedType: 'other_job_related',
          confidenceScore: 0.8,
          explanation: 'LinkedIn jobs update allowlisted.',
          reason: 'linkedin_jobs_update_allowlisted'
        };
      }
      if (denylistBypassForAppliedConfirmation) {
        break;
      }
      if (messageNotificationSignal) {
        break;
      }
      return {
        isJobRelated: false,
        explanation: `Denied by ${pattern}.`,
        reason: 'denylisted'
      };
    }
  }

  const offerRules = rules.filter((rule) => rule.detectedType === 'offer');
  const offerMatch = findRuleMatch(offerRules, text, 0.9, jobContext);
  if (offerMatch) {
    return {
      isJobRelated: true,
      detectedType: offerMatch.rule.detectedType,
      confidenceScore: offerMatch.rule.confidence,
      explanation: `Matched ${offerMatch.rule.name} via ${offerMatch.matched}.`,
      reason: offerMatch.rule.name,
      debug: {
        matchedKeywords: [String(offerMatch.matched || '')].filter(Boolean),
        rejectedKeywords: [],
        finalDecision: 'offer'
      }
    };
  }

  if (schedulingSignal) {
    return schedulingSignal;
  }

  if (assessmentInterviewSignal) {
    return assessmentInterviewSignal;
  }

  if (messageNotificationSignal) {
    return messageNotificationSignal;
  }

  const confirmationRules = rules.filter((rule) => rule.detectedType === 'confirmation');
  const rejectionRules = rules.filter((rule) => rule.detectedType === 'rejection');
  const rejectionMatch = findRuleMatch(rejectionRules, text, 0.9, jobContext);
  if (rejectionMatch) {
    const matchedPattern = rejectionMatch.matched;
    const isNotSelected = matchedPattern && /not selected/i.test(String(matchedPattern));
    const conditionalNotSelected =
      isNotSelected && isConditionalNotSelected(text) && hasConfirmationReceiptCues(text);
    const decisive = hasDecisionRejectionCues(text);
    if (!(conditionalNotSelected && !decisive)) {
      const appliedCourtesyMatchesForDecision = collectSignalMatches(APPLIED_COURTESY_SIGNALS, textSource);
      const rejectionRuleMatchLabel = String(rejectionMatch.matched || '');
      return {
        isJobRelated: true,
        detectedType: rejectionMatch.rule.detectedType,
        confidenceScore: rejectionMatch.rule.confidence,
        explanation: `Matched ${rejectionMatch.rule.name} via ${rejectionMatch.matched}.`,
        reason: rejectionMatch.rule.name,
        debug: {
          rejectionMatches: rejectionRuleMatchLabel ? [rejectionRuleMatchLabel] : [],
          appliedMatches: appliedCourtesyMatchesForDecision,
          finalDecision: 'rejection',
          decisionReason: appliedCourtesyMatchesForDecision.length
            ? 'rejection_rule_overrides_applied_intro'
            : `rejection_rule_match:${rejectionMatch.rule.name}`
        }
      };
    }
    // Conditional disclaimer present with receipt cues and no decisive rejection: allow confirmation path.
  }

  const confirmationMatch = findRuleMatch(confirmationRules, text, 0.9, jobContext);
  if (confirmationMatch) {
    return {
      isJobRelated: true,
      detectedType: confirmationMatch.rule.detectedType,
      confidenceScore: confirmationMatch.rule.confidence,
      explanation: `Matched ${confirmationMatch.rule.name} via ${confirmationMatch.matched}.`,
      reason: confirmationMatch.rule.name,
      debug: {
        matchedKeywords: [
          ...[String(confirmationMatch.matched || '')].filter(Boolean),
          ...appliedConfirmationMatches
        ],
        rejectedKeywords: interviewSuppressionMatches,
        negativeMatches: interviewSuppressionMatches,
        appliedMatches: appliedConfirmationMatches,
        finalDecision: 'confirmation'
      }
    };
  }

  if (hasAppliedConfirmationSignals(textSource)) {
    return {
      isJobRelated: true,
      detectedType: 'confirmation',
      confidenceScore: 0.89,
      explanation: 'Applied confirmation fallback matched explicit application receipt language.',
      reason: 'confirmation_fallback',
      debug: {
        matchedKeywords: appliedConfirmationMatches,
        rejectedKeywords: interviewSuppressionMatches,
        negativeMatches: interviewSuppressionMatches,
        appliedMatches: appliedConfirmationMatches,
        finalDecision: 'confirmation'
      }
    };
  }

  const match = findRuleMatch(rules, text, minConfidence, jobContext);
  if (match) {
    return {
      isJobRelated: true,
      detectedType: match.rule.detectedType,
      confidenceScore: match.rule.confidence,
      explanation: `Matched ${match.rule.name} via ${match.matched}.`,
      reason: match.rule.name
    };
  }

  const lowMatch = findRuleMatch(rules, text, 0, jobContext);
  if (lowMatch) {
    return {
      isJobRelated: false,
      explanation: `Matched ${lowMatch.rule.name} below threshold.`,
      reason: 'below_threshold'
    };
  }

  return { isJobRelated: false, explanation: 'No allowlist match.', reason: 'no_allowlist' };
}

module.exports = {
  classifyEmail,
  isRelevantApplicationEmail,
  isLinkedInJobsUpdateEmail,
  isLinkedInJobsApplicationSentEmail,
  isOutboundUserMessage,
  isNewsletterOrDigestEmail,
  RULES,
  DENYLIST
};
