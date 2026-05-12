-- Applictus inbound forwarding diagnostics.
-- Replace :user_email with the account email you want to inspect.
-- These queries intentionally avoid selecting full email bodies.

-- 1. Resolve the user and current usage counters.
SELECT
  id,
  email,
  tracked_email_count_current_month,
  tracked_email_month_bucket,
  inbound_email_count_current_month,
  inbound_email_month_bucket,
  monthly_tracked_email_limit,
  monthly_inbound_email_limit
FROM users
WHERE email = :user_email;

-- 2. Latest forwarded inbound messages and their processing outcome.
SELECT
  im.id,
  im.subject,
  im.from_email,
  im.to_email,
  im.received_at,
  im.processing_status,
  im.processing_error,
  im.processed_at,
  im.derived_event_id,
  im.derived_application_id,
  im.derived_status,
  im.derived_company,
  im.derived_role,
  im.derived_application_key,
  im.derived_debug_json
FROM inbound_messages im
JOIN users u ON u.id = im.user_id
WHERE u.email = :user_email
ORDER BY im.received_at DESC, im.created_at DESC
LIMIT 50;

-- 3. Messages that were received but did not produce a linked application.
SELECT
  im.id,
  im.subject,
  im.processing_status,
  im.processing_error,
  im.derived_event_id,
  im.derived_application_id,
  im.derived_company,
  im.derived_role,
  im.derived_debug_json
FROM inbound_messages im
JOIN users u ON u.id = im.user_id
WHERE u.email = :user_email
  AND (
    im.processing_status IN ('pending', 'processing', 'error', 'ignored')
    OR im.derived_event_id IS NULL
    OR im.derived_application_id IS NULL
  )
ORDER BY im.received_at DESC, im.created_at DESC
LIMIT 50;

-- 4. Latest inbound-created email events and whether they are linked.
SELECT
  ee.id,
  ee.subject,
  ee.sender,
  ee.detected_type,
  ee.classification_reason AS decision_reason,
  ee.company_name,
  ee.role_title,
  ee.application_id,
  ee.provider,
  ee.ingest_decision,
  ee.created_at,
  ee.updated_at
FROM email_events ee
JOIN users u ON u.id = ee.user_id
WHERE u.email = :user_email
  AND ee.provider = 'inbound_forward'
ORDER BY ee.created_at DESC
LIMIT 50;

-- 5. Inbound events that exist but are not linked to applications.
SELECT
  ee.id,
  ee.subject,
  ee.sender,
  ee.detected_type,
  ee.classification_reason AS decision_reason,
  ee.company_name,
  ee.role_title,
  ee.application_id,
  ee.ingest_decision,
  ee.created_at
FROM email_events ee
JOIN users u ON u.id = ee.user_id
WHERE u.email = :user_email
  AND ee.provider = 'inbound_forward'
  AND ee.application_id IS NULL
ORDER BY ee.created_at DESC
LIMIT 50;

-- 6. Latest visible applications for the user.
SELECT
  ja.id,
  ja.company_name,
  ja.job_title,
  ja.current_status,
  ja.status,
  ja.source,
  ja.created_at,
  ja.updated_at,
  ja.last_activity_at,
  ja.archived
FROM job_applications ja
JOIN users u ON u.id = ja.user_id
WHERE u.email = :user_email
ORDER BY COALESCE(ja.last_activity_at, ja.updated_at, ja.created_at) DESC
LIMIT 50;
