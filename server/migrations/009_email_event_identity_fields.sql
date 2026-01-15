ALTER TABLE email_events ADD COLUMN classification_confidence REAL;
ALTER TABLE email_events ADD COLUMN identity_confidence REAL;
ALTER TABLE email_events ADD COLUMN identity_company_name TEXT;
ALTER TABLE email_events ADD COLUMN identity_job_title TEXT;
ALTER TABLE email_events ADD COLUMN identity_company_confidence REAL;
ALTER TABLE email_events ADD COLUMN identity_explanation TEXT;
ALTER TABLE email_events ADD COLUMN reason_code TEXT;
ALTER TABLE email_events ADD COLUMN reason_detail TEXT;

UPDATE email_events
SET classification_confidence = confidence_score
WHERE classification_confidence IS NULL;
