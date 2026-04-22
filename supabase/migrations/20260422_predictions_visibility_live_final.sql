drop policy if exists "Authenticated users can read predictions after kickoff" on public.predictions;
drop policy if exists "Authenticated users can read predictions for live or final matches" on public.predictions;

create policy "Authenticated users can read predictions for live or final matches"
on public.predictions for select
to authenticated
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.matches
    where matches.id = predictions.match_id
      and matches.status in ('live', 'final')
  )
);
