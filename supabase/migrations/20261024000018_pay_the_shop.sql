-- Gadget Galli · 0018 · customers pay the shop directly; Gadget Galli makes sure the shop delivers (docs/DECISIONS.md #57)
--
-- Gadget Galli no longer collects order money. When a shop accepts an order, the order is paid one of two ways:
--   advance       the customer pays the shop's verified UPI ID in the app and enters the UPI reference; the shop checks
--                 its UPI app and taps "Payment received" (shop_confirm_payment) -> PAID. Only verified shops take
--                 advance payments, up to ₹10,000, or ₹50,000 once trusted (25+ deliveries, 4.3★, no open complaints).
--                 Admins can change both limits, or set a limit for one shop.
--   on_delivery   the customer pays the shop when the order arrives (or at the shop for a pickup): new shops, orders
--                 above the shop's limit, and whenever the shop picks it when confirming.
-- Every order has a 4-digit delivery code that only the customer (once it is sent) and admins can see. The shop or
-- rider enters it at handover (shop_mark_delivered); otherwise the customer taps "I received my order".
-- Protection for advance payments:
--   * a send-by time: paid before 9 AM -> 1 PM; 9 AM to 5 PM -> within 4 hours; after 5 PM -> 1 PM next day (IST);
--   * "overdue" alerts to the customer, the shop and admins when a payment is not confirmed in 2 hours, an order is not
--     sent by its send-by time, or is not delivered 2 days after it was sent;
--   * while a shop has an overdue order, an open "paid but not sent" or "not received" complaint, or a strike, its new
--     orders are pay on delivery; a second strike suspends the shop;
--   * a shop that cannot deliver a paid order refunds the customer and records the reference (shop_cancel_order).
-- Gadget Galli earns commission_pct of each delivered order: the shop pays the commission due by UPI from the app and
-- an admin confirms it. Orders placed before this migration were paid to Gadget Galli and finish on that flow
-- (payee 'gadget_galli', docs/DECISIONS.md #52): admin payment check, payouts, delivery 72 hours after sending.

-- 1. Orders: who is paid and how, send-by time, overdue alerts, refunds, commission -------------------------------
alter table public.orders
  add column if not exists payee text not null default 'gadget_galli',
  add column if not exists payment_mode text,
  add column if not exists dispatch_due_at timestamptz,
  add column if not exists overdue_reason text,
  add column if not exists overdue_at timestamptz,
  add column if not exists refund_ref text,
  add column if not exists refund_amount numeric(12,2),
  add column if not exists refunded_at timestamptz,
  add column if not exists commission_status text not null default 'none',
  add column if not exists commission_payment_id uuid;
-- Orders placed so far were paid to Gadget Galli; new ones, and requests no shop has accepted yet, pay the shop.
alter table public.orders alter column payee set default 'shop';
update public.orders set payee = 'shop' where status = 'REQUESTED';
update public.orders set payment_mode = 'advance' where payee = 'gadget_galli' and confirmed_at is not null and payment_mode is null;

do $$
begin
  alter table public.orders add constraint orders_payee_check check (payee in ('shop', 'gadget_galli'));
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.orders add constraint orders_payment_mode_check check (payment_mode in ('advance', 'on_delivery'));
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.orders add constraint orders_overdue_reason_check
    check (overdue_reason in ('payment_not_confirmed', 'not_sent', 'not_delivered'));
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.orders add constraint orders_commission_status_check check (commission_status in ('none', 'due', 'held', 'paid'));
exception when duplicate_object then null;
end $$;
-- The shop can now complete a delivery with the customer's code
alter table public.orders drop constraint if exists orders_delivered_by_check;
alter table public.orders add constraint orders_delivered_by_check check (delivered_by in ('customer', 'shop', 'auto', 'admin'));

create index if not exists orders_overdue_idx on public.orders (shop_id) where overdue_reason is not null;
create index if not exists orders_commission_idx on public.orders (shop_id, commission_status) where commission_status in ('due', 'held');

-- Shop trust, set by admins (owners read it; nobody else can)
alter table public.shop_private
  add column if not exists strikes int not null default 0,
  add column if not exists advance_limit numeric(12,2);

insert into public.app_config (key, value) values
  ('advance_limit_verified', '10000'), ('advance_limit_trusted', '50000'),
  ('trusted_min_deliveries', '25'), ('trusted_min_rating', '4.3')
on conflict (key) do nothing;

-- 2. Delivery codes: outside the API schema, so a shop can never read one ------------------------------------------
create table if not exists private.order_codes (
  order_id uuid primary key references public.orders(id) on delete cascade,
  code text not null check (code ~ '^[0-9]{4}$'),
  attempts int not null default 0,
  locked_until timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
revoke all on private.order_codes from public;

create or replace function private.new_delivery_code() returns text
language sql volatile set search_path = public, pg_temp as $$
  select lpad((abs(('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::int) % 10000)::text, 4, '0');
$$;

create or replace function private.order_code_on_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into private.order_codes (order_id, code) values (new.id, private.new_delivery_code()) on conflict (order_id) do nothing;
  return null;
end $$;
drop trigger if exists orders_delivery_code on public.orders;
create trigger orders_delivery_code after insert on public.orders for each row execute function private.order_code_on_insert();
insert into private.order_codes (order_id, code)
select o.id, private.new_delivery_code() from public.orders o
on conflict (order_id) do nothing;

-- 3. Commission payments from shops ---------------------------------------------------------------------------------
create table if not exists public.commission_payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  order_count int not null,
  method public.payment_method not null default 'upi',
  ref text,
  status text not null default 'submitted' check (status in ('submitted', 'confirmed', 'rejected')),
  reject_reason text,
  submitted_by uuid references public.users(id),
  submitted_at timestamptz not null default now(),
  decided_by uuid references public.users(id),
  decided_at timestamptz
);
create index if not exists commission_payments_shop_idx on public.commission_payments (shop_id, submitted_at desc);
create index if not exists commission_payments_open_idx on public.commission_payments (submitted_at) where status = 'submitted';
alter table public.commission_payments enable row level security;
drop policy if exists commission_payments_read on public.commission_payments;
create policy commission_payments_read on public.commission_payments for select to authenticated
  using (public.owns_shop(shop_id) or public.is_admin());
revoke all on public.commission_payments from anon;
grant select on public.commission_payments to authenticated;
grant all on public.commission_payments to service_role;
do $$
begin
  alter table public.orders add constraint orders_commission_payment_fk
    foreign key (commission_payment_id) references public.commission_payments(id) on delete set null;
exception when duplicate_object then null;
end $$;

-- 4. Rules ------------------------------------------------------------------------------------------------------------
-- An overdue alert stays current while the order is still at the step that was late.
create or replace function public.gg_order_overdue(o public.orders) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(
    (o.overdue_reason = 'payment_not_confirmed' and o.status = 'CONFIRMED' and o.payment_claimed_at is not null)
    or (o.overdue_reason = 'not_sent' and o.status in ('PAID', 'PACKED'))
    or (o.overdue_reason = 'not_delivered' and o.status = 'DISPATCHED'), false);
$$;

-- When a paid order must be sent (IST): before 9 AM -> 1 PM; 9 AM to 5 PM -> 4 hours later; after 5 PM -> 1 PM next day.
create or replace function private.send_by(p_paid timestamptz) returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  select (case
            when l::time < time '09:00' then date_trunc('day', l) + interval '13 hours'
            when l::time < time '17:00' then l + interval '4 hours'
            else date_trunc('day', l) + interval '1 day 13 hours'
          end) at time zone 'Asia/Kolkata'
  from (select p_paid at time zone 'Asia/Kolkata' as l) t;
$$;

-- How a shop's customers can pay, and why. level: new | verified | trusted; paused: strikes | overdue | complaint.
create or replace function private.shop_payment_terms(p_shop_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s public.shops;
  v_strikes int := 0;
  v_override numeric;
  v_verified_limit numeric := coalesce(private.config('advance_limit_verified')::numeric, 10000);
  v_trusted_limit numeric := coalesce(private.config('advance_limit_trusted')::numeric, 50000);
  v_min_orders int := coalesce(private.config('trusted_min_deliveries')::int, 25);
  v_min_rating numeric := coalesce(private.config('trusted_min_rating')::numeric, 4.3);
  v_level text;
  v_paused text;
  v_limit numeric;
  v_upi boolean;
begin
  select * into s from public.shops where id = p_shop_id;
  if s.id is null then return null; end if;
  select coalesce(sp.strikes, 0), sp.advance_limit into v_strikes, v_override from public.shop_private sp where sp.shop_id = s.id;
  v_strikes := coalesce(v_strikes, 0);
  v_upi := s.upi_id is not null and s.upi_verified;
  v_level := case
    when not s.verified then 'new'
    when s.orders_delivered >= v_min_orders and s.rating_avg >= v_min_rating and v_strikes = 0
         and not exists (select 1 from public.issues i where i.shop_id = s.id and i.status <> 'resolved') then 'trusted'
    else 'verified' end;
  v_paused := case
    when v_strikes > 0 then 'strikes'
    when exists (select 1 from public.orders o where o.shop_id = s.id and o.overdue_reason is not null and public.gg_order_overdue(o)) then 'overdue'
    when exists (select 1 from public.issues i where i.shop_id = s.id and i.status <> 'resolved' and i.type in ('paid_not_sent', 'not_received')) then 'complaint'
    end;
  v_limit := case
    when s.status <> 'approved' or not v_upi or v_paused is not null then 0
    when v_override is not null then v_override
    when v_level = 'trusted' then v_trusted_limit
    when v_level = 'verified' then v_verified_limit
    else 0 end;
  return jsonb_build_object(
    'level', v_level, 'advance_limit', v_limit, 'paused', v_paused, 'strikes', v_strikes,
    'limit_override', v_override, 'upi_ready', v_upi,
    'verified_limit', v_verified_limit, 'trusted_limit', v_trusted_limit,
    'trusted_min_deliveries', v_min_orders, 'trusted_min_rating', v_min_rating,
    'orders_delivered', s.orders_delivered, 'rating_avg', s.rating_avg);
end $$;

-- For customers (shop page, cart): how they will pay this shop
create or replace function public.shop_payment_terms(p_shop_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('level', t->>'level', 'advance_limit', (t->>'advance_limit')::numeric,
                            'pay_on_delivery_only', (t->>'advance_limit')::numeric = 0)
  from (select private.shop_payment_terms(s.id) as t from public.shops s where s.id = p_shop_id and s.status = 'approved') x;
$$;

create or replace function private.allowed_transition(p_from public.order_status, p_to public.order_status, p_actor public.actor_role)
returns boolean
language sql immutable set search_path = public, pg_temp as $$
  -- Who may pay, pack or deliver is checked again by each step function (payee, payment mode, delivery code).
  select case
    when p_actor = 'admin' then p_from <> p_to
    when p_from = 'REQUESTED' then (p_to in ('CONFIRMED', 'REJECTED') and p_actor = 'shop')
                                or (p_to = 'CANCELLED' and p_actor = 'customer')
                                or (p_to = 'EXPIRED' and p_actor = 'system')
    when p_from = 'CONFIRMED' then (p_to in ('PAID', 'PACKED', 'REJECTED') and p_actor = 'shop')
                                or (p_to = 'EXPIRED' and p_actor = 'system')
                                or (p_to in ('CANCELLED', 'ISSUE_REPORTED') and p_actor = 'customer')
    when p_from = 'PAID' then (p_to in ('PACKED', 'CANCELLED') and p_actor = 'shop') or (p_to = 'ISSUE_REPORTED' and p_actor = 'customer')
    when p_from = 'PACKED' then (p_to in ('DISPATCHED', 'CANCELLED') and p_actor = 'shop') or (p_to = 'ISSUE_REPORTED' and p_actor = 'customer')
    when p_from = 'DISPATCHED' then (p_to = 'DELIVERED' and p_actor in ('customer', 'shop', 'system'))
                                 or (p_to = 'CANCELLED' and p_actor = 'shop')
                                 or (p_to = 'ISSUE_REPORTED' and p_actor = 'customer')
    when p_from = 'DELIVERED' then p_to = 'ISSUE_REPORTED' and p_actor = 'customer'
    else false
  end;
$$;

create or replace function private.set_order_status(
  p_order_id uuid,
  p_to public.order_status,
  p_actor public.actor_role,
  p_note text default null,
  p_meta jsonb default '{}'::jsonb
) returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.orders;
  v_from public.order_status;
  v_eff public.order_status;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_from := o.status;
  v_eff := case when o.status = 'ISSUE_REPORTED' and p_actor <> 'admin' then coalesce(o.status_before_issue, o.status) else o.status end;

  if (o.status = 'ISSUE_REPORTED' and p_to = 'ISSUE_REPORTED')
     or not private.allowed_transition(v_eff, p_to, p_actor) then
    raise exception 'INVALID_TRANSITION: % -> % by %', v_from, p_to, p_actor using errcode = 'P0001';
  end if;

  update public.orders set
    status = p_to,
    status_before_issue = case
      when p_to = 'ISSUE_REPORTED' then v_eff
      when v_from = 'ISSUE_REPORTED' then null
      else status_before_issue end,
    confirmed_at = case when p_to = 'CONFIRMED' then now() else confirmed_at end,
    -- Pay-on-delivery orders are paid when they are delivered
    paid_at = case when p_to = 'PAID' then now()
                   when p_to = 'DELIVERED' and paid_at is null and payment_mode = 'on_delivery' then now()
                   else paid_at end,
    dispatch_due_at = case when p_to = 'PAID' and payee = 'shop' then private.send_by(now()) else dispatch_due_at end,
    packed_at = case when p_to = 'PACKED' then now() else packed_at end,
    dispatched_at = case when p_to = 'DISPATCHED' then now() else dispatched_at end,
    delivered_at = case when p_to = 'DELIVERED' then coalesce(delivered_at, now()) else delivered_at end,
    rejected_at = case when p_to = 'REJECTED' then now() else rejected_at end,
    cancelled_at = case when p_to = 'CANCELLED' then now() else cancelled_at end,
    expired_at = case when p_to = 'EXPIRED' then now() else expired_at end,
    issue_reported_at = case when p_to = 'ISSUE_REPORTED' then now() else issue_reported_at end,
    delivered_by = case when p_to = 'DELIVERED' and delivered_at is null then
                     case p_actor when 'customer' then 'customer' when 'shop' then 'shop' when 'system' then 'auto' else 'admin' end
                   else delivered_by end
  where id = p_order_id
  returning * into o;

  insert into public.order_events (order_id, from_status, to_status, actor_id, actor_role, note, meta)
  values (o.id, v_from, p_to, case when p_actor = 'system' then null else auth.uid() end, p_actor, p_note, coalesce(p_meta, '{}'::jsonb));

  if p_to = 'DELIVERED' and v_from <> 'DELIVERED' then
    perform private.after_delivered(o);
  end if;

  perform private.order_notify(o, v_from, p_actor);
  return o;
end $$;

-- Sale reduces tracked stock once (on payment, or on delivery for orders paid on delivery)
create or replace function private.reduce_stock(o public.orders) returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  update public.shop_products sp
     set stock_qty = greatest(0, sp.stock_qty - x.qty)
    from (select (i->>'shop_product_id')::uuid as id, sum((i->>'qty')::int) as qty
            from jsonb_array_elements(o.items) i where i->>'shop_product_id' is not null group by 1) x
   where sp.id = x.id and sp.stock_qty is not null;
$$;

create or replace function private.record_payment(p_order_id uuid, p_method public.payment_method, p_amount numeric, p_txn_id text, p_proof_path text)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id;
  insert into public.payments_log (order_id, method, amount, upi_txn_id, proof_path, recorded_by)
  values (o.id, p_method, coalesce(p_amount, o.grand_total), nullif(btrim(p_txn_id), ''), p_proof_path, auth.uid());
  perform private.reduce_stock(o);
end $$;

-- After a delivery: shop stats, "usually delivers in" average, referral conversion, and stock for orders paid on delivery
-- without a recorded payment (the customer tapped "I received my order").
create or replace function private.after_delivered(o public.orders) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_avg int;
begin
  select round(avg(extract(epoch from (x.delivered_at - x.confirmed_at)) / 60))::int into v_avg
  from (
    select delivered_at, confirmed_at from public.orders
    where shop_id = o.shop_id and status in ('DELIVERED', 'ISSUE_REPORTED') and delivered_by in ('customer', 'shop')
      and confirmed_at is not null and delivered_at is not null and fulfilment = 'delivery'
    order by delivered_at desc limit 50
  ) x
  having count(*) >= 3;

  update public.shops
     set orders_delivered = orders_delivered + 1,
         avg_delivery_mins = coalesce(v_avg, avg_delivery_mins)
   where id = o.shop_id;

  update public.referrals set status = 'ordered', converted_at = now()
   where referred_id = o.customer_id and status = 'joined';

  update public.catalog_products p set popularity = popularity + 5
   where p.id in (select (i->>'catalog_product_id')::uuid from jsonb_array_elements(o.items) i where i->>'catalog_product_id' is not null);

  if o.payment_mode = 'on_delivery' and not exists (select 1 from public.payments_log where order_id = o.id) then
    perform private.reduce_stock(o);
  end if;
end $$;

-- 5. Notifications ---------------------------------------------------------------------------------------------------
create or replace function private.order_notify(o public.orders, p_from public.order_status, p_actor public.actor_role)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_shop public.shops;
  v_data jsonb := jsonb_build_object('order_id', o.id, 'order_no', o.order_no, 'status', o.status, 'url', '/order/' || o.id);
  v_shop_data jsonb := jsonb_build_object('order_id', o.id, 'order_no', o.order_no, 'status', o.status, 'url', '/partner/order/' || o.id);
  v_total text := '₹' || to_char(o.grand_total, 'FM99,99,99,999');
  v_name text;
  v_due text := to_char(o.dispatch_due_at at time zone 'Asia/Kolkata', 'FMHH12:MI AM, DD Mon');
  v_code text;
  v_d public.dispatch_details;
  v_shop_paid boolean := o.payee = 'shop';
begin
  select * into v_shop from public.shops where id = o.shop_id;
  v_name := coalesce(v_shop.name, 'The shop');

  if p_actor = 'admin' and o.status = 'PAID' and p_from = 'CONFIRMED' then
    if v_shop_paid then
      perform private.notify(o.customer_id, 'customer', 'order_paid', 'Payment confirmed ✅',
        'Gadget Galli support confirmed your payment of ' || v_total || ' to ' || v_name || '. It must be sent by ' || v_due || '.', v_data);
      perform private.notify(v_shop.owner_id, 'partner', 'order_paid', 'Paid ✅ Send ' || o.order_no,
        'Gadget Galli support confirmed the customer''s payment of ' || v_total || '. Send it by ' || v_due || '.',
        v_shop_data || jsonb_build_object('sound', 'new_order'));
    else
      perform private.notify(o.customer_id, 'customer', 'order_paid', 'Payment received ✅',
        'Gadget Galli received ' || v_total || '. ' || v_name || ' will pack and send your order.', v_data);
      perform private.notify(v_shop.owner_id, 'partner', 'order_paid', 'Paid ✅ Pack and send ' || o.order_no,
        'Gadget Galli received ' || v_total || ' from the customer. Send the order now; you are paid after delivery.',
        v_shop_data || jsonb_build_object('sound', 'new_order'));
    end if;
    return;
  end if;
  if p_actor = 'admin' then
    perform private.notify(o.customer_id, 'customer', 'order_update', 'Order ' || o.order_no || ' updated',
      'Gadget Galli support updated your order. Status: ' || initcap(replace(o.status::text, '_', ' ')) || '.', v_data);
    perform private.notify(v_shop.owner_id, 'partner', 'order_update', 'Order ' || o.order_no || ' updated',
      'Gadget Galli support updated this order. Status: ' || initcap(replace(o.status::text, '_', ' ')) || '.', v_shop_data);
    return;
  end if;

  case o.status
    when 'REQUESTED' then
      perform private.notify(v_shop.owner_id, 'partner', 'new_order',
        'New order ' || o.order_no || ' · ' || v_total,
        coalesce(o.customer_name, 'A customer') || ' wants ' || jsonb_array_length(o.items) || ' item(s). Call them to confirm.',
        v_shop_data || jsonb_build_object('sound', 'new_order'));
    when 'CONFIRMED' then
      perform private.notify(o.customer_id, 'customer', 'order_confirmed',
        case when o.updated_by_shop then 'Shop updated & confirmed your order' else 'Order confirmed by ' || v_name end,
        case when o.updated_by_shop then 'Please check the changes. ' else '' end ||
        case
          when not v_shop_paid then 'Pay ' || v_total || ' by UPI to Gadget Galli. The shop is paid only after you receive your order.'
          when o.payment_mode = 'on_delivery' and o.fulfilment = 'pickup' then 'Pay ' || v_total || ' at ' || v_name || ' when you collect it.'
          when o.payment_mode = 'on_delivery' then 'Pay ' || v_total || ' when you receive it. No product, no payment.'
          else 'Pay ' || v_total || ' to ' || v_name || ' by UPI in the app. Gadget Galli makes sure it is sent on time, or refunded.'
        end,
        v_data);
    when 'REJECTED' then
      perform private.notify(o.customer_id, 'customer', 'order_rejected', 'Order ' || o.order_no || ' was not accepted',
        v_name || ': ' || coalesce(replace(o.reject_reason, '_', ' '), 'not available') || '. Try another shop.', v_data);
    when 'CANCELLED' then
      if p_actor = 'shop' then
        perform private.notify(o.customer_id, 'customer', 'order_cancelled', 'Order ' || o.order_no || ' cancelled by the shop',
          case when o.refunded_at is not null then
            v_name || ' refunded ₹' || to_char(o.refund_amount, 'FM99,99,99,999') || ' · Ref ' || o.refund_ref
              || '. Check your bank app. Not received in 24 hours? Contact Gadget Galli support from the order.'
          else v_name || ': ' || coalesce(o.cancel_reason, 'could not deliver it') || '. You paid nothing.' end, v_data);
      else
        perform private.notify(v_shop.owner_id, 'partner', 'order_cancelled', 'Order ' || o.order_no || ' cancelled',
          'The customer cancelled this order.', v_shop_data);
      end if;
    when 'EXPIRED' then
      if p_from = 'CONFIRMED' and o.payment_mode = 'on_delivery' then
        perform private.notify(o.customer_id, 'customer', 'order_expired', 'Order ' || o.order_no || ' expired',
          v_name || ' did not send it within 2 days. You paid nothing. Try another shop nearby.', v_data);
        perform private.notify(v_shop.owner_id, 'partner', 'order_expired', 'Order ' || o.order_no || ' expired',
          'It was not sent within 2 days of confirming.', v_shop_data);
        return;
      end if;
      if p_from = 'CONFIRMED' then
        perform private.notify(o.customer_id, 'customer', 'order_expired', 'Order ' || o.order_no || ' expired',
          'It was not paid within 24 hours. Place the order again when you are ready.', v_data);
        perform private.notify(v_shop.owner_id, 'partner', 'order_expired', 'Order ' || o.order_no || ' expired',
          'The customer did not pay within 24 hours. No need to send it.', v_shop_data);
        return;
      end if;
      perform private.notify(o.customer_id, 'customer', 'order_expired', 'Order ' || o.order_no || ' expired',
        v_name || ' did not respond in 2 hours. Try another shop nearby.', v_data);
      perform private.notify(v_shop.owner_id, 'partner', 'order_expired', 'You missed order ' || o.order_no,
        'It expired after 2 hours without a response.', v_shop_data);
    when 'PAID' then
      perform private.notify(o.customer_id, 'customer', 'order_paid', 'Payment received ✅',
        v_name || ' received your payment of ' || v_total || coalesce('. It must be sent by ' || v_due, '') || '.', v_data);
    when 'PACKED' then
      perform private.notify(o.customer_id, 'customer', 'order_packed', 'Your order is packed 📦',
        'It will be sent out soon.', v_data);
    when 'DISPATCHED' then
      select * into v_d from public.dispatch_details where order_id = o.id;
      select code into v_code from private.order_codes where order_id = o.id;
      if o.fulfilment = 'pickup' then
        perform private.notify(o.customer_id, 'customer', 'order_dispatched', 'Ready for pickup 🛍️',
          'Collect your order from ' || coalesce(v_shop.name, 'the shop') || '. '
            || case when o.payment_mode = 'on_delivery' then 'Pay ' || v_total || ' there. ' else '' end
            || coalesce('Your delivery code is ' || v_code || '. ', '') || 'Give it only when you have the product.', v_data);
      else
        perform private.notify(o.customer_id, 'customer', 'order_dispatched', 'On the way! 🛵',
          coalesce(initcap(replace(v_d.service::text, '_', ' ')), 'Delivery')
            || coalesce(' · ' || v_d.rider_name, '')
            || coalesce(' · Rider OTP ' || v_d.delivery_otp, '')
            || '. ' || case when o.payment_mode = 'on_delivery' then 'Pay ' || v_total || ' on delivery. ' else '' end
            || coalesce('Your delivery code is ' || v_code || ': give it only when you have the product.', 'Tap "I received my order" when it arrives.'),
          v_data);
      end if;
    when 'DELIVERED' then
      perform private.notify(v_shop.owner_id, 'partner', 'order_delivered', 'Order ' || o.order_no || ' delivered ✅',
        case o.delivered_by when 'auto' then 'Marked delivered automatically after 72 hours.'
                            when 'shop' then 'Delivery code checked.'
                            else 'The customer confirmed they received it.' end, v_shop_data);
      if o.delivered_by in ('auto', 'shop') then
        perform private.notify(o.customer_id, 'customer', 'order_delivered', 'Order ' || o.order_no || ' delivered',
          case when o.delivered_by = 'shop' then v_name || ' handed it over with your delivery code. ' else '' end
            || 'Rate the shop, or report a problem within 7 days.', v_data);
      end if;
    when 'ISSUE_REPORTED' then
      perform private.notify(v_shop.owner_id, 'partner', 'issue_reported', 'Problem reported on ' || o.order_no,
        'The customer reported a problem. Gadget Galli support will contact you.', v_shop_data);
      perform private.notify_admins('issue_reported', 'Problem reported on ' || o.order_no,
        coalesce(v_shop.name, '') || ' · ' || v_total, v_data);
    else
      null;
  end case;
end $$;

-- 6. What each side sees --------------------------------------------------------------------------------------------
create or replace function private.order_json(p_order_id uuid, p_viewer text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  o public.orders;
  s public.shops;
  v_area text;
  v_phone text;
  v_pay_to jsonb;
  v_code text;
begin
  select * into o from public.orders where id = p_order_id;
  if o.id is null then return null; end if;
  select * into s from public.shops where id = o.shop_id;
  select name into v_area from public.areas where id = s.area_id;

  -- The customer's phone is only revealed to the shop while the order is active.
  if p_viewer = 'admin'
     or (p_viewer = 'shop' and (o.status in ('REQUESTED', 'CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED')
                                or (o.status = 'ISSUE_REPORTED' and o.status_before_issue in ('CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED')))) then
    select phone into v_phone from public.users where id = o.customer_id;
  end if;

  -- Where the customer pays: the shop's UPI once it accepts (older orders: Gadget Galli)
  if p_viewer <> 'shop' then
    if o.payee = 'gadget_galli' then
      v_pay_to := private.payment_details() || jsonb_build_object('payee', 'gadget_galli');
    elsif p_viewer = 'admin' or o.status not in ('REQUESTED', 'REJECTED', 'CANCELLED', 'EXPIRED') then
      v_pay_to := jsonb_build_object('payee', 'shop', 'upi_id', s.upi_id, 'upi_name', coalesce(s.upi_name, s.name),
        'qr_path', s.upi_qr_path, 'upi_verified', s.upi_verified, 'bank', null, 'ready', s.upi_id is not null);
    end if;
  end if;

  -- The delivery code: customers see it once the order is on its way; shops never do
  if p_viewer = 'admin' or (p_viewer = 'customer' and o.status = 'DISPATCHED') then
    select code into v_code from private.order_codes where order_id = o.id;
  end if;

  return jsonb_build_object(
    'id', o.id, 'order_no', o.order_no, 'status', o.status, 'status_before_issue', o.status_before_issue,
    'contact_method', o.contact_method, 'fulfilment', o.fulfilment, 'items', o.items,
    'item_total', o.item_total, 'installation_total', o.installation_total, 'delivery_charge', o.delivery_charge,
    'grand_total', o.grand_total, 'customer_name', o.customer_name, 'address', o.address,
    'distance_km', o.distance_km, 'note', o.note, 'updated_by_shop', o.updated_by_shop,
    'reject_reason', o.reject_reason, 'cancel_reason', o.cancel_reason, 'delivered_by', o.delivered_by,
    'pack_photo_path', o.pack_photo_path, 'bill_photo_path', o.bill_photo_path,
    'requested_at', o.requested_at, 'confirmed_at', o.confirmed_at, 'paid_at', o.paid_at, 'packed_at', o.packed_at,
    'dispatched_at', o.dispatched_at, 'delivered_at', o.delivered_at, 'rejected_at', o.rejected_at,
    'cancelled_at', o.cancelled_at, 'expired_at', o.expired_at, 'issue_reported_at', o.issue_reported_at,
    'created_at', o.created_at, 'updated_at', o.updated_at,
    'viewer', p_viewer,
    'customer_phone', v_phone,
    'customer_id', case when p_viewer = 'admin' then o.customer_id end,
    'shop', jsonb_build_object(
      'id', s.id, 'name', s.name, 'slug', s.slug, 'area', v_area, 'address_line', s.address_line,
      'landmark', s.landmark, 'lat', s.lat, 'lng', s.lng, 'logo_path', s.logo_path, 'verified', s.verified,
      'contact_phone', s.contact_phone, 'whatsapp_phone', coalesce(s.whatsapp_phone, s.contact_phone),
      'upi_id', case when p_viewer <> 'customer' then s.upi_id end,
      'upi_name', case when p_viewer <> 'customer' then coalesce(s.upi_name, s.name) end,
      'upi_qr_path', case when p_viewer <> 'customer' then s.upi_qr_path end,
      'upi_verified', s.upi_verified),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'from', e.from_status, 'to', e.to_status,
                  'actor_role', e.actor_role, 'note', e.note, 'meta', e.meta, 'created_at', e.created_at) order by e.created_at, e.id)
                from public.order_events e where e.order_id = o.id), '[]'::jsonb),
    'dispatch', (select to_jsonb(d) - 'order_id' from public.dispatch_details d where d.order_id = o.id),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('method', p.method, 'amount', p.amount, 'upi_txn_id', p.upi_txn_id,
                  'proof_path', p.proof_path, 'created_at', p.created_at) order by p.created_at)
                from public.payments_log p where p.order_id = o.id), '[]'::jsonb),
    'review', (select jsonb_build_object('id', r.id, 'rating', r.rating, 'body', r.body, 'photos', to_jsonb(r.photos),
                  'shop_reply', r.shop_reply, 'created_at', r.created_at)
               from public.reviews r where r.order_id = o.id),
    'issues', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'type', i.type, 'description', i.description,
                  'photos', to_jsonb(i.photos), 'status', i.status, 'resolution', i.resolution, 'created_at', i.created_at,
                  'resolved_at', i.resolved_at) order by i.created_at)
                from public.issues i where i.order_id = o.id), '[]'::jsonb)
  ) || jsonb_build_object(
    'payee', o.payee, 'payment_mode', o.payment_mode,
    'payment_ref', o.payment_ref, 'payment_claimed_at', o.payment_claimed_at,
    'payment_rejected_reason', o.payment_rejected_reason,
    'payment_method', o.payment_method,
    'pay_to', v_pay_to,
    'delivery_code', v_code,
    'dispatch_due_at', o.dispatch_due_at,
    'overdue', public.gg_order_overdue(o), 'overdue_reason', o.overdue_reason, 'overdue_at', o.overdue_at,
    'refund_ref', o.refund_ref, 'refund_amount', o.refund_amount, 'refunded_at', o.refunded_at,
    -- For the shop's confirm sheet: can this order be paid in advance?
    'payment_terms', case when p_viewer <> 'customer' and o.status = 'REQUESTED' then private.shop_payment_terms(s.id) end,
    'commission_status', case when p_viewer <> 'customer' then o.commission_status end,
    'commission_amount', case when p_viewer <> 'customer' then o.commission_amount end,
    'payout_status', case when p_viewer <> 'customer' then o.payout_status end,
    'payout_amount', case when p_viewer <> 'customer' then o.payout_amount end,
    'payout_ref', case when p_viewer <> 'customer' then o.payout_ref end,
    'payout_at', case when p_viewer <> 'customer' then o.payout_at end
  );
