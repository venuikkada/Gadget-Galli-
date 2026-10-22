-- Customers pay the shop; Gadget Galli makes sure the shop delivers (20261024000018_pay_the_shop.sql)
\ir _prelude.sql
begin;

do $$
begin
  perform set_config('test.cyber_owner', (select owner_id::text from public.shops where id = current_setting('test.cyber')::uuid), false);
  perform set_config('test.dsnr', (select id::text from public.shops where name = 'Dilsukhnagar Digital Store'), false);
  perform set_config('test.secureeye', (select id::text from public.shops where name = 'SecureEye CCTV Solutions'), false);
  perform set_config('test.secureeye_owner', (select owner_id::text from public.shops where name = 'SecureEye CCTV Solutions'), false);
  perform set_config('test.mehdi_owner', (select owner_id::text from public.shops where name = 'Mehdipatnam Systems & Security'), false);
  perform set_config('test.kondapur', (select id::text from public.shops where name = 'Kondapur Laptop Point'), false);
end $$;

-- Places an order as a customer from a shop (a listing priced between p_min and p_max) and returns its id.
create function pg_temp.place(p_customer text, p_shop uuid, p_qty int, p_min numeric, p_max numeric, p_pickup boolean default false)
returns uuid language plpgsql as $$
declare
  v_listing uuid;
begin
  perform pg_temp.act_as(p_customer);
  perform public.cart_clear();
  select sp.id into v_listing from public.shop_products sp
   where sp.shop_id = p_shop and sp.is_active and sp.in_stock and (sp.stock_qty is null or sp.stock_qty >= p_qty)
     and sp.price between p_min and p_max
   order by sp.price desc limit 1;
  if v_listing is null then raise exception 'no listing between % and % at %', p_min, p_max, p_shop; end if;
  perform public.cart_add(v_listing, p_qty, true);
  if p_pickup then perform public.cart_update('{"fulfilment": "pickup"}'); end if;
  return (public.place_order('call')->>'id')::uuid;
end $$;
create function pg_temp.code(p_order uuid) returns text language sql as $$
  select code from private.order_codes where order_id = p_order;
$$;
grant execute on all functions in schema pg_temp to public;

-- 1. Who may take advance payments -----------------------------------------------------------------------------------
do $$
declare
  t jsonb;
begin
  t := private.shop_payment_terms(current_setting('test.kphb')::uuid);
  assert t->>'level' = 'trusted' and (t->>'advance_limit')::numeric = 50000, format('KPHB: %s', t);
  t := private.shop_payment_terms(current_setting('test.cyber')::uuid);
  assert t->>'level' = 'verified' and (t->>'advance_limit')::numeric = 10000, format('Cyber Zone (4.0★): %s', t);
  t := private.shop_payment_terms(current_setting('test.kondapur')::uuid);
  assert t->>'level' = 'new' and (t->>'advance_limit')::numeric = 0, format('an unverified shop takes no advance: %s', t);
  t := private.shop_payment_terms(current_setting('test.dsnr')::uuid);
  assert t->>'paused' = 'overdue' and (t->>'advance_limit')::numeric = 0, format('a shop with an overdue order: %s', t);
  t := private.shop_payment_terms(current_setting('test.secureeye')::uuid);
  assert t->>'paused' = 'complaint' and (t->>'advance_limit')::numeric = 0, format('a shop with a "paid but not sent" complaint: %s', t);
  assert private.send_by('2026-10-24 08:00+05:30') = '2026-10-24 13:00+05:30', 'paid before 9 AM: send by 1 PM';
  assert private.send_by('2026-10-24 10:15+05:30') = '2026-10-24 14:15+05:30', 'paid in the day: send within 4 hours';
  assert private.send_by('2026-10-24 18:30+05:30') = '2026-10-25 13:00+05:30', 'paid in the evening: send by 1 PM next day';
end $$;

-- Customers see it before they sign in; they never see strikes
select pg_temp.act_anon();
set role anon;
do $$
declare
  t jsonb := public.shop_payment_terms(current_setting('test.kphb')::uuid);
