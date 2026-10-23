-- Shops' bank accounts, and paying a shop by bank transfer (20261025000019_shop_bank_details.sql)
\ir _prelude.sql
begin;

-- Places an order as a customer from a shop (a listing priced between p_min and p_max) and returns its id.
create function pg_temp.place(p_customer text, p_shop uuid, p_qty int, p_min numeric, p_max numeric)
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
  return (public.place_order('call')->>'id')::uuid;
end $$;
grant execute on all functions in schema pg_temp to public;

-- 1. The owner saves the bank account; it is checked again after every change -----------------------------------------
do $$
declare
  s jsonb;
begin
  perform pg_temp.act_as('kphb_owner');
  s := public.my_shop();
  assert s->'bank'->>'account_number' is not null and (s->'bank'->>'verified')::boolean, format('demo bank account: %s', s->'bank');
  perform pg_temp.expect_error($q$select public.shop_upsert('{"bank_account_name": "KPHB Computer World", "bank_account_number": "123456789012", "bank_ifsc": "ICIC0001"}')$q$, 'INVALID_IFSC%');
  perform pg_temp.expect_error($q$select public.shop_upsert('{"bank_account_name": "KPHB Computer World", "bank_account_number": "12AB56789012", "bank_ifsc": "ICIC0001234"}')$q$, 'INVALID_BANK_ACCOUNT_NUMBER%');
  perform pg_temp.expect_error($q$select public.shop_upsert('{"bank_account_name": "KPHB Computer World", "bank_account_number": "12345678", "bank_ifsc": "ICIC0001234"}')$q$, 'INVALID_BANK_ACCOUNT_NUMBER%');
  perform pg_temp.expect_error($q$select public.shop_upsert('{"bank_account_name": " ", "bank_account_number": "123456789012", "bank_ifsc": "ICIC0001234"}')$q$, 'INVALID_BANK_ACCOUNT_NAME%');
  s := public.shop_upsert('{"bank_account_name": " KPHB Computer World ", "bank_account_number": "1234 5678 9012", "bank_ifsc": "icic0001234", "bank_name": "ICICI Bank"}');
  assert s->'bank'->>'account_number' = '123456789012' and s->'bank'->>'ifsc' = 'ICIC0001234'
     and s->'bank'->>'account_name' = 'KPHB Computer World' and s->'bank'->>'bank_name' = 'ICICI Bank', format('saved: %s', s->'bank');
  assert not (s->'bank'->>'verified')::boolean, 'a changed account must be checked again';
  s := public.shop_upsert('{"description": "Gaming PCs, parts and accessories"}');
  assert s->'bank'->>'account_number' = '123456789012', 'other edits keep the bank account';

  perform pg_temp.act_as('admin');
  s := public.admin_set_shop_flags(current_setting('test.kphb')::uuid, p_bank_verified => true);
  assert (s->'bank'->>'verified')::boolean, 'an admin checks it';
  s := public.admin_set_shop_flags(current_setting('test.kphb')::uuid, p_verified => true);
  assert (s->'bank'->>'verified')::boolean, 'other flags leave the check alone';
end $$;

-- Approving a new shop checks its bank account with its UPI ID
do $$
declare
  s jsonb;
begin
  perform pg_temp.act_as('admin');
  s := public.admin_get_shop(current_setting('test.pending_shop')::uuid);
  assert s->'bank'->>'account_number' is not null and not (s->'bank'->>'verified')::boolean, 'the shop waiting for review has an unchecked account';
  s := public.admin_review_shop(current_setting('test.pending_shop')::uuid, 'approve');
  assert (s->'bank'->>'verified')::boolean and (s->>'upi_verified')::boolean, 'approving checks the bank account and the UPI ID';
end $$;

-- 2. Only the owner and admins read it ------------------------------------------------------------------------------------
select pg_temp.act_as('hitech_owner');
set role authenticated;
do $$ begin
  assert not exists (select 1 from public.shop_private where shop_id = current_setting('test.kphb')::uuid), 'another shop reads the bank account';
  assert exists (select 1 from public.shop_private where shop_id = current_setting('test.hitech')::uuid and bank_account_number is not null),
    'the owner reads their own bank account';
end $$;
reset role;
select pg_temp.act_as('ravi');
set role authenticated;
do $$ begin
  assert not exists (select 1 from public.shop_private), 'a customer reads bank accounts';
  assert position('123456789012' in public.get_shop_page(current_setting('test.kphb')::uuid)::text) = 0, 'the public shop page shows the bank account';
