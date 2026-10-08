-- Gadget Galli · 0005 · cart, orders, status workflow, reviews, issues
--
-- Orders are never written directly by apps: every change goes through these functions, which
-- check who is acting, allow only valid transitions, record an order_events row (time, who, note)
-- and notify the other side.

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create or replace function private.notify(
  p_user_id uuid, p_app text, p_kind text, p_title text, p_body text, p_data jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, app, kind, title, body, data, push_status)
  select p_user_id, p_app, p_kind, p_title, p_body, coalesce(p_data, '{}'::jsonb),
         case when p_app = 'admin' then 'skipped' else 'pending' end
  where p_user_id is not null;
$$;

create or replace function private.notify_admins(p_kind text, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, app, kind, title, body, data, push_status)
  select u.id, 'admin', p_kind, p_title, p_body, coalesce(p_data, '{}'::jsonb), 'skipped'
  from public.users u where u.admin_role is not null and not u.is_blocked;
$$;

-- ---------------------------------------------------------------------------
-- Status machine
-- ---------------------------------------------------------------------------
create or replace function private.allowed_transition(p_from public.order_status, p_to public.order_status, p_actor public.actor_role)
returns boolean
language sql immutable as $$
  select case
    when p_actor = 'admin' then p_from <> p_to
    when p_from = 'REQUESTED' then (p_to in ('CONFIRMED', 'REJECTED') and p_actor = 'shop')
                                or (p_to = 'CANCELLED' and p_actor = 'customer')
                                or (p_to = 'EXPIRED' and p_actor = 'system')
    when p_from = 'CONFIRMED' then (p_to in ('PAID', 'REJECTED') and p_actor = 'shop')
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
             else 'Pay ' || v_total || ' by UPI to the shop''s verified UPI ID.' end,
        v_data);
    when 'REJECTED' then
      perform private.notify(o.customer_id, 'customer', 'order_rejected', 'Order ' || o.order_no || ' was not accepted',
        coalesce(v_shop.name, 'The shop') || ': ' || coalesce(replace(o.reject_reason, '_', ' '), 'not available') || '. Try another shop.', v_data);
    when 'CANCELLED' then
      perform private.notify(v_shop.owner_id, 'partner', 'order_cancelled', 'Order ' || o.order_no || ' cancelled',
        'The customer cancelled this order.', v_shop_data);
    when 'EXPIRED' then
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

-- After a delivery: shop stats, "usually delivers in" average, referral conversion.
create or replace function private.after_delivered(o public.orders) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_avg int;
begin
  select round(avg(extract(epoch from (x.delivered_at - x.confirmed_at)) / 60))::int into v_avg
  from (
    select delivered_at, confirmed_at from public.orders
    where shop_id = o.shop_id and status in ('DELIVERED', 'ISSUE_REPORTED') and delivered_by = 'customer'
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
end $$;

create or replace function private.set_order_status(
  p_order_id uuid,
  p_to public.order_status,
  p_actor public.actor_role,
  p_note text default null,
  p_meta jsonb default '{}'::jsonb
) returns public.orders
language plpgsql security definer set search_path = public as $$
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
    paid_at = case when p_to = 'PAID' then now() else paid_at end,
    packed_at = case when p_to = 'PACKED' then now() else packed_at end,
    dispatched_at = case when p_to = 'DISPATCHED' then now() else dispatched_at end,
    delivered_at = case when p_to = 'DELIVERED' then coalesce(delivered_at, now()) else delivered_at end,
    rejected_at = case when p_to = 'REJECTED' then now() else rejected_at end,
    cancelled_at = case when p_to = 'CANCELLED' then now() else cancelled_at end,
    expired_at = case when p_to = 'EXPIRED' then now() else expired_at end,
    issue_reported_at = case when p_to = 'ISSUE_REPORTED' then now() else issue_reported_at end,
    delivered_by = case when p_to = 'DELIVERED' and delivered_at is null then
                     case p_actor when 'customer' then 'customer' when 'system' then 'auto' else 'admin' end
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

-- ---------------------------------------------------------------------------
-- Order JSON for the customer, the shop or an admin
-- ---------------------------------------------------------------------------
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
      'upi_id', case when v_show_upi or p_viewer <> 'customer' then s.upi_id end,
      'upi_name', case when v_show_upi or p_viewer <> 'customer' then coalesce(s.upi_name, s.name) end,
      'upi_qr_path', case when v_show_upi or p_viewer <> 'customer' then s.upi_qr_path end,
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
  );
end $$;

