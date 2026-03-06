-- Field authority + confidence defaults for safe parser updates.
ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS company_source text DEFAULT 'parser',
  ADD COLUMN IF NOT EXISTS role_source text DEFAULT 'parser',
  ADD COLUMN IF NOT EXISTS status_source text DEFAULT 'parser',
  ADD COLUMN IF NOT EXISTS company_confidence double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS role_confidence double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_confidence double precision DEFAULT 0;

ALTER TABLE job_applications
  ALTER COLUMN company_source SET DEFAULT 'parser',
  ALTER COLUMN role_source SET DEFAULT 'parser',
  ALTER COLUMN status_source SET DEFAULT 'parser',
  ALTER COLUMN company_confidence SET DEFAULT 0,
  ALTER COLUMN role_confidence SET DEFAULT 0,
  ALTER COLUMN status_confidence SET DEFAULT 0;

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
SET company_confidence = GREATEST(0, LEAST(100, COALESCE(company_confidence, 0))),
    role_confidence = GREATEST(0, LEAST(100, COALESCE(role_confidence, 0))),
    status_confidence = GREATEST(0, LEAST(100, COALESCE(status_confidence, 0)));
