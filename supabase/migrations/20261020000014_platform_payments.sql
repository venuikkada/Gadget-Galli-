-- Gadget Galli · 0014 · customers pay Gadget Galli; shops are paid after delivery (docs/DECISIONS.md #52)
--   CONFIRMED -> the customer pays the Gadget Galli UPI and submits the UPI reference (customer_submit_payment)
--             -> an admin checks the bank app and confirms (admin_confirm_payment) -> PAID -> shop packs and sends
--   DELIVERED -> payout due (full amount minus commission_pct, 0 by default) -> admin pays the shop by UPI and records
--             the reference (admin_mark_payouts_paid). A reported problem holds the payout.
--   Shops can no longer mark orders paid. Unpaid CONFIRMED orders expire after 24 hours.

-- 1. Order columns ---------------------------------------------------------------------------------------------
alter table public.orders
  add column if not exists payment_ref text,
  add column if not exists payment_claimed_at timestamptz,
  add column if not exists payment_rejected_reason text,
  add column if not exists payout_status text not null default 'not_due',
  add column if not exists payout_amount numeric(12,2),
  add column if not exists commission_amount numeric(12,2),
  add column if not exists payout_ref text,
  add column if not exists payout_at timestamptz,
  add column if not exists payout_by uuid references public.users(id);
do $$
begin
  alter table public.orders add constraint orders_payout_status_check check (payout_status in ('not_due', 'due', 'held', 'paid'));
exception when duplicate_object then null;
end $$;
create index if not exists orders_payout_idx on public.orders (shop_id, payout_status) where payout_status in ('due', 'held');
create index if not exists orders_payment_claim_idx on public.orders (payment_claimed_at) where status = 'CONFIRMED';

-- 2. Settings ----------------------------------------------------------------------------------------------------
insert into public.app_config (key, value) values ('commission_pct', '0') on conflict (key) do nothing;

create or replace function private.config(p_key text) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select nullif(btrim(value), '') from public.app_config where key = p_key;
$$;

-- Where customers pay: the Gadget Galli UPI ID set in the admin panel.
create or replace function public.platform_payment_info() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_user();
  return jsonb_build_object(
    'upi_id', private.config('platform_upi_id'),
    'upi_name', coalesce(private.config('platform_upi_name'), 'Gadget Galli'),
    'commission_pct', case when public.is_admin() then coalesce(private.config('commission_pct'), '0')::numeric end);
end $$;

create or replace function public.admin_save_payment_settings(p_upi_id text, p_upi_name text, p_commission_pct numeric default 0)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_upi text := lower(btrim(coalesce(p_upi_id, '')));
begin
  if not public.is_super_admin() then raise exception 'SUPER_ADMIN_ONLY' using errcode = 'P0001'; end if;
  if v_upi !~ '^[a-z0-9._-]{2,}@[a-z][a-z0-9.]+$' then raise exception 'INVALID_UPI' using errcode = 'P0001'; end if;
  if p_commission_pct is null or p_commission_pct < 0 or p_commission_pct > 50 then
    raise exception 'INVALID_COMMISSION' using errcode = 'P0001';
  end if;
  insert into public.app_config (key, value) values
    ('platform_upi_id', v_upi),
    ('platform_upi_name', coalesce(nullif(btrim(p_upi_name), ''), 'Gadget Galli')),
    ('commission_pct', p_commission_pct::text)
  on conflict (key) do update set value = excluded.value;
  perform private.audit('save_payment_settings', 'app_config', 'payments',
    jsonb_build_object('upi_id', v_upi, 'commission_pct', p_commission_pct));
  return public.platform_payment_info();
end $$;

-- 3. Status rules: only Gadget Galli (admin) moves an order to PAID ----------------------------------------------
create or replace function private.allowed_transition(p_from public.order_status, p_to public.order_status, p_actor public.actor_role)
returns boolean
language sql immutable as $$
  select case
    when p_actor = 'admin' then p_from <> p_to
    when p_from = 'REQUESTED' then (p_to in ('CONFIRMED', 'REJECTED') and p_actor = 'shop')
                                or (p_to = 'CANCELLED' and p_actor = 'customer')
                                or (p_to = 'EXPIRED' and p_actor = 'system')
    when p_from = 'CONFIRMED' then (p_to = 'REJECTED' and p_actor = 'shop')
                                or (p_to = 'EXPIRED' and p_actor = 'system')
                                or (p_to in ('CANCELLED', 'ISSUE_REPORTED') and p_actor = 'customer')
    when p_from = 'PAID' then (p_to = 'PACKED' and p_actor = 'shop') or (p_to = 'ISSUE_REPORTED' and p_actor = 'customer')
    when p_from = 'PACKED' then (p_to = 'DISPATCHED' and p_actor = 'shop') or (p_to = 'ISSUE_REPORTED' and p_actor = 'customer')
    when p_from = 'DISPATCHED' then (p_to = 'DELIVERED' and p_actor in ('customer', 'system'))
                                 or (p_to = 'ISSUE_REPORTED' and p_actor = 'customer')
    when p_from = 'DELIVERED' then p_to = 'ISSUE_REPORTED' and p_actor = 'customer'
    else false
  end;
$$;

create or replace function private.order_notify(o public.orders, p_from public.order_status, p_actor public.actor_role)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_shop public.shops;
  v_data jsonb := jsonb_build_object('order_id', o.id, 'order_no', o.order_no, 'status', o.status, 'url', '/order/' || o.id);
  v_shop_data jsonb := jsonb_build_object('order_id', o.id, 'order_no', o.order_no, 'status', o.status, 'url', '/partner/order/' || o.id);
  v_total text := '₹' || to_char(o.grand_total, 'FM99,99,99,999');
  v_d public.dispatch_details;
begin
  select * into v_shop from public.shops where id = o.shop_id;

  if p_actor = 'admin' and o.status = 'PAID' and p_from = 'CONFIRMED' then
    perform private.notify(o.customer_id, 'customer', 'order_paid', 'Payment received ✅',
      'Gadget Galli received ' || v_total || '. ' || coalesce(v_shop.name, 'The shop') || ' will pack and send your order.', v_data);
    perform private.notify(v_shop.owner_id, 'partner', 'order_paid', 'Paid ✅ Pack and send ' || o.order_no,
      'Gadget Galli received ' || v_total || ' from the customer. Send the order now; you are paid after delivery.',
      v_shop_data || jsonb_build_object('sound', 'new_order'));
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
        case when o.updated_by_shop then 'Shop updated & confirmed your order' else 'Order confirmed by ' || v_shop.name end,
        case when o.updated_by_shop then 'Please check the changes. Pay ' || v_total || ' only if you agree.'
             else 'Pay ' || v_total || ' by UPI to Gadget Galli. The shop is paid only after you receive your order.' end,
        v_data);
    when 'REJECTED' then
      perform private.notify(o.customer_id, 'customer', 'order_rejected', 'Order ' || o.order_no || ' was not accepted',
        coalesce(v_shop.name, 'The shop') || ': ' || coalesce(replace(o.reject_reason, '_', ' '), 'not available') || '. Try another shop.', v_data);
    when 'CANCELLED' then
      perform private.notify(v_shop.owner_id, 'partner', 'order_cancelled', 'Order ' || o.order_no || ' cancelled',
        'The customer cancelled this order.', v_shop_data);
    when 'EXPIRED' then
      if p_from = 'CONFIRMED' then
        perform private.notify(o.customer_id, 'customer', 'order_expired', 'Order ' || o.order_no || ' expired',
          'We did not receive your payment within 24 hours. Place the order again when you are ready.', v_data);
        perform private.notify(v_shop.owner_id, 'partner', 'order_expired', 'Order ' || o.order_no || ' expired',
          'The customer did not pay within 24 hours. No need to send it.', v_shop_data);
        return;
      end if;
      perform private.notify(o.customer_id, 'customer', 'order_expired', 'Order ' || o.order_no || ' expired',
        coalesce(v_shop.name, 'The shop') || ' did not respond in 2 hours. Try another shop nearby.', v_data);
      perform private.notify(v_shop.owner_id, 'partner', 'order_expired', 'You missed order ' || o.order_no,
        'It expired after 2 hours without a response.', v_shop_data);
    when 'PAID' then
      perform private.notify(o.customer_id, 'customer', 'order_paid', 'Payment received',
        coalesce(v_shop.name, 'The shop') || ' confirmed your payment of ' || v_total || '.', v_data);
    when 'PACKED' then
      perform private.notify(o.customer_id, 'customer', 'order_packed', 'Your order is packed 📦',
        'It will be sent out soon.', v_data);
    when 'DISPATCHED' then
      select * into v_d from public.dispatch_details where order_id = o.id;
      if o.fulfilment = 'pickup' then
        perform private.notify(o.customer_id, 'customer', 'order_dispatched', 'Ready for pickup 🛍️',
          'Collect your order from ' || coalesce(v_shop.name, 'the shop') || '. Tap "I received my order" after pickup.', v_data);
      else
        perform private.notify(o.customer_id, 'customer', 'order_dispatched', 'On the way! 🛵',
          coalesce(initcap(replace(v_d.service::text, '_', ' ')), 'Delivery')
            || coalesce(' · ' || v_d.rider_name, '')
            || coalesce(' · OTP ' || v_d.delivery_otp, '')
            || '. Tap "I received my order" when it arrives.', v_data);
      end if;
    when 'DELIVERED' then
      perform private.notify(v_shop.owner_id, 'partner', 'order_delivered', 'Order ' || o.order_no || ' delivered ✅',
        case when o.delivered_by = 'auto' then 'Marked delivered automatically after 72 hours.'
             else 'The customer confirmed they received it.' end, v_shop_data);
      if o.delivered_by = 'auto' then
        perform private.notify(o.customer_id, 'customer', 'order_delivered', 'Order ' || o.order_no || ' marked delivered',
          'If something is wrong, you can report a problem for 7 days.', v_data);
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

