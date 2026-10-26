-- Keep existing consent unchanged; standardize only the two delivery times.
alter table public.walking_push_subscriptions alter column hours set default '{11,19}';
update public.walking_push_subscriptions set hours = '{11,19}', updated_at = now()
where hours is distinct from array[11,19];

create or replace function public.claim_walking_push(batch_size integer default 100)
returns setof public.walking_push_subscriptions
language sql security definer set search_path = '' as $$
  with due as (
    select s.id from public.walking_push_subscriptions s
    where s.enabled
      and extract(hour from now() at time zone 'Asia/Seoul')::integer in (11,19)
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
