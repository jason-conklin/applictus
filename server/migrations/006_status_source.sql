ALTER TABLE job_applications ADD COLUMN status_source TEXT;

UPDATE job_applications
SET status_source = CASE
  WHEN user_override = 1 THEN 'user'
  ELSE 'inferred'
END
WHERE status_source IS NULL;