end $$;
reset role;

-- 3. Customers see the shop's UPI and bank account once it accepts, and can pay by bank transfer ---------------------------
do $$
declare
  a uuid := pg_temp.place('ravi', current_setting('test.kphb')::uuid, 1, 2000, 40000);
  o jsonb;
begin
  perform pg_temp.act_as('ravi');
  o := public.get_order(a);
  assert o->>'pay_to' is null, format('payment details before the shop accepts: %s', o->'pay_to');
  perform pg_temp.act_as('kphb_owner');
  o := public.shop_confirm_order(a);
  assert o->>'payment_mode' = 'advance' and o->>'pay_to' is null, 'advance order; the shop''s own view has no pay_to';
  perform pg_temp.act_as('ravi');
  o := public.get_order(a);
  assert o->'pay_to'->>'upi_id' = 'kphbcomputerworld@okicici' and o->'pay_to'->'bank'->>'account_number' = '123456789012'
     and o->'pay_to'->'bank'->>'ifsc' = 'ICIC0001234' and (o->'pay_to'->>'ready')::boolean, format('pay_to: %s', o->'pay_to');
  o := public.customer_submit_payment(a, 'icicr52026102300012', 'bank_transfer');
  assert o->>'payment_method' = 'bank_transfer' and o->>'payment_ref' = 'ICICR52026102300012' and o->>'payment_claimed_at' is not null,
    format('bank transfer claim: %s %s', o->>'payment_method', o->>'payment_ref');
  assert exists (select 1 from public.notifications where user_id = current_setting('test.kphb_owner')::uuid and kind = 'payment_claimed'
                 and body like 'Bank UTR ICICR52026102300012. Check your bank account%'), 'the shop is told to check its bank account';
  perform pg_temp.act_as('kphb_owner');
  o := public.shop_confirm_payment(a);
  assert o->>'status' = 'PAID', format('the shop confirms the bank transfer: %s', o->>'status');
end $$;

-- 4. A shop with no bank account: UPI only; pay-on-delivery orders still show where to pay --------------------------------
do $$
declare
  b uuid;
  c uuid;
  s jsonb;
  o jsonb;
begin
  perform pg_temp.act_as('hitech_owner');
  s := public.shop_upsert('{"bank_account_name": "", "bank_account_number": "", "bank_ifsc": "", "bank_name": ""}');
  assert s->>'bank' is null, format('the bank account is removed: %s', s->'bank');
  b := pg_temp.place('priya', current_setting('test.hitech')::uuid, 1, 2000, 40000);
  perform pg_temp.act_as('hitech_owner');
  o := public.shop_confirm_order(b);
  assert o->>'payment_mode' = 'advance', format('advance at Hitech: %s', o->>'payment_mode');
  perform pg_temp.act_as('priya');
  o := public.get_order(b);
  assert o->'pay_to'->>'bank' is null and o->'pay_to'->>'upi_id' is not null, format('UPI only: %s', o->'pay_to');
  perform pg_temp.expect_error(format('select public.customer_submit_payment(%L, %L, %L)', b, '412345678901', 'bank_transfer'), 'PAYMENT_METHOD_UNAVAILABLE%');
  o := public.customer_submit_payment(b, '412345678901', 'upi');
  assert o->>'payment_method' = 'upi', 'UPI still works';

  -- Pay on delivery (above KPHB's limit): the customer sees the UPI ID and bank account from the start, to pay at the door
  c := pg_temp.place('arjun', current_setting('test.kphb')::uuid, 2, 26000, 40000);
  perform pg_temp.act_as('kphb_owner');
  o := public.shop_confirm_order(c);
  assert o->>'payment_mode' = 'on_delivery', format('on delivery: %s', o->>'payment_mode');
  perform pg_temp.act_as('arjun');
  o := public.get_order(c);
  assert o->'pay_to'->'bank'->>'account_number' = '123456789012' and o->'pay_to'->>'upi_id' is not null, 'pay-on-delivery customers see where to pay';
  perform pg_temp.expect_error(format('select public.customer_submit_payment(%L, %L, %L)', c, '412345678901', 'bank_transfer'), 'PAY_ON_DELIVERY%');
end $$;

rollback;