end $$;

create or replace function private.order_card(o public.orders) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', o.id, 'order_no', o.order_no, 'status', o.status, 'status_before_issue', o.status_before_issue,
    'fulfilment', o.fulfilment, 'contact_method', o.contact_method, 'grand_total', o.grand_total,
    'item_count', (select coalesce(sum((i->>'qty')::int), 0) from jsonb_array_elements(o.items) i),
    'first_item', o.items->0->>'name', 'first_photo', o.items->0->>'photo',
    'customer_name', o.customer_name, 'area', o.address->>'area', 'distance_km', o.distance_km, 'note', o.note,
    'shop_id', o.shop_id, 'shop_name', s.name, 'shop_logo', s.logo_path,
    'requested_at', o.requested_at, 'updated_at', o.updated_at, 'delivered_at', o.delivered_at,
    'has_review', exists (select 1 from public.reviews r where r.order_id = o.id),
    'payee', o.payee, 'payment_mode', o.payment_mode, 'payment_claimed_at', o.payment_claimed_at,
    'dispatch_due_at', o.dispatch_due_at, 'overdue', public.gg_order_overdue(o), 'overdue_reason', o.overdue_reason)
  from public.shops s where s.id = o.shop_id;
$$;

-- 7. Shop steps --------------------------------------------------------------------------------------------------------
-- Accept and confirm. p_items (optional) replaces the items as agreed on the call:
-- [{shop_product_id?, name?, qty, price, with_installation?, installation_charge?}]
-- p_payment_mode: null picks it (advance when the shop's limit allows, pay on delivery otherwise and for pickups);
-- 'on_delivery' is always allowed; 'advance' only within the limit (ADVANCE_NOT_ALLOWED).
drop function if exists public.shop_confirm_order(uuid, jsonb, numeric, text);
create or replace function public.shop_confirm_order(
  p_order_id uuid, p_items jsonb default null, p_delivery_charge numeric default null, p_note text default null,
  p_payment_mode text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  o public.orders := private.lock_shop_order(p_order_id);
  v_new jsonb := '[]'::jsonb;
  el jsonb;
  sp public.shop_products;
  p public.catalog_products;
  v_brand text;
  v_qty int;
  v_price numeric;
  v_inst boolean;
  v_inst_charge numeric;
  v_item_total numeric := 0;
  v_inst_total numeric := 0;
  v_charge numeric;
  v_changed boolean := false;
  v_total numeric;
  v_limit numeric;
  v_mode text;
begin
  if o.status <> 'REQUESTED' then
    raise exception 'INVALID_TRANSITION: % -> CONFIRMED by shop', o.status using errcode = 'P0001';
  end if;

  if p_items is not null and jsonb_typeof(p_items) = 'array' then
    if jsonb_array_length(p_items) = 0 then
      raise exception 'ORDER_NEEDS_ITEMS' using errcode = 'P0001';
    end if;
    for el in select * from jsonb_array_elements(p_items) loop
      v_qty := greatest(coalesce((el->>'qty')::int, 1), 1);
      if el->>'shop_product_id' is not null then
        select * into sp from public.shop_products where id = (el->>'shop_product_id')::uuid and shop_id = o.shop_id;
        if sp.id is null then raise exception 'ITEM_NOT_IN_SHOP' using errcode = 'P0001'; end if;
        select * into p from public.catalog_products where id = sp.catalog_product_id;
        select name into v_brand from public.brands where id = p.brand_id;
        v_price := coalesce((el->>'price')::numeric, sp.price);
        v_inst := coalesce((el->>'with_installation')::boolean, false) and sp.installation_available;
        v_inst_charge := case when v_inst then coalesce((el->>'installation_charge')::numeric, sp.installation_charge, 0) end;
        v_new := v_new || jsonb_build_object(
          'shop_product_id', sp.id, 'catalog_product_id', p.id, 'name', p.name, 'brand', v_brand,
          'variant', p.variant, 'condition', sp.condition, 'price', v_price, 'mrp', coalesce(sp.mrp, p.mrp),
          'qty', v_qty, 'photo', coalesce(sp.photos[1], p.photos[1]), 'warranty_months', sp.warranty_months,
          'with_installation', v_inst, 'installation_charge', v_inst_charge,
          'line_total', v_price * v_qty + coalesce(v_inst_charge, 0) * v_qty);
      else
        if coalesce(btrim(el->>'name'), '') = '' then raise exception 'ITEM_NAME_REQUIRED' using errcode = 'P0001'; end if;
        v_price := coalesce((el->>'price')::numeric, 0);
        v_inst_charge := null;
        v_new := v_new || jsonb_build_object(
          'shop_product_id', null, 'catalog_product_id', null, 'name', left(el->>'name', 200), 'brand', null,
          'variant', null, 'condition', coalesce(el->>'condition', 'new'), 'price', v_price, 'mrp', null,
          'qty', v_qty, 'photo', null, 'warranty_months', null, 'with_installation', false,
          'installation_charge', null, 'line_total', v_price * v_qty);
      end if;
      if v_price < 0 then raise exception 'INVALID_PRICE' using errcode = 'P0001'; end if;
      v_item_total := v_item_total + v_price * v_qty;
      v_inst_total := v_inst_total + coalesce(v_inst_charge, 0) * v_qty;
    end loop;

    v_changed := (select coalesce(jsonb_agg(jsonb_build_object('id', x->>'shop_product_id', 'n', x->>'name', 'q', x->'qty', 'p', (x->>'price')::numeric)), '[]')
                    from jsonb_array_elements(v_new) x)
              <> (select coalesce(jsonb_agg(jsonb_build_object('id', x->>'shop_product_id', 'n', x->>'name', 'q', x->'qty', 'p', (x->>'price')::numeric)), '[]')
                    from jsonb_array_elements(o.items) x);
  else
    v_new := o.items;
    v_item_total := o.item_total;
    v_inst_total := o.installation_total;
  end if;

  v_charge := coalesce(p_delivery_charge, o.delivery_charge);
  if v_charge < 0 then raise exception 'INVALID_PRICE' using errcode = 'P0001'; end if;
  v_changed := v_changed or v_charge <> o.delivery_charge;
  v_total := v_item_total + v_inst_total + v_charge;

  if o.payee = 'gadget_galli' then
    v_mode := 'advance';
  else
    v_limit := coalesce((private.shop_payment_terms(o.shop_id)->>'advance_limit')::numeric, 0);
    v_mode := case
      when p_payment_mode is null then
        case when o.fulfilment = 'delivery' and v_limit > 0 and v_total > 0 and v_total <= v_limit then 'advance' else 'on_delivery' end
      when p_payment_mode = 'on_delivery' then 'on_delivery'
      when p_payment_mode = 'advance' then 'advance'
    end;
    if v_mode is null then raise exception 'INVALID_PAYMENT_MODE' using errcode = 'P0001'; end if;
    if v_mode = 'advance' and (v_limit <= 0 or v_total > v_limit) then raise exception 'ADVANCE_NOT_ALLOWED' using errcode = 'P0001'; end if;
  end if;

  update public.orders set
    items = v_new, item_total = v_item_total, installation_total = v_inst_total,
    delivery_charge = v_charge, grand_total = v_total,
    updated_by_shop = v_changed, payment_mode = v_mode
  where id = o.id;

  perform private.set_order_status(o.id, 'CONFIRMED', 'shop',
    coalesce(nullif(btrim(p_note), ''), case when v_changed then 'Shop updated the order after the call' else 'Confirmed on call' end)
      || case when v_mode = 'on_delivery' then ' · Pay on delivery' else '' end,
    jsonb_build_object('updated', v_changed, 'payment_mode', v_mode));
  return private.order_json(o.id, 'shop');
end $$;

-- The customer paid the shop in advance: the shop checks its UPI app and confirms
create or replace function public.shop_confirm_payment(p_order_id uuid, p_ref text default null, p_method public.payment_method default 'upi')
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  o public.orders := private.lock_shop_order(p_order_id);
  v_ref text := nullif(upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g')), '');
  v_method public.payment_method := coalesce(p_method, 'upi');
begin
  if o.payee <> 'shop' then raise exception 'PAID_TO_GADGET_GALLI' using errcode = 'P0001'; end if;
  if o.status <> 'CONFIRMED' then raise exception 'ORDER_NOT_AWAITING_PAYMENT' using errcode = 'P0001'; end if;
  if o.payment_mode <> 'advance' then raise exception 'PAY_ON_DELIVERY' using errcode = 'P0001'; end if;
  v_ref := coalesce(v_ref, o.payment_ref);
  if v_ref is not null and (length(v_ref) > 40 or v_ref !~ '^[A-Z0-9-]+$') then
    raise exception 'PAYMENT_REF_INVALID' using errcode = 'P0001';
  end if;
  update public.orders set payment_ref = v_ref, payment_method = v_method where id = o.id;
  perform private.set_order_status(o.id, 'PAID', 'shop',
    'Payment received by the shop' || coalesce(case when v_method = 'cash' then ' · Cash' else ' · Ref ' || v_ref end, ''),
    jsonb_build_object('method', v_method, 'txn_id', v_ref, 'paid_to', 'shop'));
  perform private.record_payment(o.id, v_method, o.grand_total, v_ref, null);
  return private.order_json(o.id, 'shop');
end $$;

-- The shop cannot find the customer's payment: the customer checks and enters the right reference
create or replace function public.shop_reject_payment(p_order_id uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  o public.orders := private.lock_shop_order(p_order_id);
  v_reason text := left(nullif(btrim(p_reason), ''), 300);
  v_name text := (select name from public.shops where id = o.shop_id);
begin
  if o.payee <> 'shop' then raise exception 'PAID_TO_GADGET_GALLI' using errcode = 'P0001'; end if;
  if v_reason is null then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  if o.status <> 'CONFIRMED' or o.payment_claimed_at is null then raise exception 'PAYMENT_NOT_CLAIMED' using errcode = 'P0001'; end if;
  update public.orders set payment_claimed_at = null, payment_rejected_reason = v_reason where id = o.id;
  perform private.notify(o.customer_id, 'customer', 'payment_not_found', 'Payment not received for ' || o.order_no,
    coalesce(v_name, 'The shop') || ': ' || v_reason || ' Check your UPI app and enter the right UPI reference, or call the shop.',
    jsonb_build_object('order_id', o.id, 'url', '/order/' || o.id));
  return private.order_json(o.id, 'shop');
end $$;

-- Pack: after the advance payment, or straight away for pay on delivery
create or replace function public.shop_mark_packed(p_order_id uuid, p_pack_photo text default null, p_bill_photo text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  o public.orders := private.lock_shop_order(p_order_id);
begin
  if o.status = 'CONFIRMED' and (o.payee <> 'shop' or o.payment_mode is distinct from 'on_delivery') then
    raise exception 'WAIT_FOR_PAYMENT' using errcode = 'P0001';
  end if;
  update public.orders set pack_photo_path = coalesce(p_pack_photo, pack_photo_path),
                           bill_photo_path = coalesce(p_bill_photo, bill_photo_path)
   where id = o.id;
  perform private.set_order_status(o.id, 'PACKED', 'shop', 'Packed', '{}'::jsonb);
  return private.order_json(o.id, 'shop');
end $$;

-- Handover: the shop (or rider) enters the customer's delivery code; for pay on delivery, also how the customer paid.
-- A wrong code returns {"error": "WRONG_DELIVERY_CODE", "attempts_left": n} (and is counted); 5 wrong codes lock it
-- for 30 minutes (CODE_LOCKED).
create or replace function public.shop_mark_delivered(
  p_order_id uuid, p_code text, p_method public.payment_method default null, p_ref text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  o public.orders := private.lock_shop_order(p_order_id);
  c private.order_codes;
  v_ref text := nullif(upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g')), '');
  v_pay boolean;
begin
  if o.status <> 'DISPATCHED' then raise exception 'NOT_DISPATCHED' using errcode = 'P0001'; end if;
  select * into c from private.order_codes where order_id = o.id for update;
  if c.order_id is null then raise exception 'NO_DELIVERY_CODE' using errcode = 'P0001'; end if;
  if c.locked_until > now() then raise exception 'CODE_LOCKED' using errcode = 'P0001'; end if;
  if regexp_replace(coalesce(p_code, ''), '\D', '', 'g') <> c.code then
    update private.order_codes
       set attempts = case when c.attempts + 1 >= 5 then 0 else c.attempts + 1 end,
           locked_until = case when c.attempts + 1 >= 5 then now() + interval '30 minutes' end
     where order_id = o.id;
    return jsonb_build_object('error', 'WRONG_DELIVERY_CODE', 'attempts_left', greatest(0, 4 - c.attempts));
  end if;

  v_pay := o.payment_mode = 'on_delivery' and o.paid_at is null;
  if v_pay then
    if p_method is null then raise exception 'PAYMENT_METHOD_REQUIRED' using errcode = 'P0001'; end if;
    if v_ref is not null and (length(v_ref) > 40 or v_ref !~ '^[A-Z0-9-]+$') then
      raise exception 'PAYMENT_REF_INVALID' using errcode = 'P0001';
    end if;
    update public.orders set payment_method = p_method, payment_ref = coalesce(v_ref, payment_ref) where id = o.id;
    perform private.record_payment(o.id, p_method, o.grand_total, v_ref, null);
  end if;
  update private.order_codes set used_at = now(), attempts = 0, locked_until = null where order_id = o.id;
  perform private.set_order_status(o.id, 'DELIVERED', 'shop',
    'Handed over · delivery code checked'
      || case when v_pay then ' · Paid ' || case p_method when 'cash' then 'in cash' when 'bank_transfer' then 'by bank transfer' else 'by UPI' end
                              || coalesce(' · Ref ' || v_ref, '') else '' end,
    jsonb_build_object('code_checked', true, 'method', case when v_pay then p_method end, 'txn_id', case when v_pay then v_ref end));
  return private.order_json(o.id, 'shop');
end $$;

-- The shop cannot deliver: a paid order needs the refund reference; an order paid on delivery just needs a reason.
create or replace function public.shop_cancel_order(p_order_id uuid, p_reason text, p_refund_ref text default null) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  o public.orders := private.lock_shop_order(p_order_id);
  v_eff public.order_status := case when o.status = 'ISSUE_REPORTED' then o.status_before_issue else o.status end;
  v_reason text := left(nullif(btrim(p_reason), ''), 300);
  v_ref text := nullif(upper(regexp_replace(coalesce(p_refund_ref, ''), '\s', '', 'g')), '');
begin
  if o.payee <> 'shop' then raise exception 'PAID_TO_GADGET_GALLI' using errcode = 'P0001'; end if;
  if v_eff not in ('PAID', 'PACKED', 'DISPATCHED') then raise exception 'CANNOT_CANCEL_NOW' using errcode = 'P0001'; end if;
  if v_reason is null then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  if o.paid_at is not null then
    if v_ref is null or length(v_ref) < 6 or length(v_ref) > 40 or v_ref !~ '^[A-Z0-9-]+$' then
      raise exception 'REFUND_REF_REQUIRED' using errcode = 'P0001';
    end if;
    update public.orders set refund_ref = v_ref, refund_amount = grand_total, refunded_at = now(), cancel_reason = v_reason
     where id = o.id;
  else
    update public.orders set cancel_reason = v_reason where id = o.id;
  end if;
  perform private.set_order_status(o.id, 'CANCELLED', 'shop',
    'Cancelled by the shop: ' || v_reason || coalesce(' · Refund ref ' || v_ref, ''),
    jsonb_build_object('refund_ref', v_ref, 'refund_amount', case when v_ref is not null then o.grand_total end));
  return private.order_json(o.id, 'shop');
end $$;

-- 8. Customer steps -----------------------------------------------------------------------------------------------------
-- "I have paid" with the UPI reference: to the shop (advance orders) or, for older orders, to Gadget Galli
create or replace function public.customer_submit_payment(p_order_id uuid, p_ref text, p_method public.payment_method default 'upi') returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_user();
  o public.orders;
  s public.shops;
  v_ref text := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
  v_pay jsonb;
  v_label text := case when p_method = 'bank_transfer' then 'Bank UTR' else 'UPI ref' end;
  v_total text;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null or o.customer_id <> v_uid then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if o.status <> 'CONFIRMED' then raise exception 'ORDER_NOT_AWAITING_PAYMENT' using errcode = 'P0001'; end if;
  select * into s from public.shops where id = o.shop_id;
  v_total := '₹' || to_char(o.grand_total, 'FM99,99,99,999');

  if o.payee = 'shop' then
    if o.payment_mode = 'on_delivery' then raise exception 'PAY_ON_DELIVERY' using errcode = 'P0001'; end if;
    if s.upi_id is null then raise exception 'PAYMENTS_NOT_SET_UP' using errcode = 'P0001'; end if;
    if p_method is distinct from 'upi' then raise exception 'PAYMENT_METHOD_UNAVAILABLE' using errcode = 'P0001'; end if;
  else
    v_pay := private.payment_details();
    if not (v_pay->>'ready')::boolean then raise exception 'PAYMENTS_NOT_SET_UP' using errcode = 'P0001'; end if;
    if p_method is null or p_method not in ('upi', 'bank_transfer')
       or (p_method = 'upi' and v_pay->>'upi_id' is null)
       or (p_method = 'bank_transfer' and v_pay->'bank' = 'null'::jsonb) then
      raise exception 'PAYMENT_METHOD_UNAVAILABLE' using errcode = 'P0001';
    end if;
  end if;
  if length(v_ref) < 6 or length(v_ref) > 40 or v_ref !~ '^[A-Z0-9-]+$' then
    raise exception 'PAYMENT_REF_INVALID' using errcode = 'P0001';
  end if;
  perform private.hit_limit('submit_payment', 10, interval '1 day');
  update public.orders set payment_ref = v_ref, payment_method = p_method, payment_claimed_at = now(), payment_rejected_reason = null,
         overdue_reason = case when overdue_reason = 'payment_not_confirmed' then null else overdue_reason end,
         overdue_at = case when overdue_reason = 'payment_not_confirmed' then null else overdue_at end
   where id = o.id;

  if o.payee = 'shop' then
    perform private.notify(s.owner_id, 'partner', 'payment_claimed', 'Customer paid ' || v_total || ' · ' || o.order_no,
      'UPI ref ' || v_ref || '. Check your UPI app, then tap "Payment received" and send it.',
      jsonb_build_object('order_id', o.id, 'order_no', o.order_no, 'url', '/partner/order/' || o.id, 'sound', 'new_order'));
  else
    perform private.notify_admins('payment_claimed', 'Payment to verify · ' || o.order_no,
      v_total || ' · ' || v_label || ' ' || v_ref,
      jsonb_build_object('order_id', o.id, 'order_no', o.order_no, 'amount', o.grand_total, 'method', p_method, 'url', '/payments'));
    perform private.notify(s.owner_id, 'partner', 'payment_claimed', 'Customer paid · ' || o.order_no,
      'Gadget Galli is checking the payment. You will get a "Paid" alert to send the order.',
      jsonb_build_object('order_id', o.id, 'url', '/partner/order/' || o.id));
  end if;
  return private.order_json(o.id, 'customer');
end $$;

-- A problem report waits while the shop (or Gadget Galli, for older orders) checks a payment, unless it is overdue
create or replace function public.report_issue(p_order_id uuid, p_type public.issue_type, p_description text default null, p_photos text[] default '{}')
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  o public.orders := private.lock_customer_order(p_order_id);
  v_eff public.order_status := case when o.status = 'ISSUE_REPORTED' then o.status_before_issue else o.status end;
  i public.issues;
begin
  if v_eff not in ('CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED', 'DELIVERED') then
    raise exception 'CANNOT_REPORT_NOW' using errcode = 'P0001';
  end if;
  if o.status = 'CONFIRMED' and o.payment_claimed_at is not null and not public.gg_order_overdue(o) then
    raise exception 'PAYMENT_UNDER_REVIEW' using errcode = 'P0001';
  end if;
  if v_eff = 'DELIVERED' and o.delivered_at < now() - interval '7 days' then
    raise exception 'ISSUE_WINDOW_CLOSED' using errcode = 'P0001';
  end if;
  insert into public.issues (order_id, customer_id, shop_id, type, description, photos)
  values (o.id, o.customer_id, o.shop_id, p_type, left(nullif(btrim(p_description), ''), 2000), coalesce(p_photos[1:6], '{}'))
  returning * into i;
  if o.status <> 'ISSUE_REPORTED' then
    perform private.set_order_status(o.id, 'ISSUE_REPORTED', 'customer',
      'Problem reported: ' || replace(p_type::text, '_', ' '), jsonb_build_object('issue_id', i.id));
  else
    perform private.notify_admins('issue_reported', 'Another problem on ' || o.order_no, replace(p_type::text, '_', ' '),
      jsonb_build_object('order_id', o.id, 'issue_id', i.id));
  end if;
  return to_jsonb(i);
end $$;

-- 9. Admin --------------------------------------------------------------------------------------------------------------
-- Pay-on-delivery orders may be packed, sent and delivered before they are paid
create or replace function private.check_admin_status(o public.orders, p_status public.order_status) returns void
language plpgsql stable set search_path = public, pg_temp as $$
begin
  if p_status = 'PAID' and o.paid_at is null then
    raise exception 'USE_CONFIRM_PAYMENT' using errcode = 'P0001';
  end if;
  if p_status in ('PACKED', 'DISPATCHED', 'DELIVERED') and o.paid_at is null and o.payment_mode is distinct from 'on_delivery' then
    raise exception 'PAYMENT_NOT_CONFIRMED' using errcode = 'P0001';
  end if;
end $$;

-- Support can confirm a payment: to Gadget Galli (older orders) or, in a dispute, the customer's payment to the shop
create or replace function public.admin_confirm_payment(p_order_id uuid, p_ref text default null, p_method public.payment_method default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  o public.orders;
  v_ref text;
  v_method public.payment_method;
  v_shop boolean;
begin
  perform private.require_admin();
  if p_method is not null and p_method not in ('upi', 'bank_transfer') then
    raise exception 'PAYMENT_METHOD_UNAVAILABLE' using errcode = 'P0001';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if o.status <> 'CONFIRMED' then raise exception 'ORDER_NOT_AWAITING_PAYMENT' using errcode = 'P0001'; end if;
  v_shop := o.payee = 'shop';
  v_method := coalesce(p_method, o.payment_method, 'upi');
  v_ref := coalesce(nullif(upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g')), ''), o.payment_ref);
  update public.orders set payment_method = v_method where id = o.id;
  perform private.set_order_status(o.id, 'PAID', 'admin',
    case when v_shop then 'Payment to the shop confirmed by Gadget Galli support' else 'Payment received by Gadget Galli' end
      || coalesce(case when v_method = 'bank_transfer' then ' · Bank UTR ' else ' · UPI ref ' end || v_ref, ''),
    jsonb_build_object('method', v_method, 'txn_id', v_ref, 'paid_to', case when v_shop then 'shop' else 'gadget_galli' end));
  update public.orders set payment_ref = v_ref where id = o.id;
  perform private.record_payment(o.id, v_method, o.grand_total, v_ref, null);
  perform private.audit('confirm_payment', 'order', o.id::text, jsonb_build_object('ref', v_ref, 'amount', o.grand_total, 'method', v_method, 'payee', o.payee));
  return private.order_json(o.id, 'admin');
end $$;

-- Strikes (1: no advance payments, 2: suspended) and a shop's own advance limit (null: by trust level)
-- p_patch: {strikes?: 0-3, advance_limit?: number | null, reason?: text}
create or replace function public.admin_set_shop_trust(p_shop_id uuid, p_patch jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  s public.shops;
  p jsonb := coalesce(p_patch, '{}'::jsonb);
  v_old int;
  v_strikes int;
  v_limit numeric;
  v_reason text := nullif(btrim(p->>'reason'), '');
begin
  perform private.require_admin();
  select * into s from public.shops where id = p_shop_id for update;
  if s.id is null then raise exception 'SHOP_NOT_FOUND' using errcode = 'P0002'; end if;
  insert into public.shop_private (shop_id) values (s.id) on conflict (shop_id) do nothing;
  select strikes into v_old from public.shop_private where shop_id = s.id;
  v_strikes := case when p ? 'strikes' then (p->>'strikes')::int else v_old end;
  if v_strikes is null or v_strikes < 0 or v_strikes > 3 then raise exception 'INVALID_STRIKES' using errcode = 'P0001'; end if;
  if v_strikes > v_old and v_reason is null then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  if p ? 'advance_limit' and jsonb_typeof(p->'advance_limit') <> 'null' then
    v_limit := (p->>'advance_limit')::numeric;
    if v_limit < 0 or v_limit > 100000 then raise exception 'INVALID_ADVANCE_LIMIT' using errcode = 'P0001'; end if;
  end if;

  update public.shop_private set
    strikes = v_strikes,
    advance_limit = case when p ? 'advance_limit' then v_limit else advance_limit end,
    updated_at = now()
  where shop_id = s.id;

  if v_strikes > v_old then
    perform private.notify(s.owner_id, 'partner', 'shop_strike', 'Strike ' || v_strikes || ' from Gadget Galli',
      v_reason || case when v_strikes >= 2 then ' Your shop is suspended.' else ' Customers pay you on delivery until it is cleared.' end,
      jsonb_build_object('shop_id', s.id, 'url', '/partner/settings'));
    if v_strikes >= 2 and s.status = 'approved' then
      perform public.admin_suspend_shop(s.id, true, 'Strike ' || v_strikes || ': ' || v_reason);
    end if;
  end if;
  perform private.audit('shop_trust', 'shop', s.id::text,
    jsonb_build_object('strikes', v_strikes, 'previous_strikes', v_old, 'advance_limit', p->'advance_limit', 'reason', v_reason));
  return public.admin_get_shop(s.id);
end $$;

-- Payment settings also carry the advance limits
create or replace function public.platform_payment_info() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_user();
  return private.payment_details() || jsonb_build_object(
    'commission_pct', case when public.is_admin() then coalesce(private.config('commission_pct'), '0')::numeric end,
    'advance_limit_verified', case when public.is_admin() then coalesce(private.config('advance_limit_verified'), '10000')::numeric end,
    'advance_limit_trusted', case when public.is_admin() then coalesce(private.config('advance_limit_trusted'), '50000')::numeric end);
end $$;

create or replace function public.admin_save_payment_settings(p_settings jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_upi text := lower(btrim(coalesce(p_settings->>'upi_id', '')));
  v_upi_name text := btrim(coalesce(p_settings->>'upi_name', ''));
  v_qr text := btrim(coalesce(p_settings->>'qr_path', ''));
  v_acc_name text := btrim(coalesce(p_settings->>'bank_account_name', ''));
  v_acc_no text := regexp_replace(coalesce(p_settings->>'bank_account_number', ''), '\s', '', 'g');
  v_ifsc text := upper(btrim(coalesce(p_settings->>'bank_ifsc', '')));
  v_bank text := btrim(coalesce(p_settings->>'bank_name', ''));
  v_pct numeric := coalesce((p_settings->>'commission_pct')::numeric, coalesce(private.config('commission_pct'), '0')::numeric);
  v_verified numeric := coalesce((p_settings->>'advance_limit_verified')::numeric, coalesce(private.config('advance_limit_verified'), '10000')::numeric);
  v_trusted numeric := coalesce((p_settings->>'advance_limit_trusted')::numeric, coalesce(private.config('advance_limit_trusted'), '50000')::numeric);
begin
  if not public.is_super_admin() then raise exception 'SUPER_ADMIN_ONLY' using errcode = 'P0001'; end if;
  if v_upi <> '' and v_upi !~ '^[a-z0-9._-]{2,}@[a-z][a-z0-9.]+$' then raise exception 'INVALID_UPI' using errcode = 'P0001'; end if;
  if v_qr <> '' and v_qr !~ '^payments/[A-Za-z0-9._/-]+$' then raise exception 'INVALID_QR' using errcode = 'P0001'; end if;
  if v_acc_name <> '' or v_acc_no <> '' or v_ifsc <> '' or v_bank <> '' then
    if v_acc_name = '' or length(v_acc_name) > 120 then raise exception 'INVALID_BANK_ACCOUNT_NAME' using errcode = 'P0001'; end if;
    if v_acc_no !~ '^[0-9]{9,18}$' then raise exception 'INVALID_BANK_ACCOUNT' using errcode = 'P0001'; end if;
    if v_ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$' then raise exception 'INVALID_IFSC' using errcode = 'P0001'; end if;
  end if;
  if v_pct < 0 or v_pct > 50 then raise exception 'INVALID_COMMISSION' using errcode = 'P0001'; end if;
  if v_verified < 0 or v_trusted < v_verified or v_trusted > 100000 then raise exception 'INVALID_ADVANCE_LIMIT' using errcode = 'P0001'; end if;

  insert into public.app_config (key, value) values
    ('platform_upi_id', v_upi),
    ('platform_upi_name', coalesce(nullif(v_upi_name, ''), 'Gadget Galli')),
    ('platform_upi_qr_path', v_qr),
    ('platform_bank_account_name', v_acc_name),
    ('platform_bank_account_number', v_acc_no),
    ('platform_bank_ifsc', v_ifsc),
    ('platform_bank_name', v_bank),
    ('commission_pct', v_pct::text),
    ('advance_limit_verified', v_verified::text),
    ('advance_limit_trusted', v_trusted::text)
  on conflict (key) do update set value = excluded.value;
  perform private.audit('save_payment_settings', 'app_config', 'payments', jsonb_build_object(
    'upi_id', nullif(v_upi, ''), 'qr', v_qr <> '', 'bank_ifsc', nullif(v_ifsc, ''),
    'bank_account_last4', nullif(right(v_acc_no, 4), ''), 'commission_pct', v_pct,
    'advance_limit_verified', v_verified, 'advance_limit_trusted', v_trusted));
  return public.platform_payment_info();
end $$;

-- 10. Commission ----------------------------------------------------------------------------------------------------------
-- Delivery makes the commission due (orders paid to the shop) or the shop's payout due (older orders paid to Gadget
-- Galli); a reported problem holds it; a cancelled order has none.
create or replace function private.payout_on_status() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pct numeric;
begin
  if new.payee = 'shop' then
    if new.status = 'DELIVERED' and old.status is distinct from 'DELIVERED' and new.commission_status in ('none', 'held') then
      v_pct := coalesce(private.config('commission_pct')::numeric, 0);
      new.commission_amount := round(new.grand_total * v_pct / 100, 2);
      new.commission_status := case when new.commission_amount > 0 then 'due' else 'none' end;
    elsif new.status = 'ISSUE_REPORTED' and new.commission_status = 'due' then
      new.commission_status := 'held';
    elsif new.status in ('CANCELLED', 'REJECTED', 'EXPIRED') and new.commission_status in ('due', 'held') then
      new.commission_status := 'none';
      new.commission_payment_id := null;
    end if;
    return new;
  end if;

  if new.status = 'DELIVERED' and old.status is distinct from 'DELIVERED' and new.payout_status in ('not_due', 'held') then
    v_pct := coalesce(private.config('commission_pct')::numeric, 0);
    new.commission_amount := round(new.grand_total * v_pct / 100, 2);
    new.payout_amount := new.grand_total - new.commission_amount;
    new.payout_status := 'due';
  elsif new.status = 'ISSUE_REPORTED' and new.payout_status = 'due' then
    new.payout_status := 'held';
  elsif new.status in ('CANCELLED', 'REJECTED', 'EXPIRED') and new.payout_status in ('due', 'held') then
    new.payout_status := 'not_due';
  end if;
  return new;
end $$;

-- The shop's commission: what is due, where to pay it, and past payments
create or replace function public.shop_commission() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_shop public.shops := private.my_first_shop();
begin
  perform private.require_user();
  if v_shop.id is null then raise exception 'NO_SHOP' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'commission_pct', coalesce(private.config('commission_pct'), '0')::numeric,
    'due_total', (select coalesce(sum(commission_amount), 0) from public.orders
                   where shop_id = v_shop.id and commission_status = 'due' and commission_payment_id is null),
    'due_count', (select count(*) from public.orders
                   where shop_id = v_shop.id and commission_status = 'due' and commission_payment_id is null),
    'held_total', (select coalesce(sum(commission_amount), 0) from public.orders where shop_id = v_shop.id and commission_status = 'held'),
    'paid_30d', (select coalesce(sum(amount), 0) from public.commission_payments
                  where shop_id = v_shop.id and status = 'confirmed' and decided_at > now() - interval '30 days'),
    'pending', (select jsonb_build_object('id', c.id, 'amount', c.amount, 'order_count', c.order_count, 'ref', c.ref,
                         'method', c.method, 'submitted_at', c.submitted_at)
                  from public.commission_payments c where c.shop_id = v_shop.id and c.status = 'submitted'
                  order by c.submitted_at desc limit 1),
    'pay_to', private.payment_details(),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'amount', c.amount, 'order_count', c.order_count,
                    'ref', c.ref, 'method', c.method, 'status', c.status, 'reject_reason', c.reject_reason,
                    'submitted_at', c.submitted_at, 'decided_at', c.decided_at) order by c.submitted_at desc)
                  from (select * from public.commission_payments where shop_id = v_shop.id order by submitted_at desc limit 24) c), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'order_no', o.order_no, 'grand_total', o.grand_total,
                    'commission_amount', o.commission_amount, 'commission_status', o.commission_status,
                    'in_payment', o.commission_payment_id is not null, 'delivered_at', o.delivered_at)
                    order by o.delivered_at desc)
                  from (select * from public.orders where shop_id = v_shop.id and commission_status <> 'none'
                        order by delivered_at desc nulls last limit 60) o), '[]'::jsonb),
    -- Orders paid to Gadget Galli before #57 that still owe this shop a payout
    'legacy_payouts_due', (select coalesce(sum(payout_amount), 0) from public.orders where shop_id = v_shop.id and payout_status = 'due'));
end $$;

-- The shop paid Gadget Galli everything due: Gadget Galli checks its account and confirms
create or replace function public.shop_pay_commission(p_ref text, p_method public.payment_method default 'upi') returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_shop public.shops := private.my_first_shop();
  v_ref text := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
  v_total numeric;
  v_count int;
  v_id uuid;
begin
  perform private.require_user();
  if v_shop.id is null then raise exception 'NO_SHOP' using errcode = 'P0001'; end if;
  if p_method is null or p_method not in ('upi', 'bank_transfer') then raise exception 'PAYMENT_METHOD_UNAVAILABLE' using errcode = 'P0001'; end if;
  if length(v_ref) < 6 or length(v_ref) > 40 or v_ref !~ '^[A-Z0-9-]+$' then raise exception 'PAYMENT_REF_INVALID' using errcode = 'P0001'; end if;
  if exists (select 1 from public.commission_payments where shop_id = v_shop.id and status = 'submitted') then
    raise exception 'COMMISSION_PAYMENT_PENDING' using errcode = 'P0001';
  end if;
  perform 1 from public.orders where shop_id = v_shop.id and commission_status = 'due' and commission_payment_id is null order by id for update;
  select coalesce(sum(commission_amount), 0), count(*) into v_total, v_count
    from public.orders where shop_id = v_shop.id and commission_status = 'due' and commission_payment_id is null;
  if v_count = 0 or v_total <= 0 then raise exception 'NOTHING_DUE' using errcode = 'P0001'; end if;
  perform private.hit_limit('pay_commission', 10, interval '1 day');
  insert into public.commission_payments (shop_id, amount, order_count, method, ref, submitted_by)
  values (v_shop.id, v_total, v_count, p_method, v_ref, auth.uid()) returning id into v_id;
  update public.orders set commission_payment_id = v_id
   where shop_id = v_shop.id and commission_status = 'due' and commission_payment_id is null;
  perform private.notify_admins('commission_paid', 'Commission paid · ' || coalesce(v_shop.name, 'shop'),
    '₹' || to_char(v_total, 'FM99,99,99,999') || ' · ' || case when p_method = 'bank_transfer' then 'Bank UTR ' else 'UPI ref ' end || v_ref,
    jsonb_build_object('shop_id', v_shop.id, 'payment_id', v_id, 'url', '/payments?tab=commission'));
  return public.shop_commission();
end $$;

create or replace function public.admin_list_commission() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'commission_pct', coalesce(private.config('commission_pct'), '0')::numeric,
    'submitted', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'shop_id', s.id, 'shop_name', s.name, 'amount', c.amount,
                    'order_count', c.order_count, 'method', c.method, 'ref', c.ref, 'submitted_at', c.submitted_at,
                    'owner_phone', s.owner_phone, 'contact_phone', s.contact_phone) order by c.submitted_at)
                  from public.commission_payments c join public.shops s on s.id = c.shop_id where c.status = 'submitted'), '[]'::jsonb),
    'due', coalesce((select jsonb_agg(x order by x.total desc) from (
                  select s.id as shop_id, s.name as shop_name, a.name as area, s.owner_phone, s.contact_phone,
                         sum(o.commission_amount) as total, count(*) as order_count, min(o.delivered_at) as oldest_delivered_at
                    from public.orders o join public.shops s on s.id = o.shop_id left join public.areas a on a.id = s.area_id
                   where o.commission_status = 'due' and o.commission_payment_id is null
                   group by s.id, a.name) x), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'shop_id', s.id, 'shop_name', s.name, 'amount', c.amount,
                    'order_count', c.order_count, 'method', c.method, 'ref', c.ref, 'status', c.status, 'reject_reason', c.reject_reason,
                    'submitted_at', c.submitted_at, 'decided_at', c.decided_at) order by c.decided_at desc)
                  from (select * from public.commission_payments where status <> 'submitted' order by decided_at desc limit 50) c
                  join public.shops s on s.id = c.shop_id), '[]'::jsonb));
