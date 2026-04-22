-- Reconcile legacy per-user limit values to the current plan policy.
-- Free: 50 tracked updates, 150 forwarded emails.
-- Paid (Pro monthly / Job Search Plan): 500 tracked updates, 1000 forwarded emails.

UPDATE users
SET monthly_tracked_email_limit = CASE
      WHEN lower(COALESCE(plan_tier, 'free')) = 'pro'
        OR lower(COALESCE(billing_plan, '')) IN ('pro_monthly', 'job_search_plan')
      THEN 500
      ELSE 50
    END,
    monthly_inbound_email_limit = CASE
      WHEN lower(COALESCE(plan_tier, 'free')) = 'pro'
        OR lower(COALESCE(billing_plan, '')) IN ('pro_monthly', 'job_search_plan')
      THEN 1000
      ELSE 150
    END
WHERE COALESCE(monthly_tracked_email_limit, -1) <> CASE
        WHEN lower(COALESCE(plan_tier, 'free')) = 'pro'
          OR lower(COALESCE(billing_plan, '')) IN ('pro_monthly', 'job_search_plan')
        THEN 500
        ELSE 50
      END
   OR COALESCE(monthly_inbound_email_limit, -1) <> CASE
        WHEN lower(COALESCE(plan_tier, 'free')) = 'pro'
          OR lower(COALESCE(billing_plan, '')) IN ('pro_monthly', 'job_search_plan')
        THEN 1000
        ELSE 150
      END;
