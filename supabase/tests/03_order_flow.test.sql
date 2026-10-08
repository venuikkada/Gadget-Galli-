-- The "Done when" scenario: a customer in Kukatpally finds an RTX 4060, orders from a shop that
-- delivers there, the shop moves it through every step, the customer confirms receipt and reviews,
-- reports a problem, and an admin resolves it.
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

-- Shop: confirm with a price change agreed on the call, then paid, packed, dispatched (Porter)
select pg_temp.act_as('kphb_owner');
set role authenticated;
do $$
declare
  oid uuid := (select v::uuid from t_ctx where k = 'order');
  o jsonb := public.get_order(oid);
  spid text := o->'items'->0->>'shop_product_id';
begin
  assert o->>'customer_phone' = '+919000000001', 'shop should see the customer phone on an active order';
  o := public.shop_confirm_order(oid, jsonb_build_array(jsonb_build_object('shop_product_id', spid, 'qty', 2, 'price', 28500)), null, 'Discount agreed on call');
  assert o->>'status' = 'CONFIRMED' and (o->>'updated_by_shop')::boolean, 'confirm with edits failed';
  assert (o->>'item_total')::numeric = 57000, format('item total after edit: %s', o->>'item_total');
  perform pg_temp.expect_error(format('select public.shop_mark_packed(%L)', oid), 'INVALID_TRANSITION%');
  o := public.shop_mark_paid(oid, 'upi', null, '412345678901');
  assert o->>'status' = 'PAID' and jsonb_array_length(o->'payments') = 1, 'mark paid failed';
  o := public.shop_mark_packed(oid, null, null);
  assert o->>'status' = 'PACKED', 'mark packed failed';
  o := public.shop_dispatch_order(oid, '{"service":"porter","rider_name":"Ramu","rider_phone":"98490 12345","vehicle_no":"ts09ex4521","tracking_url":"https://porter.in/track/x","delivery_otp":"4821"}');
  assert o->>'status' = 'DISPATCHED', 'dispatch failed';
  assert o->'dispatch'->>'rider_phone' = '+919849012345' and o->'dispatch'->>'vehicle_no' = 'TS09EX4521', 'dispatch details not normalised';
  perform pg_temp.expect_error(format('select public.shop_mark_paid(%L)', oid), 'INVALID_TRANSITION%');
end $$;
reset role;

-- Customer: sees every step, cannot cancel after payment, confirms receipt, reviews
select pg_temp.act_as('ravi');
set role authenticated;
do $$
declare
  oid uuid := (select v::uuid from t_ctx where k = 'order');
  o jsonb := public.get_order(oid);
  r jsonb;
begin
  assert o->'shop'->>'upi_id' = 'kphbcomputerworld@okicici', 'customer should see the verified UPI after confirmation';
  assert (o->'shop'->>'upi_verified')::boolean, 'UPI should be verified';
  assert o->'dispatch'->>'delivery_otp' = '4821', 'customer should see delivery OTP';
  assert (select array_agg(e->>'to' order by (e->>'id')::bigint) from jsonb_array_elements(o->'events') e)
         = array['REQUESTED', 'CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED'], 'timeline wrong';
  perform pg_temp.expect_error(format('select public.customer_cancel_order(%L)', oid), 'INVALID_TRANSITION%');
  perform pg_temp.expect_error(format('select public.submit_review(%L, 5)', oid), 'REVIEW_AFTER_DELIVERY%');
  o := public.customer_mark_received(oid);
  assert o->>'status' = 'DELIVERED' and o->>'delivered_by' = 'customer', 'mark received failed';
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

-- A shop that does not deliver to Kukatpally cannot take a delivery order; store pickup still works
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
  assert c->'problems' ? 'AREA_NOT_SERVED', 'cart should flag area not served';
  perform pg_temp.expect_error('select public.place_order(''whatsapp'')', 'AREA_NOT_SERVED%');
  c := public.cart_update('{"fulfilment": "pickup"}');
  if not (c->'problems' ? 'SHOP_CLOSED') then
    o := public.place_order('whatsapp');
    assert o->>'fulfilment' = 'pickup' and (o->>'delivery_charge')::numeric = 0, 'pickup order failed';
    perform public.customer_cancel_order((o->>'id')::uuid, 'test');
  end if;
end $$;
reset role;

rollback;
