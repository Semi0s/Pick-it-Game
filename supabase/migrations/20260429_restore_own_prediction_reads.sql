drop policy if exists "Users can read own predictions" on public.predictions;

create policy "Users can read own predictions"
on public.predictions for select
to authenticated
using (user_id = auth.uid());
