alter table public.trophies
add column if not exists tier text not null default 'special'
check (tier in ('bronze', 'silver', 'gold', 'special'));

update public.trophies
set tier = case key
  when 'perfect_pick_first' then 'bronze'
  when 'perfect_pick_3' then 'gold'
  when 'big_climb' then 'silver'
  when 'daily_winner' then 'gold'
  when 'first_reaction' then 'special'
  else coalesce(tier, 'special')
end;
