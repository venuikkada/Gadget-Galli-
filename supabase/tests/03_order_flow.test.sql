-- The "Done when" scenario: a customer in Kukatpally finds an RTX 4060, orders from a shop that
-- delivers there, pays the shop in advance by UPI, the shop moves it through every step and hands it over
-- with the customer's delivery code, the customer reviews, reports a problem, and an admin resolves it.
\ir _prelude.sql
begin;

create temp table t_ctx (k text primary key, v text);
grant all on t_ctx to public;

-- Customer: cart rules (one shop per cart) and placing the order
select pg_temp.act_as('ravi');
set role authenticated;
do $$
declare
  k int := current_setting('test.kukatpally')::int;
  zotac uuid := current_setting('test.zotac4060')::uuid;
  kphb_listing uuid;
  cyber_listing uuid;
  r jsonb;
  c jsonb;
  o jsonb;
begin
  perform public.cart_clear();
  select (x->>'shop_product_id')::uuid into kphb_listing
    from jsonb_array_elements(public.get_product_page(zotac, k)->'offers') x where x->>'shop_name' = 'KPHB Computer World';
  select (x->>'shop_product_id')::uuid into cyber_listing
    from jsonb_array_elements(public.get_product_page(zotac, k)->'offers') x where x->>'shop_name' = 'Cyber Zone Systems';

  r := public.cart_add(kphb_listing, 1);
  assert r->>'status' = 'ok', 'add to cart failed';
  r := public.cart_add(cyber_listing, 1);
  assert r->>'status' = 'conflict' and r->'current_shop'->>'name' = 'KPHB Computer World', 'expected one-shop-per-cart prompt';
  r := public.cart_add(cyber_listing, 1, true);
  assert r->>'status' = 'ok' and r->'cart'->'shop'->>'name' = 'Cyber Zone Systems', 'replace cart failed';
  r := public.cart_add(kphb_listing, 1, true);
  c := public.cart_set_qty(kphb_listing, 2);
  assert (c->'totals'->>'item_count')::int = 2, 'qty update failed';
  c := public.cart_update('{"note": "Need GST bill"}');
  assert c->'cart'->>'note' = 'Need GST bill', 'note not saved';
  assert c->'address'->>'area_name' = 'Kukatpally', format('default address should be Kukatpally, got %s', c->'address'->>'area_name');
  assert jsonb_array_length(c->'problems') = 0, format('cart has problems: %s', c->'problems');
  assert (c->'totals'->>'grand_total')::numeric = (c->'totals'->>'item_total')::numeric + (c->'totals'->>'delivery_charge')::numeric, 'totals do not add up';

  o := public.place_order('call');
  assert o->>'status' = 'REQUESTED', 'order not REQUESTED';
  assert o->>'order_no' like 'GG-__-______', format('order number format: %s', o->>'order_no');
  assert jsonb_array_length(o->'items') = 1 and (o->'items'->0->>'qty')::int = 2, 'item snapshot wrong';
  assert o->'address'->>'area' = 'Kukatpally', 'address snapshot missing';
  assert o->'shop'->>'upi_id' is null, 'UPI must not be shown before the shop confirms';
  assert jsonb_array_length(public.get_cart()->'items') = 0, 'cart not cleared';
  insert into t_ctx values ('order', o->>'id');
end $$;
reset role;

do $$
declare
  oid uuid := (select v::uuid from t_ctx where k = 'order');
begin
  assert exists (select 1 from public.notifications where user_id = current_setting('test.kphb_owner')::uuid
                 and kind = 'new_order' and (data->>'order_id')::uuid = oid), 'shop was not alerted';
  assert (select call_taps from public.shop_stats_daily where shop_id = current_setting('test.kphb')::uuid
          and day = (now() at time zone 'Asia/Kolkata')::date) >= 1, 'call tap not counted';
end $$;

