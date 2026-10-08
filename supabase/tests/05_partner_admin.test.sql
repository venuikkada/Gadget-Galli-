-- Shop Partner registration -> admin approval -> products; dashboards, insights and admin reports.
\ir _prelude.sql
begin;

create temp table t_ctx (k text primary key, v text);
grant all on t_ctx to public;

-- A new shop owner registers step by step
select pg_temp.act_as('newowner');
set role authenticated;
do $$
declare
  s jsonb;
  r jsonb;
  sid uuid;
  west int := (select id from public.zones where name = 'West Hyderabad');
begin
  s := public.shop_upsert('{"name": "Lakshmi Mobiles", "shop_types": ["mobiles", "cctv_security"], "description": "Phones & CCTV", "registration_step": 1}');
  sid := (s->>'id')::uuid;
  insert into t_ctx values ('shop', sid::text);
  assert s->>'status' = 'draft' and s->>'slug' is not null, 'draft shop not created';
  assert (select role from public.users where id = auth.uid()) = 'shop_owner', 'role not switched to shop_owner';

  r := public.shop_submit(sid);
  assert not (r->>'ok')::boolean and jsonb_array_length(r->'missing') > 3, 'incomplete shop was accepted';

  perform pg_temp.expect_error('select public.shop_upsert(''{"contact_phone": "12345"}'')', 'INVALID_PHONE%');
  perform pg_temp.expect_error('select public.shop_upsert(''{"upi_id": "not-a-upi"}'')', 'INVALID_UPI_ID%');
  s := public.shop_upsert(jsonb_build_object(
    'owner_name', 'Lakshmi Prasanna', 'contact_phone', '98765 43210', 'whatsapp_phone', '+91 98765 43210',
    'address_line', 'Plot 12, Main Road', 'area_id', (select id from public.areas where name = 'Kondapur'), 'pincode', '500084',
    'lat', 17.4640, 'lng', 78.3650, 'delivery_mode', 'areas', 'delivery_charge_type', 'flat', 'delivery_charge', 40,
    'free_delivery_above', 2000, 'usual_delivery_mins', 120, 'store_pickup', true, 'upi_id', 'lakshmimobiles@okhdfcbank',
    'gst_number', '36abcde1234f1z5', 'registration_step', 6));
  assert s->>'contact_phone' = '+919876543210', 'phone not normalised';
  assert s->>'gst_number' = '36ABCDE1234F1Z5', 'GST not saved privately';
  s := public.shop_set_delivery_areas(sid, array[west], array[(select id from public.areas where name = 'Ameerpet')]);
  assert jsonb_array_length(s->'delivery_zone_ids') = 1 and jsonb_array_length(s->'delivery_area_ids') = 1, 'delivery areas';
  s := public.shop_add_photo(sid, 'front', sid || '/front.jpg');
  s := public.shop_add_document(sid, 'owner_id_proof', sid || '/id.jpg', 'XXXX 1234');
  s := public.shop_add_document(sid, 'trade_licence', sid || '/licence.pdf');
  r := public.shop_submit(sid);
  assert (r->>'ok')::boolean, format('complete shop rejected: %s', r->'missing');
  assert r->'shop'->>'status' = 'under_review', 'not under review';
end $$;
reset role;

-- Not visible to customers until approved
select pg_temp.act_as('ravi');
set role authenticated;
do $$ begin
  assert public.get_shop_page((select v::uuid from t_ctx where k = 'shop')) is null, 'unapproved shop is public';
end $$;
reset role;

-- Admin approves
select pg_temp.act_as('admin');
set role authenticated;
do $$
declare
  sid uuid := (select v::uuid from t_ctx where k = 'shop');
  r jsonb;
begin
  perform pg_temp.expect_error(format('select public.admin_review_shop(%L, %L)', sid, 'reject'), 'REASON_REQUIRED%');
  r := public.admin_review_shop(sid, 'approve');
  assert r->>'status' = 'approved' and (r->>'upi_verified')::boolean, 'approval failed';
  r := public.admin_set_shop_flags(sid, true, null);
  assert (r->>'verified')::boolean, 'verified badge not set';
  assert jsonb_array_length(r->'audit') >= 2, 'admin actions not audited';
end $$;
reset role;

-- Owner adds products: catalog search, listing, duplicate guard, quick edit, custom product, bulk upload
select pg_temp.act_as('newowner');
set role authenticated;
do $$
declare
  sid uuid := (select v::uuid from t_ctx where k = 'shop');
  found jsonb;
  p jsonb;
  b jsonb;
  cp jsonb;