end $$;

create or replace function public.admin_confirm_commission(p_payment_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  c public.commission_payments;
  v_owner uuid;
begin
  perform private.require_admin();
  select * into c from public.commission_payments where id = p_payment_id for update;
  if c.id is null or c.status <> 'submitted' then raise exception 'COMMISSION_NOT_PENDING' using errcode = 'P0001'; end if;
  update public.commission_payments set status = 'confirmed', decided_by = auth.uid(), decided_at = now() where id = c.id;
  update public.orders set commission_status = 'paid' where commission_payment_id = c.id and commission_status in ('due', 'held');
  select owner_id into v_owner from public.shops where id = c.shop_id;
  perform private.notify(v_owner, 'partner', 'commission_confirmed', 'Commission received ✅',
    'Gadget Galli received ₹' || to_char(c.amount, 'FM99,99,99,999') || ' · Ref ' || c.ref || '. Thank you!',
    jsonb_build_object('url', '/partner/payouts'));
  perform private.audit('confirm_commission', 'shop', c.shop_id::text, jsonb_build_object('payment_id', c.id, 'amount', c.amount, 'ref', c.ref));
  return public.admin_list_commission();
end $$;

create or replace function public.admin_reject_commission(p_payment_id uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  c public.commission_payments;
  v_reason text := left(nullif(btrim(p_reason), ''), 300);
  v_owner uuid;
begin
  perform private.require_admin();
  if v_reason is null then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  select * into c from public.commission_payments where id = p_payment_id for update;
  if c.id is null or c.status <> 'submitted' then raise exception 'COMMISSION_NOT_PENDING' using errcode = 'P0001'; end if;
  update public.commission_payments set status = 'rejected', reject_reason = v_reason, decided_by = auth.uid(), decided_at = now() where id = c.id;
  update public.orders set commission_payment_id = null where commission_payment_id = c.id;
  select owner_id into v_owner from public.shops where id = c.shop_id;
  perform private.notify(v_owner, 'partner', 'commission_rejected', 'Commission payment not found',
    v_reason || ' Please check and pay again from Payments.', jsonb_build_object('url', '/partner/payouts'));
  perform private.audit('reject_commission', 'shop', c.shop_id::text, jsonb_build_object('payment_id', c.id, 'reason', v_reason));
  return public.admin_list_commission();
end $$;

-- Commission paid outside the app (cash, a bank transfer the shop did not record): settles everything due
create or replace function public.admin_record_commission(p_shop_id uuid, p_ref text, p_method public.payment_method default 'upi') returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_ref text := upper(btrim(coalesce(p_ref, '')));
  v_total numeric;
  v_count int;
  v_id uuid;
  v_owner uuid;
begin
  perform private.require_admin();
  if length(v_ref) < 4 then raise exception 'PAYOUT_REF_REQUIRED' using errcode = 'P0001'; end if;
  perform 1 from public.orders where shop_id = p_shop_id and commission_status = 'due' and commission_payment_id is null order by id for update;
  select coalesce(sum(commission_amount), 0), count(*) into v_total, v_count
    from public.orders where shop_id = p_shop_id and commission_status = 'due' and commission_payment_id is null;
  if v_count = 0 or v_total <= 0 then raise exception 'NOTHING_DUE' using errcode = 'P0001'; end if;
  insert into public.commission_payments (shop_id, amount, order_count, method, ref, status, submitted_by, decided_by, decided_at)
  values (p_shop_id, v_total, v_count, coalesce(p_method, 'upi'), v_ref, 'confirmed', auth.uid(), auth.uid(), now()) returning id into v_id;
  update public.orders set commission_payment_id = v_id, commission_status = 'paid'
   where shop_id = p_shop_id and commission_status = 'due' and commission_payment_id is null;
  select owner_id into v_owner from public.shops where id = p_shop_id;
  perform private.notify(v_owner, 'partner', 'commission_confirmed', 'Commission received ✅',
    'Gadget Galli recorded ₹' || to_char(v_total, 'FM99,99,99,999') || ' · Ref ' || v_ref || '. Thank you!',
    jsonb_build_object('url', '/partner/payouts'));
  perform private.audit('record_commission', 'shop', p_shop_id::text, jsonb_build_object('payment_id', v_id, 'amount', v_total, 'ref', v_ref));
  return public.admin_list_commission();
end $$;

-- 11. Jobs: advance-payment watch, pay-on-delivery expiry; auto delivery only for older orders ---------------------------
create or replace function private.overdue_notify(o public.orders) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_shop public.shops;
  v_total text := '₹' || to_char(o.grand_total, 'FM99,99,99,999');
  v_data jsonb := jsonb_build_object('order_id', o.id, 'order_no', o.order_no, 'url', '/order/' || o.id);
  v_shop_data jsonb := jsonb_build_object('order_id', o.id, 'order_no', o.order_no, 'url', '/partner/order/' || o.id, 'sound', 'new_order');
begin
  select * into v_shop from public.shops where id = o.shop_id;
  if o.overdue_reason = 'payment_not_confirmed' then
    perform private.notify(v_shop.owner_id, 'partner', 'order_overdue', 'Confirm the payment for ' || o.order_no,
      'The customer says they paid ' || v_total || ' (UPI ref ' || coalesce(o.payment_ref, '-') || '). Check your UPI app and tap "Payment received" or "Not received".',
      v_shop_data);
    perform private.notify(o.customer_id, 'customer', 'order_overdue', 'We have reminded ' || coalesce(v_shop.name, 'the shop'),
      'The shop has not confirmed your payment yet. Call the shop, or report a problem and Gadget Galli will help.', v_data);
    perform private.notify_admins('order_overdue', 'Payment not confirmed · ' || o.order_no,
      coalesce(v_shop.name, '') || ' · ' || v_total || ' · claimed 2 hours ago', v_data);
  elsif o.overdue_reason = 'not_sent' then
    perform private.notify(v_shop.owner_id, 'partner', 'order_overdue', 'Overdue: send ' || o.order_no || ' now',
      'The customer paid ' || v_total || '. Send it now, or refund the customer. New customers pay you on delivery until it is sent.',
      v_shop_data);
    perform private.notify(o.customer_id, 'customer', 'order_overdue', 'Your order is late',
      coalesce(v_shop.name, 'The shop') || ' has not sent your paid order yet. We have alerted them and Gadget Galli support is watching it. Call the shop, or report a problem.',
      v_data);
    perform private.notify_admins('order_overdue', 'Paid but not sent · ' || o.order_no, coalesce(v_shop.name, '') || ' · ' || v_total, v_data);
  else
    perform private.notify(v_shop.owner_id, 'partner', 'order_overdue', 'Delivery overdue · ' || o.order_no,
      'It was sent 2 days ago. Ask the customer for the delivery code to finish it, or contact Gadget Galli support.', v_shop_data);
    perform private.notify(o.customer_id, 'customer', 'order_overdue', 'Did you get order ' || o.order_no || '?',
      'If you got it, tap "I received my order". If not, report a problem and Gadget Galli will help.', v_data);
    perform private.notify_admins('order_overdue', 'Sent but not delivered · ' || o.order_no, coalesce(v_shop.name, '') || ' · ' || v_total, v_data);
  end if;
end $$;

create or replace function public.run_order_jobs() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  r record;
  o public.orders;
  v_expired int := 0;
  v_reminded int := 0;
  v_auto int := 0;
  v_overdue int := 0;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'ADMIN_ONLY' using errcode = '42501';
  end if;

  -- Advance payment not made within 24 hours
  for r in select id from public.orders
           where status = 'CONFIRMED' and payment_claimed_at is null and coalesce(payment_mode, 'advance') = 'advance'
             and confirmed_at < now() - interval '24 hours'
           order by confirmed_at for update skip locked loop
    perform private.set_order_status(r.id, 'EXPIRED', 'system', 'Not paid within 24 hours', '{}'::jsonb);
    v_expired := v_expired + 1;
  end loop;

  -- Pay on delivery: not packed within 2 days of confirming
  for r in select id from public.orders
           where status = 'CONFIRMED' and payment_mode = 'on_delivery' and confirmed_at < now() - interval '48 hours'
           order by confirmed_at for update skip locked loop
    perform private.set_order_status(r.id, 'EXPIRED', 'system', 'Not sent within 2 days', '{}'::jsonb);
    v_expired := v_expired + 1;
  end loop;

  for r in select id from public.orders
           where status = 'REQUESTED' and requested_at < now() - interval '2 hours'
           order by requested_at for update skip locked loop
    perform private.set_order_status(r.id, 'EXPIRED', 'system', 'No response from the shop in 2 hours', '{}'::jsonb);
    v_expired := v_expired + 1;
  end loop;

  for r in select id, customer_id, order_no from public.orders
           where status = 'DISPATCHED' and dispatched_at < now() - interval '24 hours' and reminder_sent_at is null loop
    perform private.notify(r.customer_id, 'customer', 'receive_reminder', 'Did you get your order?',
      'Order ' || r.order_no || ' was sent a day ago. Tap "I received my order" once it arrives, or report a problem.',
      jsonb_build_object('order_id', r.id, 'url', '/order/' || r.id));
    update public.orders set reminder_sent_at = now() where id = r.id;
    v_reminded := v_reminded + 1;
  end loop;

  -- Orders paid to Gadget Galli (#52) are delivered automatically 72 hours after sending, so the shop's payout comes due
  for r in select id from public.orders
           where status = 'DISPATCHED' and payee = 'gadget_galli' and dispatched_at < now() - interval '72 hours'
           for update skip locked loop
    perform private.set_order_status(r.id, 'DELIVERED', 'system', 'Marked delivered automatically after 72 hours', '{}'::jsonb);
    v_auto := v_auto + 1;
  end loop;

  -- Advance payments to shops: the payment is not confirmed in 2 hours, the order is not sent by its send-by time,
  -- or not delivered 2 days after sending. Each step alerts once.
  for r in select x.id, x.status, x.reason from (
             select o2.id, o2.status, o2.overdue_reason,
                    case when o2.status = 'CONFIRMED' then 'payment_not_confirmed'
                         when o2.status in ('PAID', 'PACKED') then 'not_sent'
                         else 'not_delivered' end as reason
               from public.orders o2
              where o2.payee = 'shop' and o2.payment_mode = 'advance'
                and ((o2.status = 'CONFIRMED' and o2.payment_claimed_at < now() - interval '2 hours')
                  or (o2.status in ('PAID', 'PACKED') and o2.dispatch_due_at < now())
                  or (o2.status = 'DISPATCHED' and o2.dispatched_at < now() - interval '48 hours'))) x
            where x.overdue_reason is distinct from x.reason loop
    update public.orders set overdue_reason = r.reason, overdue_at = now()
     where id = r.id and status = r.status
    returning * into o;
    if found then
      perform private.overdue_notify(o);
      v_overdue := v_overdue + 1;
    end if;
  end loop;

  -- Retry pushes that did not go out (e.g. webhook was down)
  if exists (select 1 from public.notifications where push_status = 'pending' and created_at < now() - interval '1 minute') then
    perform private.post_push_webhook(jsonb_build_object('flush', true));
  end if;

  return jsonb_build_object('expired', v_expired, 'reminded', v_reminded, 'auto_delivered', v_auto, 'overdue', v_overdue);
end $$;

-- 12. Admin dashboard and lists -----------------------------------------------------------------------------------------
create or replace function public.gg_stuck_reason(o public.orders) returns text
language sql stable set search_path = public, pg_temp as $$
  select case
    when public.gg_order_overdue(o) then case o.overdue_reason
      when 'payment_not_confirmed' then 'Shop has not confirmed the payment in 2 hrs'
      when 'not_sent' then 'Paid but not sent by the deadline'
      else 'Sent but not delivered in 2 days' end
    when o.status = 'REQUESTED' and o.requested_at < now() - interval '30 minutes' then 'Not confirmed in 30 min'
    when o.payee = 'gadget_galli' and o.status = 'CONFIRMED' and o.payment_claimed_at < now() - interval '2 hours' then 'Payment not verified in 2 hrs'
    when o.payee = 'gadget_galli' and o.status in ('PAID', 'PACKED') and o.paid_at < now() - interval '3 hours' then 'Paid but not dispatched in 3 hrs'
    when o.payment_mode = 'on_delivery' and o.status in ('CONFIRMED', 'PACKED') and o.confirmed_at < now() - interval '24 hours' then 'Not sent in 24 hrs'
    when o.status = 'DISPATCHED' and o.dispatched_at < now() - interval '24 hours' then 'Dispatched but not delivered in 24 hrs'
    else null end;
$$;

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  perform private.require_admin();
  return jsonb_build_object(
    'shops_pending', (select count(*) from public.shops where status = 'under_review'),
    'shops_live', (select count(*) from public.shops where status = 'approved'),
    'issues_open', (select count(*) from public.issues where status <> 'resolved'),
    'stuck_orders', (select count(*) from public.orders o where public.gg_stuck_reason(o) is not null),
    'overdue_orders', (select count(*) from public.orders o where o.overdue_reason is not null and public.gg_order_overdue(o)),
    'catalog_pending', (select count(*) from public.catalog_products where status = 'pending'),
    'orders_today', (select count(*) from public.orders where (requested_at at time zone 'Asia/Kolkata')::date = v_today),
    'delivered_today', (select count(*) from public.orders where status = 'DELIVERED' and (delivered_at at time zone 'Asia/Kolkata')::date = v_today),
    'gmv_today', (select coalesce(sum(grand_total), 0) from public.orders where paid_at is not null
                  and (paid_at at time zone 'Asia/Kolkata')::date = v_today and status not in ('REJECTED', 'CANCELLED', 'EXPIRED')),
    'customers', (select count(*) from public.users where role = 'customer' and deleted_at is null),
    'searches_today', (select count(*) from public.search_logs where (created_at at time zone 'Asia/Kolkata')::date = v_today),
    'payments_to_verify', (select count(*) from public.orders where payee = 'gadget_galli' and status = 'CONFIRMED' and payment_claimed_at is not null),
    'payouts_due', (select coalesce(sum(payout_amount), 0) from public.orders where payout_status = 'due'),
    'payouts_due_count', (select count(distinct shop_id) from public.orders where payout_status = 'due'),
    'commission_due', (select coalesce(sum(commission_amount), 0) from public.orders where commission_status = 'due'),
    'commission_to_confirm', (select count(*) from public.commission_payments where status = 'submitted'),
    'active_orders', (select count(*) from public.orders where status in ('REQUESTED', 'CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED'))
  );
end $$;

-- Only older payments to Gadget Galli are checked by admins
create or replace function public.admin_list_payments_to_verify() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'awaiting', (select count(*) from public.orders where payee = 'gadget_galli' and status = 'CONFIRMED' and payment_claimed_at is null),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', o.id, 'order_no', o.order_no, 'grand_total', o.grand_total, 'payment_ref', o.payment_ref, 'payment_method', o.payment_method,
          'payment_claimed_at', o.payment_claimed_at, 'confirmed_at', o.confirmed_at, 'customer_name', o.customer_name,
          'customer_phone', u.phone, 'shop_name', s.name) order by o.payment_claimed_at)
        from public.orders o
        join public.shops s on s.id = o.shop_id
        left join public.users u on u.id = o.customer_id
       where o.payee = 'gadget_galli' and o.status = 'CONFIRMED' and o.payment_claimed_at is not null), '[]'::jsonb));