-- Shop: confirm with a price change agreed on the call (one card, so it fits KPHB's ₹50,000 advance limit)
select pg_temp.act_as('kphb_owner');
set role authenticated;
do $$
declare
  oid uuid := (select v::uuid from t_ctx where k = 'order');
  o jsonb := public.get_order(oid);
  spid text := o->'items'->0->>'shop_product_id';
begin
  assert o->>'customer_phone' = '+919000000001', 'shop should see the customer phone on an active order';
  assert (o->'payment_terms'->>'advance_limit')::numeric = 50000 and o->'payment_terms'->>'level' = 'trusted',
    format('KPHB should be trusted: %s', o->'payment_terms');
  assert o->>'delivery_code' is null, 'the shop must never see the delivery code';
  o := public.shop_confirm_order(oid, jsonb_build_array(jsonb_build_object('shop_product_id', spid, 'qty', 1, 'price', 28500)), null, 'Discount agreed on call');
  assert o->>'status' = 'CONFIRMED' and (o->>'updated_by_shop')::boolean, 'confirm with edits failed';
  assert (o->>'item_total')::numeric = 28500, format('item total after edit: %s', o->>'item_total');
  assert o->>'payee' = 'shop' and o->>'payment_mode' = 'advance', format('should be paid to the shop in advance: %s %s', o->>'payee', o->>'payment_mode');
  perform pg_temp.expect_error(format('select public.shop_mark_packed(%L)', oid), 'WAIT_FOR_PAYMENT%');
  assert o->'pay_to' is null or o->'pay_to' = 'null'::jsonb, 'the shop does not need its own UPI as pay_to';
end $$;
reset role;

-- Customer pays the shop's UPI ID and enters the UPI reference; the shop checks its UPI app and confirms
select pg_temp.act_as('ravi');
set role authenticated;
do $$
declare
  oid uuid := (select v::uuid from t_ctx where k = 'order');
  o jsonb := public.get_order(oid);
begin
  assert o->'pay_to'->>'upi_id' = 'kphbcomputerworld@okicici' and o->'pay_to'->>'payee' = 'shop',
    format('customer should pay the shop, got %s', o->'pay_to');
  assert o->>'delivery_code' is null, 'the code is shown only once the order is on its way';
  perform pg_temp.expect_error(format('select public.customer_submit_payment(%L, %L)', oid, '12'), 'PAYMENT_REF_INVALID%');
  assert o->'pay_to'->'bank'->>'ifsc' is not null, 'the shop''s bank account is offered too (bank transfers: 12_shop_bank)';
  o := public.customer_submit_payment(oid, '4123 4567 8901');
  assert o->>'payment_ref' = '412345678901' and o->>'payment_claimed_at' is not null, 'payment claim not saved';
  assert o->>'status' = 'CONFIRMED', 'claiming a payment must not mark it paid';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.notifications where user_id = current_setting('test.kphb_owner')::uuid and kind = 'payment_claimed'
                 and (data->>'order_id')::uuid = (select v::uuid from t_ctx where k = 'order') and data->>'sound' = 'new_order'),
    'the shop should get a loud "customer paid" alert';
  assert not exists (select 1 from public.notifications n join public.users u on u.id = n.user_id
                     where u.admin_role is not null and n.kind = 'payment_claimed'
                       and (n.data->>'order_id')::uuid = (select v::uuid from t_ctx where k = 'order')),
    'admins do not check payments made to shops';
end $$;

-- Shop: confirms the payment, packs and dispatches (Porter), then hands it over with the customer's code
select pg_temp.act_as('kphb_owner');
set role authenticated;
do $$
declare
  oid uuid := (select v::uuid from t_ctx where k = 'order');
  o jsonb;
begin
  o := public.shop_confirm_payment(oid);
  assert o->>'status' = 'PAID' and jsonb_array_length(o->'payments') = 1 and o->'payments'->0->>'upi_txn_id' = '412345678901', 'confirm payment failed';
  assert (o->>'dispatch_due_at')::timestamptz > now(), 'a paid order gets a send-by time';
  o := public.shop_mark_packed(oid, null, null);
  assert o->>'status' = 'PACKED', 'mark packed failed';
  o := public.shop_dispatch_order(oid, '{"service":"porter","rider_name":"Ramu","rider_phone":"98490 12345","vehicle_no":"ts09ex4521","tracking_url":"https://porter.in/track/x","delivery_otp":"4821"}');
  assert o->>'status' = 'DISPATCHED', 'dispatch failed';
  assert o->'dispatch'->>'rider_phone' = '+919849012345' and o->'dispatch'->>'vehicle_no' = 'TS09EX4521', 'dispatch details not normalised';
  assert o->>'delivery_code' is null, 'the shop must never see the delivery code';
end $$;
reset role;

-- Customer: sees every step and the delivery code, cannot cancel after payment or review before delivery
select pg_temp.act_as('ravi');
set role authenticated;
do $$
declare
  oid uuid := (select v::uuid from t_ctx where k = 'order');
  o jsonb := public.get_order(oid);
begin
  assert o->'dispatch'->>'delivery_otp' = '4821', 'customer should see the rider OTP';
  assert o->>'delivery_code' ~ '^[0-9]{4}$', format('customer should see the delivery code: %s', o->>'delivery_code');
  insert into t_ctx values ('code', o->>'delivery_code');
  assert (select array_agg(e->>'to' order by (e->>'id')::bigint) from jsonb_array_elements(o->'events') e)
         = array['REQUESTED', 'CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED'], 'timeline wrong';
  perform pg_temp.expect_error(format('select public.customer_cancel_order(%L)', oid), 'INVALID_TRANSITION%');
  perform pg_temp.expect_error(format('select public.submit_review(%L, 5)', oid), 'REVIEW_AFTER_DELIVERY%');
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.notifications where user_id = current_setting('test.ravi')::uuid and kind = 'order_dispatched'
                 and body like '%' || (select v from t_ctx where k = 'code') || '%'), 'the dispatch alert should carry the delivery code';
end $$;

