alter table public.group_invites
  add column if not exists invite_intent text not null default 'member',
  add column if not exists captain_invite_allowance integer;

update public.group_invites
set invite_intent = 'member'
where invite_intent is null
   or trim(invite_intent) = '';

alter table public.group_invites
  drop constraint if exists group_invites_invite_intent_check,
  drop constraint if exists group_invites_captain_invite_allowance_check;

alter table public.group_invites
  add constraint group_invites_invite_intent_check
    check (invite_intent in ('member', 'captain_pass')),
  add constraint group_invites_captain_invite_allowance_check
    check (
      captain_invite_allowance is null
      or (captain_invite_allowance >= 1 and captain_invite_allowance <= 6)
    );

create index if not exists group_invites_captain_intent_idx
  on public.group_invites (group_id, normalized_email, status)
  where invite_intent = 'captain_pass';