end $$;

-- Shop JSON (owner and admin) carries the payment terms
create or replace function private.shop_json(p_shop_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select to_jsonb(s) || jsonb_build_object(
    'area', (select jsonb_build_object('id', a.id, 'name', a.name, 'pincode', a.pincode, 'zone_id', a.zone_id)
             from public.areas a where a.id = s.area_id),
    'gst_number', (select gst_number from public.shop_private where shop_id = s.id),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', ph.id, 'kind', ph.kind, 'path', ph.path, 'sort', ph.sort)
                         order by ph.kind, ph.sort) from public.shop_photos ph where ph.shop_id = s.id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'doc_type', d.doc_type, 'doc_number', d.doc_number,
                         'status', d.status, 'note', d.note, 'path', d.path, 'created_at', d.created_at) order by d.created_at)
                         from public.shop_documents d where d.shop_id = s.id), '[]'::jsonb),
    'delivery_zone_ids', coalesce((select jsonb_agg(da.zone_id) from public.delivery_areas da where da.shop_id = s.id and da.zone_id is not null), '[]'::jsonb),
    'delivery_area_ids', coalesce((select jsonb_agg(da.area_id) from public.delivery_areas da where da.shop_id = s.id and da.area_id is not null), '[]'::jsonb),
    'is_open_now', public.gg_shop_open_now(s.hours, s.is_open),
    'product_count', (select count(*) from public.shop_products sp where sp.shop_id = s.id and sp.is_active),
    'payment_terms', private.shop_payment_terms(s.id)
  )
  from public.shops s where s.id = p_shop_id;
