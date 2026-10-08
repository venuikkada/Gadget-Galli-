-- Calls every remaining API function once with realistic arguments (catches runtime errors in function bodies).
\ir _prelude.sql
begin;

do $$
begin
  perform set_config('test.some_review', (select id::text from public.reviews where shop_id = current_setting('test.kphb')::uuid limit 1), false);
  perform set_config('test.some_issue', (select id::text from public.issues limit 1), false);
  perform set_config('test.some_listing', (select id::text from public.shop_products where shop_id = current_setting('test.kphb')::uuid limit 1), false);
  perform set_config('test.dispatched_cyber', (select id::text from public.orders where shop_id = current_setting('test.cyber')::uuid and status = 'DISPATCHED' limit 1), false);
  perform set_config('test.cyber_owner', (select owner_id::text from public.shops where id = current_setting('test.cyber')::uuid), false);
end $$;

-- Customer side
select pg_temp.act_as('ravi');
set role authenticated;
do $$
declare
  k int := current_setting('test.kukatpally')::int;
  shop uuid := current_setting('test.kphb')::uuid;
  r jsonb;
  a jsonb;
begin
  r := public.my_profile();
  assert r->'user'->>'name' = 'Ravi Kumar' and jsonb_array_length(r->'addresses') = 2, 'my_profile';
  r := public.update_my_profile('{"language": "te"}');
  assert r->'user'->>'language' = 'te', 'update_my_profile';
  perform pg_temp.expect_error('select public.update_my_profile(''{"name": "x"}'')', 'NAME_REQUIRED%');
  r := public.resolve_location(17.4950, 78.3990);
  assert r->>'area_name' = 'Kukatpally' and (r->>'in_service')::boolean, format('resolve_location: %s', r);
  r := public.resolve_location(17.6868, 83.2185); -- Visakhapatnam
  assert not (r->>'in_service')::boolean, 'Vizag should be out of service';
  perform public.notify_me_outside('Visakhapatnam', 17.6868, 83.2185);

  r := public.get_shop_page(shop, k);
  assert r->>'name' = 'KPHB Computer World' and (r->'delivery'->>'delivers_to_me')::boolean, 'get_shop_page';
  assert jsonb_array_length(r->'tabs') > 0 and (r->>'is_favourite')::boolean, 'shop tabs / favourite';
  r := public.shop_catalog(shop, 'rtx 4060');
  assert (r->>'total')::int >= 2, 'search inside shop';
  r := public.shop_catalog(shop, '', (select id from public.categories where slug = 'components'), 5);
  assert jsonb_array_length(r->'items') between 1 and 5, 'shop category tab';
  r := public.get_shop_product(current_setting('test.some_listing')::uuid, k);
  assert r->>'name' is not null and r->'shop'->>'name' = 'KPHB Computer World', 'get_shop_product';
  r := public.shop_reviews(shop);
  assert (r->'summary'->>'count')::int > 0 and jsonb_array_length(r->'items') > 0, 'shop_reviews';
  r := public.shops_near(k, null, null, 20, 0, false, 'cctv_security');
  assert jsonb_array_length(r) > 0, 'shops_near by type';
  r := public.products_by_ids(array[current_setting('test.zotac4060')::uuid], k);
  assert (r->0->>'shop_count')::int = 2, 'products_by_ids';
  perform public.track_product_view(current_setting('test.zotac4060')::uuid);
  perform public.track_shop_event(shop, 'view');
  perform public.track_shop_event(shop, 'share');

  assert public.toggle_favourite(current_setting('test.deccan')::uuid), 'favourite on';
  assert jsonb_array_length(public.my_favourite_shops()) = 3, 'favourites list';
  assert not public.toggle_favourite(current_setting('test.deccan')::uuid), 'favourite off';

  a := public.save_address(jsonb_build_object('label', 'other', 'label_custom', 'Parents', 'house', '1-2-3', 'street', 'Main Road',
         'area_id', (select id from public.areas where name = 'Uppal'), 'is_default', true));
  assert (a->>'is_default')::boolean and a->>'pincode' = '500039', 'save_address';
  assert (select count(*) from public.addresses where user_id = auth.uid() and is_default) = 1, 'single default address';
  perform public.delete_address((a->>'id')::uuid);
  assert (select count(*) from public.addresses where user_id = auth.uid() and is_default) = 1, 'default moved after delete';

  r := public.my_orders('active');
  assert jsonb_array_length(r) >= 2, 'my_orders active';
  r := public.my_orders('past');
  assert jsonb_array_length(r) >= 1, 'my_orders past';
  r := public.my_notifications('customer');
  assert jsonb_array_length(r) >= 1, 'my_notifications';
  perform public.mark_notifications_read('customer');
  assert (public.my_profile()->>'unread')::int = 0, 'mark read';
  r := public.my_reviews();
  assert jsonb_array_length(r) >= 1, 'my_reviews';
  r := public.my_referrals();
  assert r->>'code' like 'GG%', 'my_referrals';
  perform public.register_push_token('ExponentPushToken[test-ravi]', 'android', 'customer');
  perform public.unregister_push_token('ExponentPushToken[test-ravi]');
  perform pg_temp.expect_error('select public.apply_referral(''NOPE'')', 'INVALID_REFERRAL_CODE%');
  perform pg_temp.expect_error('select public.delete_my_account()', 'ACTIVE_ORDERS%');