create or replace function private.order_json(p_order_id uuid, p_viewer text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  o public.orders;
  s public.shops;
  v_area text;
  v_show_upi boolean;
  v_phone text;
begin
  select * into o from public.orders where id = p_order_id;
  if o.id is null then return null; end if;
  select * into s from public.shops where id = o.shop_id;
  select name into v_area from public.areas where id = s.area_id;
  v_show_upi := o.status not in ('REQUESTED', 'REJECTED', 'CANCELLED', 'EXPIRED');

  -- The customer's phone is only revealed to the shop while the order is active.
  if p_viewer = 'admin'
     or (p_viewer = 'shop' and (o.status in ('REQUESTED', 'CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED')
                                or (o.status = 'ISSUE_REPORTED' and o.status_before_issue in ('CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED')))) then
    select phone into v_phone from public.users where id = o.customer_id;
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
    'payment_ref', o.payment_ref, 'payment_claimed_at', o.payment_claimed_at,
    'payment_rejected_reason', o.payment_rejected_reason,
    'pay_to', case when p_viewer <> 'shop' then jsonb_build_object(
      'upi_id', private.config('platform_upi_id'), 'upi_name', coalesce(private.config('platform_upi_name'), 'Gadget Galli')) end,
    'payout_status', case when p_viewer <> 'customer' then o.payout_status end,
    'payout_amount', case when p_viewer <> 'customer' then o.payout_amount end,
    'commission_amount', case when p_viewer <> 'customer' then o.commission_amount end,
    'payout_ref', case when p_viewer <> 'customer' then o.payout_ref end,
    'payout_at', case when p_viewer <> 'customer' then o.payout_at end
  );
