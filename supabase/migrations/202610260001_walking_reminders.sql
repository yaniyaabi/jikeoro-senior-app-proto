-- Web Push subscriptions are device-specific. No resident can read another endpoint.
create table if not exists public.walking_push_config (
  id boolean primary key default true check (id),
  public_key text,
  private_key text,
  dispatch_secret text not null default encode(gen_random_bytes(32), 'hex')
);
alter table public.walking_push_config enable row level security;
revoke all on public.walking_push_config from anon, authenticated;
grant all on public.walking_push_config to service_role;
insert into public.walking_push_config (id) values (true) on conflict do nothing;

create table if not exists public.walking_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  enabled boolean not null default true,
  hours integer[] not null default '{19}',
  updated_at timestamptz not null default now(),
  last_slot text,
  last_test_at timestamptz,
  constraint valid_reminder_hours check (
    cardinality(hours) between 1 and 2 and hours <@ array[8,9,10,11,12,13,14,15,16,17,18,19,20,21]
  )
);
alter table public.walking_push_subscriptions enable row level security;
revoke all on public.walking_push_subscriptions from anon, authenticated;
grant all on public.walking_push_subscriptions to service_role;
create index if not exists walking_push_enabled_idx on public.walking_push_subscriptions (enabled);

-- Claim before sending: overlapping cron invocations cannot duplicate a reminder.
create or replace function public.claim_walking_push(batch_size integer default 100)
returns setof public.walking_push_subscriptions
language sql security definer set search_path = '' as $$
  with due as (
    select s.id from public.walking_push_subscriptions s
    where s.enabled
      and extract(hour from now() at time zone 'Asia/Seoul')::integer = any(s.hours)
      and extract(minute from now() at time zone 'Asia/Seoul') < 10
      and s.last_slot is distinct from to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD-HH24')
    order by s.id limit least(greatest(batch_size, 1), 100)
    for update skip locked
  )
  update public.walking_push_subscriptions s
  set last_slot = to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD-HH24')
  from due where s.id = due.id returning s.*;
$$;
revoke all on function public.claim_walking_push(integer) from public, anon, authenticated;
grant execute on function public.claim_walking_push(integer) to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create or replace function public.dispatch_walking_push()
returns bigint language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://opgzkvecdkfqdvbmecja.supabase.co/functions/v1/walking-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Reminder-Secret', c.dispatch_secret),
    body := '{"action":"dispatch"}'::jsonb,
    timeout_milliseconds := 10000
  ) from public.walking_push_config c where c.id;
$$;
revoke all on function public.dispatch_walking_push() from public, anon, authenticated;
select cron.schedule('jikeoro-walking-reminders', '*/5 * * * *', 'select public.dispatch_walking_push();');
