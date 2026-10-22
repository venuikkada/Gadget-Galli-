-- Orders placed before 20261024000018 were paid to Gadget Galli and shops were paid after delivery
-- (20261020000014_platform_payments.sql). They still finish on that flow.
\ir _prelude.sql
begin;

-- Turn the demo orders into such older orders: paid to Gadget Galli (one payment waiting to be checked), payouts
-- paid for orders delivered over 3 days ago, due for recent ones and held while a problem is open
update public.orders set payee = 'gadget_galli', payment_mode = case when confirmed_at is not null then 'advance' end,
       commission_status = 'none', commission_amount = null, commission_payment_id = null, overdue_reason = null, overdue_at = null;
delete from public.commission_payments;
update public.orders set payment_claimed_at = null where status = 'CONFIRMED';
update public.orders set payment_ref = '415628930417', payment_method = 'upi', payment_claimed_at = confirmed_at + interval '6 minutes'
 where id = (select id from public.orders where status = 'CONFIRMED' order by confirmed_at desc limit 1);
update public.orders set payout_amount = grand_total, commission_amount = 0,
       payout_status = case when status = 'ISSUE_REPORTED' then 'held'
                            when delivered_at < now() - interval '3 days' then 'paid' else 'due' end,
       payout_ref = case when status = 'DELIVERED' and delivered_at < now() - interval '3 days'
                         then 'GGP' || to_char(delivered_at + interval '1 day', 'YYMMDD') || upper(left(md5(shop_id::text), 4)) end,
       payout_at = case when status = 'DELIVERED' and delivered_at < now() - interval '3 days'
                        then date_trunc('day', delivered_at + interval '1 day') + interval '11 hours' end
 where delivered_at is not null;

-- Settings: only valid UPI IDs and commissions, super admins only
select pg_temp.act_as('ravi');
set role authenticated;
select pg_temp.expect_error($q$select public.admin_save_payment_settings('{"upi_id": "x@ybl"}')$q$, 'SUPER_ADMIN_ONLY%');
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
select pg_temp.expect_error($q$select public.admin_save_payment_settings('{"upi_id": "not a upi"}')$q$, 'INVALID_UPI%');
select pg_temp.expect_error($q$select public.admin_save_payment_settings('{"upi_id": "gadgetgalli@ybl", "commission_pct": 60}')$q$, 'INVALID_COMMISSION%');
select pg_temp.expect_error($q$select public.admin_save_payment_settings('{"bank_account_name": "GG", "bank_account_number": "12345678901", "bank_ifsc": "HDFC1234"}')$q$, 'INVALID_IFSC%');
select pg_temp.expect_error($q$select public.admin_save_payment_settings('{"bank_account_name": "GG", "bank_account_number": "12AB", "bank_ifsc": "HDFC0001234"}')$q$, 'INVALID_BANK_ACCOUNT%');
select pg_temp.expect_error($q$select public.admin_save_payment_settings('{"qr_path": "../secret.png"}')$q$, 'INVALID_QR%');
do $$
declare
  r jsonb;
  o jsonb;
  oid uuid := (select id from public.orders where status = 'CONFIRMED' and payment_claimed_at is null limit 1);
begin
  -- Nothing saved: customers cannot pay yet
  r := public.admin_save_payment_settings('{}');
  assert not (r->>'ready')::boolean and r->>'upi_id' is null and r->'bank' = 'null'::jsonb, format('empty settings should not be ready: %s', r);

  -- Bank account only: ready, and pay_to carries it
  r := public.admin_save_payment_settings('{"bank_account_name": "Gadget Galli Technologies", "bank_account_number": "0001 2345 6789", "bank_ifsc": "hdfc0001234", "bank_name": "HDFC Bank"}');
  assert (r->>'ready')::boolean and r->'bank'->>'account_number' = '000123456789' and r->'bank'->>'ifsc' = 'HDFC0001234', format('bank not saved: %s', r);

  -- Everything: UPI, QR image, bank, commission
  r := public.admin_save_payment_settings('{"upi_id": "GadgetGalli@ybl", "upi_name": "Gadget Galli", "qr_path": "payments/qr.png", "bank_account_name": "Gadget Galli Technologies", "bank_account_number": "000123456789", "bank_ifsc": "HDFC0001234", "bank_name": "HDFC Bank", "commission_pct": 5}');
  assert r->>'upi_id' = 'gadgetgalli@ybl' and r->>'qr_path' = 'payments/qr.png' and (r->>'commission_pct')::numeric = 5, format('settings not saved: %s', r);
  o := public.get_order(oid);
  assert o->'pay_to'->>'upi_id' = 'gadgetgalli@ybl' and o->'pay_to'->'bank'->>'ifsc' = 'HDFC0001234', format('admin order view misses pay_to: %s', o->'pay_to');
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

-- A customer pays by bank transfer; the confirmation records it as a bank transfer (undone afterwards, so the
-- later tests still have their unpaid orders)
reset role;
savepoint bank_payment;
do $$
declare
  oid uuid;
  cust uuid;
begin
  select id, customer_id into oid, cust from public.orders
   where status = 'CONFIRMED' and payment_claimed_at is null order by confirmed_at desc limit 1;
  assert oid is not null, 'demo data has no unpaid confirmed order';
  perform set_config('test.bank_order', oid::text, false);
  perform set_config('test.bank_customer', cust::text, false);
end $$;
select pg_temp.act_as('bank_customer');
set role authenticated;
do $$
declare
  oid uuid := current_setting('test.bank_order')::uuid;
  o jsonb := public.get_order(oid);
begin
  assert o->'pay_to'->'bank'->>'account_number' = '000123456789' and (o->'pay_to'->>'ready')::boolean,
    format('customer should see the bank account: %s', o->'pay_to');
  perform pg_temp.expect_error(format('select public.customer_submit_payment(%L, %L, %L)', oid, '412345678901', 'cash'), 'PAYMENT_METHOD_UNAVAILABLE%');
  o := public.customer_submit_payment(oid, 'hdfc n5202 4102 0123 45678', 'bank_transfer');
  assert o->>'payment_method' = 'bank_transfer' and o->>'payment_ref' = 'HDFCN52024102012345678', format('bank claim not saved: %s', o);
end $$;
reset role;
select pg_temp.act_as('admin');
set role authenticated;
do $$
declare
  oid uuid := current_setting('test.bank_order')::uuid;
  o jsonb;
begin
  assert exists (select 1 from jsonb_array_elements(public.admin_list_payments_to_verify()->'items') e
                 where (e->>'id')::uuid = oid and e->>'payment_method' = 'bank_transfer'), 'bank payment not listed with its method';
  o := public.admin_confirm_payment(oid);
  assert o->>'status' = 'PAID', 'bank payment not confirmed';
end $$;
reset role;
do $$ begin
  assert (select method from public.payments_log where order_id = current_setting('test.bank_order')::uuid order by id desc limit 1) = 'bank_transfer',
    'payments_log should record a bank transfer';
  assert exists (select 1 from public.notifications where kind = 'payment_claimed' and data->>'method' = 'bank_transfer'), 'admins not alerted with the method';
end $$;
rollback to savepoint bank_payment;
select pg_temp.act_as('admin');
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
  assert not exists (select 1 from public.orders o where o.shop_id = current_setting('test.kphb')::uuid
                     and public.get_order(o.id)->'pay_to' <> 'null'::jsonb), 'a shop must not see where customers pay';
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
