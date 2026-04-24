-- Ensures the email job worker only claims runnable jobs.
-- - pending/retrying only
-- - available_at <= now()
-- - attempts < max_attempts

create or replace function public.claim_email_jobs(job_limit integer default 10)
returns setof public.email_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select email_jobs.id
    from public.email_jobs
    where email_jobs.status in ('pending', 'retrying')
      and email_jobs.available_at <= now()
      and email_jobs.attempts < email_jobs.max_attempts
    order by email_jobs.created_at
    for update skip locked
    limit job_limit
  ),
  claimed as (
    update public.email_jobs
    set status = 'processing',
        attempts = public.email_jobs.attempts + 1,
        locked_at = now(),
        updated_at = now()
    where public.email_jobs.id in (select candidates.id from candidates)
    returning public.email_jobs.*
  )
  select * from claimed;
end;
$$;