begin
  assert t->>'level' = 'trusted' and not (t->>'pay_on_delivery_only')::boolean and not t ? 'strikes', format('anon terms: %s', t);
  assert (public.shop_payment_terms(current_setting('test.kondapur')::uuid)->>'pay_on_delivery_only')::boolean, 'new shops: pay on delivery';
end $$;
reset role;

-- A changed UPI ID must be checked again before customers pay it in advance
select pg_temp.act_as('hitech_owner');
set role authenticated;
do $$
declare
  s jsonb;
begin
  s := public.shop_upsert('{"upi_id": "hitech.new@ybl"}');
  assert not (s->>'upi_verified')::boolean and (s->'payment_terms'->>'advance_limit')::numeric = 0, format('new UPI ID: %s', s->'payment_terms');
end $$;
reset role;

-- 2. Confirming picks how the order is paid ----------------------------------------------------------------------------
do $$
declare
  a uuid := pg_temp.place('ravi', current_setting('test.kphb')::uuid, 1, 2000, 40000);
  b uuid := pg_temp.place('priya', current_setting('test.kphb')::uuid, 2, 26000, 40000);
  c uuid := pg_temp.place('arjun', current_setting('test.kphb')::uuid, 1, 2000, 40000, true);
  o jsonb;
begin
  perform set_config('test.adv', a::text, false);
  perform set_config('test.cod', b::text, false);
  perform pg_temp.act_as('kphb_owner');
  o := public.shop_confirm_order(a);
  assert o->>'payment_mode' = 'advance', format('within the limit: advance, got %s', o->>'payment_mode');
  perform pg_temp.expect_error(format('select public.shop_confirm_order(%L, null, null, null, %L)', b, 'advance'), 'ADVANCE_NOT_ALLOWED%');
  perform pg_temp.expect_error(format('select public.shop_confirm_order(%L, null, null, null, %L)', b, 'cash'), 'INVALID_PAYMENT_MODE%');
  o := public.shop_confirm_order(b);
  assert o->>'payment_mode' = 'on_delivery' and (o->>'grand_total')::numeric > 50000, format('above the limit: on delivery (%s)', o->>'grand_total');
  o := public.shop_confirm_order(c);
  assert o->>'payment_mode' = 'on_delivery', 'pickups are paid at the shop';
end $$;
do $$ begin
  assert exists (select 1 from public.notifications where user_id = current_setting('test.priya')::uuid and kind = 'order_confirmed'
                 and body like '%No product, no payment%'), 'the customer is told to pay on delivery';
end $$;

-- 3. Pay on delivery: packed straight away, paid at the door with the delivery code ------------------------------------
do $$
declare
  b uuid := current_setting('test.cod')::uuid;
  o jsonb;
  r jsonb;
begin
  perform pg_temp.act_as('priya');
  perform pg_temp.expect_error(format('select public.customer_submit_payment(%L, %L)', b, '412345678901'), 'PAY_ON_DELIVERY%');
  o := public.get_order(b);
  assert o->'pay_to'->>'upi_id' = 'kphbcomputerworld@okicici', 'the customer can scan the shop''s UPI at the door';
  perform pg_temp.act_as('kphb_owner');
  perform pg_temp.expect_error(format('select public.shop_confirm_payment(%L)', b), 'PAY_ON_DELIVERY%');
  o := public.shop_mark_packed(b);
  assert o->>'status' = 'PACKED', 'pay-on-delivery orders are packed without a payment';
  o := public.shop_dispatch_order(b, '{"service": "own", "rider_name": "Ramu"}');
  perform pg_temp.expect_error(format('select public.shop_mark_delivered(%L, %L)', b, pg_temp.code(b)), 'PAYMENT_METHOD_REQUIRED%');
  r := public.shop_mark_delivered(b, pg_temp.code(b), 'cash');
  assert r->>'status' = 'DELIVERED' and r->>'delivered_by' = 'shop' and r->>'paid_at' is not null, format('handover failed: %s', r->>'status');
  assert r->'payments'->0->>'method' = 'cash', 'the cash payment is recorded';
  assert r->>'commission_status' = 'due' and (r->>'commission_amount')::numeric = round((r->>'grand_total')::numeric * 0.02, 2),
    format('2%% commission due: %s %s', r->>'commission_status', r->>'commission_amount');
