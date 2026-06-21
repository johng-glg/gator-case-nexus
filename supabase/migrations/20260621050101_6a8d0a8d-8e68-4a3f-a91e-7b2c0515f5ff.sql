CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'daily-deadline-sweep',
  '15 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--8b3bc77b-451a-41f6-ae91-2ec0fba6062c.lovable.app/api/public/deadline-sweep',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRseHpqbnh2d3Vuc3Fzenp0b2pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5OTIyODIsImV4cCI6MjA5NzU2ODI4Mn0.liJwEIPkxcF1pis1A4tm7sRWYhlu1Az2m3D-7DwAQ-4"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);