end $$;

-- 4. Recording a payment (shared by the admin confirmation) -----------------------------------------------------
create or replace function private.record_payment(p_order_id uuid, p_method public.payment_method, p_amount numeric, p_txn_id text, p_proof_path text)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id;
  insert into public.payments_log (order_id, method, amount, upi_txn_id, proof_path, recorded_by)
  values (o.id, p_method, coalesce(p_amount, o.grand_total), nullif(btrim(p_txn_id), ''), p_proof_path, auth.uid());

  -- Sale is certain now: reduce tracked stock
  update public.shop_products sp
     set stock_qty = greatest(0, sp.stock_qty - x.qty)
    from (select (i->>'shop_product_id')::uuid as id, sum((i->>'qty')::int) as qty
            from jsonb_array_elements(o.items) i where i->>'shop_product_id' is not null group by 1) x
   where sp.id = x.id and sp.stock_qty is not null;
end $$;

-- Shops no longer mark orders paid: customers pay Gadget Galli, which confirms the payment.
create or replace function public.shop_mark_paid(
  p_order_id uuid, p_method public.payment_method default 'upi', p_amount numeric default null,
  p_txn_id text default null, p_proof_path text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  raise exception 'PAID_TO_GADGET_GALLI' using errcode = 'P0001';
end $$;

-- 5. Customer: "I've paid" with the UPI reference ----------------------------------------------------------------
create or replace function public.customer_submit_payment(p_order_id uuid, p_ref text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_user();
  o public.orders;
  v_ref text := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
  v_owner uuid;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null or o.customer_id <> v_uid then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if o.status <> 'CONFIRMED' then raise exception 'ORDER_NOT_AWAITING_PAYMENT' using errcode = 'P0001'; end if;
  if private.config('platform_upi_id') is null then raise exception 'PAYMENTS_NOT_SET_UP' using errcode = 'P0001'; end if;
  if length(v_ref) < 6 or length(v_ref) > 40 or v_ref !~ '^[A-Z0-9-]+$' then
    raise exception 'PAYMENT_REF_INVALID' using errcode = 'P0001';
  end if;
  perform private.hit_limit('submit_payment', 10, interval '1 day');
  update public.orders set payment_ref = v_ref, payment_claimed_at = now(), payment_rejected_reason = null where id = o.id;
  perform private.notify_admins('payment_claimed', 'Payment to verify · ' || o.order_no,
    '₹' || to_char(o.grand_total, 'FM99,99,99,999') || ' · UPI ref ' || v_ref,
    jsonb_build_object('order_id', o.id, 'url', '/payments'));
  select owner_id into v_owner from public.shops where id = o.shop_id;
  perform private.notify(v_owner, 'partner', 'payment_claimed', 'Customer paid · ' || o.order_no,
    'Gadget Galli is checking the payment. You will get a "Paid" alert to send the order.',
    jsonb_build_object('order_id', o.id, 'url', '/partner/order/' || o.id));
  return private.order_json(o.id, 'customer');
end $$;

-- 6. Admin: confirm or reject a payment --------------------------------------------------------------------------
create or replace function public.admin_confirm_payment(p_order_id uuid, p_ref text default null) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  o public.orders;
  v_ref text;
begin
  perform private.require_admin();
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if o.status <> 'CONFIRMED' then raise exception 'ORDER_NOT_AWAITING_PAYMENT' using errcode = 'P0001'; end if;
  v_ref := coalesce(nullif(upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g')), ''), o.payment_ref);
  perform private.set_order_status(o.id, 'PAID', 'admin',
    'Payment received by Gadget Galli' || coalesce(' · UPI ref ' || v_ref, ''),
    jsonb_build_object('method', 'upi', 'txn_id', v_ref, 'paid_to', 'gadget_galli'));
  update public.orders set payment_ref = v_ref where id = o.id;
  perform private.record_payment(o.id, 'upi', o.grand_total, v_ref, null);
  perform private.audit('confirm_payment', 'order', o.id::text, jsonb_build_object('ref', v_ref, 'amount', o.grand_total));
  return private.order_json(o.id, 'admin');
end $$;

create or replace function public.admin_reject_payment(p_order_id uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  o public.orders;
begin
  perform private.require_admin();
  if coalesce(btrim(p_reason), '') = '' then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if o.status <> 'CONFIRMED' or o.payment_claimed_at is null then raise exception 'PAYMENT_NOT_CLAIMED' using errcode = 'P0001'; end if;
  update public.orders set payment_claimed_at = null, payment_rejected_reason = btrim(p_reason) where id = o.id;
  perform private.notify(o.customer_id, 'customer', 'payment_not_found', 'Payment not found for ' || o.order_no,
    btrim(p_reason) || ' Please check your UPI app and enter the correct UPI reference.',
    jsonb_build_object('order_id', o.id, 'url', '/order/' || o.id));
  perform private.audit('reject_payment', 'order', o.id::text, jsonb_build_object('ref', o.payment_ref, 'reason', btrim(p_reason)));
  return private.order_json(o.id, 'admin');
end $$;

create or replace function public.admin_list_payments_to_verify() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'awaiting', (select count(*) from public.orders where status = 'CONFIRMED' and payment_claimed_at is null),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', o.id, 'order_no', o.order_no, 'grand_total', o.grand_total, 'payment_ref', o.payment_ref,
          'payment_claimed_at', o.payment_claimed_at, 'confirmed_at', o.confirmed_at, 'customer_name', o.customer_name,
          'customer_phone', u.phone, 'shop_name', s.name) order by o.payment_claimed_at)
        from public.orders o
        join public.shops s on s.id = o.shop_id
        left join public.users u on u.id = o.customer_id
       where o.status = 'CONFIRMED' and o.payment_claimed_at is not null), '[]'::jsonb));