end $$;

-- 4. Advance: the shop checks the payment; "not received" sends the customer back ---------------------------------------
do $$
declare
  a uuid := current_setting('test.adv')::uuid;
  o jsonb;
begin
  perform pg_temp.act_as('ravi');
  o := public.customer_submit_payment(a, '400011112222');
  perform pg_temp.act_as('kphb_owner');
  perform pg_temp.expect_error(format('select public.shop_reject_payment(%L, %L)', a, ' '), 'REASON_REQUIRED%');
  o := public.shop_reject_payment(a, 'No payment with this reference.');
  assert o->>'payment_claimed_at' is null and o->>'payment_rejected_reason' = 'No payment with this reference.', 'claim not cleared';
  perform pg_temp.expect_error(format('select public.shop_reject_payment(%L, %L)', a, 'again'), 'PAYMENT_NOT_CLAIMED%');
  perform pg_temp.act_as('ravi');
  o := public.customer_submit_payment(a, '400011113333');
  perform pg_temp.act_as('kphb_owner');
  o := public.shop_confirm_payment(a);
  assert o->>'status' = 'PAID' and o->>'payment_ref' = '400011113333' and o->>'dispatch_due_at' is not null, 'confirm failed';
  -- Another shop cannot touch it
  perform pg_temp.act_as('deccan_owner');
  perform pg_temp.expect_error(format('select public.shop_cancel_order(%L, %L, %L)', a, 'test', 'REF123456'), 'NOT_YOUR_SHOP%');
end $$;
do $$ begin
  assert exists (select 1 from public.notifications where user_id = current_setting('test.ravi')::uuid and kind = 'payment_not_found'),
    'the customer is told the shop did not find the payment';
end $$;

-- 5. The delivery code: never shown to the shop, not readable from the API, locked after 5 wrong tries ------------------
select pg_temp.act_as('kphb_owner');
set role authenticated;
do $$
declare
  a uuid := current_setting('test.adv')::uuid;
  r jsonb;
begin
  perform public.shop_mark_packed(a);
  perform public.shop_dispatch_order(a, '{"service": "porter", "rider_name": "Saleem"}');
  assert public.get_order(a)->>'delivery_code' is null, 'the shop must not see the code';
  perform pg_temp.expect_error('select code from private.order_codes limit 1', '%permission denied%');
  for i in 1..5 loop
    r := public.shop_mark_delivered(a, '99999');
    assert r->>'error' = 'WRONG_DELIVERY_CODE', format('wrong code %s: %s', i, r);
  end loop;
  assert (r->>'attempts_left')::int = 0, format('attempts left after 5: %s', r);
end $$;
reset role;
do $$ begin
  perform pg_temp.act_as('kphb_owner');
  perform pg_temp.expect_error(format('select public.shop_mark_delivered(%L, %L)', current_setting('test.adv'), pg_temp.code(current_setting('test.adv')::uuid)), 'CODE_LOCKED%');
  -- The customer can still confirm it themselves
  perform pg_temp.act_as('ravi');
  assert public.get_order(current_setting('test.adv')::uuid)->>'delivery_code' = pg_temp.code(current_setting('test.adv')::uuid), 'the customer sees the code';
  assert public.customer_mark_received(current_setting('test.adv')::uuid)->>'delivered_by' = 'customer', 'customer confirmation failed';
end $$;

-- 6. A shop that cannot deliver refunds a paid order (with the reference) or cancels an unpaid one -----------------------
do $$
declare
  paid uuid := (select o.id from public.orders o join public.shops s on s.id = o.shop_id
                 where o.status = 'PAID' and s.name = 'Mehdipatnam Systems & Security' limit 1);
  packed uuid := (select id from public.orders where status = 'PACKED' and payment_mode = 'on_delivery'
                   and shop_id = current_setting('test.secureeye')::uuid limit 1);
  o jsonb;