begin
  assert exists (select 1 from public.notifications where user_id = auth.uid() and kind = 'shop_approved'), 'owner not notified of approval';
  found := public.catalog_lookup('iphone 15');
  assert (found->0->>'name') like 'Apple iPhone 15%', 'catalog lookup failed';
  p := public.shop_upsert_product(jsonb_build_object('catalog_product_id', found->0->>'id', 'price', 61999, 'mrp', 69900,
         'stock_qty', 3, 'warranty_months', 12));
  assert (p->>'price')::numeric = 61999 and (p->>'in_stock')::boolean, 'listing failed';
  perform pg_temp.expect_error(format('select public.shop_upsert_product(%L::jsonb)',
    jsonb_build_object('catalog_product_id', found->0->>'id', 'price', 60000)), 'ALREADY_LISTED%');
  p := public.shop_quick_update((p->>'id')::uuid, 60999, null, 0);
  assert (p->>'price')::numeric = 60999 and not (p->>'in_stock')::boolean, 'quick edit / stock sync failed';

  cp := public.shop_create_custom_product(jsonb_build_object('name', 'Lakshmi Special 4G Keypad Phone', 'brand', 'Lava',
          'category_id', (select id from public.categories where slug = 'smartphones'), 'mrp', 1999));
  assert cp->>'status' = 'pending', 'custom product should be pending';
  insert into t_ctx values ('custom', cp->>'id');

  b := public.shop_bulk_upsert(sid, jsonb_build_array(
    jsonb_build_object('model_number', 'MTP93HN/A', 'price', 69999, 'stock_qty', 2),
    jsonb_build_object('name', 'Apple iPhone 15 (128 GB, Black)', 'price', 59999, 'in_stock', true),
    jsonb_build_object('name', 'Some Unknown Gadget', 'price', 999),
    jsonb_build_object('name', 'Lava Blaze 5G (4 GB/128 GB)', 'brand', 'Lava', 'category', 'smartphones', 'price', 10999)));
  assert (b->>'created')::int = 2 and (b->>'updated')::int = 1 and (b->>'errors')::int = 1, format('bulk upload counts: %s', b);
end $$;
reset role;

-- Admin approves the custom product; merge duplicates
select pg_temp.act_as('admin');
set role authenticated;
do $$
declare
  cid uuid := (select v::uuid from t_ctx where k = 'custom');
  target uuid := (select id from public.catalog_products where model_number = 'MTP03HN/A');
  r jsonb;
begin
  r := public.admin_review_catalog_product(cid, 'approve', null);
  assert r->>'status' = 'approved', 'catalog approval failed';
  r := public.admin_catalog_list('pending');
  assert (r->>'total')::int >= 1, 'pending catalog list empty (seed has one)';
  r := public.admin_merge_catalog_products(cid, target);
  assert (select status from public.catalog_products where id = cid) = 'merged', 'merge failed';
end $$;
reset role;

-- Partner dashboard and insights (KPHB Computer World)
select pg_temp.act_as('kphb_owner');
set role authenticated;
do $$
declare
  sid uuid := current_setting('test.kphb')::uuid;
  d jsonb := public.shop_dashboard(sid);
  i jsonb;
  dm jsonb;
  so jsonb;
begin
  assert d->'shop'->>'name' = 'KPHB Computer World' and d->'today' ? 'sales', 'dashboard';
  i := public.shop_insights(sid, 'day');
  assert jsonb_array_length(i->'series') = 14, 'daily series should have 14 points';
  i := public.shop_insights(sid, 'month');
  assert jsonb_array_length(i->'series') = 12, 'monthly series should have 12 points';
  dm := public.shop_demand_insights(sid, 7);
  assert exists (select 1 from jsonb_array_elements(dm) x where x->>'normalized' = 'rtx 4070 super'), format('demand insights: %s', dm);
  assert not exists (select 1 from jsonb_array_elements(dm) x where x->>'normalized' = 'rtx 4060'), 'listed item shown as unmet demand';
  so := public.shop_orders(sid, 'all');
  assert (so->'counts'->>'delivered')::int > 0, 'shop order counts';
  perform public.shop_set_open(sid, false);
  assert not (public.get_shop_page(sid)->>'is_open_now')::boolean, 'closed switch ignored';
end $$;
reset role;

-- The owner's edit form gets the listing's own values; other users never see them.
select pg_temp.act_as('kphb_owner');
set role authenticated;
do $$
declare
  sp uuid := (select id from public.shop_products where shop_id = current_setting('test.kphb')::uuid limit 1);
  j jsonb;
begin
  perform public.shop_upsert_product(jsonb_build_object('id', sp, 'description', 'Sealed box, GST bill', 'specs', '{"Bill":"GST"}'::jsonb));
  j := public.get_shop_product(sp);
  assert j->'own'->>'description' = 'Sealed box, GST bill', 'own description missing';
  assert j->'own'->'specs'->>'Bill' = 'GST', 'own specs missing';
  perform set_config('test.kphb_sp', sp::text, false);
end $$;
reset role;
select pg_temp.act_as('ravi');
set role authenticated;
do $$
begin
  assert public.get_shop_product(current_setting('test.kphb_sp')::uuid)->'own' = 'null'::jsonb, 'own values leaked to a customer';
end $$;
reset role;

-- Admin reports and campaigns
select pg_temp.act_as('admin');
set role authenticated;
do $$
declare
  r jsonb := public.admin_reports();
  c jsonb;
begin
  assert jsonb_array_length(r->'daily') = 30, 'daily report should cover 30 days';
  assert exists (select 1 from jsonb_array_elements(r->'zero_result_searches') z where z->>'normalized' = 'ps 5'), 'zero-result report';
  assert jsonb_array_length(r->'top_shops') > 0 and jsonb_array_length(r->'top_searches') > 0, 'top lists';
  assert (r->'customers'->>'active')::int > 0, 'active customers';
  c := public.admin_send_campaign('Diwali dhamaka', 'Up to 20% off on CCTV kits', 'customers');
  assert (c->>'sent')::int >= 10, 'campaign not sent to customers';
  assert jsonb_array_length(public.admin_list_users('Ravi')) = 1, 'customer search';
  perform public.admin_block_user(current_setting('test.priya')::uuid, true);
end $$;
reset role;
select pg_temp.act_as('priya');
set role authenticated;
select pg_temp.expect_error('select public.get_cart()', 'ACCOUNT_BLOCKED%');
reset role;

rollback;