end $$;

-- 7. Payouts -------------------------------------------------------------------------------------------------------
-- Reaching DELIVERED makes the shop's payout due; a reported problem holds it; a cancelled order has none.
create or replace function private.payout_on_status() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pct numeric;
begin
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
drop trigger if exists orders_payout on public.orders;
create trigger orders_payout before update of status on public.orders
  for each row execute function private.payout_on_status();

create or replace function public.admin_list_payouts(p_status text default 'due') returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_admin();
  if p_status = 'paid' then
    return coalesce((
      select jsonb_agg(x order by x.payout_at desc) from (
        select o.payout_ref, max(o.payout_at) as payout_at, s.id as shop_id, s.name as shop_name, s.upi_id,
               sum(o.payout_amount) as total, count(*) as order_count,
               jsonb_agg(jsonb_build_object('id', o.id, 'order_no', o.order_no, 'payout_amount', o.payout_amount) order by o.order_no) as orders
          from public.orders o join public.shops s on s.id = o.shop_id
         where o.payout_status = 'paid'
         group by o.payout_ref, s.id, s.name, s.upi_id
         order by max(o.payout_at) desc limit 100) x), '[]'::jsonb);
  end if;
  return coalesce((
    select jsonb_agg(x order by x.total desc) from (
      select s.id as shop_id, s.name as shop_name, s.upi_id, coalesce(s.upi_name, s.name) as upi_name, s.upi_qr_path,
             s.upi_verified, s.owner_phone, s.contact_phone, a.name as area,
             sum(o.payout_amount) as total, count(*) as order_count,
             jsonb_agg(jsonb_build_object('id', o.id, 'order_no', o.order_no, 'grand_total', o.grand_total,
               'commission_amount', o.commission_amount, 'payout_amount', o.payout_amount, 'delivered_at', o.delivered_at)
               order by o.delivered_at) as orders
        from public.orders o
        join public.shops s on s.id = o.shop_id
        left join public.areas a on a.id = s.area_id
       where o.payout_status = coalesce(p_status, 'due')
       group by s.id, a.name) x), '[]'::jsonb);