begin
  perform pg_temp.act_as('mehdi_owner');
  perform pg_temp.expect_error(format('select public.shop_cancel_order(%L, %L)', paid, 'Out of stock'), 'REFUND_REF_REQUIRED%');
  o := public.shop_cancel_order(paid, 'Out of stock', 'upi 4000 5555 6666');
  assert o->>'status' = 'CANCELLED' and o->>'refund_ref' = 'UPI400055556666' and (o->>'refund_amount')::numeric = (o->>'grand_total')::numeric,
    format('refund not recorded: %s %s', o->>'status', o->>'refund_ref');
  perform pg_temp.act_as('secureeye_owner');
  o := public.shop_cancel_order(packed, 'Customer not reachable');
  assert o->>'status' = 'CANCELLED' and o->>'refund_ref' is null, 'an unpaid order is cancelled without a refund';
  perform pg_temp.act_as('kphb_owner');
  perform pg_temp.expect_error(format('select public.shop_cancel_order(%L, %L, %L)',
    (select id from public.orders where shop_id = current_setting('test.kphb')::uuid and status = 'DELIVERED' limit 1), 'x', 'REF123456'), 'CANNOT_CANCEL_NOW%');
end $$;
do $$ begin
  assert exists (select 1 from public.notifications n join public.orders o on o.id = (n.data->>'order_id')::uuid
                 where n.user_id = o.customer_id and n.kind = 'order_cancelled' and n.body like '%UPI400055556666%'), 'customer not told the refund ref';
end $$;

-- 7. Overdue alerts pause advance payments until the shop catches up -----------------------------------------------------
do $$
declare
  a uuid := pg_temp.place('ravi', current_setting('test.cyber')::uuid, 1, 2000, 9000);
  b uuid;
  r jsonb;
begin
  perform pg_temp.act_as('cyber_owner');
  perform public.shop_confirm_order(a);
  perform pg_temp.act_as('ravi');
  perform public.customer_submit_payment(a, '400077778888');
  -- Claimed 3 hours ago and not checked by the shop
  update public.orders set payment_claimed_at = now() - interval '3 hours' where id = a;
  perform pg_temp.expect_error(format('select public.report_issue(%L, %L)', a, 'other'), 'PAYMENT_UNDER_REVIEW%');
  perform set_config('request.jwt.claims', '', false);
  r := public.run_order_jobs();
  assert (r->>'overdue')::int >= 1 and (select overdue_reason from public.orders where id = a) = 'payment_not_confirmed', format('jobs: %s', r);
  assert private.shop_payment_terms(current_setting('test.cyber')::uuid)->>'paused' = 'overdue', 'advance should pause';
  -- New orders from this shop are paid on delivery meanwhile
  b := pg_temp.place('priya', current_setting('test.cyber')::uuid, 1, 2000, 9000);
  perform pg_temp.act_as('cyber_owner');
  assert public.shop_confirm_order(b)->>'payment_mode' = 'on_delivery', 'a paused shop gets paid on delivery';
  -- The shop confirms the payment: the payment alert is over; the send-by time passes and the next one fires
  perform public.shop_confirm_payment(a);
  assert private.shop_payment_terms(current_setting('test.cyber')::uuid)->>'paused' is null, 'paused after the shop caught up';
  update public.orders set dispatch_due_at = now() - interval '1 minute' where id = a;
  perform set_config('request.jwt.claims', '', false);
  perform public.run_order_jobs();
  assert (select overdue_reason from public.orders where id = a) = 'not_sent', 'not sent by the send-by time';
  assert exists (select 1 from public.notifications where kind = 'order_overdue' and (data->>'order_id')::uuid = a
                 and user_id = current_setting('test.ravi')::uuid and title = 'Your order is late'), 'customer not alerted';
  assert exists (select 1 from public.notifications n join public.users u on u.id = n.user_id
                 where u.admin_role is not null and n.kind = 'order_overdue' and (n.data->>'order_id')::uuid = a), 'admins not alerted';
  -- Sending it ends the alert
  perform pg_temp.act_as('cyber_owner');
  perform public.shop_mark_packed(a);
  perform public.shop_dispatch_order(a, '{"service": "own"}');
  assert not public.gg_order_overdue((select o from public.orders o where id = a)), 'still overdue after sending';
end $$;

-- An overdue payment check lets the customer report it
do $$
declare
  a uuid := pg_temp.place('arjun', current_setting('test.hitech')::uuid, 1, 2000, 9000);
