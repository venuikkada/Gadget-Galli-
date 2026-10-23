-- Gadget Galli: shops can add a bank account, and customers paying a shop see its UPI QR and bank details
-- from the moment the shop accepts (docs/DECISIONS.md #59). The money still goes straight to the shop (#57).

-- 1. The shop's bank account (private: the owner and admins read it; a customer only through their own order)
alter table public.shop_private
  add column if not exists bank_account_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_ifsc text,
  add column if not exists bank_name text,
  add column if not exists bank_verified boolean not null default false;

-- A changed account must be checked again before customers see it as checked (like the UPI ID)
create or replace function private.shop_private_before_write() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.bank_account_number is null then
    new.bank_verified := false;
  elsif tg_op = 'UPDATE'
        and (new.bank_account_name, new.bank_account_number, new.bank_ifsc) is distinct from (old.bank_account_name, old.bank_account_number, old.bank_ifsc)
        and not coalesce(current_setting('gg.admin_action', true), '') = 'on' then
    new.bank_verified := false;
  end if;
  return new;
end $$;
drop trigger if exists shop_private_before_write on public.shop_private;
create trigger shop_private_before_write before insert or update on public.shop_private
  for each row execute function private.shop_private_before_write();

-- The bank account as customers paying the shop see it, or null when the shop has none
create or replace function private.shop_bank(p_shop_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('account_name', sp.bank_account_name, 'account_number', sp.bank_account_number,
           'ifsc', sp.bank_ifsc, 'bank_name', sp.bank_name, 'verified', sp.bank_verified)
    from public.shop_private sp
   where sp.shop_id = p_shop_id and sp.bank_account_number is not null and sp.bank_ifsc is not null;
$$;

-- 2. Shops save it with their other details
create or replace function public.shop_upsert(p_patch jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  me public.users;
  s public.shops;
  p jsonb := coalesce(p_patch, '{}'::jsonb);
  v_acc_name text;
  v_acc_no text;
  v_ifsc text;
  v_bank text;
begin
  select * into me from public.users where id = v_uid;
  if p ? 'id' and p->>'id' is not null then
    s := private.require_shop_owner((p->>'id')::uuid);
  else
    select * into s from public.shops where owner_id = v_uid order by created_at limit 1;
  end if;

  if s.id is null then
    insert into public.shops (owner_id, owner_name, owner_phone, contact_phone, whatsapp_phone, hours)
    values (v_uid, me.name, me.phone, me.phone, me.phone,
            '{"mon":{"open":"10:00","close":"21:00"},"tue":{"open":"10:00","close":"21:00"},"wed":{"open":"10:00","close":"21:00"},"thu":{"open":"10:00","close":"21:00"},"fri":{"open":"10:00","close":"21:00"},"sat":{"open":"10:00","close":"21:00"},"sun":{"open":"10:00","close":"21:00","closed":true}}'::jsonb)
    returning * into s;
    update public.users set role = 'shop_owner' where id = v_uid;
  end if;

  if p ? 'contact_phone' and private.normalize_phone(p->>'contact_phone') !~ '^\+91[6-9][0-9]{9}$' then
    raise exception 'INVALID_PHONE: contact_phone' using errcode = 'P0001';
  end if;
  if p ? 'whatsapp_phone' and nullif(p->>'whatsapp_phone', '') is not null
     and private.normalize_phone(p->>'whatsapp_phone') !~ '^\+91[6-9][0-9]{9}$' then
    raise exception 'INVALID_PHONE: whatsapp_phone' using errcode = 'P0001';
  end if;
  if p ? 'upi_id' and nullif(p->>'upi_id', '') is not null
     and (p->>'upi_id') !~ '^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z][a-zA-Z0-9]{1,64}$' then
    raise exception 'INVALID_UPI_ID' using errcode = 'P0001';
  end if;

  update public.shops set
    name = case when p ? 'name' then nullif(btrim(p->>'name'), '') else name end,
    shop_types = case when p ? 'shop_types' then
                   coalesce((select array_agg(x::public.shop_type) from jsonb_array_elements_text(p->'shop_types') x), '{}')
                 else shop_types end,
    description = case when p ? 'description' then left(nullif(btrim(p->>'description'), ''), 600) else description end,
    hours = case when p ? 'hours' then coalesce(p->'hours', '{}'::jsonb) else hours end,
    weekly_holiday = case when p ? 'weekly_holiday' then nullif(p->>'weekly_holiday', '') else weekly_holiday end,
    owner_name = case when p ? 'owner_name' then nullif(btrim(p->>'owner_name'), '') else owner_name end,
    contact_phone = case when p ? 'contact_phone' then p->>'contact_phone' else contact_phone end,
    whatsapp_phone = case when p ? 'whatsapp_phone' then nullif(p->>'whatsapp_phone', '') else whatsapp_phone end,
    email = case when p ? 'email' then nullif(btrim(p->>'email'), '') else email end,
    address_line = case when p ? 'address_line' then nullif(btrim(p->>'address_line'), '') else address_line end,
    area_id = case when p ? 'area_id' then (p->>'area_id')::int else area_id end,
    pincode = case when p ? 'pincode' then nullif(p->>'pincode', '') else pincode end,
    landmark = case when p ? 'landmark' then nullif(btrim(p->>'landmark'), '') else landmark end,
    lat = case when p ? 'lat' then (p->>'lat')::double precision else lat end,
    lng = case when p ? 'lng' then (p->>'lng')::double precision else lng end,
    delivery_mode = case when p ? 'delivery_mode' then (p->>'delivery_mode')::public.delivery_mode else delivery_mode end,
    delivery_radius_km = case when p ? 'delivery_radius_km' then (p->>'delivery_radius_km')::numeric else delivery_radius_km end,
    delivery_charge_type = case when p ? 'delivery_charge_type' then (p->>'delivery_charge_type')::public.delivery_charge_type else delivery_charge_type end,
    delivery_charge = case when p ? 'delivery_charge' then coalesce((p->>'delivery_charge')::numeric, 0) else delivery_charge end,
    free_delivery_above = case when p ? 'free_delivery_above' then (p->>'free_delivery_above')::numeric else free_delivery_above end,
    min_order = case when p ? 'min_order' then coalesce((p->>'min_order')::numeric, 0) else min_order end,
    usual_delivery_mins = case when p ? 'usual_delivery_mins' then greatest(15, coalesce((p->>'usual_delivery_mins')::int, 120)) else usual_delivery_mins end,
    store_pickup = case when p ? 'store_pickup' then coalesce((p->>'store_pickup')::boolean, true) else store_pickup end,
    upi_id = case when p ? 'upi_id' then nullif(btrim(p->>'upi_id'), '') else upi_id end,
    upi_name = case when p ? 'upi_name' then nullif(btrim(p->>'upi_name'), '') else upi_name end,
    upi_qr_path = case when p ? 'upi_qr_path' then nullif(p->>'upi_qr_path', '') else upi_qr_path end,
    logo_path = case when p ? 'logo_path' then nullif(p->>'logo_path', '') else logo_path end,
    cover_path = case when p ? 'cover_path' then nullif(p->>'cover_path', '') else cover_path end,
    registration_step = case when p ? 'registration_step' then greatest(registration_step, (p->>'registration_step')::int) else registration_step end
  where id = s.id;

  if p ? 'gst_number' then
    insert into public.shop_private (shop_id, gst_number) values (s.id, upper(nullif(btrim(p->>'gst_number'), '')))
    on conflict (shop_id) do update set gst_number = excluded.gst_number, updated_at = now();
  end if;

  -- Bank account for customers who pay by bank transfer: all of it, or nothing to remove it
  if p ?| array['bank_account_name', 'bank_account_number', 'bank_ifsc', 'bank_name'] then
    v_acc_name := btrim(coalesce(p->>'bank_account_name', ''));
    v_acc_no := regexp_replace(coalesce(p->>'bank_account_number', ''), '\s', '', 'g');
    v_ifsc := upper(btrim(coalesce(p->>'bank_ifsc', '')));
    v_bank := btrim(coalesce(p->>'bank_name', ''));
    if v_acc_name = '' and v_acc_no = '' and v_ifsc = '' and v_bank = '' then
      insert into public.shop_private (shop_id) values (s.id)
      on conflict (shop_id) do update set bank_account_name = null, bank_account_number = null, bank_ifsc = null, bank_name = null,
        bank_verified = false, updated_at = now();
    else
      if v_acc_name = '' or length(v_acc_name) > 100 then raise exception 'INVALID_BANK_ACCOUNT_NAME' using errcode = 'P0001'; end if;
      if v_acc_no !~ '^[0-9]{9,18}$' then raise exception 'INVALID_BANK_ACCOUNT_NUMBER' using errcode = 'P0001'; end if;
      if v_ifsc !~ '^[A-Z]{4}0[A-Z0-9]{6}$' then raise exception 'INVALID_IFSC' using errcode = 'P0001'; end if;
      insert into public.shop_private (shop_id, bank_account_name, bank_account_number, bank_ifsc, bank_name)
      values (s.id, v_acc_name, v_acc_no, v_ifsc, nullif(left(v_bank, 80), ''))
      on conflict (shop_id) do update set bank_account_name = excluded.bank_account_name,
        bank_account_number = excluded.bank_account_number, bank_ifsc = excluded.bank_ifsc, bank_name = excluded.bank_name,
        updated_at = now();
    end if;
  end if;

  return private.shop_json(s.id);
end $$;

-- 3. The owner and admins see it with the shop
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
    'payment_terms', private.shop_payment_terms(s.id),
    'bank', private.shop_bank(s.id)
  )
  from public.shops s where s.id = p_shop_id;
$$;

-- 4. Approving a shop checks its bank account too; admins can also tick it by hand
create or replace function public.admin_review_shop(p_shop_id uuid, p_action text, p_reason text default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  s public.shops;
begin
  perform private.require_admin();
  select * into s from public.shops where id = p_shop_id for update;
  if s.id is null then raise exception 'SHOP_NOT_FOUND' using errcode = 'P0002'; end if;
  if p_action in ('reject', 'request_changes') and coalesce(btrim(p_reason), '') = '' then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  perform set_config('gg.admin_action', 'on', true);
  if p_action = 'approve' then
    update public.shops set status = 'approved', status_reason = null, approved_at = coalesce(approved_at, now()),
           upi_verified = upi_id is not null
     where id = s.id;
    update public.shop_private set bank_verified = bank_account_number is not null where shop_id = s.id;
    update public.shop_documents set status = 'accepted' where shop_id = s.id and status = 'submitted';
    perform private.notify(s.owner_id, 'partner', 'shop_approved', 'Your shop is live on Gadget Galli! 🎉',
      'Customers near you can now find ' || coalesce(s.name, 'your shop') || '. Add more products to get orders.',
      jsonb_build_object('shop_id', s.id, 'url', '/partner'));
  elsif p_action = 'reject' then
    update public.shops set status = 'rejected', status_reason = p_reason where id = s.id;
    perform private.notify(s.owner_id, 'partner', 'shop_rejected', 'Shop registration not approved',
      p_reason, jsonb_build_object('shop_id', s.id, 'url', '/partner/status'));
  elsif p_action = 'request_changes' then
    update public.shops set status = 'changes_requested', status_reason = p_reason where id = s.id;
    perform private.notify(s.owner_id, 'partner', 'shop_changes', 'Please update your shop details',
      p_reason, jsonb_build_object('shop_id', s.id, 'url', '/partner/status'));
  else
    raise exception 'INVALID_ACTION' using errcode = 'P0001';
  end if;
  perform private.audit('shop_' || p_action, 'shop', s.id::text, jsonb_build_object('reason', p_reason));
  return public.admin_get_shop(s.id);
end $$;

drop function if exists public.admin_set_shop_flags(uuid, boolean, boolean);
create or replace function public.admin_set_shop_flags(p_shop_id uuid, p_verified boolean default null, p_upi_verified boolean default null,
  p_bank_verified boolean default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_admin();
  perform set_config('gg.admin_action', 'on', true);
  update public.shops set verified = coalesce(p_verified, verified), upi_verified = coalesce(p_upi_verified, upi_verified)
   where id = p_shop_id;
  if p_bank_verified is not null then
    update public.shop_private set bank_verified = p_bank_verified and bank_account_number is not null where shop_id = p_shop_id;
  end if;
  perform private.audit('shop_flags', 'shop', p_shop_id::text,
    jsonb_build_object('verified', p_verified, 'upi_verified', p_upi_verified, 'bank_verified', p_bank_verified));
  return public.admin_get_shop(p_shop_id);
end $$;

-- 5. Customers paying a shop see its bank account next to its UPI ID
create or replace function private.order_json(p_order_id uuid, p_viewer text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  o public.orders;
  s public.shops;
  v_area text;
  v_phone text;
  v_pay_to jsonb;
  v_bank jsonb;
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

  -- Where the customer pays: the shop's UPI and bank account once it accepts (older orders: Gadget Galli)
  if p_viewer <> 'shop' then
    if o.payee = 'gadget_galli' then
      v_pay_to := private.payment_details() || jsonb_build_object('payee', 'gadget_galli');
    elsif p_viewer = 'admin' or o.status not in ('REQUESTED', 'REJECTED', 'CANCELLED', 'EXPIRED') then
      v_bank := private.shop_bank(s.id);
      v_pay_to := jsonb_build_object('payee', 'shop', 'upi_id', s.upi_id, 'upi_name', coalesce(s.upi_name, s.name),
        'qr_path', s.upi_qr_path, 'upi_verified', s.upi_verified, 'bank', v_bank, 'ready', s.upi_id is not null or v_bank is not null);
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

-- 6. Advance orders: the customer can pay the shop by bank transfer and enter the bank UTR
create or replace function public.customer_submit_payment(p_order_id uuid, p_ref text, p_method public.payment_method default 'upi') returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_user();
  o public.orders;
  s public.shops;
  v_ref text := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
  v_pay jsonb;
  v_bank jsonb;
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
    v_bank := private.shop_bank(s.id);
    if s.upi_id is null and v_bank is null then raise exception 'PAYMENTS_NOT_SET_UP' using errcode = 'P0001'; end if;
    if p_method is null or p_method not in ('upi', 'bank_transfer')
       or (p_method = 'upi' and s.upi_id is null) or (p_method = 'bank_transfer' and v_bank is null) then
      raise exception 'PAYMENT_METHOD_UNAVAILABLE' using errcode = 'P0001';
    end if;
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
      v_label || ' ' || v_ref || case when p_method = 'bank_transfer' then '. Check your bank account' else '. Check your UPI app' end
        || ', then tap "Payment received" and send it.',
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

-- 7. Access
revoke all on function private.shop_bank(uuid), private.shop_private_before_write() from public;
revoke execute on function public.admin_set_shop_flags(uuid, boolean, boolean, boolean) from public;
grant execute on function public.admin_set_shop_flags(uuid, boolean, boolean, boolean) to authenticated, service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all functions in schema private from anon, authenticated';
    execute 'revoke execute on function public.admin_set_shop_flags(uuid, boolean, boolean, boolean) from anon';
  end if;
end $$;
