-- Clear malformed URL fragments that were incorrectly stored as company names.

UPDATE job_applications
SET company_name = NULL,
    company = CASE
      WHEN lower(trim(COALESCE(company, ''))) LIKE '<https%'
        OR lower(trim(COALESCE(company, ''))) LIKE '"<https%'
        OR lower(trim(COALESCE(company, ''))) LIKE '&lt;https%'
        OR lower(trim(COALESCE(company, ''))) IN ('http', 'https')
        OR lower(trim(COALESCE(company, ''))) LIKE 'http:%'
        OR lower(trim(COALESCE(company, ''))) LIKE 'https:%'
        OR lower(trim(COALESCE(company, ''))) LIKE 'http/%'
        OR lower(trim(COALESCE(company, ''))) LIKE 'https/%'
        OR lower(trim(COALESCE(company, ''))) LIKE 'www.%'
        OR lower(trim(COALESCE(company, ''))) LIKE '%://%'
        OR lower(trim(COALESCE(company, ''))) LIKE '%href=%'
      THEN 'Unknown company'
      ELSE company
    END,
    company_confidence = CASE
      WHEN lower(trim(COALESCE(company_source, ''))) = 'user' THEN company_confidence
      ELSE 0
    END
WHERE lower(trim(COALESCE(company_name, ''))) LIKE '<https%'
   OR lower(trim(COALESCE(company_name, ''))) LIKE '"<https%'
   OR lower(trim(COALESCE(company_name, ''))) LIKE '&lt;https%'
   OR lower(trim(COALESCE(company_name, ''))) IN ('http', 'https')
   OR lower(trim(COALESCE(company_name, ''))) LIKE 'http:%'
   OR lower(trim(COALESCE(company_name, ''))) LIKE 'https:%'
   OR lower(trim(COALESCE(company_name, ''))) LIKE 'http/%'
   OR lower(trim(COALESCE(company_name, ''))) LIKE 'https/%'
   OR lower(trim(COALESCE(company_name, ''))) LIKE 'www.%'
   OR lower(trim(COALESCE(company_name, ''))) LIKE '%://%'
   OR lower(trim(COALESCE(company_name, ''))) LIKE '%href=%';

UPDATE job_applications
SET company = 'Unknown company',
    company_confidence = CASE
      WHEN lower(trim(COALESCE(company_source, ''))) = 'user' THEN company_confidence
      ELSE 0
    END
WHERE (company_name IS NULL OR trim(COALESCE(company_name, '')) = '')
  AND (lower(trim(COALESCE(company, ''))) LIKE '<https%'
   OR lower(trim(COALESCE(company, ''))) LIKE '"<https%'
   OR lower(trim(COALESCE(company, ''))) LIKE '&lt;https%'
   OR lower(trim(COALESCE(company, ''))) IN ('http', 'https')
   OR lower(trim(COALESCE(company, ''))) LIKE 'http:%'
   OR lower(trim(COALESCE(company, ''))) LIKE 'https:%'
   OR lower(trim(COALESCE(company, ''))) LIKE 'http/%'
   OR lower(trim(COALESCE(company, ''))) LIKE 'https/%'
   OR lower(trim(COALESCE(company, ''))) LIKE 'www.%'
   OR lower(trim(COALESCE(company, ''))) LIKE '%://%'
   OR lower(trim(COALESCE(company, ''))) LIKE '%href=%');
