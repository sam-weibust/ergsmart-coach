-- Schedule daily re-engagement notifications at 9am UTC (5am EST)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-reengagement-notifications-9utc') THEN
    PERFORM cron.schedule(
      'daily-reengagement-notifications-9utc',
      '0 9 * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://clmesnkdwohtvduzdgex.supabase.co/functions/v1/send-reengagement-notifications',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
      ) AS request_id;
      $cron$
    );
  END IF;
END;
$$;
