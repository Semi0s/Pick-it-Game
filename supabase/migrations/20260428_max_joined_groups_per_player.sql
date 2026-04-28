alter table public.app_settings
add column if not exists integer_value integer;

insert into public.app_settings (key, boolean_value, integer_value)
values ('max_joined_groups_per_player', false, 10)
on conflict (key)
do update
set integer_value = coalesce(public.app_settings.integer_value, excluded.integer_value);