select pg_temp.act_as('kphb_owner');
set role authenticated;
do $$
declare
  oid uuid := (select v::uuid from t_ctx where k = 'order');
  code text := (select v from t_ctx where k = 'code');
  wrong text := lpad(((code::int + 1) % 10000)::text, 4, '0');
  r jsonb;
begin
  r := public.shop_mark_delivered(oid, wrong);
  assert r->>'error' = 'WRONG_DELIVERY_CODE' and (r->>'attempts_left')::int = 4, format('wrong code: %s', r);
  r := public.shop_mark_delivered(oid, code);
  assert r->>'status' = 'DELIVERED' and r->>'delivered_by' = 'shop', format('handover with the code failed: %s', r->>'status');
end $$;
reset role;

-- Customer reviews
select pg_temp.act_as('ravi');
set role authenticated;
do $$
declare
  oid uuid := (select v::uuid from t_ctx where k = 'order');
  r jsonb;
begin
  r := public.submit_review(oid, 5, 'Super fast delivery!', array['review-photos/x.jpg']);
  assert (r->>'rating')::int = 5, 'review failed';
  insert into t_ctx values ('review', r->>'id');
end $$;
reset role;

do $$
declare
  oid uuid := (select v::uuid from t_ctx where k = 'order');
begin
  assert (select count(*) from public.notifications where (data->>'order_id')::uuid = oid and user_id = current_setting('test.ravi')::uuid) >= 4,
    'customer was not notified on each status change';
  assert (select rating_count from public.shops where id = current_setting('test.kphb')::uuid)
       = (select count(*) from public.reviews where shop_id = current_setting('test.kphb')::uuid), 'shop rating not recomputed';
end $$;

-- Shop replies to the review
select pg_temp.act_as('kphb_owner');
set role authenticated;
do $$ begin
  perform public.shop_reply_review((select v::uuid from t_ctx where k = 'review'), 'Thank you sir!');
end $$;
reset role;

-- Customer reports a problem within 7 days; admin resolves it
select pg_temp.act_as('ravi');
set role authenticated;
do $$
declare
  oid uuid := (select v::uuid from t_ctx where k = 'order');
  i jsonb;
begin
  i := public.report_issue(oid, 'damaged', 'Box was dented', array[]::text[]);
  insert into t_ctx values ('issue', i->>'id');
  assert public.get_order(oid)->>'status' = 'ISSUE_REPORTED', 'order not ISSUE_REPORTED';
end $$;
reset role;
select pg_temp.act_as('admin');
set role authenticated;
do $$
declare
  iid uuid := (select v::uuid from t_ctx where k = 'issue');
  oid uuid := (select v::uuid from t_ctx where k = 'order');
  r jsonb;
begin
  r := public.admin_add_issue_note(iid, 'Called the shop, replacement arranged');
  assert jsonb_array_length(r->'notes') = 1, 'note not saved';
  r := public.admin_resolve_issue(iid, 'Shop replaced the item', 'warn');
  assert r->>'status' = 'resolved', 'issue not resolved';
  assert public.get_order(oid)->>'status' = 'DELIVERED', 'order should return to DELIVERED after resolution';
  assert (select warnings_count from public.shops where id = current_setting('test.kphb')::uuid) >= 1, 'shop warning not recorded';
end $$;
reset role;

-- A shop on the other side of the city (Deccan, Secunderabad) delivers to Kukatpally too; store pickup still works
select pg_temp.act_as('ravi');
set role authenticated;
do $$
declare
  listing uuid := (select (x->>'shop_product_id')::uuid
                   from jsonb_array_elements(public.get_product_page(current_setting('test.zotac4060')::uuid, current_setting('test.kukatpally')::int)->'offers') x
                   where x->>'shop_name' = 'Deccan PC Components');
  c jsonb;
  o jsonb;
begin
  perform public.cart_add(listing, 1, true);
  c := public.get_cart();
  assert not (c->'problems' ? 'AREA_NOT_SERVED'), 'no shop should be out of area';
  assert (c->'shop'->>'delivers_to_address')::boolean and (c->'totals'->>'delivery_charge')::numeric >= 0, format('delivery quote missing: %s', c->'totals');
  if not (c->'problems' ? 'SHOP_CLOSED') and not (c->'problems' ? 'MIN_ORDER_NOT_MET') then
    o := public.place_order('whatsapp');
    assert o->>'fulfilment' = 'delivery', 'far delivery order failed';
    perform public.customer_cancel_order((o->>'id')::uuid, 'test');
    perform public.cart_add(listing, 1, true);
  end if;
  c := public.cart_update('{"fulfilment": "pickup"}');
  if not (c->'problems' ? 'SHOP_CLOSED') then
    o := public.place_order('whatsapp');
    assert o->>'fulfilment' = 'pickup' and (o->>'delivery_charge')::numeric = 0, 'pickup order failed';
    perform public.customer_cancel_order((o->>'id')::uuid, 'test');
  end if;
end $$;
reset role;

rollback;