begin
  update public.shops set upi_verified = true where id = current_setting('test.hitech')::uuid;
  perform pg_temp.act_as('hitech_owner');
  assert public.shop_confirm_order(a)->>'payment_mode' = 'advance', 'hitech takes advance payments';
  perform pg_temp.act_as('arjun');
  perform public.customer_submit_payment(a, '400099990000');
  update public.orders set payment_claimed_at = now() - interval '3 hours' where id = a;
  perform set_config('request.jwt.claims', '', false);
  perform public.run_order_jobs();
  perform pg_temp.act_as('arjun');
  assert (public.report_issue(a, 'paid_not_sent', 'Paid 3 hours ago, no reply')->>'id') is not null, 'report refused';
  assert private.shop_payment_terms(current_setting('test.hitech')::uuid)->>'paused' = 'complaint', 'an open complaint pauses advance';
end $$;

-- 8. Strikes and a shop's own limit ---------------------------------------------------------------------------------------
select pg_temp.act_as('admin');
set role authenticated;
do $$
declare
  s jsonb;
  k uuid := current_setting('test.kphb')::uuid;
begin
  perform pg_temp.expect_error(format('select public.admin_set_shop_trust(%L, %L)', k, '{"strikes": 1}'), 'REASON_REQUIRED%');
  perform pg_temp.expect_error(format('select public.admin_set_shop_trust(%L, %L)', k, '{"advance_limit": 500000}'), 'INVALID_ADVANCE_LIMIT%');
  s := public.admin_set_shop_trust(k, '{"strikes": 1, "reason": "Paid order not delivered or refunded."}');
  assert s->'payment_terms'->>'paused' = 'strikes' and (s->'payment_terms'->>'advance_limit')::numeric = 0, format('1 strike: %s', s->'payment_terms');
  assert s->>'status' = 'approved', 'one strike does not suspend';
  s := public.admin_set_shop_trust(k, '{"strikes": 2, "reason": "Second unrefunded order."}');
  assert s->>'status' = 'suspended', 'two strikes suspend the shop';
  s := public.admin_set_shop_trust(k, '{"strikes": 0, "advance_limit": 20000}');
  assert (s->'payment_terms'->>'strikes')::int = 0 and (s->'payment_terms'->>'limit_override')::numeric = 20000, format('reset: %s', s->'payment_terms');
  s := public.admin_set_shop_trust(current_setting('test.kondapur')::uuid, '{"advance_limit": 5000}');
  assert (s->'payment_terms'->>'advance_limit')::numeric = 5000, 'an admin can let a new shop take small advance payments';
  s := public.admin_set_shop_trust(current_setting('test.kondapur')::uuid, '{"advance_limit": null}');
  assert (s->'payment_terms'->>'advance_limit')::numeric = 0, 'back to automatic';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.notifications where user_id = current_setting('test.kphb_owner')::uuid and kind = 'shop_strike'), 'shop not told about the strike';
end $$;
select pg_temp.act_as('kphb_owner');
set role authenticated;
select pg_temp.expect_error(format('select public.admin_set_shop_trust(%L, %L)', current_setting('test.kphb'), '{"strikes": 0}'), 'ADMIN_ONLY%');
reset role;

-- 9. Commission: due on delivery, paid by the shop by UPI, confirmed (or rejected) by an admin ------------------------------
select pg_temp.act_as('kphb_owner');
set role authenticated;
do $$
declare
  c jsonb := public.shop_commission();
begin
  assert (c->>'commission_pct')::numeric = 2 and (c->>'due_total')::numeric > 0, format('KPHB owes commission: %s', c->>'due_total');
  assert c->'pay_to'->>'upi_id' = 'gadgetgalli@ybl', 'the shop pays Gadget Galli''s UPI ID';
  perform pg_temp.expect_error($q$select public.shop_pay_commission('12')$q$, 'PAYMENT_REF_INVALID%');
  c := public.shop_pay_commission('412300004567');
  assert c->'pending'->>'ref' = '412300004567' and (c->>'due_total')::numeric = 0, format('payment not pending: %s', c->'pending');
  perform pg_temp.expect_error($q$select public.shop_pay_commission('412300004568')$q$, 'COMMISSION_PAYMENT_PENDING%');
  perform set_config('test.commission_payment', c->'pending'->>'id', false);