create or replace function public.get_order(p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  o public.orders;
  v_viewer text;
begin
  perform private.require_user();
  select * into o from public.orders where id = p_order_id;
  if o.id is null then return null; end if;
  if o.customer_id = auth.uid() then v_viewer := 'customer';
  elsif public.owns_shop(o.shop_id) then v_viewer := 'shop';
  elsif public.is_admin() then v_viewer := 'admin';
  else return null;
  end if;
  return private.order_json(o.id, v_viewer);
end $$;

-- ---------------------------------------------------------------------------
-- Cart
-- ---------------------------------------------------------------------------
create or replace function private.ensure_cart(p_uid uuid) returns public.carts
language plpgsql security definer set search_path = public as $$
declare
  c public.carts;
begin
  select * into c from public.carts where user_id = p_uid;
  if c.id is null then
    insert into public.carts (user_id) values (p_uid)
    on conflict (user_id) do update set updated_at = now()
    returning * into c;
  end if;
  return c;
end $$;

create or replace function public.get_cart() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  c public.carts;
  s public.shops;
  a public.addresses;
  v_items jsonb;
  v_item_total numeric := 0;
  v_inst numeric := 0;
  v_count int := 0;
  v_charge numeric := 0;
  v_km double precision;
  v_delivers boolean;
  v_problems text[] := '{}';
  v_unavailable int;
begin
  c := private.ensure_cart(v_uid);

  -- Default to the customer's default (or latest) address
  if c.address_id is null then
    select id into c.address_id from public.addresses where user_id = v_uid
    order by is_default desc, updated_at desc limit 1;
    if c.address_id is not null then
      update public.carts set address_id = c.address_id where id = c.id;
    end if;
  end if;
  select * into a from public.addresses where id = c.address_id and user_id = v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
      'shop_product_id', sp.id, 'catalog_product_id', p.id, 'name', p.name, 'brand', b.name, 'variant', p.variant,
      'condition', sp.condition, 'photo', coalesce(sp.photos[1], p.photos[1]), 'price', sp.price,
      'mrp', coalesce(sp.mrp, p.mrp), 'qty', ci.qty, 'in_stock', sp.in_stock and sp.is_active, 'stock_qty', sp.stock_qty,
      'with_installation', ci.with_installation and sp.installation_available,
      'installation_available', sp.installation_available, 'installation_charge', sp.installation_charge,
      'warranty_months', sp.warranty_months, 'category_id', p.category_id,
      'line_total', sp.price * ci.qty + case when ci.with_installation and sp.installation_available
                                             then coalesce(sp.installation_charge, 0) * ci.qty else 0 end
    ) order by ci.added_at), '[]'::jsonb),
    coalesce(sum(sp.price * ci.qty) filter (where sp.in_stock and sp.is_active), 0),
    coalesce(sum(case when ci.with_installation and sp.installation_available then coalesce(sp.installation_charge, 0) * ci.qty else 0 end)
             filter (where sp.in_stock and sp.is_active), 0),
    coalesce(sum(ci.qty), 0),
    count(*) filter (where not (sp.in_stock and sp.is_active) or (sp.stock_qty is not null and ci.qty > sp.stock_qty))
  into v_items, v_item_total, v_inst, v_count, v_unavailable
  from public.cart_items ci
  join public.shop_products sp on sp.id = ci.shop_product_id
  join public.catalog_products p on p.id = sp.catalog_product_id
  left join public.brands b on b.id = p.brand_id
  where ci.cart_id = c.id;

  if v_count = 0 then
    if c.shop_id is not null then update public.carts set shop_id = null where id = c.id; end if;
    return jsonb_build_object(
      'cart', jsonb_build_object('id', c.id, 'shop_id', null, 'fulfilment', c.fulfilment, 'address_id', c.address_id, 'note', c.note),
      'shop', null, 'items', '[]'::jsonb,
      'address', case when a.id is null then null else to_jsonb(a) end,
      'totals', jsonb_build_object('item_count', 0, 'item_total', 0, 'installation_total', 0, 'delivery_charge', 0, 'grand_total', 0, 'min_order_gap', 0),
      'problems', '[]'::jsonb);
  end if;

  select * into s from public.shops where id = c.shop_id;
  if s.status <> 'approved' then v_problems := v_problems || 'SHOP_UNAVAILABLE'::text; end if;
  if not public.gg_shop_open_now(s.hours, s.is_open) then v_problems := v_problems || 'SHOP_CLOSED'::text; end if;
  if v_unavailable > 0 then v_problems := v_problems || 'ITEM_UNAVAILABLE'::text; end if;

  if c.fulfilment = 'pickup' then
    if not s.store_pickup then v_problems := v_problems || 'PICKUP_NOT_AVAILABLE'::text; end if;
  else
    if a.id is null then
      v_problems := v_problems || 'ADDRESS_REQUIRED'::text;
    else
      v_km := public.gg_distance_km(s.lat, s.lng, a.lat, a.lng);
      v_delivers := public.shop_delivers_to(s.id, a.area_id, a.lat, a.lng);
      if not v_delivers then v_problems := v_problems || 'AREA_NOT_SERVED'::text; end if;
      v_charge := public.gg_delivery_charge(s.delivery_charge_type, s.delivery_charge, s.free_delivery_above, v_km, v_item_total);
    end if;
    if v_item_total < s.min_order then v_problems := v_problems || 'MIN_ORDER_NOT_MET'::text; end if;
  end if;

  return jsonb_build_object(
    'cart', jsonb_build_object('id', c.id, 'shop_id', c.shop_id, 'fulfilment', c.fulfilment, 'address_id', c.address_id, 'note', c.note),
    'shop', jsonb_build_object(
      'id', s.id, 'name', s.name, 'slug', s.slug, 'area', (select name from public.areas where id = s.area_id),
      'logo_path', s.logo_path, 'contact_phone', s.contact_phone, 'whatsapp_phone', coalesce(s.whatsapp_phone, s.contact_phone),
      'store_pickup', s.store_pickup, 'min_order', s.min_order, 'is_open_now', public.gg_shop_open_now(s.hours, s.is_open),
      'charge_type', s.delivery_charge_type, 'charge', s.delivery_charge, 'free_above', s.free_delivery_above,
      'delivery_mins', public.gg_shop_delivery_mins(s.avg_delivery_mins, s.usual_delivery_mins),
      'address_line', s.address_line, 'lat', s.lat, 'lng', s.lng, 'verified', s.verified,
      'upi_verified', s.upi_verified, 'delivers_to_address', v_delivers, 'distance_km', round(v_km::numeric, 1)),
    'items', v_items,
    'address', case when a.id is null then null else to_jsonb(a) end,
    'totals', jsonb_build_object(
      'item_count', v_count, 'item_total', v_item_total, 'installation_total', v_inst,
      'delivery_charge', case when c.fulfilment = 'pickup' then 0 else v_charge end,
      'grand_total', v_item_total + v_inst + case when c.fulfilment = 'pickup' then 0 else v_charge end,
      'min_order_gap', greatest(0, case when c.fulfilment = 'pickup' then 0 else s.min_order - v_item_total end)),
    'problems', to_jsonb(v_problems));
