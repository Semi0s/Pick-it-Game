alter table public.group_invites
add column if not exists helper_language text not null default 'en';

update public.group_invites
set helper_language = 'en'
where helper_language is null or helper_language = '';
