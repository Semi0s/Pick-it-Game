alter table public.app_updates
  add column if not exists card_tone text not null default 'neutral'
  check (card_tone in ('neutral', 'sky', 'green', 'amber', 'rose'));
