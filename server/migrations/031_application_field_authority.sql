-- Normalize authority/confidence metadata for parser-safe updates.
-- company_source/role_source/status_source and confidence columns were introduced in earlier migrations.

UPDATE job_applications
SET company_source = 'user'
WHERE company_source IS NOT NULL
  AND lower(trim(company_source)) IN ('manual', 'user');

UPDATE job_applications
SET role_source = 'user'
WHERE role_source IS NOT NULL
  AND lower(trim(role_source)) IN ('manual', 'user');

UPDATE job_applications
SET status_source = 'user'
WHERE status_source IS NOT NULL
  AND lower(trim(status_source)) IN ('manual', 'user');

UPDATE job_applications
SET status_source = 'system'
WHERE status_source IS NOT NULL
  AND lower(trim(status_source)) IN ('inferred', 'inference', 'system');

UPDATE job_applications
SET company_source = 'parser'
WHERE company_source IS NULL
   OR trim(company_source) = ''
   OR lower(trim(company_source)) NOT IN ('user', 'hint', 'parser', 'system');

UPDATE job_applications
SET role_source = 'parser'
WHERE role_source IS NULL
   OR trim(role_source) = ''
   OR lower(trim(role_source)) NOT IN ('user', 'hint', 'parser', 'system');

UPDATE job_applications
SET status_source = 'parser'
WHERE status_source IS NULL
   OR trim(status_source) = ''
   OR lower(trim(status_source)) NOT IN ('user', 'hint', 'parser', 'system');

UPDATE job_applications
SET company_confidence = ROUND(company_confidence * 100)
WHERE company_confidence IS NOT NULL
  AND company_confidence >= 0
  AND company_confidence <= 1;

UPDATE job_applications
SET role_confidence = ROUND(role_confidence * 100)
WHERE role_confidence IS NOT NULL
  AND role_confidence >= 0
  AND role_confidence <= 1;

UPDATE job_applications
SET status_confidence = ROUND(status_confidence * 100)
WHERE status_confidence IS NOT NULL
  AND status_confidence >= 0
  AND status_confidence <= 1;

UPDATE job_applications
SET company_confidence = CASE
  WHEN company_confidence IS NULL THEN 0
  WHEN company_confidence < 0 THEN 0
  WHEN company_confidence > 100 THEN 100
  ELSE company_confidence
END;

UPDATE job_applications
SET role_confidence = CASE
  WHEN role_confidence IS NULL THEN 0
  WHEN role_confidence < 0 THEN 0
  WHEN role_confidence > 100 THEN 100
  ELSE role_confidence
END;

UPDATE job_applications
SET status_confidence = CASE
  WHEN status_confidence IS NULL THEN 0
  WHEN status_confidence < 0 THEN 0
  WHEN status_confidence > 100 THEN 100
  ELSE status_confidence
END;