end $$;
reset role;

-- New customer applies a referral, deletes account
select pg_temp.act_as('newowner');
set role authenticated;
do $$
declare
  code text;
begin
  reset role;
  code := (select referral_code from public.users where phone = '+919000000002');
  set role authenticated;
  assert (public.apply_referral(code)->>'ok')::boolean, 'apply_referral';
  perform pg_temp.expect_error(format('select public.apply_referral(%L)', code), 'ALREADY_REFERRED%');
  assert (public.delete_my_account()->>'ok')::boolean, 'delete_my_account';
  assert public.my_profile()->'user'->>'deleted' = 'true', 'account not marked deleted';
end $$;
reset role;

-- Shop side
select pg_temp.act_as('cyber_owner');
set role authenticated;
do $$
declare
  r jsonb;
begin
  r := public.my_shop();
  assert r->>'name' = 'Cyber Zone Systems' and (r->>'product_count')::int > 0, 'my_shop';
  r := public.shop_catalog(current_setting('test.cyber')::uuid, '', null, 100, 0, true);
  assert (r->>'total')::int > 0, 'owner shop_catalog';
  r := public.shop_update_dispatch(current_setting('test.dispatched_cyber')::uuid, '{"rider_name": "Saleem", "rider_phone": "9849023456"}');
  assert r->'dispatch'->>'rider_name' = 'Saleem', 'shop_update_dispatch';
  r := public.my_notifications('partner');
  assert jsonb_typeof(r) = 'array', 'partner notifications';
end $$;
reset role;

-- Admin side
select pg_temp.act_as('admin');
set role authenticated;
do $$
declare
  r jsonb;
begin
  r := public.admin_list_shops('under_review');
  assert (r->>'total')::int >= 1, 'admin_list_shops';
  r := public.admin_get_shop(current_setting('test.pending_shop')::uuid);
  assert jsonb_array_length(r->'documents') = 2 and r->'owner'->>'phone' like '+91%', 'admin_get_shop';
  perform public.admin_save_shop_notes(current_setting('test.pending_shop')::uuid, 'Called owner, documents look fine');
  r := public.admin_review_shop(current_setting('test.pending_shop')::uuid, 'request_changes', 'Please upload a clearer shop front photo');
  assert r->>'status' = 'changes_requested', 'request changes';
  r := public.admin_suspend_shop(current_setting('test.kphb')::uuid, true, 'Test suspension');
  assert r->>'status' = 'suspended', 'suspend';
  r := public.admin_suspend_shop(current_setting('test.kphb')::uuid, false);
  assert r->>'status' = 'approved', 'unsuspend';
  r := public.admin_list_issues('open');
  assert jsonb_array_length(r) >= 2, 'admin_list_issues';
  r := public.admin_get_issue(current_setting('test.some_issue')::uuid);
  assert r->'order'->>'order_no' is not null, 'admin_get_issue';
  r := public.admin_list_orders(jsonb_build_object('shop_id', current_setting('test.kphb'), 'date_from', '2020-01-01'));
  assert (r->>'total')::int > 0, 'admin_list_orders filter';
  r := public.admin_set_order_status((select id from public.orders where status = 'CONFIRMED' limit 1), 'CANCELLED', 'Customer asked support to cancel');
  assert r->>'status' = 'CANCELLED', 'admin_set_order_status';
  r := public.admin_list_users(null, 'customer', 5);
  assert jsonb_array_length(r) = 5, 'admin_list_users';
  r := public.admin_referrals();
  assert (r->>'total_joined')::int >= 2, 'admin_referrals';
  r := public.admin_save_catalog_product(jsonb_build_object('name', 'Apple iPhone 17 (512 GB, Black)', 'brand', 'Apple', 'model', 'iPhone 17',
         'category_id', (select id from public.categories where slug = 'smartphones'), 'variant', '{"storage":"512 GB","colour":"Black"}'::jsonb, 'mrp', 102900));
  assert r->>'status' = 'approved', 'admin_save_catalog_product';
  assert public.refresh_catalog_search() > 100, 'refresh_catalog_search';
  assert (public.run_order_jobs()) ? 'expired', 'admin can run jobs';
end $$;
reset role;

rollback;