end $$;

create or replace function public.admin_mark_payouts_paid(p_order_ids uuid[], p_ref text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_ref text := upper(btrim(coalesce(p_ref, '')));
  v_shops int;
  v_shop uuid;
  v_total numeric;
  v_count int;
  v_owner uuid;
begin
  perform private.require_admin();
  if length(v_ref) < 4 then raise exception 'PAYOUT_REF_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce(array_length(p_order_ids, 1), 0) = 0 then raise exception 'NOTHING_TO_PAY' using errcode = 'P0001'; end if;
  select count(distinct shop_id), min(shop_id::text)::uuid, sum(payout_amount), count(*)
    into v_shops, v_shop, v_total, v_count
    from public.orders where id = any(p_order_ids) and payout_status = 'due';
  if v_count <> array_length(p_order_ids, 1) then raise exception 'PAYOUT_NOT_DUE' using errcode = 'P0001'; end if;
  if v_shops <> 1 then raise exception 'PAYOUTS_MIXED_SHOPS' using errcode = 'P0001'; end if;
  update public.orders set payout_status = 'paid', payout_ref = v_ref, payout_at = now(), payout_by = auth.uid()
   where id = any(p_order_ids);
  select owner_id into v_owner from public.shops where id = v_shop;
  perform private.notify(v_owner, 'partner', 'payout_paid', '₹' || to_char(v_total, 'FM99,99,99,999') || ' paid to you 💸',
    v_count || ' delivered order(s) · UPI ref ' || v_ref, jsonb_build_object('url', '/partner/payouts'));
  perform private.audit('mark_payouts_paid', 'shop', v_shop::text,
    jsonb_build_object('ref', v_ref, 'total', v_total, 'orders', to_jsonb(p_order_ids)));
  return jsonb_build_object('shop_id', v_shop, 'total', v_total, 'order_count', v_count, 'ref', v_ref);
end $$;

-- The shop's own payouts.
create or replace function public.shop_payouts() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_shop public.shops := private.my_first_shop();
begin
  perform private.require_user();
  if v_shop.id is null then raise exception 'NO_SHOP' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'upi_id', v_shop.upi_id,
    'due_total', (select coalesce(sum(payout_amount), 0) from public.orders where shop_id = v_shop.id and payout_status = 'due'),
    'due_count', (select count(*) from public.orders where shop_id = v_shop.id and payout_status = 'due'),
    'held_total', (select coalesce(sum(coalesce(payout_amount, grand_total)), 0) from public.orders where shop_id = v_shop.id and payout_status = 'held'),
    'paid_30d', (select coalesce(sum(payout_amount), 0) from public.orders where shop_id = v_shop.id and payout_status = 'paid' and payout_at > now() - interval '30 days'),
    'last_paid_at', (select max(payout_at) from public.orders where shop_id = v_shop.id and payout_status = 'paid'),
    'awaiting_payment', (select count(*) from public.orders where shop_id = v_shop.id and status in ('PAID', 'PACKED', 'DISPATCHED')),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'order_no', o.order_no, 'grand_total', o.grand_total,
          'commission_amount', o.commission_amount, 'payout_amount', o.payout_amount, 'payout_status', o.payout_status,
          'payout_ref', o.payout_ref, 'payout_at', o.payout_at, 'delivered_at', o.delivered_at)
          order by coalesce(o.payout_at, o.delivered_at) desc)
        from (select * from public.orders where shop_id = v_shop.id and payout_status <> 'not_due'
              order by coalesce(payout_at, delivered_at) desc limit 60) o), '[]'::jsonb));
