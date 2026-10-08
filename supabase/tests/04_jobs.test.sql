-- Scheduled jobs: expire unanswered requests after 2 hrs, remind after 24 hrs dispatched,
-- auto-deliver after 72 hrs; stuck-order flags for the admin panel.
\ir _prelude.sql
begin;

create temp table t_jobs as
select id as src, gen_random_uuid() as id from public.orders where status = 'DELIVERED' order by id limit 3;

-- Three fresh orders copied from delivered ones, in the states the jobs look for
insert into public.orders (id, order_no, customer_id, shop_id, status, contact_method, fulfilment, items, item_total, delivery_charge,
                           grand_total, customer_name, requested_at, confirmed_at, paid_at, packed_at, dispatched_at)
select t.id, 'GG-TEST-' || row_number() over (), o.customer_id, o.shop_id,
       (array['REQUESTED', 'DISPATCHED', 'DISPATCHED'])[row_number() over ()]::public.order_status,
       'call', 'delivery', o.items, o.item_total, o.delivery_charge, o.grand_total, o.customer_name,
       now() - (array[interval '3 hours', interval '30 hours', interval '80 hours'])[row_number() over ()],
       case when row_number() over () > 1 then now() - interval '81 hours' end,
       case when row_number() over () > 1 then now() - interval '81 hours' end,
       case when row_number() over () > 1 then now() - interval '81 hours' end,
       now() - (array[null, interval '30 hours', interval '80 hours'])[row_number() over ()]
from t_jobs t join public.orders o on o.id = t.src;

do $$
declare
  r jsonb;
  ids uuid[] := (select array_agg(id order by order_no) from public.orders where order_no like 'GG-TEST-%');
begin
  assert public.gg_stuck_reason((select o from public.orders o where id = ids[1])) = 'Not confirmed in 30 min', 'stuck flag for REQUESTED';
  assert public.gg_stuck_reason((select o from public.orders o where id = ids[2])) like 'Dispatched but not delivered%', 'stuck flag for DISPATCHED';

  r := public.run_order_jobs();
  assert (r->>'expired')::int >= 1, format('nothing expired: %s', r);
  assert (select status from public.orders where id = ids[1]) = 'EXPIRED', 'REQUESTED after 2 hrs should be EXPIRED';
  assert exists (select 1 from public.order_events where order_id = ids[1] and to_status = 'EXPIRED' and actor_role = 'system'), 'expiry event missing';
  assert (select reminder_sent_at from public.orders where id = ids[2]) is not null, '24 hr reminder not sent';
  assert exists (select 1 from public.notifications where kind = 'receive_reminder' and (data->>'order_id')::uuid = ids[2]), 'reminder notification missing';
  assert (select status from public.orders where id = ids[2]) = 'DISPATCHED', '30 hr order must stay DISPATCHED';
  assert (select status from public.orders where id = ids[3]) = 'DELIVERED', '72 hr order should be auto-delivered';
  assert (select delivered_by from public.orders where id = ids[3]) = 'auto', 'auto delivery not marked as auto';

  -- Running again does not repeat reminders
  r := public.run_order_jobs();
  assert (select count(*) from public.notifications where kind = 'receive_reminder' and (data->>'order_id')::uuid = ids[2]) = 1, 'duplicate reminder';
end $$;

-- Admin order list with stuck filter
select pg_temp.act_as('admin');
set role authenticated;
do $$
declare
  r jsonb := public.admin_list_orders('{"stuck_only": true}');
begin
  assert (r->>'total')::int >= 2, format('expected stuck orders from the seed, got %s', r->>'total');
  assert not exists (select 1 from jsonb_array_elements(r->'items') i where i->>'stuck_reason' is null), 'unstuck order in stuck filter';
end $$;
reset role;

rollback;
