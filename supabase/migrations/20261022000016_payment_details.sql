-- Gadget Galli · 0016 · payment details set in the web admin: UPI ID + QR image + bank account (docs/DECISIONS.md #52)
--   Customers pay Gadget Galli by UPI (app-made QR with the exact amount, the uploaded QR image, or the UPI button) or by
--   bank transfer (NEFT/IMPS), then enter the UPI reference or bank UTR. Payments are possible once either a UPI ID
--   or a complete bank account is saved (Admin -> Payments -> Settings). Before this, the live project had no UPI ID,
--   so nobody could pay.

-- 1. Orders remember how the customer says they paid --------------------------------------------------------------
alter table public.orders add column if not exists payment_method public.payment_method;

-- 2. Where customers pay ------------------------------------------------------------------------------------------
create or replace function private.payment_details() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with c as (
    select private.config('platform_upi_id') as upi_id,
           coalesce(private.config('platform_upi_name'), 'Gadget Galli') as upi_name,
           private.config('platform_upi_qr_path') as qr_path,
           private.config('platform_bank_account_name') as acc_name,
           private.config('platform_bank_account_number') as acc_no,
           private.config('platform_bank_ifsc') as ifsc,
           private.config('platform_bank_name') as bank_name
  )
  select jsonb_build_object(
    'upi_id', c.upi_id, 'upi_name', c.upi_name, 'qr_path', c.qr_path,
    'bank', case when c.acc_name is not null and c.acc_no is not null and c.ifsc is not null then jsonb_build_object(
      'account_name', c.acc_name, 'account_number', c.acc_no, 'ifsc', c.ifsc, 'bank_name', c.bank_name) end,
    'ready', c.upi_id is not null or (c.acc_name is not null and c.acc_no is not null and c.ifsc is not null))
  from c;
$$;

create or replace function public.platform_payment_info() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform private.require_user();
  return private.payment_details() || jsonb_build_object(
    'commission_pct', case when public.is_admin() then coalesce(private.config('commission_pct'), '0')::numeric end);
end $$;

-- 3. Saving them (super admin). Empty values clear a setting. -------------------------------------------------------
drop function if exists public.admin_save_payment_settings(text, text, numeric);
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

  insert into public.app_config (key, value) values
    ('platform_upi_id', v_upi),
    ('platform_upi_name', coalesce(nullif(v_upi_name, ''), 'Gadget Galli')),
    ('platform_upi_qr_path', v_qr),
    ('platform_bank_account_name', v_acc_name),
    ('platform_bank_account_number', v_acc_no),
    ('platform_bank_ifsc', v_ifsc),
    ('platform_bank_name', v_bank),
    ('commission_pct', v_pct::text)
  on conflict (key) do update set value = excluded.value;
  perform private.audit('save_payment_settings', 'app_config', 'payments', jsonb_build_object(
    'upi_id', nullif(v_upi, ''), 'qr', v_qr <> '', 'bank_ifsc', nullif(v_ifsc, ''),
    'bank_account_last4', nullif(right(v_acc_no, 4), ''), 'commission_pct', v_pct));
  return public.platform_payment_info();
end $$;

-- 4. Orders show customers every way to pay ------------------------------------------------------------------------
create or replace function private.order_json(p_order_id uuid, p_viewer text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
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
    'payment_method', o.payment_method,
    'pay_to', case when p_viewer <> 'shop' then private.payment_details() end,
    'payout_status', case when p_viewer <> 'customer' then o.payout_status end,
    'payout_amount', case when p_viewer <> 'customer' then o.payout_amount end,
    'commission_amount', case when p_viewer <> 'customer' then o.commission_amount end,
    'payout_ref', case when p_viewer <> 'customer' then o.payout_ref end,
    'payout_at', case when p_viewer <> 'customer' then o.payout_at end
  );
end $$;

-- 5. Customers say how they paid: UPI reference or bank UTR -----------------------------------------------------
drop function if exists public.customer_submit_payment(uuid, text);
create or replace function public.customer_submit_payment(p_order_id uuid, p_ref text, p_method public.payment_method default 'upi') returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_user();
  o public.orders;
  v_ref text := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
  v_owner uuid;
  v_pay jsonb := private.payment_details();
  v_label text := case when p_method = 'bank_transfer' then 'Bank UTR' else 'UPI ref' end;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null or o.customer_id <> v_uid then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if o.status <> 'CONFIRMED' then raise exception 'ORDER_NOT_AWAITING_PAYMENT' using errcode = 'P0001'; end if;
  if not (v_pay->>'ready')::boolean then raise exception 'PAYMENTS_NOT_SET_UP' using errcode = 'P0001'; end if;
  if p_method is null or p_method not in ('upi', 'bank_transfer')
     or (p_method = 'upi' and v_pay->>'upi_id' is null)
     or (p_method = 'bank_transfer' and v_pay->'bank' = 'null'::jsonb) then
    raise exception 'PAYMENT_METHOD_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if length(v_ref) < 6 or length(v_ref) > 40 or v_ref !~ '^[A-Z0-9-]+$' then
    raise exception 'PAYMENT_REF_INVALID' using errcode = 'P0001';
  end if;
  perform private.hit_limit('submit_payment', 10, interval '1 day');
  update public.orders set payment_ref = v_ref, payment_method = p_method, payment_claimed_at = now(), payment_rejected_reason = null
   where id = o.id;
  perform private.notify_admins('payment_claimed', 'Payment to verify · ' || o.order_no,
    '₹' || to_char(o.grand_total, 'FM99,99,99,999') || ' · ' || v_label || ' ' || v_ref,
    jsonb_build_object('order_id', o.id, 'order_no', o.order_no, 'amount', o.grand_total, 'method', p_method, 'url', '/payments'));
  select owner_id into v_owner from public.shops where id = o.shop_id;
  perform private.notify(v_owner, 'partner', 'payment_claimed', 'Customer paid · ' || o.order_no,
    'Gadget Galli is checking the payment. You will get a "Paid" alert to send the order.',
    jsonb_build_object('order_id', o.id, 'url', '/partner/order/' || o.id));
  return private.order_json(o.id, 'customer');
end $$;

-- 6. Confirming records the right method -------------------------------------------------------------------------
create or replace function public.admin_confirm_payment(p_order_id uuid, p_ref text default null) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  o public.orders;
  v_ref text;
  v_method public.payment_method;
begin
  perform private.require_admin();
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if o.status <> 'CONFIRMED' then raise exception 'ORDER_NOT_AWAITING_PAYMENT' using errcode = 'P0001'; end if;
  v_method := coalesce(o.payment_method, 'upi');
  v_ref := coalesce(nullif(upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g')), ''), o.payment_ref);
  perform private.set_order_status(o.id, 'PAID', 'admin',
    'Payment received by Gadget Galli' || coalesce(case when v_method = 'bank_transfer' then ' · Bank UTR ' else ' · UPI ref ' end || v_ref, ''),
    jsonb_build_object('method', v_method, 'txn_id', v_ref, 'paid_to', 'gadget_galli'));
  update public.orders set payment_ref = v_ref where id = o.id;
  perform private.record_payment(o.id, v_method, o.grand_total, v_ref, null);
  perform private.audit('confirm_payment', 'order', o.id::text, jsonb_build_object('ref', v_ref, 'amount', o.grand_total));
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
          'id', o.id, 'order_no', o.order_no, 'grand_total', o.grand_total, 'payment_ref', o.payment_ref, 'payment_method', o.payment_method,
          'payment_claimed_at', o.payment_claimed_at, 'confirmed_at', o.confirmed_at, 'customer_name', o.customer_name,
          'customer_phone', u.phone, 'shop_name', s.name) order by o.payment_claimed_at)
        from public.orders o
        join public.shops s on s.id = o.shop_id
        left join public.users u on u.id = o.customer_id
       where o.status = 'CONFIRMED' and o.payment_claimed_at is not null), '[]'::jsonb));
end $$;

-- 7. Access ------------------------------------------------------------------------------------------------------
revoke execute on function private.payment_details() from public;
revoke execute on function public.admin_save_payment_settings(jsonb), public.customer_submit_payment(uuid, text, public.payment_method) from public;
grant execute on function public.admin_save_payment_settings(jsonb), public.customer_submit_payment(uuid, text, public.payment_method)
  to authenticated, service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all functions in schema private from anon, authenticated';
    execute 'revoke execute on function public.admin_save_payment_settings(jsonb), public.customer_submit_payment(uuid, text, public.payment_method) from anon';
  end if;
end $$;

-- 8. Re-pin search_path on anything recreated without one (see 0013)
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
