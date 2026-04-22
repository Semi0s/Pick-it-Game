alter table public.email_jobs
  add column if not exists dedupe_key text,
  add column if not exists provider_response_id text;

create unique index if not exists email_jobs_active_kind_email_idx
  on public.email_jobs (kind, lower(email))
  where status in ('pending', 'retrying', 'processing');