end $$;
reset role;
select pg_temp.act_as('admin');
set role authenticated;
do $$
declare
  p uuid := current_setting('test.commission_payment')::uuid;
  l jsonb := public.admin_list_commission();
  other uuid;
begin
  assert exists (select 1 from jsonb_array_elements(l->'submitted') e where (e->>'id')::uuid = p), 'not listed for the admin';
  assert (public.admin_overview()->>'commission_to_confirm')::int >= 1, 'overview misses it';
  perform pg_temp.expect_error(format('select public.admin_reject_commission(%L, %L)', p, ''), 'REASON_REQUIRED%');
  l := public.admin_reject_commission(p, 'Not in the bank statement.');
  assert not exists (select 1 from public.orders where commission_payment_id = p), 'rejected payment still holds orders';
  perform pg_temp.expect_error(format('select public.admin_confirm_commission(%L)', p), 'COMMISSION_NOT_PENDING%');
  -- Commission paid outside the app settles everything due for a shop
  other := (select shop_id from public.orders where commission_status = 'due' and shop_id <> current_setting('test.kphb')::uuid limit 1);
  l := public.admin_record_commission(other, 'CASH-OCT-01', 'upi');
  assert not exists (select 1 from public.orders where shop_id = other and commission_status = 'due'), 'record did not settle';
end $$;
reset role;
select pg_temp.act_as('kphb_owner');
set role authenticated;
do $$
declare
  c jsonb := public.shop_pay_commission('412300009999', 'bank_transfer');
begin
  perform set_config('test.commission_payment', c->'pending'->>'id', false);
end $$;
reset role;
select pg_temp.act_as('admin');
set role authenticated;
do $$
declare
  p uuid := current_setting('test.commission_payment')::uuid;
begin
  perform public.admin_confirm_commission(p);
  assert not exists (select 1 from public.orders where commission_payment_id = p and commission_status <> 'paid'), 'orders not marked paid';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.notifications where user_id = current_setting('test.kphb_owner')::uuid and kind = 'commission_rejected'), 'shop not told of the rejection';
  assert exists (select 1 from public.notifications where user_id = current_setting('test.kphb_owner')::uuid and kind = 'commission_confirmed'), 'shop not thanked';
end $$;

-- A problem on a delivered order holds its commission
do $$
declare
  d uuid := (select id from public.orders where status = 'DELIVERED' and commission_status = 'due' limit 1);
begin
  perform private.set_order_status(d, 'ISSUE_REPORTED', 'admin', 'test', '{}'::jsonb);
  assert (select commission_status from public.orders where id = d) = 'held', 'commission should be held';
  perform private.set_order_status(d, 'DELIVERED', 'admin', 'resolved', '{}'::jsonb);
  assert (select commission_status from public.orders where id = d) = 'due', 'resolving releases it';
end $$;

-- 10. Settings: advance limits; support can confirm a payment to the shop in a dispute -------------------------------------
select pg_temp.act_as('admin');
set role authenticated;
select pg_temp.expect_error($q$select public.admin_save_payment_settings('{"advance_limit_verified": 20000, "advance_limit_trusted": 10000}')$q$, 'INVALID_ADVANCE_LIMIT%');
do $$
declare
  r jsonb := public.admin_save_payment_settings('{"upi_id": "gadgetgalli@ybl", "advance_limit_verified": 15000, "advance_limit_trusted": 60000}');
  claimed uuid := (select id from public.orders where status = 'CONFIRMED' and payee = 'shop' and payment_claimed_at is not null limit 1);
  o jsonb;
begin
  assert (r->>'advance_limit_verified')::numeric = 15000 and (r->>'advance_limit_trusted')::numeric = 60000, format('limits not saved: %s', r);
  assert (public.shop_payment_terms(current_setting('test.cyber')::uuid)->>'advance_limit')::numeric = 15000, 'new verified limit not used';
  o := public.admin_confirm_payment(claimed);
  assert o->>'status' = 'PAID' and o->'events'->-1->'meta'->>'paid_to' = 'shop', format('dispute confirm: %s', o->'events'->-1);
end $$;
reset role;

rollback;
