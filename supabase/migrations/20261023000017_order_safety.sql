-- Order and payment safety fixes from the October bug sweep (docs/DECISIONS.md #54), plus home-feed extras.
--
--  1. Once a customer says they paid Gadget Galli, nobody can cancel, reject or put the order on hold with a problem
--     report while the payment is checked (PAYMENT_UNDER_REVIEW). Support handles any change and refund.
--  2. Admin "Change status" and problem resolution cannot skip the payment check: PAID only through Confirm payment,
--     and packing, sending and delivery need a confirmed payment.
--  3. Only super admins can block another admin.
--  4. Marking payouts paid locks the orders, so two admins cannot pay (and notify) the same payout twice.
--  5. An admin confirming a payment can say whether it came by UPI or bank transfer.
--  6. The shop dashboard's "needs attention" leaves out orders that only wait for the customer to pay.
--  7. Favourite shops carry the cover photo and distance like every other shop card.
--  8. The home feed carries featured shop and product cards (set in Admin → Content) and the top deals.

-- 1. Payment under review: no cancel, reject or problem report ---------------------------------------------------
create or replace function public.customer_cancel_order(p_order_id uuid, p_reason text default null) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  o public.orders := private.lock_customer_order(p_order_id);
begin
  if o.payment_claimed_at is not null and o.paid_at is null then
    raise exception 'PAYMENT_UNDER_REVIEW' using errcode = 'P0001';
  end if;
  update public.orders set cancel_reason = left(nullif(btrim(p_reason), ''), 300) where id = o.id;
  perform private.set_order_status(o.id, 'CANCELLED', 'customer', coalesce(nullif(btrim(p_reason), ''), 'Cancelled by customer'), '{}'::jsonb);
  return private.order_json(o.id, 'customer');
end $$;

create or replace function public.shop_reject_order(p_order_id uuid, p_reason text, p_note text default null) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  o public.orders := private.lock_shop_order(p_order_id);
begin
  if o.payment_claimed_at is not null and o.paid_at is null then
    raise exception 'PAYMENT_UNDER_REVIEW' using errcode = 'P0001';
  end if;
  update public.orders set reject_reason = coalesce(nullif(p_reason, ''), 'other') where id = o.id;
  perform private.set_order_status(o.id, 'REJECTED', 'shop', coalesce(p_note, replace(p_reason, '_', ' ')),
                                   jsonb_build_object('reason', p_reason));
  return private.order_json(o.id, 'shop');
end $$;

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
  -- A report would take the order out of the payment queue; the customer contacts support instead.
  if o.status = 'CONFIRMED' and o.payment_claimed_at is not null then
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

-- 2. Admin status changes keep the payment trail -----------------------------------------------------------------
create or replace function private.check_admin_status(o public.orders, p_status public.order_status) returns void
language plpgsql stable set search_path = public, pg_temp as $$
begin
  if p_status = 'PAID' and o.paid_at is null then
    raise exception 'USE_CONFIRM_PAYMENT' using errcode = 'P0001';
  end if;
  if p_status in ('PACKED', 'DISPATCHED', 'DELIVERED') and o.paid_at is null then
    raise exception 'PAYMENT_NOT_CONFIRMED' using errcode = 'P0001';
  end if;
end $$;

create or replace function public.admin_set_order_status(p_order_id uuid, p_status public.order_status, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  o public.orders;
begin
  perform private.require_admin();
  if coalesce(btrim(p_note), '') = '' then raise exception 'NOTE_REQUIRED' using errcode = 'P0001'; end if;
  select * into o from public.orders where id = p_order_id;
  if o.id is null then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  perform private.check_admin_status(o, p_status);
  perform private.set_order_status(p_order_id, p_status, 'admin', p_note, '{}'::jsonb);
  perform private.audit('order_status', 'order', p_order_id::text, jsonb_build_object('status', p_status, 'note', p_note));
  return private.order_json(p_order_id, 'admin');
end $$;

create or replace function public.admin_resolve_issue(
  p_issue_id uuid, p_resolution text, p_shop_action text default 'none', p_order_status public.order_status default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  i public.issues;
  o public.orders;
begin
  perform private.require_admin();
  select * into i from public.issues where id = p_issue_id for update;
  if i.id is null then raise exception 'ISSUE_NOT_FOUND' using errcode = 'P0002'; end if;
  if coalesce(btrim(p_resolution), '') = '' then raise exception 'RESOLUTION_REQUIRED' using errcode = 'P0001'; end if;
  select * into o from public.orders where id = i.order_id;
  if p_order_status is not null and p_order_status <> o.status then
    perform private.check_admin_status(o, p_order_status);
  end if;

  update public.issues set status = 'resolved', resolution = p_resolution,
         shop_action = case p_shop_action when 'warn' then 'warned' when 'suspend' then 'suspended' else 'none' end,
         resolved_by = auth.uid(), resolved_at = now()
   where id = i.id;

  if p_shop_action = 'warn' then
    perform public.admin_warn_shop(i.shop_id, 'About order issue: ' || p_resolution);
  elsif p_shop_action = 'suspend' then
    perform public.admin_suspend_shop(i.shop_id, true, 'Suspended after a customer complaint: ' || p_resolution);
  end if;

  if p_order_status is not null and p_order_status <> o.status then
    perform private.set_order_status(o.id, p_order_status, 'admin', 'Issue resolved: ' || p_resolution, jsonb_build_object('issue_id', i.id));
  elsif o.status = 'ISSUE_REPORTED' and not exists (select 1 from public.issues where order_id = o.id and status <> 'resolved') then
    perform private.set_order_status(o.id, coalesce(o.status_before_issue, 'DELIVERED'), 'admin',
      'Issue resolved: ' || p_resolution, jsonb_build_object('issue_id', i.id));
  end if;

  perform private.notify(i.customer_id, 'customer', 'issue_resolved', 'Your problem report was resolved',
    p_resolution, jsonb_build_object('order_id', i.order_id, 'url', '/order/' || i.order_id));
  perform private.audit('issue_resolve', 'issue', i.id::text,
    jsonb_build_object('resolution', p_resolution, 'shop_action', p_shop_action, 'order_status', p_order_status));
  return public.admin_get_issue(i.id);
end $$;

-- 3. Blocking an admin needs a super admin ------------------------------------------------------------------------
create or replace function public.admin_block_user(p_user_id uuid, p_blocked boolean) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform private.require_admin();
  if p_user_id = auth.uid() then raise exception 'CANNOT_BLOCK_SELF' using errcode = 'P0001'; end if;
  if not public.is_super_admin() and exists (select 1 from public.users where id = p_user_id and admin_role is not null) then
    raise exception 'SUPER_ADMIN_ONLY' using errcode = '42501';
  end if;
  update public.users set is_blocked = p_blocked where id = p_user_id;
  perform private.audit(case when p_blocked then 'user_block' else 'user_unblock' end, 'user', p_user_id::text, '{}'::jsonb);
end $$;

-- 4. Payouts: lock first, so a second "mark paid" fails with PAYOUT_NOT_DUE ----------------------------------------
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
  perform 1 from public.orders where id = any(p_order_ids) order by id for update;
  select count(distinct shop_id), min(shop_id::text)::uuid, sum(payout_amount), count(*)
    into v_shops, v_shop, v_total, v_count
    from public.orders where id = any(p_order_ids) and payout_status = 'due';
  if v_count <> array_length(p_order_ids, 1) then raise exception 'PAYOUT_NOT_DUE' using errcode = 'P0001'; end if;
  if v_shops <> 1 then raise exception 'PAYOUTS_MIXED_SHOPS' using errcode = 'P0001'; end if;
  update public.orders set payout_status = 'paid', payout_ref = v_ref, payout_at = now(), payout_by = auth.uid()
   where id = any(p_order_ids) and payout_status = 'due';
  select owner_id into v_owner from public.shops where id = v_shop;
  perform private.notify(v_owner, 'partner', 'payout_paid', '₹' || to_char(v_total, 'FM99,99,99,999') || ' paid to you 💸',
    v_count || ' delivered order(s) · Ref ' || v_ref, jsonb_build_object('url', '/partner/payouts'));
  perform private.audit('mark_payouts_paid', 'shop', v_shop::text,
    jsonb_build_object('ref', v_ref, 'total', v_total, 'orders', to_jsonb(p_order_ids)));
  return jsonb_build_object('shop_id', v_shop, 'total', v_total, 'order_count', v_count, 'ref', v_ref);
end $$;

-- 5. Confirm payment with the method the money came by ----------------------------------------------------------
drop function if exists public.admin_confirm_payment(uuid, text);
create or replace function public.admin_confirm_payment(p_order_id uuid, p_ref text default null, p_method public.payment_method default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  o public.orders;
  v_ref text;
  v_method public.payment_method;
begin
  perform private.require_admin();
  if p_method is not null and p_method not in ('upi', 'bank_transfer') then
    raise exception 'PAYMENT_METHOD_UNAVAILABLE' using errcode = 'P0001';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if o.status <> 'CONFIRMED' then raise exception 'ORDER_NOT_AWAITING_PAYMENT' using errcode = 'P0001'; end if;
  v_method := coalesce(p_method, o.payment_method, 'upi');
  v_ref := coalesce(nullif(upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g')), ''), o.payment_ref);
  update public.orders set payment_method = v_method where id = o.id;
  perform private.set_order_status(o.id, 'PAID', 'admin',
    'Payment received by Gadget Galli' || coalesce(case when v_method = 'bank_transfer' then ' · Bank UTR ' else ' · UPI ref ' end || v_ref, ''),
    jsonb_build_object('method', v_method, 'txn_id', v_ref, 'paid_to', 'gadget_galli'));
  update public.orders set payment_ref = v_ref where id = o.id;
  perform private.record_payment(o.id, v_method, o.grand_total, v_ref, null);
  perform private.audit('confirm_payment', 'order', o.id::text, jsonb_build_object('ref', v_ref, 'amount', o.grand_total, 'method', v_method));
  return private.order_json(o.id, 'admin');
end $$;

-- 6. Shop dashboard: "needs attention" = orders the shop can act on ---------------------------------------------
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
    'attention', coalesce((select jsonb_agg(private.order_card(o) order by o.requested_at)
                           from (select * from public.orders where shop_id = s.id
                                 and status in ('REQUESTED', 'PAID', 'PACKED', 'ISSUE_REPORTED')
                                 order by requested_at limit 10) o), '[]'::jsonb),
    'low_stock', (select count(*) from public.shop_products where shop_id = s.id and is_active
                  and ((stock_qty is not null and stock_qty <= 2) or not in_stock)),
    'unread_reviews', (select count(*) from public.reviews where shop_id = s.id and shop_reply is null)
  );
end $$;

-- 7. Favourite shops: same card fields as shops_near ------------------------------------------------------------
drop function if exists public.my_favourite_shops();
create or replace function public.my_favourite_shops(p_lat double precision default null, p_lng double precision default null)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'slug', s.slug, 'name', s.name, 'area', a.name, 'rating_avg', s.rating_avg, 'rating_count', s.rating_count,
      'verified', s.verified, 'logo_path', s.logo_path, 'cover_path', s.cover_path,
      'cover_photo', (select ph.path from public.shop_photos ph where ph.shop_id = s.id and ph.kind in ('front', 'cover') order by ph.kind desc, ph.sort limit 1),
      'distance_km', round(public.gg_distance_km(s.lat, s.lng, p_lat, p_lng)::numeric, 1),
      'is_open_now', public.gg_shop_open_now(s.hours, s.is_open),
      'delivery_mins', public.gg_shop_delivery_mins(s.avg_delivery_mins, s.usual_delivery_mins),
      'store_pickup', s.store_pickup, 'delivers', true,
      'shop_types', to_jsonb(s.shop_types)) order by f.created_at desc), '[]'::jsonb)
  from public.favourites f
  join public.shops s on s.id = f.shop_id and s.status = 'approved'
  left join public.areas a on a.id = s.area_id
  where f.user_id = auth.uid();
$$;

-- 8. Home feed: featured cards and top deals in the same round trip ---------------------------------------------
create or replace function public.home_feed(
  p_area_id int default null,
  p_lat double precision default null,
  p_lng double precision default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_banners jsonb;
  v_categories jsonb;
  v_featured_shops jsonb;
  v_featured_products jsonb;
  v_near jsonb;
  v_ranked jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'subtitle', b.subtitle, 'image_path', b.image_path,
            'bg_color', b.bg_color, 'link_type', b.link_type, 'link_value', b.link_value) order by b.sort, b.id), '[]'::jsonb)
  into v_banners
  from public.banners b
  where b.is_active and (b.area_id is null or b.area_id = p_area_id)
    and (b.starts_at is null or b.starts_at <= now()) and (b.ends_at is null or b.ends_at > now());

  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'name_te', c.name_te,
            'name_hi', c.name_hi, 'icon', c.icon) order by c.sort), '[]'::jsonb)
  into v_categories
  from public.categories c where c.parent_id is null and c.is_active;

  select coalesce(jsonb_agg(f.shop_id order by f.sort), '[]'::jsonb) into v_featured_shops
  from public.featured f join public.shops s on s.id = f.shop_id and s.status = 'approved'
  where f.kind = 'shop' and f.is_active and (f.starts_at is null or f.starts_at <= now()) and (f.ends_at is null or f.ends_at > now());

  select coalesce(jsonb_agg(f.catalog_product_id order by f.sort), '[]'::jsonb) into v_featured_products
  from public.featured f
  where f.kind = 'product' and f.is_active and (f.starts_at is null or f.starts_at <= now()) and (f.ends_at is null or f.ends_at > now());

  v_near := public.shops_near(p_area_id, p_lat, p_lng, 50, 0, true, null);
  -- The 50 most popular products in stock: the first 10 are "Popular", the biggest discounts off MRP are "Top deals".
  v_ranked := coalesce(public.search_products('', p_area_id, p_lat, p_lng, '{"deliver_only": true}'::jsonb, 'popular', 50, 0, false) -> 'items', '[]'::jsonb);

  return jsonb_build_object(
    'banners', v_banners,
    'categories', v_categories,
    'shops_near', coalesce((select jsonb_agg(e order by n) from jsonb_array_elements(v_near) with ordinality t(e, n) where n <= 10), '[]'::jsonb),
    'popular', coalesce((select jsonb_agg(e order by n) from jsonb_array_elements(v_ranked) with ordinality t(e, n) where n <= 10), '[]'::jsonb),
    'deals', coalesce((
      select jsonb_agg(x.e order by x.pct desc, x.n)
        from (select e, n, 1 - (e->>'min_price')::numeric / (e->>'mrp')::numeric as pct
                from jsonb_array_elements(v_ranked) with ordinality t(e, n)
               where (e->>'mrp')::numeric > 0 and (e->>'min_price')::numeric > 0
                 and (e->>'min_price')::numeric <= (e->>'mrp')::numeric * 0.95
               order by pct desc, n limit 10) x), '[]'::jsonb),
    'featured_shops', coalesce((
      select jsonb_agg(e order by array_position(array(select jsonb_array_elements_text(v_featured_shops)), e->>'id'))
        from jsonb_array_elements(v_near) e
       where v_featured_shops ? (e->>'id')), '[]'::jsonb),
    'featured_products', public.products_by_ids(array(select x::uuid from jsonb_array_elements_text(v_featured_products) x), p_area_id, p_lat, p_lng),
    'featured_shop_ids', v_featured_shops,
    'featured_product_ids', v_featured_products
  );
end $$;

-- 9. Access ------------------------------------------------------------------------------------------------------
revoke execute on function
  public.admin_confirm_payment(uuid, text, public.payment_method), public.my_favourite_shops(double precision, double precision)
from public;
grant execute on function
  public.admin_confirm_payment(uuid, text, public.payment_method), public.my_favourite_shops(double precision, double precision)
to authenticated, service_role;
revoke all on function private.check_admin_status(public.orders, public.order_status) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all functions in schema private from anon, authenticated';
    execute 'revoke execute on function public.admin_confirm_payment(uuid, text, public.payment_method), public.my_favourite_shops(double precision, double precision) from anon';
  end if;
end $$;