$$;

-- The shop dashboard: orders waiting for the shop, trust and commission due
create or replace function public.shop_dashboard(p_shop_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s public.shops := private.require_shop_owner(p_shop_id);
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  return jsonb_build_object(
    'shop', jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug, 'status', s.status, 'is_open', s.is_open,
      'is_open_now', public.gg_shop_open_now(s.hours, s.is_open), 'verified', s.verified,
      'rating_avg', s.rating_avg, 'rating_count', s.rating_count, 'logo_path', s.logo_path,
      'avg_delivery_mins', s.avg_delivery_mins, 'orders_delivered', s.orders_delivered),
    'today', jsonb_build_object(
      'new_requests', (select count(*) from public.orders where shop_id = s.id and status = 'REQUESTED'),
      'active_orders', (select count(*) from public.orders where shop_id = s.id
                        and status in ('CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED', 'ISSUE_REPORTED')),
      'delivered', (select count(*) from public.orders where shop_id = s.id and status = 'DELIVERED'
                    and (delivered_at at time zone 'Asia/Kolkata')::date = v_today),
      'sales', (select coalesce(sum(grand_total), 0) from public.orders where shop_id = s.id and paid_at is not null
                and (paid_at at time zone 'Asia/Kolkata')::date = v_today
                and status not in ('REJECTED', 'CANCELLED', 'EXPIRED')),
      'orders_today', (select count(*) from public.orders where shop_id = s.id
                       and (requested_at at time zone 'Asia/Kolkata')::date = v_today),
      'views', coalesce((select views from public.shop_stats_daily where shop_id = s.id and day = v_today), 0),
      'call_taps', coalesce((select call_taps from public.shop_stats_daily where shop_id = s.id and day = v_today), 0),
      'whatsapp_taps', coalesce((select whatsapp_taps from public.shop_stats_daily where shop_id = s.id and day = v_today), 0)),
    -- Orders the shop can act on: new requests, payments to check, orders to pack or send, problems, late deliveries
    'attention', coalesce((select jsonb_agg(private.order_card(o) order by o.requested_at)
                           from (select * from public.orders o where o.shop_id = s.id
                                 and (o.status in ('REQUESTED', 'PAID', 'PACKED', 'ISSUE_REPORTED')
                                      or (o.status = 'CONFIRMED' and o.payee = 'shop'
                                          and (o.payment_mode = 'on_delivery' or o.payment_claimed_at is not null))
                                      or (o.status = 'DISPATCHED' and o.overdue_reason is not null and public.gg_order_overdue(o)))
                                 order by o.requested_at limit 10) o), '[]'::jsonb),
    'low_stock', (select count(*) from public.shop_products where shop_id = s.id and is_active
                  and ((stock_qty is not null and stock_qty <= 2) or not in_stock)),
    'unread_reviews', (select count(*) from public.reviews where shop_id = s.id and shop_reply is null),
    'payment_terms', private.shop_payment_terms(s.id),
    'commission_due', (select coalesce(sum(commission_amount), 0) from public.orders
                       where shop_id = s.id and commission_status = 'due' and commission_payment_id is null),
    'overdue', (select count(*) from public.orders o where o.shop_id = s.id and o.overdue_reason is not null and public.gg_order_overdue(o))
  );