end $$;

-- Adds a listing to the cart. Different shop -> {status:'conflict'} unless p_replace.
create or replace function public.cart_add(p_shop_product_id uuid, p_qty int default 1, p_replace boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  c public.carts;
  sp public.shop_products;
  v_shop public.shops;
  v_existing int;
begin
  select * into sp from public.shop_products where id = p_shop_product_id;
  select * into v_shop from public.shops where id = sp.shop_id;
  if sp.id is null or not sp.is_active or v_shop.status <> 'approved' then
    raise exception 'ITEM_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if not sp.in_stock then
    raise exception 'OUT_OF_STOCK' using errcode = 'P0001';
  end if;
  c := private.ensure_cart(v_uid);
  select count(*) into v_existing from public.cart_items where cart_id = c.id;

  if v_existing > 0 and c.shop_id is not null and c.shop_id <> sp.shop_id then
    if not p_replace then
      return jsonb_build_object('status', 'conflict',
        'current_shop', (select jsonb_build_object('id', id, 'name', name) from public.shops where id = c.shop_id),
        'new_shop', jsonb_build_object('id', v_shop.id, 'name', v_shop.name));
    end if;
    delete from public.cart_items where cart_id = c.id;
    update public.carts set note = null where id = c.id;
  end if;

  update public.carts set shop_id = sp.shop_id, updated_at = now(),
         fulfilment = case when v_existing = 0 or c.shop_id <> sp.shop_id then 'delivery' else fulfilment end
   where id = c.id;
  insert into public.cart_items (cart_id, shop_product_id, qty)
  values (c.id, sp.id, least(greatest(coalesce(p_qty, 1), 1), coalesce(sp.stock_qty, 99), 99))
  on conflict (cart_id, shop_product_id)
  do update set qty = least(public.cart_items.qty + greatest(coalesce(p_qty, 1), 1), coalesce(sp.stock_qty, 99), 99);

  return jsonb_build_object('status', 'ok', 'cart', public.get_cart());
end $$;

create or replace function public.cart_set_qty(p_shop_product_id uuid, p_qty int) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  c public.carts := private.ensure_cart(v_uid);
begin
  if coalesce(p_qty, 0) <= 0 then
    delete from public.cart_items where cart_id = c.id and shop_product_id = p_shop_product_id;
  else
    update public.cart_items ci set qty = least(p_qty, 99,
             coalesce((select stock_qty from public.shop_products where id = p_shop_product_id), 99))
     where cart_id = c.id and shop_product_id = p_shop_product_id;
  end if;
  update public.carts set updated_at = now() where id = c.id;
  return public.get_cart();
end $$;

-- patch keys: fulfilment ('delivery'|'pickup'), address_id, note, installation {shop_product_id: bool}
create or replace function public.cart_update(p_patch jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  c public.carts := private.ensure_cart(v_uid);
  k text;
  v jsonb;
begin
  if p_patch ? 'fulfilment' then
    update public.carts set fulfilment = (p_patch->>'fulfilment')::public.fulfilment_type where id = c.id;
  end if;
  if p_patch ? 'address_id' then
    if p_patch->>'address_id' is not null and not exists (
      select 1 from public.addresses where id = (p_patch->>'address_id')::uuid and user_id = v_uid) then
      raise exception 'ADDRESS_NOT_FOUND' using errcode = 'P0001';
    end if;
    update public.carts set address_id = (p_patch->>'address_id')::uuid where id = c.id;
  end if;
  if p_patch ? 'note' then
    update public.carts set note = left(nullif(btrim(p_patch->>'note'), ''), 500) where id = c.id;
  end if;
  if jsonb_typeof(p_patch->'installation') = 'object' then
    for k, v in select * from jsonb_each(p_patch->'installation') loop
      update public.cart_items set with_installation = (v #>> '{}')::boolean
       where cart_id = c.id and shop_product_id = k::uuid;
    end loop;
  end if;
  update public.carts set updated_at = now() where id = c.id;
  return public.get_cart();
end $$;

create or replace function public.cart_clear() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  c public.carts := private.ensure_cart(v_uid);
begin
  delete from public.cart_items where cart_id = c.id;
  update public.carts set shop_id = null, note = null, updated_at = now() where id = c.id;
  return public.get_cart();
end $$;

-- ---------------------------------------------------------------------------
-- Place order: creates REQUESTED with a snapshot of items, prices and address
-- ---------------------------------------------------------------------------
create or replace function public.place_order(p_contact_method public.contact_method) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_user public.users;
  c public.carts;
  s public.shops;
  a public.addresses;
  v_items jsonb;
  v_item_total numeric;
  v_inst numeric;
  v_bad text;
  v_km double precision;
  v_charge numeric := 0;
  v_order_no text;
  o public.orders;
  v_address jsonb;
begin
  select * into v_user from public.users where id = v_uid;
  select * into c from public.carts where user_id = v_uid for update;
  if c.id is null or not exists (select 1 from public.cart_items where cart_id = c.id) then
    raise exception 'CART_EMPTY' using errcode = 'P0001';
  end if;
  if (select count(*) from public.orders where customer_id = v_uid and status = 'REQUESTED') >= 5 then
    raise exception 'TOO_MANY_PENDING_ORDERS' using errcode = 'P0001';
  end if;

  select * into s from public.shops where id = c.shop_id;
  if s.id is null or s.status <> 'approved' then
    raise exception 'SHOP_UNAVAILABLE' using errcode = 'P0001';
  end if;
  select p.name into v_bad
  from public.cart_items ci
  join public.shop_products sp on sp.id = ci.shop_product_id
  join public.catalog_products p on p.id = sp.catalog_product_id
  where ci.cart_id = c.id
    and (not sp.is_active or not sp.in_stock or sp.shop_id <> s.id or (sp.stock_qty is not null and ci.qty > sp.stock_qty))
  limit 1;
  if v_bad is not null then
    raise exception 'ITEM_UNAVAILABLE: %', v_bad using errcode = 'P0001';
  end if;

  select jsonb_agg(jsonb_build_object(
      'shop_product_id', sp.id, 'catalog_product_id', p.id, 'name', p.name, 'brand', b.name,
      'variant', p.variant, 'condition', sp.condition, 'price', sp.price, 'mrp', coalesce(sp.mrp, p.mrp),
      'qty', ci.qty, 'photo', coalesce(sp.photos[1], p.photos[1]), 'warranty_months', sp.warranty_months,
      'with_installation', ci.with_installation and sp.installation_available,
      'installation_charge', case when ci.with_installation and sp.installation_available then sp.installation_charge end,
      'line_total', sp.price * ci.qty + case when ci.with_installation and sp.installation_available
                                             then coalesce(sp.installation_charge, 0) * ci.qty else 0 end
    ) order by ci.added_at),
    sum(sp.price * ci.qty),
    sum(case when ci.with_installation and sp.installation_available then coalesce(sp.installation_charge, 0) * ci.qty else 0 end)
  into v_items, v_item_total, v_inst
  from public.cart_items ci
  join public.shop_products sp on sp.id = ci.shop_product_id
  join public.catalog_products p on p.id = sp.catalog_product_id
  left join public.brands b on b.id = p.brand_id
  where ci.cart_id = c.id;

  if c.fulfilment = 'pickup' then
    if not s.store_pickup then
      raise exception 'PICKUP_NOT_AVAILABLE' using errcode = 'P0001';
    end if;
  else
    select * into a from public.addresses where id = c.address_id and user_id = v_uid;
    if a.id is null then
      raise exception 'ADDRESS_REQUIRED' using errcode = 'P0001';
    end if;
    if not public.shop_delivers_to(s.id, a.area_id, a.lat, a.lng) then
      raise exception 'AREA_NOT_SERVED' using errcode = 'P0001';
    end if;
    if v_item_total < s.min_order then
      raise exception 'MIN_ORDER_NOT_MET' using errcode = 'P0001';
    end if;
    v_km := public.gg_distance_km(s.lat, s.lng, a.lat, a.lng);
    v_charge := public.gg_delivery_charge(s.delivery_charge_type, s.delivery_charge, s.free_delivery_above, v_km, v_item_total);
    v_address := jsonb_build_object(
      'name', coalesce(a.contact_name, v_user.name), 'label', a.label, 'house', a.house, 'building', a.building,
      'street', a.street, 'landmark', a.landmark, 'area', coalesce(a.area_name, (select name from public.areas where id = a.area_id)),
      'pincode', a.pincode, 'lat', a.lat, 'lng', a.lng);
  end if;

  -- Checked last: closing time is temporary, the problems above are not
  if not public.gg_shop_open_now(s.hours, s.is_open) then
    raise exception 'SHOP_CLOSED' using errcode = 'P0001';
  end if;

  v_order_no := 'GG-' || to_char(now() at time zone 'Asia/Kolkata', 'YY') || '-' || lpad(nextval('public.order_no_seq')::text, 6, '0');

  insert into public.orders (
    order_no, customer_id, shop_id, status, contact_method, fulfilment, items, item_total, installation_total,
    delivery_charge, grand_total, customer_name, address, area_id, distance_km, note, shop_snapshot
  ) values (
    v_order_no, v_uid, s.id, 'REQUESTED', p_contact_method, c.fulfilment, v_items, v_item_total, v_inst,
    v_charge, v_item_total + v_inst + v_charge, v_user.name, v_address, a.area_id, round(v_km::numeric, 2), c.note,
    jsonb_build_object('name', s.name, 'contact_phone', s.contact_phone, 'whatsapp_phone', s.whatsapp_phone,
                       'upi_id', s.upi_id, 'address_line', s.address_line)
  ) returning * into o;

  insert into public.order_events (order_id, from_status, to_status, actor_id, actor_role, note, meta)
  values (o.id, null, 'REQUESTED', v_uid, 'customer',
          case when p_contact_method = 'call' then 'Customer is calling the shop' else 'Customer sent the order on WhatsApp' end,
          jsonb_build_object('contact_method', p_contact_method));

  perform private.order_notify(o, null, 'customer');

  insert into public.shop_stats_daily (shop_id, day, call_taps, whatsapp_taps)
  values (s.id, (now() at time zone 'Asia/Kolkata')::date,
          case when p_contact_method = 'call' then 1 else 0 end, case when p_contact_method = 'whatsapp' then 1 else 0 end)
  on conflict (shop_id, day) do update
    set call_taps = public.shop_stats_daily.call_taps + excluded.call_taps,
        whatsapp_taps = public.shop_stats_daily.whatsapp_taps + excluded.whatsapp_taps;

  update public.catalog_products p set popularity = popularity + 3
   where p.id in (select (i->>'catalog_product_id')::uuid from jsonb_array_elements(v_items) i);

  delete from public.cart_items where cart_id = c.id;
  update public.carts set shop_id = null, note = null, updated_at = now() where id = c.id;

  return private.order_json(o.id, 'customer');
end $$;

-- ---------------------------------------------------------------------------
-- Shop steps
-- ---------------------------------------------------------------------------
create or replace function private.lock_shop_order(p_order_id uuid) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  perform private.require_shop_owner(o.shop_id);
  return o;
end $$;

-- Accept and confirm. p_items (optional) replaces the items as agreed on the call:
-- [{shop_product_id?, name?, qty, price, with_installation?, installation_charge?}]
create or replace function public.shop_confirm_order(
  p_order_id uuid, p_items jsonb default null, p_delivery_charge numeric default null, p_note text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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

  update public.orders set
    items = v_new, item_total = v_item_total, installation_total = v_inst_total,
    delivery_charge = v_charge, grand_total = v_item_total + v_inst_total + v_charge,
    updated_by_shop = v_changed
  where id = o.id;

  perform private.set_order_status(o.id, 'CONFIRMED', 'shop',
    coalesce(nullif(btrim(p_note), ''), case when v_changed then 'Shop updated the order after the call' else 'Confirmed on call' end),
    jsonb_build_object('updated', v_changed));
  return private.order_json(o.id, 'shop');
end $$;

create or replace function public.shop_reject_order(p_order_id uuid, p_reason text, p_note text default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders := private.lock_shop_order(p_order_id);
begin
  update public.orders set reject_reason = coalesce(nullif(p_reason, ''), 'other') where id = o.id;
  perform private.set_order_status(o.id, 'REJECTED', 'shop', coalesce(p_note, replace(p_reason, '_', ' ')),
                                   jsonb_build_object('reason', p_reason));
  return private.order_json(o.id, 'shop');
end $$;

create or replace function public.shop_mark_paid(
  p_order_id uuid, p_method public.payment_method default 'upi', p_amount numeric default null,
  p_txn_id text default null, p_proof_path text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders := private.lock_shop_order(p_order_id);
begin
  perform private.set_order_status(o.id, 'PAID', 'shop',
    'Payment received by ' || case p_method::text when 'upi' then 'UPI' else replace(p_method::text, '_', ' ') end || coalesce(' · Txn ' || nullif(btrim(p_txn_id), ''), ''),
    jsonb_build_object('method', p_method, 'txn_id', p_txn_id));
  insert into public.payments_log (order_id, method, amount, upi_txn_id, proof_path, recorded_by)
  values (o.id, p_method, coalesce(p_amount, o.grand_total), nullif(btrim(p_txn_id), ''), p_proof_path, auth.uid());

  -- Sale is certain now: reduce tracked stock
  update public.shop_products sp
     set stock_qty = greatest(0, sp.stock_qty - x.qty)
    from (select (i->>'shop_product_id')::uuid as id, sum((i->>'qty')::int) as qty
            from jsonb_array_elements(o.items) i where i->>'shop_product_id' is not null group by 1) x
   where sp.id = x.id and sp.stock_qty is not null;
  return private.order_json(o.id, 'shop');
end $$;

create or replace function public.shop_mark_packed(p_order_id uuid, p_pack_photo text default null, p_bill_photo text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders := private.lock_shop_order(p_order_id);
begin
  update public.orders set pack_photo_path = coalesce(p_pack_photo, pack_photo_path),
                           bill_photo_path = coalesce(p_bill_photo, bill_photo_path)
   where id = o.id;
  perform private.set_order_status(o.id, 'PACKED', 'shop', 'Packed', '{}'::jsonb);
  return private.order_json(o.id, 'shop');
end $$;

-- p_details: {service, rider_name, rider_phone, vehicle_no, tracking_url, delivery_otp, eta, package_photo_path}
create or replace function public.shop_dispatch_order(p_order_id uuid, p_details jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders := private.lock_shop_order(p_order_id);
  d jsonb := coalesce(p_details, '{}'::jsonb);
  v_service public.delivery_service;
begin
  v_service := case when o.fulfilment = 'pickup' then 'store_pickup'
                    else coalesce(nullif(d->>'service', ''), 'own')::public.delivery_service end;
  if o.fulfilment = 'delivery' and v_service = 'store_pickup' then
    raise exception 'SERVICE_REQUIRED' using errcode = 'P0001';
  end if;
  insert into public.dispatch_details (order_id, service, rider_name, rider_phone, vehicle_no, tracking_url, delivery_otp, eta, package_photo_path)
  values (o.id, v_service, nullif(btrim(d->>'rider_name'), ''),
          coalesce(private.normalize_phone(nullif(d->>'rider_phone', '')), nullif(d->>'rider_phone', '')),
          upper(nullif(btrim(d->>'vehicle_no'), '')), nullif(btrim(d->>'tracking_url'), ''),
          nullif(btrim(d->>'delivery_otp'), ''), nullif(d->>'eta', '')::timestamptz,
          coalesce(nullif(d->>'package_photo_path', ''), o.pack_photo_path))
  on conflict (order_id) do update set
    service = excluded.service, rider_name = excluded.rider_name, rider_phone = excluded.rider_phone,
    vehicle_no = excluded.vehicle_no, tracking_url = excluded.tracking_url, delivery_otp = excluded.delivery_otp,
    eta = excluded.eta, package_photo_path = excluded.package_photo_path, updated_at = now();
  perform private.set_order_status(o.id, 'DISPATCHED', 'shop',
    case when v_service = 'store_pickup' then 'Ready for pickup'
         else 'Sent via ' || initcap(replace(v_service::text, '_', ' ')) || coalesce(' · ' || nullif(btrim(d->>'rider_name'), ''), '') end,
    jsonb_build_object('service', v_service));
  return private.order_json(o.id, 'shop');
end $$;

-- Update rider/tracking details after dispatch (e.g. Porter reassigns a rider).
create or replace function public.shop_update_dispatch(p_order_id uuid, p_details jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders := private.lock_shop_order(p_order_id);
  d jsonb := coalesce(p_details, '{}'::jsonb);
begin
  if o.status <> 'DISPATCHED' then raise exception 'NOT_DISPATCHED' using errcode = 'P0001'; end if;
  update public.dispatch_details set
    rider_name = coalesce(nullif(btrim(d->>'rider_name'), ''), rider_name),
    rider_phone = coalesce(private.normalize_phone(nullif(d->>'rider_phone', '')), rider_phone),
    vehicle_no = coalesce(upper(nullif(btrim(d->>'vehicle_no'), '')), vehicle_no),
    tracking_url = coalesce(nullif(btrim(d->>'tracking_url'), ''), tracking_url),
    delivery_otp = coalesce(nullif(btrim(d->>'delivery_otp'), ''), delivery_otp),
    eta = coalesce(nullif(d->>'eta', '')::timestamptz, eta),
    updated_at = now()
  where order_id = o.id;
  perform private.notify(o.customer_id, 'customer', 'dispatch_updated', 'Delivery details updated',
    'Order ' || o.order_no || ': the shop updated rider / tracking details.',
    jsonb_build_object('order_id', o.id, 'url', '/order/' || o.id));
  return private.order_json(o.id, 'shop');
end $$;

-- ---------------------------------------------------------------------------
-- Customer steps
-- ---------------------------------------------------------------------------
create or replace function private.lock_customer_order(p_order_id uuid) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  v_uid uuid := private.require_user();
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null or o.customer_id <> v_uid then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  return o;
end $$;

create or replace function public.customer_cancel_order(p_order_id uuid, p_reason text default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders := private.lock_customer_order(p_order_id);
begin
  update public.orders set cancel_reason = left(nullif(btrim(p_reason), ''), 300) where id = o.id;
  perform private.set_order_status(o.id, 'CANCELLED', 'customer', coalesce(nullif(btrim(p_reason), ''), 'Cancelled by customer'), '{}'::jsonb);
  return private.order_json(o.id, 'customer');
end $$;

create or replace function public.customer_mark_received(p_order_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders := private.lock_customer_order(p_order_id);
begin
  perform private.set_order_status(o.id, 'DELIVERED', 'customer', 'Customer received the order', '{}'::jsonb);
  return private.order_json(o.id, 'customer');
end $$;

create or replace function public.submit_review(p_order_id uuid, p_rating int, p_body text default null, p_photos text[] default '{}')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders := private.lock_customer_order(p_order_id);
  r public.reviews;
begin
  if not (o.status = 'DELIVERED' or (o.status = 'ISSUE_REPORTED' and o.status_before_issue = 'DELIVERED')) then
    raise exception 'REVIEW_AFTER_DELIVERY' using errcode = 'P0001';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'INVALID_RATING' using errcode = 'P0001';
  end if;
  insert into public.reviews (order_id, shop_id, customer_id, customer_name, rating, body, photos)
  values (o.id, o.shop_id, o.customer_id, split_part(coalesce(o.customer_name, 'Customer'), ' ', 1), p_rating,
          left(nullif(btrim(p_body), ''), 2000), coalesce(p_photos[1:5], '{}'))
  on conflict (order_id) do update set rating = excluded.rating, body = excluded.body, photos = excluded.photos
  returning * into r;

  update public.shops s set
    rating_avg = coalesce((select round(avg(rating)::numeric, 1) from public.reviews where shop_id = s.id and not is_hidden), 0),
    rating_count = (select count(*) from public.reviews where shop_id = s.id and not is_hidden)
  where s.id = o.shop_id;

  perform private.notify((select owner_id from public.shops where id = o.shop_id), 'partner', 'new_review',
    'New ' || p_rating || '★ review', coalesce(left(p_body, 120), 'Order ' || o.order_no),
    jsonb_build_object('review_id', r.id, 'order_id', o.id, 'url', '/partner/reviews'));
  return to_jsonb(r);
end $$;

create or replace function public.shop_reply_review(p_review_id uuid, p_reply text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r public.reviews;
begin
  select * into r from public.reviews where id = p_review_id;
  if r.id is null then raise exception 'REVIEW_NOT_FOUND' using errcode = 'P0002'; end if;
  perform private.require_shop_owner(r.shop_id);
  update public.reviews set shop_reply = left(nullif(btrim(p_reply), ''), 1000), shop_replied_at = now()
   where id = r.id returning * into r;
  perform private.notify(r.customer_id, 'customer', 'review_reply', 'The shop replied to your review',
    left(coalesce(p_reply, ''), 140), jsonb_build_object('review_id', r.id, 'order_id', r.order_id, 'url', '/order/' || r.order_id));
  return to_jsonb(r);
end $$;

create or replace function public.report_issue(p_order_id uuid, p_type public.issue_type, p_description text default null, p_photos text[] default '{}')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders := private.lock_customer_order(p_order_id);
  v_eff public.order_status := case when o.status = 'ISSUE_REPORTED' then o.status_before_issue else o.status end;
  i public.issues;
begin
  if v_eff not in ('CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED', 'DELIVERED') then
    raise exception 'CANNOT_REPORT_NOW' using errcode = 'P0001';
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

-- ---------------------------------------------------------------------------
-- Order lists
-- ---------------------------------------------------------------------------
create or replace function private.order_card(o public.orders) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id, 'order_no', o.order_no, 'status', o.status, 'status_before_issue', o.status_before_issue,
    'fulfilment', o.fulfilment, 'contact_method', o.contact_method, 'grand_total', o.grand_total,
    'item_count', (select coalesce(sum((i->>'qty')::int), 0) from jsonb_array_elements(o.items) i),
    'first_item', o.items->0->>'name', 'first_photo', o.items->0->>'photo',
    'customer_name', o.customer_name, 'area', o.address->>'area', 'distance_km', o.distance_km, 'note', o.note,
    'shop_id', o.shop_id, 'shop_name', s.name, 'shop_logo', s.logo_path,
    'requested_at', o.requested_at, 'updated_at', o.updated_at, 'delivered_at', o.delivered_at,
    'has_review', exists (select 1 from public.reviews r where r.order_id = o.id))
  from public.shops s where s.id = o.shop_id;
$$;

create or replace function public.my_orders(p_scope text default 'active', p_limit int default 30, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
begin
  return coalesce((
    select jsonb_agg(private.order_card(o) order by o.requested_at desc)
    from (
      select * from public.orders o
      where o.customer_id = v_uid
        and case when p_scope = 'active'
                 then o.status in ('REQUESTED', 'CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED', 'ISSUE_REPORTED')
                 else o.status in ('DELIVERED', 'REJECTED', 'CANCELLED', 'EXPIRED') end
      order by o.requested_at desc
      limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
    ) o
  ), '[]'::jsonb);
end $$;

-- filter: new | confirmed | paid | dispatched | delivered | cancelled | issues | active | all
create or replace function public.shop_orders(p_shop_id uuid, p_filter text default 'active', p_limit int default 30, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_statuses public.order_status[];
begin
  perform private.require_shop_owner(p_shop_id);
  v_statuses := case p_filter
    when 'new' then array['REQUESTED']::public.order_status[]
    when 'confirmed' then array['CONFIRMED']::public.order_status[]
    when 'paid' then array['PAID', 'PACKED']::public.order_status[]
    when 'dispatched' then array['DISPATCHED']::public.order_status[]
    when 'delivered' then array['DELIVERED']::public.order_status[]
    when 'cancelled' then array['REJECTED', 'CANCELLED', 'EXPIRED']::public.order_status[]
    when 'issues' then array['ISSUE_REPORTED']::public.order_status[]
    when 'active' then array['REQUESTED', 'CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED', 'ISSUE_REPORTED']::public.order_status[]
    else null end;
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(private.order_card(o) order by o.requested_at desc)
      from (
        select * from public.orders o
        where o.shop_id = p_shop_id and (v_statuses is null or o.status = any(v_statuses))
        order by o.requested_at desc
        limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
      ) o), '[]'::jsonb),
    'counts', (
      select jsonb_build_object(
        'new', count(*) filter (where status = 'REQUESTED'),
        'confirmed', count(*) filter (where status = 'CONFIRMED'),
        'paid', count(*) filter (where status in ('PAID', 'PACKED')),
        'dispatched', count(*) filter (where status = 'DISPATCHED'),
        'delivered', count(*) filter (where status = 'DELIVERED'),
        'cancelled', count(*) filter (where status in ('REJECTED', 'CANCELLED', 'EXPIRED')),
        'issues', count(*) filter (where status = 'ISSUE_REPORTED'),
        'active', count(*) filter (where status in ('REQUESTED', 'CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED', 'ISSUE_REPORTED')))
      from public.orders where shop_id = p_shop_id)
  );
end $$;
