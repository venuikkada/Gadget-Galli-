-- Customers pay Gadget Galli; shops are paid after delivery (20261020000014_platform_payments.sql)
\ir _prelude.sql
begin;

-- Settings: only valid UPI IDs and commissions, super admins only
select pg_temp.act_as('ravi');
set role authenticated;
select pg_temp.expect_error($q$select public.admin_save_payment_settings('x@ybl', 'X', 0)$q$, 'SUPER_ADMIN_ONLY%');
select pg_temp.expect_error($q$select public.admin_list_payouts('due')$q$, 'ADMIN_ONLY%');
select pg_temp.expect_error($q$select public.admin_confirm_payment((select id from public.orders limit 1))$q$, 'ADMIN_ONLY%');
-- A customer cannot pay for someone else's order
select pg_temp.expect_error(
  format('select public.customer_submit_payment(%L, %L)',
    (select id from public.orders where status = 'CONFIRMED' and customer_id <> current_setting('test.ravi')::uuid limit 1), '412345678901'),
  'ORDER_NOT_FOUND%');
reset role;

select pg_temp.act_as('admin');
set role authenticated;
select pg_temp.expect_error($q$select public.admin_save_payment_settings('not a upi', 'Gadget Galli', 0)$q$, 'INVALID_UPI%');
select pg_temp.expect_error($q$select public.admin_save_payment_settings('gadgetgalli@ybl', 'Gadget Galli', 60)$q$, 'INVALID_COMMISSION%');
do $$
declare
  r jsonb := public.admin_save_payment_settings('GadgetGalli@ybl', 'Gadget Galli', 5);
begin
  assert r->>'upi_id' = 'gadgetgalli@ybl' and (r->>'commission_pct')::numeric = 5, format('settings not saved: %s', r);
end $$;

-- Rejecting a claimed payment clears it and tells the customer
do $$
declare
  oid uuid := (select id from public.orders where status = 'CONFIRMED' and payment_claimed_at is not null limit 1);
  o jsonb;
begin
  assert oid is not null, 'demo data has no payment to verify';
  perform pg_temp.expect_error(format('select public.admin_reject_payment(%L, %L)', oid, ''), 'REASON_REQUIRED%');
  o := public.admin_reject_payment(oid, 'No payment with this reference in the bank statement.');
  assert o->>'payment_claimed_at' is null and o->>'payment_rejected_reason' like 'No payment%', 'reject did not clear the claim';
  perform pg_temp.expect_error(format('select public.admin_reject_payment(%L, %L)', oid, 'again'), 'PAYMENT_NOT_CLAIMED%');
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.notifications n join public.orders x on x.id = (n.data->>'order_id')::uuid
                 where n.user_id = x.customer_id and n.kind = 'payment_not_found'), 'customer not told';
end $$;
set role authenticated;

-- Delivery makes the payout due (with the 5% commission set above); a problem report holds it
do $$
declare
  oid uuid := (select id from public.orders where status = 'DISPATCHED' order by dispatched_at limit 1);
  o public.orders;
begin
  assert oid is not null, 'demo data has no dispatched order';
  reset role;
  perform private.set_order_status(oid, 'DELIVERED', 'system', 'test', '{}'::jsonb);
  select * into o from public.orders where id = oid;
  assert o.payout_status = 'due', format('payout should be due, got %s', o.payout_status);
  assert o.commission_amount = round(o.grand_total * 0.05, 2) and o.payout_amount = o.grand_total - o.commission_amount,
    format('commission %s payout %s of %s', o.commission_amount, o.payout_amount, o.grand_total);
  perform private.set_order_status(oid, 'ISSUE_REPORTED', 'admin', 'test', '{}'::jsonb);
  assert (select payout_status from public.orders where id = oid) = 'held', 'a reported problem should hold the payout';
  perform private.set_order_status(oid, 'DELIVERED', 'admin', 'resolved', '{}'::jsonb);
  assert (select payout_status from public.orders where id = oid) = 'due', 'resolving should release the payout';
end $$;

-- Paying a shop: one shop at a time, with a reference; the shop is notified
select pg_temp.act_as('admin');
set role authenticated;
do $$
declare
  due jsonb := public.admin_list_payouts('due');
  shop1 jsonb := due->0;
  ids uuid[] := (select array_agg((e->>'id')::uuid) from jsonb_array_elements(due->0->'orders') e);
  other uuid := ((due->1->'orders'->0)->>'id')::uuid;
  r jsonb;
begin
  assert jsonb_array_length(due) >= 2, 'need payouts due for two shops';
  perform pg_temp.expect_error(format('select public.admin_mark_payouts_paid(%L, %L)', ids, ''), 'PAYOUT_REF_REQUIRED%');
  perform pg_temp.expect_error(format('select public.admin_mark_payouts_paid(%L, %L)', ids || other, 'UTR123456'), 'PAYOUTS_MIXED_SHOPS%');
  r := public.admin_mark_payouts_paid(ids, 'utr123456');
  assert (r->>'total')::numeric = (shop1->>'total')::numeric and r->>'ref' = 'UTR123456', format('payout result %s', r);
  assert not exists (select 1 from public.orders where id = any(ids) and payout_status <> 'paid'), 'orders not marked paid';
  perform set_config('test.paid_shop', shop1->>'shop_id', false);
  perform pg_temp.expect_error(format('select public.admin_mark_payouts_paid(%L, %L)', ids, 'UTR999999'), 'PAYOUT_NOT_DUE%');
  assert (public.admin_overview()->>'payouts_due')::numeric >= 0, 'overview misses payouts';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.notifications n join public.shops s on s.owner_id = n.user_id
                 where s.id = current_setting('test.paid_shop')::uuid and n.kind = 'payout_paid'), 'shop not notified of the payout';
end $$;

-- A shop sees only its own payouts
select pg_temp.act_as('kphb_owner');
set role authenticated;
do $$
declare
  p jsonb := public.shop_payouts();
begin
  assert jsonb_array_length(p->'items') > 0, 'shop sees no payouts';
  assert not exists (select 1 from jsonb_array_elements(p->'items') e join public.orders o on o.id = (e->>'id')::uuid
                     where o.shop_id <> current_setting('test.kphb')::uuid), 'shop sees another shop''s payouts';
end $$;
reset role;

-- Unpaid confirmed orders expire after 24 hours; claimed ones wait for the admin
select set_config('request.jwt.claims', '', false);  -- run the jobs as the scheduler
do $$
declare
  a uuid;
  b uuid;
begin
  select id into a from public.orders where status = 'CONFIRMED' and payment_claimed_at is null limit 1;
  select id into b from public.orders where status = 'CONFIRMED' and id <> a limit 1;
  update public.orders set confirmed_at = now() - interval '25 hours' where id in (a, b);
  update public.orders set payment_ref = '400000000001', payment_claimed_at = now() - interval '1 hour' where id = b;
  perform public.run_order_jobs();
  assert (select status from public.orders where id = a) = 'EXPIRED', 'unpaid order did not expire';
  assert (select status from public.orders where id = b) = 'CONFIRMED', 'a claimed payment must wait for the admin';
end $$;

rollback;
