-- Order and payment safety (20261023000017_order_safety.sql)
\ir _prelude.sql
begin;

do $$
declare
  oid uuid;
begin
  select id into oid from public.orders where status = 'CONFIRMED' and payment_claimed_at is not null limit 1;
  assert oid is not null, 'demo data has no claimed payment';
  perform set_config('test.claimed', oid::text, false);
  perform set_config('test.claimed_customer', (select customer_id::text from public.orders where id = oid), false);
  perform set_config('test.claimed_owner', (select s.owner_id::text from public.orders o join public.shops s on s.id = o.shop_id where o.id = oid), false);
  perform set_config('test.unpaid', (select id::text from public.orders where status = 'CONFIRMED' and payment_claimed_at is null limit 1), false);
  perform set_config('test.support', (select id::text from public.users where email = 'support@gadgetgalli.in'), false);
end $$;

-- After "I have paid": the customer cannot cancel or report a problem, and the shop cannot reject
select pg_temp.act_as('claimed_customer');
set role authenticated;
select pg_temp.expect_error(format('select public.customer_cancel_order(%L, %L)', current_setting('test.claimed'), 'changed my mind'), 'PAYMENT_UNDER_REVIEW%');
select pg_temp.expect_error(format('select public.report_issue(%L, %L)', current_setting('test.claimed'), 'other'), 'PAYMENT_UNDER_REVIEW%');
reset role;
select pg_temp.act_as('claimed_owner');
set role authenticated;
select pg_temp.expect_error(format('select public.shop_reject_order(%L, %L)', current_setting('test.claimed'), 'out_of_stock'), 'PAYMENT_UNDER_REVIEW%');
reset role;
do $$ begin
  assert (select status from public.orders where id = current_setting('test.claimed')::uuid) = 'CONFIRMED', 'claimed order changed';
end $$;

-- Admin "Change status" cannot skip the payment check
select pg_temp.act_as('admin');
set role authenticated;
select pg_temp.expect_error(format('select public.admin_set_order_status(%L, %L, %L)', current_setting('test.unpaid'), 'PAID', 'paid in cash'), 'USE_CONFIRM_PAYMENT%');
select pg_temp.expect_error(format('select public.admin_set_order_status(%L, %L, %L)', current_setting('test.unpaid'), 'DELIVERED', 'test'), 'PAYMENT_NOT_CONFIRMED%');
select pg_temp.expect_error(format('select public.admin_set_order_status(%L, %L, %L)', current_setting('test.unpaid'), 'DISPATCHED', 'test'), 'PAYMENT_NOT_CONFIRMED%');

-- Confirming a payment records how it came
do $$
declare
  o jsonb;
begin
  perform pg_temp.expect_error(format('select public.admin_confirm_payment(%L, %L, %L)', current_setting('test.unpaid'), 'X1234567', 'cash'), 'PAYMENT_METHOD_UNAVAILABLE%');
  o := public.admin_confirm_payment(current_setting('test.unpaid')::uuid, 'hdfc 1234 5678', 'bank_transfer');
  assert o->>'status' = 'PAID' and o->>'payment_method' = 'bank_transfer' and o->>'payment_ref' = 'HDFC12345678', format('confirm result %s', o);
  -- Now paid: support may move it on
  o := public.admin_set_order_status(current_setting('test.unpaid')::uuid, 'PACKED', 'Packed at the shop');
  assert o->>'status' = 'PACKED', 'paid order should move on';
end $$;
reset role;
do $$ begin
  assert (select method from public.payments_log where order_id = current_setting('test.unpaid')::uuid order by id desc limit 1) = 'bank_transfer',
    'payments_log should say bank transfer';
end $$;

-- Only a super admin can block another admin
select pg_temp.act_as('support');
set role authenticated;
select pg_temp.expect_error(format('select public.admin_block_user(%L, true)', current_setting('test.admin')), 'SUPER_ADMIN_ONLY%');
select public.admin_block_user(current_setting('test.priya')::uuid, true);
select public.admin_block_user(current_setting('test.priya')::uuid, false);
reset role;
select pg_temp.act_as('admin');
set role authenticated;
select public.admin_block_user(current_setting('test.support')::uuid, true);
select public.admin_block_user(current_setting('test.support')::uuid, false);
reset role;

-- The shop dashboard only asks for attention on orders the shop can act on
select pg_temp.act_as('kphb_owner');
set role authenticated;
do $$
declare
  d jsonb := public.shop_dashboard(current_setting('test.kphb')::uuid);
begin
  assert not exists (select 1 from jsonb_array_elements(d->'attention') e where e->>'status' = 'CONFIRMED'),
    'orders waiting for the customer to pay need no attention from the shop';
end $$;
reset role;

-- Favourites look like other shop cards (cover photo, distance)
select pg_temp.act_as('ravi');
set role authenticated;
do $$
declare
  f jsonb := public.my_favourite_shops(17.4948, 78.3996);
begin
  assert jsonb_array_length(f) > 0, 'ravi has favourites in the demo data';
  assert (select bool_and(e ? 'cover_photo' and e ? 'cover_path' and (e->>'distance_km') is not null) from jsonb_array_elements(f) e),
    format('favourite cards miss cover or distance: %s', f->0);
  assert (select bool_and((e->>'distance_km') is null) from jsonb_array_elements(public.my_favourite_shops()) e), 'no location, no distance';
end $$;
reset role;

-- Home feed: top deals sorted by discount, featured cards in the admin's order
select pg_temp.act_anon();
set role anon;
do $$
declare
  h jsonb := public.home_feed((current_setting('test.kukatpally'))::int, null, null);
  prev numeric := 2;
  e jsonb;
  pct numeric;
begin
  assert jsonb_array_length(h->'popular') between 1 and 10 and jsonb_array_length(h->'shops_near') between 1 and 10, 'popular/shops_near sizes';
  assert jsonb_array_length(h->'deals') between 1 and 10, format('no deals: %s', h->'deals');
  for e in select * from jsonb_array_elements(h->'deals') loop
    pct := 1 - (e->>'min_price')::numeric / (e->>'mrp')::numeric;
    assert pct >= 0.05 and pct <= prev, format('deal %s off %s', e->>'name', pct);
    prev := pct;
  end loop;
  assert jsonb_array_length(h->'featured_shops') = 3 and h->'featured_shops'->0->>'id' = h->'featured_shop_ids'->>0,
    format('featured shops: %s', h->'featured_shops');
  assert jsonb_array_length(h->'featured_products') = 3
     and h->'featured_products'->0->>'product_id' = current_setting('test.zotac4060'), format('featured products: %s', h->'featured_products');
end $$;
reset role;

rollback;
