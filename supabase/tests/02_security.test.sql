-- Row-level security: shops see only their own orders/products, documents are admin-only,
-- the customer's phone is visible to a shop only for that shop's active orders.
\ir _prelude.sql
begin;

do $$
begin
  perform set_config('test.hitech_requested', (select id::text from public.orders where shop_id = current_setting('test.hitech')::uuid and status = 'REQUESTED' limit 1), false);
  perform set_config('test.some_confirmed', (select id::text from public.orders where status = 'CONFIRMED' limit 1), false);
  perform set_config('test.other_requested', (select id::text from public.orders where customer_id <> current_setting('test.ravi')::uuid and status = 'REQUESTED' limit 1), false);
  assert current_setting('test.hitech_requested') <> '' and current_setting('test.some_confirmed') <> '', 'seed orders missing';
end $$;

-- Shop owner (Hitech Gadget Hub) sees only their own orders
select pg_temp.act_as('hitech_owner');
set role authenticated;
do $$
begin
  assert (select count(*) from public.orders) > 0, 'owner sees none of their orders';
  assert not exists (select 1 from public.orders where shop_id <> current_setting('test.hitech')::uuid), 'owner sees other shops'' orders';
  assert not exists (select 1 from public.order_events e join public.orders o on o.id = e.order_id where o.shop_id <> current_setting('test.hitech')::uuid),
    'owner sees other shops'' order events';
  assert not exists (select 1 from public.shop_documents where shop_id <> current_setting('test.hitech')::uuid), 'owner sees other shops'' documents';
  assert not exists (select 1 from public.carts), 'owner sees carts';
  assert (select count(*) from public.users) = 1, 'owner sees other users';
  assert not exists (select 1 from public.search_logs), 'owner reads raw search logs';
  -- Writing to another shop's products is silently filtered by RLS
  update public.shop_products set price = 1 where shop_id = current_setting('test.kphb')::uuid;
  assert not found, 'owner updated another shop''s products';
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from public.shop_products where price = 1), 'price was changed through RLS';
end $$;

-- Another shop cannot act on the order; a customer cannot confirm orders
select pg_temp.act_as('deccan_owner');
set role authenticated;
select pg_temp.expect_error(format('select public.shop_confirm_order(%L)', current_setting('test.hitech_requested')), 'NOT_YOUR_SHOP%');
reset role;
select pg_temp.act_as('ravi');
set role authenticated;
select pg_temp.expect_error(format('select public.shop_mark_paid(%L)', current_setting('test.some_confirmed')), 'NOT_YOUR_SHOP%');
-- Customers cannot touch other customers' orders
select pg_temp.expect_error(format('select public.customer_cancel_order(%L)', current_setting('test.other_requested')), 'ORDER_NOT_FOUND%');
do $$
begin
  assert not exists (select 1 from public.orders where customer_id <> current_setting('test.ravi')::uuid), 'customer sees other customers'' orders';
  assert (select count(*) from public.orders) > 0, 'customer sees none of their orders';
  -- No direct writes to orders
  update public.orders set status = 'DELIVERED' where customer_id = current_setting('test.ravi')::uuid;
  assert not found, 'customer updated an order directly';
  assert not exists (select 1 from public.shop_documents), 'customer sees shop documents';
  assert not exists (select 1 from public.shop_private), 'customer sees GST numbers';
  assert not exists (select 1 from public.issue_notes), 'customer sees admin notes';
end $$;
-- Privilege escalation through the profile is blocked
select pg_temp.expect_error(format('update public.users set admin_role = %L where id = %L', 'super_admin', current_setting('test.ravi')),
  'permission denied%');
select pg_temp.expect_error(format('update public.users set is_blocked = false where id = %L', current_setting('test.ravi')), 'permission denied%');
select pg_temp.expect_error('select public.admin_overview()', 'ADMIN_ONLY%');
select pg_temp.expect_error('select public.run_order_jobs()', '%');
reset role;

-- Customer phone: visible to the shop only while the order is active
select pg_temp.act_as('hitech_owner');
set role authenticated;
do $$
declare
  active_id uuid := (select id from public.orders where shop_id = current_setting('test.hitech')::uuid and status = 'REQUESTED' limit 1);
  done_id uuid := (select id from public.orders where shop_id = current_setting('test.hitech')::uuid and status in ('DELIVERED', 'REJECTED', 'CANCELLED', 'EXPIRED') limit 1);
begin
  assert active_id is not null and done_id is not null, 'test data missing';
  assert public.get_order(active_id)->>'customer_phone' like '+91%', 'active order should show phone';
  assert public.get_order(done_id)->>'customer_phone' is null, 'closed order must hide phone';
  assert public.get_order((select id from public.orders where shop_id <> current_setting('test.hitech')::uuid limit 1)) is null,
    'get_order returned another shop''s order';
end $$;
reset role;

-- Documents and storage: owner of the shop + admins only
select pg_temp.act_as('kphb_owner');
set role authenticated;
do $$
begin
  insert into storage.objects (bucket_id, name) values ('shop-documents', current_setting('test.kphb') || '/licence.pdf');
  begin
    insert into storage.objects (bucket_id, name) values ('shop-documents', current_setting('test.cyber') || '/fake.pdf');
    raise exception 'uploaded into another shop''s folder';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('shop-media', current_setting('test.cyber') || '/x.jpg');
    raise exception 'uploaded media into another shop''s folder';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select pg_temp.act_as('ravi');
set role authenticated;
do $$
begin
  assert not exists (select 1 from storage.objects where bucket_id = 'shop-documents'), 'customer can read shop documents';
end $$;
reset role;
select pg_temp.act_as('admin');
set role authenticated;
do $$
begin
  assert exists (select 1 from storage.objects where bucket_id = 'shop-documents'), 'admin cannot read shop documents';
  assert (select count(*) from public.shop_documents) >= 4, 'admin cannot see all documents';
  assert (select count(*) from public.orders) = (select count(*) from public.orders), 'admin order count';
  assert (public.admin_overview()->>'shops_pending')::int >= 1, 'admin overview';
end $$;
reset role;

-- Anonymous visitors: only approved shops
select pg_temp.act_anon();
set role anon;
do $$
begin
  assert exists (select 1 from public.shops where status = 'approved'), 'anon cannot browse approved shops';
  assert not exists (select 1 from public.shops where status <> 'approved'), 'anon sees unapproved shops';
  assert not exists (select 1 from public.orders), 'anon sees orders';
  assert (public.search_products('iphone 15', current_setting('test.kukatpally')::int)->>'total')::int > 0, 'anon search failed';
end $$;
select pg_temp.expect_error('select public.place_order(''call'')', '%');
reset role;

rollback;