end $$;

-- 8. Jobs: unpaid CONFIRMED orders expire after 24 hours ------------------------------------------------------
create or replace function public.run_order_jobs() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  v_expired int := 0;
  v_reminded int := 0;
  v_auto int := 0;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'ADMIN_ONLY' using errcode = '42501';
  end if;

  for r in select id from public.orders
           where status = 'CONFIRMED' and payment_claimed_at is null and confirmed_at < now() - interval '24 hours'
           order by confirmed_at for update skip locked loop
    perform private.set_order_status(r.id, 'EXPIRED', 'system', 'Not paid within 24 hours', '{}'::jsonb);
    v_expired := v_expired + 1;
  end loop;

  for r in select id from public.orders
           where status = 'REQUESTED' and requested_at < now() - interval '2 hours'
           order by requested_at for update skip locked loop
    perform private.set_order_status(r.id, 'EXPIRED', 'system', 'No response from the shop in 2 hours', '{}'::jsonb);
    v_expired := v_expired + 1;
  end loop;

  for r in select id, customer_id, order_no from public.orders
           where status = 'DISPATCHED' and dispatched_at < now() - interval '24 hours'
             and dispatched_at >= now() - interval '72 hours' and reminder_sent_at is null loop
    perform private.notify(r.customer_id, 'customer', 'receive_reminder', 'Did you get your order?',
      'Order ' || r.order_no || ' was dispatched a day ago. Tap "I received my order" once it arrives.',
      jsonb_build_object('order_id', r.id, 'url', '/order/' || r.id));
    update public.orders set reminder_sent_at = now() where id = r.id;
    v_reminded := v_reminded + 1;
  end loop;

  for r in select id from public.orders
           where status = 'DISPATCHED' and dispatched_at < now() - interval '72 hours'
           for update skip locked loop
    perform private.set_order_status(r.id, 'DELIVERED', 'system', 'Marked delivered automatically after 72 hours', '{}'::jsonb);
    v_auto := v_auto + 1;
  end loop;

  -- Retry pushes that did not go out (e.g. webhook was down)
  if exists (select 1 from public.notifications where push_status = 'pending' and created_at < now() - interval '1 minute') then
    perform private.post_push_webhook(jsonb_build_object('flush', true));
  end if;

  return jsonb_build_object('expired', v_expired, 'reminded', v_reminded, 'auto_delivered', v_auto);
