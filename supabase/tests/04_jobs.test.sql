-- Scheduled jobs: expire unanswered requests after 2 hrs, remind after 24 hrs dispatched, auto-deliver older orders
-- paid to Gadget Galli after 72 hrs (never orders paid to the shop); stuck-order flags for the admin panel.
\ir _prelude.sql
begin;

create temp table t_jobs as
select id as src, gen_random_uuid() as id from public.orders where status = 'DELIVERED' order by id limit 4;

-- Four fresh orders copied from delivered ones, in the states the jobs look for; the last two were sent 80 hours ago,
-- one paid to Gadget Galli (before 0018), one paid to the shop in advance
insert into public.orders (id, order_no, customer_id, shop_id, status, contact_method, fulfilment, items, item_total, delivery_charge,
                           grand_total, customer_name, requested_at, confirmed_at, paid_at, packed_at, dispatched_at, payee, payment_mode)
select t.id, 'GG-TEST-' || row_number() over (), o.customer_id, o.shop_id,
       (array['REQUESTED', 'DISPATCHED', 'DISPATCHED', 'DISPATCHED'])[row_number() over ()]::public.order_status,
       'call', 'delivery', o.items, o.item_total, o.delivery_charge, o.grand_total, o.customer_name,
       now() - (array[interval '3 hours', interval '30 hours', interval '80 hours', interval '80 hours'])[row_number() over ()],
       case when row_number() over () > 1 then now() - interval '81 hours' end,
       case when row_number() over () > 1 then now() - interval '81 hours' end,
       case when row_number() over () > 1 then now() - interval '81 hours' end,
       now() - (array[null, interval '30 hours', interval '80 hours', interval '80 hours'])[row_number() over ()],
       (array['shop', 'shop', 'gadget_galli', 'shop'])[row_number() over ()],
       case when row_number() over () > 1 then 'advance' end
from t_jobs t join public.orders o on o.id = t.src;

do $$
declare
  r jsonb;
  ids uuid[] := (select array_agg(id order by order_no) from public.orders where order_no like 'GG-TEST-%');
begin
  assert (select count(*) from private.order_codes where order_id = any(ids)) = 4, 'every new order gets a delivery code';
  assert public.gg_stuck_reason((select o from public.orders o where id = ids[1])) = 'Not confirmed in 30 min', 'stuck flag for REQUESTED';
  assert public.gg_stuck_reason((select o from public.orders o where id = ids[2])) like 'Dispatched but not delivered%', 'stuck flag for DISPATCHED';

  r := public.run_order_jobs();
  assert (r->>'expired')::int >= 1, format('nothing expired: %s', r);
  assert (select status from public.orders where id = ids[1]) = 'EXPIRED', 'REQUESTED after 2 hrs should be EXPIRED';
  assert exists (select 1 from public.order_events where order_id = ids[1] and to_status = 'EXPIRED' and actor_role = 'system'), 'expiry event missing';
  assert (select reminder_sent_at from public.orders where id = ids[2]) is not null, '24 hr reminder not sent';
  assert exists (select 1 from public.notifications where kind = 'receive_reminder' and (data->>'order_id')::uuid = ids[2]), 'reminder notification missing';
  assert (select status from public.orders where id = ids[2]) = 'DISPATCHED', '30 hr order must stay DISPATCHED';
  assert (select status from public.orders where id = ids[3]) = 'DELIVERED', 'an older order paid to Gadget Galli is auto-delivered after 72 hrs';
  assert (select delivered_by from public.orders where id = ids[3]) = 'auto', 'auto delivery not marked as auto';
  -- Paid to the shop: no automatic delivery; it needs the code or the customer, and is flagged overdue instead
  assert (select status from public.orders where id = ids[4]) = 'DISPATCHED', 'an order paid to the shop is never auto-delivered';
  assert (select overdue_reason from public.orders where id = ids[4]) = 'not_delivered', 'sent 2+ days ago should be overdue';
  assert public.gg_stuck_reason((select o from public.orders o where id = ids[4])) = 'Sent but not delivered in 2 days', 'stuck flag for overdue';

  -- Running again does not repeat reminders or overdue alerts
  r := public.run_order_jobs();
  assert (select count(*) from public.notifications where kind = 'receive_reminder' and (data->>'order_id')::uuid = ids[2]) = 1, 'duplicate reminder';
  assert (select count(*) from public.notifications where kind = 'order_overdue' and (data->>'order_id')::uuid = ids[4]
            and user_id = (select customer_id from public.orders where id = ids[4])) = 1, 'duplicate overdue alert';
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