end $$;

-- 13. Access -----------------------------------------------------------------------------------------------------------
revoke execute on function
  public.gg_order_overdue(public.orders), public.shop_payment_terms(uuid),
  public.shop_confirm_order(uuid, jsonb, numeric, text, text), public.shop_confirm_payment(uuid, text, public.payment_method),
  public.shop_reject_payment(uuid, text), public.shop_mark_delivered(uuid, text, public.payment_method, text),
  public.shop_cancel_order(uuid, text, text), public.admin_set_shop_trust(uuid, jsonb),
  public.shop_commission(), public.shop_pay_commission(text, public.payment_method), public.admin_list_commission(),
  public.admin_confirm_commission(uuid), public.admin_reject_commission(uuid, text),
  public.admin_record_commission(uuid, text, public.payment_method)
from public;
grant execute on function
  public.gg_order_overdue(public.orders), public.shop_payment_terms(uuid),
  public.shop_confirm_order(uuid, jsonb, numeric, text, text), public.shop_confirm_payment(uuid, text, public.payment_method),
  public.shop_reject_payment(uuid, text), public.shop_mark_delivered(uuid, text, public.payment_method, text),
  public.shop_cancel_order(uuid, text, text), public.admin_set_shop_trust(uuid, jsonb),
  public.shop_commission(), public.shop_pay_commission(text, public.payment_method), public.admin_list_commission(),
  public.admin_confirm_commission(uuid), public.admin_reject_commission(uuid, text),
  public.admin_record_commission(uuid, text, public.payment_method)
to authenticated, service_role;
revoke all on all functions in schema private from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all functions in schema private from anon, authenticated';
    execute 'revoke execute on function public.gg_order_overdue(public.orders), public.shop_confirm_order(uuid, jsonb, numeric, text, text), public.shop_confirm_payment(uuid, text, public.payment_method), public.shop_reject_payment(uuid, text), public.shop_mark_delivered(uuid, text, public.payment_method, text), public.shop_cancel_order(uuid, text, text), public.admin_set_shop_trust(uuid, jsonb), public.shop_commission(), public.shop_pay_commission(text, public.payment_method), public.admin_list_commission(), public.admin_confirm_commission(uuid), public.admin_reject_commission(uuid, text), public.admin_record_commission(uuid, text, public.payment_method) from anon';
    -- Customers see how a shop is paid before they sign in
    execute 'grant execute on function public.shop_payment_terms(uuid) to anon';
  end if;
end $$;

-- 14. Re-pin search_path on anything recreated without one (see 0013)
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prokind = 'f'
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', f.sig);
  end loop;
end $$;