end $$;

-- 9. Admin dashboard -----------------------------------------------------------------------------------------
create or replace function public.gg_stuck_reason(o public.orders) returns text
language sql stable as $$
  select case
    when o.status = 'REQUESTED' and o.requested_at < now() - interval '30 minutes' then 'Not confirmed in 30 min'
    when o.status = 'CONFIRMED' and o.payment_claimed_at < now() - interval '2 hours' then 'Payment not verified in 2 hrs'
    when o.status in ('PAID', 'PACKED') and o.paid_at < now() - interval '3 hours' then 'Paid but not dispatched in 3 hrs'
    when o.status = 'DISPATCHED' and o.dispatched_at < now() - interval '24 hours' then 'Dispatched but not delivered in 24 hrs'
    else null end;
$$;

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  perform private.require_admin();
  return jsonb_build_object(
    'shops_pending', (select count(*) from public.shops where status = 'under_review'),
    'shops_live', (select count(*) from public.shops where status = 'approved'),
    'issues_open', (select count(*) from public.issues where status <> 'resolved'),
    'stuck_orders', (select count(*) from public.orders o where public.gg_stuck_reason(o) is not null),
    'catalog_pending', (select count(*) from public.catalog_products where status = 'pending'),
    'orders_today', (select count(*) from public.orders where (requested_at at time zone 'Asia/Kolkata')::date = v_today),
    'delivered_today', (select count(*) from public.orders where status = 'DELIVERED' and (delivered_at at time zone 'Asia/Kolkata')::date = v_today),
    'gmv_today', (select coalesce(sum(grand_total), 0) from public.orders where paid_at is not null
                  and (paid_at at time zone 'Asia/Kolkata')::date = v_today and status not in ('REJECTED', 'CANCELLED', 'EXPIRED')),
    'customers', (select count(*) from public.users where role = 'customer' and deleted_at is null),
    'searches_today', (select count(*) from public.search_logs where (created_at at time zone 'Asia/Kolkata')::date = v_today),
    'payments_to_verify', (select count(*) from public.orders where status = 'CONFIRMED' and payment_claimed_at is not null),
    'payouts_due', (select coalesce(sum(payout_amount), 0) from public.orders where payout_status = 'due'),
    'payouts_due_count', (select count(distinct shop_id) from public.orders where payout_status = 'due'),
    'active_orders', (select count(*) from public.orders where status in ('REQUESTED', 'CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED'))
  );
end $$;


-- 10. Access: signed-in users only. New functions are executable by everyone by default, and a per-schema default
-- (0013) cannot remove that, so the global default is closed here and each new function is revoked explicitly.
alter default privileges revoke execute on functions from public;
revoke execute on function
  public.platform_payment_info(), public.admin_save_payment_settings(text, text, numeric),
  public.customer_submit_payment(uuid, text), public.admin_confirm_payment(uuid, text), public.admin_reject_payment(uuid, text),
  public.admin_list_payments_to_verify(), public.admin_list_payouts(text), public.admin_mark_payouts_paid(uuid[], text),
  public.shop_payouts()
from public;
grant execute on function
  public.platform_payment_info(), public.admin_save_payment_settings(text, text, numeric),
  public.customer_submit_payment(uuid, text), public.admin_confirm_payment(uuid, text), public.admin_reject_payment(uuid, text),
  public.admin_list_payments_to_verify(), public.admin_list_payouts(text), public.admin_mark_payouts_paid(uuid[], text),
  public.shop_payouts()
to authenticated, service_role;
revoke all on all functions in schema private from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all functions in schema private from anon, authenticated';
    execute 'revoke execute on function public.platform_payment_info(), public.admin_save_payment_settings(text, text, numeric), public.customer_submit_payment(uuid, text), public.admin_confirm_payment(uuid, text), public.admin_reject_payment(uuid, text), public.admin_list_payments_to_verify(), public.admin_list_payouts(text), public.admin_mark_payouts_paid(uuid[], text), public.shop_payouts() from anon';
  end if;
end $$;


-- 11. Re-pin search_path on the functions redefined above (see 0013)
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
