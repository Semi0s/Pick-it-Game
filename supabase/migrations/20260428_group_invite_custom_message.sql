alter table public.group_invites
add column if not exists custom_message text;
