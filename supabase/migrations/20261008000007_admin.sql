-- Gadget Galli · 0007 · admin panel functions and reports

create or replace function private.audit(p_action text, p_entity text, p_entity_id text, p_details jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = public as $$
  insert into public.admin_audit_log (admin_id, action, entity, entity_id, details)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;

-- Why an order is stuck (null if it is not). Thresholds: REQUESTED 30 min, PAID/PACKED 3 hrs, DISPATCHED 24 hrs.
create or replace function public.gg_stuck_reason(o public.orders) returns text
language sql stable as $$
  select case
    when o.status = 'REQUESTED' and o.requested_at < now() - interval '30 minutes' then 'Not confirmed in 30 min'
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
    'active_orders', (select count(*) from public.orders where status in ('REQUESTED', 'CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED'))
  );
end $$;

-- ---------------------------------------------------------------------------
-- Shops
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_shops(p_status text default null, p_query text default null, p_limit int default 50, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'total', (select count(*) from public.shops s
              where (p_status is null or s.status::text = p_status)
                and (coalesce(p_query, '') = '' or s.name ilike '%' || p_query || '%' or s.contact_phone ilike '%' || p_query || '%')),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', s.id, 'name', s.name, 'status', s.status, 'status_reason', s.status_reason, 'verified', s.verified,
          'upi_verified', s.upi_verified, 'area', a.name, 'shop_types', to_jsonb(s.shop_types), 'owner_name', s.owner_name,
          'owner_phone', s.owner_phone, 'contact_phone', s.contact_phone, 'rating_avg', s.rating_avg,
          'rating_count', s.rating_count, 'orders_delivered', s.orders_delivered, 'warnings_count', s.warnings_count,
          'product_count', (select count(*) from public.shop_products sp where sp.shop_id = s.id and sp.is_active),
          'registration_step', s.registration_step, 'submitted_at', s.submitted_at, 'approved_at', s.approved_at,
          'created_at', s.created_at, 'logo_path', s.logo_path) order by s.submitted_at desc nulls last, s.created_at desc)
      from (select * from public.shops s
            where (p_status is null or s.status::text = p_status)
              and (coalesce(p_query, '') = '' or s.name ilike '%' || p_query || '%' or s.contact_phone ilike '%' || p_query || '%')
            order by s.submitted_at desc nulls last, s.created_at desc
            limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) s
      left join public.areas a on a.id = s.area_id), '[]'::jsonb));
end $$;

create or replace function public.admin_get_shop(p_shop_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s public.shops;
begin
  perform private.require_admin();
  select * into s from public.shops where id = p_shop_id;
  if s.id is null then return null; end if;
  return private.shop_json(s.id) || jsonb_build_object(
    'owner', (select jsonb_build_object('id', u.id, 'name', u.name, 'phone', u.phone, 'email', u.email, 'is_blocked', u.is_blocked,
                                        'created_at', u.created_at) from public.users u where u.id = s.owner_id),
    'admin_notes', (select admin_notes from public.shop_private where shop_id = s.id),
    'delivery_zone_names', coalesce((select jsonb_agg(z.name) from public.delivery_areas da join public.zones z on z.id = da.zone_id where da.shop_id = s.id), '[]'::jsonb),
    'delivery_area_names', coalesce((select jsonb_agg(a.name) from public.delivery_areas da join public.areas a on a.id = da.area_id where da.shop_id = s.id), '[]'::jsonb),
    'stats', (select jsonb_build_object(
                'orders', count(*), 'delivered', count(*) filter (where status = 'DELIVERED'),
                'rejected', count(*) filter (where status = 'REJECTED'), 'expired', count(*) filter (where status = 'EXPIRED'),
                'issues', (select count(*) from public.issues i where i.shop_id = s.id),
                'value', coalesce(sum(grand_total) filter (where paid_at is not null and status not in ('REJECTED', 'CANCELLED', 'EXPIRED')), 0))
              from public.orders where shop_id = s.id),
    'audit', coalesce((select jsonb_agg(jsonb_build_object('action', l.action, 'details', l.details, 'created_at', l.created_at,
                         'admin', (select name from public.users where id = l.admin_id)) order by l.created_at desc)
                       from public.admin_audit_log l where l.entity = 'shop' and l.entity_id = s.id::text), '[]'::jsonb)
  );
end $$;

-- p_action: approve | reject | request_changes
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

create or replace function public.admin_set_shop_flags(p_shop_id uuid, p_verified boolean default null, p_upi_verified boolean default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_admin();
  perform set_config('gg.admin_action', 'on', true);
  update public.shops set verified = coalesce(p_verified, verified), upi_verified = coalesce(p_upi_verified, upi_verified)
   where id = p_shop_id;
  perform private.audit('shop_flags', 'shop', p_shop_id::text, jsonb_build_object('verified', p_verified, 'upi_verified', p_upi_verified));
  return public.admin_get_shop(p_shop_id);
end $$;

create or replace function public.admin_suspend_shop(p_shop_id uuid, p_suspend boolean, p_reason text default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  s public.shops;
begin
  perform private.require_admin();
  select * into s from public.shops where id = p_shop_id;
  if s.id is null then raise exception 'SHOP_NOT_FOUND' using errcode = 'P0002'; end if;
  if p_suspend then
    update public.shops set status = 'suspended', status_reason = coalesce(p_reason, 'Suspended by Gadget Galli'), is_open = false
     where id = s.id;
    perform private.notify(s.owner_id, 'partner', 'shop_suspended', 'Your shop has been suspended',
      coalesce(p_reason, 'Please contact Gadget Galli support.'), jsonb_build_object('shop_id', s.id));
  else
    update public.shops set status = 'approved', status_reason = null where id = s.id;
    perform private.notify(s.owner_id, 'partner', 'shop_unsuspended', 'Your shop is live again',
      'Customers can see your shop again.', jsonb_build_object('shop_id', s.id));
  end if;
  perform private.audit(case when p_suspend then 'shop_suspend' else 'shop_unsuspend' end, 'shop', s.id::text,
                        jsonb_build_object('reason', p_reason));
  return public.admin_get_shop(s.id);
end $$;

create or replace function public.admin_warn_shop(p_shop_id uuid, p_message text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  s public.shops;
begin
  perform private.require_admin();
  update public.shops set warnings_count = warnings_count + 1 where id = p_shop_id returning * into s;
  perform private.notify(s.owner_id, 'partner', 'shop_warning', 'Warning from Gadget Galli', p_message, jsonb_build_object('shop_id', s.id));
  perform private.audit('shop_warn', 'shop', s.id::text, jsonb_build_object('message', p_message));
  return public.admin_get_shop(s.id);
end $$;

create or replace function public.admin_save_shop_notes(p_shop_id uuid, p_notes text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_admin();
  insert into public.shop_private (shop_id, admin_notes) values (p_shop_id, p_notes)
  on conflict (shop_id) do update set admin_notes = excluded.admin_notes, updated_at = now();
end $$;

-- ---------------------------------------------------------------------------
-- Orders
-- filters: {status, shop_id, area_id, date_from, date_to, q, stuck_only}
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_orders(p_filters jsonb default '{}'::jsonb, p_limit int default 50, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
begin
  perform private.require_admin();
  return (
    with base as (
      select o as ord, o.requested_at, public.gg_stuck_reason(o) as stuck_reason
      from public.orders o
      where (f->>'status' is null or o.status::text = f->>'status')
        and (f->>'shop_id' is null or o.shop_id = (f->>'shop_id')::uuid)
        and (f->>'area_id' is null or o.area_id = (f->>'area_id')::int)
        and (f->>'date_from' is null or (o.requested_at at time zone 'Asia/Kolkata')::date >= (f->>'date_from')::date)
        and (f->>'date_to' is null or (o.requested_at at time zone 'Asia/Kolkata')::date <= (f->>'date_to')::date)
        and (coalesce(f->>'q', '') = '' or o.order_no ilike '%' || (f->>'q') || '%' or o.customer_name ilike '%' || (f->>'q') || '%')
    ),
    filtered as (
      select * from base where not coalesce((f->>'stuck_only')::boolean, false) or stuck_reason is not null
    )
    select jsonb_build_object(
      'total', (select count(*) from filtered),
      'items', coalesce((
        select jsonb_agg(private.order_card(x.ord) || jsonb_build_object('stuck_reason', x.stuck_reason)
                         order by x.requested_at desc)
        from (select * from filtered order by requested_at desc
              limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) x), '[]'::jsonb))
  );
end $$;

create or replace function public.admin_set_order_status(p_order_id uuid, p_status public.order_status, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_admin();
  if coalesce(btrim(p_note), '') = '' then raise exception 'NOTE_REQUIRED' using errcode = 'P0001'; end if;
  perform private.set_order_status(p_order_id, p_status, 'admin', p_note, '{}'::jsonb);
  perform private.audit('order_status', 'order', p_order_id::text, jsonb_build_object('status', p_status, 'note', p_note));
  return private.order_json(p_order_id, 'admin');
end $$;

-- ---------------------------------------------------------------------------
-- Problems (issues)
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_issues(p_status text default null, p_limit int default 50, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', i.id, 'type', i.type, 'description', i.description, 'photos', to_jsonb(i.photos), 'status', i.status,
        'resolution', i.resolution, 'shop_action', i.shop_action, 'created_at', i.created_at, 'resolved_at', i.resolved_at,
        'order_id', o.id, 'order_no', o.order_no, 'order_status', o.status, 'grand_total', o.grand_total,
        'shop_id', s.id, 'shop_name', s.name, 'shop_phone', s.contact_phone,
        'customer_name', u.name, 'customer_phone', u.phone,
        'notes_count', (select count(*) from public.issue_notes n where n.issue_id = i.id)) order by i.created_at desc)
    from (select * from public.issues i where p_status is null or i.status::text = p_status
          order by i.created_at desc limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) i
    join public.orders o on o.id = i.order_id
    join public.shops s on s.id = i.shop_id
    join public.users u on u.id = i.customer_id
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_get_issue(p_issue_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  i public.issues;
begin
  perform private.require_admin();
  select * into i from public.issues where id = p_issue_id;
  if i.id is null then return null; end if;
  return to_jsonb(i) || jsonb_build_object(
    'order', private.order_json(i.order_id, 'admin'),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'note', n.note, 'created_at', n.created_at,
                          'author', (select name from public.users where id = n.author_id)) order by n.created_at)
                       from public.issue_notes n where n.issue_id = i.id), '[]'::jsonb),
    'shop', (select jsonb_build_object('id', s.id, 'name', s.name, 'status', s.status, 'contact_phone', s.contact_phone,
                                       'warnings_count', s.warnings_count) from public.shops s where s.id = i.shop_id),
    'customer', (select jsonb_build_object('id', u.id, 'name', u.name, 'phone', u.phone) from public.users u where u.id = i.customer_id)
  );
end $$;

create or replace function public.admin_add_issue_note(p_issue_id uuid, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_admin();
  insert into public.issue_notes (issue_id, author_id, note) values (p_issue_id, auth.uid(), p_note);
  update public.issues set status = 'in_progress' where id = p_issue_id and status = 'open';
  return public.admin_get_issue(p_issue_id);
end $$;

-- p_shop_action: none | warn | suspend; p_order_status: optional new order status (e.g. DELIVERED, CANCELLED)
create or replace function public.admin_resolve_issue(
  p_issue_id uuid, p_resolution text, p_shop_action text default 'none', p_order_status public.order_status default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  i public.issues;
  o public.orders;
begin
  perform private.require_admin();
  select * into i from public.issues where id = p_issue_id for update;
  if i.id is null then raise exception 'ISSUE_NOT_FOUND' using errcode = 'P0002'; end if;
  if coalesce(btrim(p_resolution), '') = '' then raise exception 'RESOLUTION_REQUIRED' using errcode = 'P0001'; end if;

  update public.issues set status = 'resolved', resolution = p_resolution,
         shop_action = case p_shop_action when 'warn' then 'warned' when 'suspend' then 'suspended' else 'none' end,
         resolved_by = auth.uid(), resolved_at = now()
   where id = i.id;

  if p_shop_action = 'warn' then
    perform public.admin_warn_shop(i.shop_id, 'About order issue: ' || p_resolution);
  elsif p_shop_action = 'suspend' then
    perform public.admin_suspend_shop(i.shop_id, true, 'Suspended after a customer complaint: ' || p_resolution);
  end if;

  select * into o from public.orders where id = i.order_id;
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

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_users(p_query text default null, p_role text default null, p_limit int default 50, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', u.id, 'name', u.name, 'phone', u.phone, 'email', u.email, 'role', u.role, 'admin_role', u.admin_role,
        'is_blocked', u.is_blocked, 'created_at', u.created_at, 'deleted', u.deleted_at is not null,
        'referral_code', u.referral_code,
        'orders', (select count(*) from public.orders o where o.customer_id = u.id),
        'delivered', (select count(*) from public.orders o where o.customer_id = u.id and o.status = 'DELIVERED'),
        'last_order_at', (select max(requested_at) from public.orders o where o.customer_id = u.id),
        'area', (select name from public.areas a where a.id = u.last_area_id)) order by u.created_at desc)
    from (select * from public.users u
          where (p_role is null or u.role::text = p_role or (p_role = 'admin' and u.admin_role is not null))
            and (coalesce(p_query, '') = '' or u.name ilike '%' || p_query || '%' or u.phone ilike '%' || p_query || '%')
          order by u.created_at desc limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) u
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_block_user(p_user_id uuid, p_blocked boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_admin();
  if p_user_id = auth.uid() then raise exception 'CANNOT_BLOCK_SELF' using errcode = 'P0001'; end if;
  update public.users set is_blocked = p_blocked where id = p_user_id;
  perform private.audit(case when p_blocked then 'user_block' else 'user_unblock' end, 'user', p_user_id::text, '{}'::jsonb);
end $$;

create or replace function public.admin_set_admin_role(p_user_id uuid, p_role public.admin_role) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'SUPER_ADMIN_ONLY' using errcode = '42501'; end if;
  update public.users set admin_role = p_role where id = p_user_id;
  perform private.audit('admin_role', 'user', p_user_id::text, jsonb_build_object('role', p_role));
end $$;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
create or replace function public.admin_catalog_list(
  p_status text default null, p_query text default null, p_category_id int default null, p_limit int default 50, p_offset int default 0
) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_norm text := public.gg_norm(p_query);
  v_variants text[];
begin
  perform private.require_admin();
  if v_norm <> '' then v_variants := public.gg_query_variants(v_norm); end if;
  return (
    with base as (
      select p.*, b.name as brand, c.name as category,
             case when v_norm = '' then 1.0::real else public.gg_match_score(p.search_text, p.search_compact, v_variants) end as score
      from public.catalog_products p
      left join public.brands b on b.id = p.brand_id
      join public.categories c on c.id = p.category_id
      where (p_status is null or p.status::text = p_status)
        and (p_category_id is null or p.category_id = p_category_id or c.parent_id = p_category_id)
    )
    select jsonb_build_object(
      'total', (select count(*) from base where score > 0),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'brand', x.brand, 'brand_id', x.brand_id,
            'category', x.category, 'category_id', x.category_id, 'model', x.model, 'model_number', x.model_number,
            'variant', x.variant, 'key_specs', x.key_specs, 'specs', x.specs, 'description', x.description,
            'in_the_box', x.in_the_box, 'photos', to_jsonb(x.photos), 'keywords', x.keywords, 'mrp', x.mrp,
            'status', x.status, 'review_note', x.review_note, 'popularity', x.popularity, 'merged_into', x.merged_into,
            'created_by_shop', (select name from public.shops where id = x.created_by_shop),
            'listings', (select count(*) from public.shop_products sp where sp.catalog_product_id = x.id),
            'created_at', x.created_at) order by x.score desc, x.created_at desc)
        from (select * from base where score > 0 order by score desc, created_at desc
              limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) x), '[]'::jsonb))
  );
end $$;

-- Create or edit a master catalog product.
create or replace function public.admin_save_catalog_product(p_patch jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  p jsonb := coalesce(p_patch, '{}'::jsonb);
  v_id uuid := nullif(p->>'id', '')::uuid;
  c public.catalog_products;
  v_brand int;
begin
  perform private.require_admin();
  v_brand := coalesce((p->>'brand_id')::int, private.find_or_create_brand(p->>'brand'));
  if v_id is null then
    insert into public.catalog_products (category_id, brand_id, name, model, model_number, variant, key_specs, specs,
      description, in_the_box, photos, keywords, mrp, status, created_by)
    values ((p->>'category_id')::int, v_brand, btrim(p->>'name'), nullif(p->>'model', ''), nullif(p->>'model_number', ''),
      coalesce(p->'variant', '{}'::jsonb), coalesce((select array_agg(x) from jsonb_array_elements_text(p->'key_specs') x), '{}'),
      coalesce(p->'specs', '{}'::jsonb), nullif(p->>'description', ''), nullif(p->>'in_the_box', ''),
      coalesce((select array_agg(x) from jsonb_array_elements_text(p->'photos') x), '{}'), nullif(p->>'keywords', ''),
      (p->>'mrp')::numeric, coalesce(p->>'status', 'approved')::public.catalog_status, auth.uid())
    returning * into c;
  else
    update public.catalog_products set
      category_id = coalesce((p->>'category_id')::int, category_id),
      brand_id = case when p ? 'brand_id' or p ? 'brand' then v_brand else brand_id end,
      name = coalesce(nullif(btrim(p->>'name'), ''), name),
      model = case when p ? 'model' then nullif(p->>'model', '') else model end,
      model_number = case when p ? 'model_number' then nullif(p->>'model_number', '') else model_number end,
      variant = case when p ? 'variant' then coalesce(p->'variant', '{}'::jsonb) else variant end,
      key_specs = case when p ? 'key_specs' then coalesce((select array_agg(x) from jsonb_array_elements_text(p->'key_specs') x), '{}') else key_specs end,
      specs = case when p ? 'specs' then coalesce(p->'specs', '{}'::jsonb) else specs end,
      description = case when p ? 'description' then nullif(p->>'description', '') else description end,
      in_the_box = case when p ? 'in_the_box' then nullif(p->>'in_the_box', '') else in_the_box end,
      photos = case when p ? 'photos' then coalesce((select array_agg(x) from jsonb_array_elements_text(p->'photos') x), '{}') else photos end,
      keywords = case when p ? 'keywords' then nullif(p->>'keywords', '') else keywords end,
      mrp = case when p ? 'mrp' then (p->>'mrp')::numeric else mrp end,
      status = case when p ? 'status' then (p->>'status')::public.catalog_status else status end
    where id = v_id returning * into c;
  end if;
  perform private.audit(case when v_id is null then 'catalog_create' else 'catalog_update' end, 'catalog_product', c.id::text, '{}'::jsonb);
  return to_jsonb(c);
end $$;

create or replace function public.admin_review_catalog_product(p_id uuid, p_action text, p_note text default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c public.catalog_products;
  v_owner uuid;
begin
  perform private.require_admin();
  update public.catalog_products
     set status = case p_action when 'approve' then 'approved'::public.catalog_status else 'rejected'::public.catalog_status end,
         review_note = p_note
   where id = p_id returning * into c;
  if c.id is null then raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002'; end if;
  select owner_id into v_owner from public.shops where id = c.created_by_shop;
  perform private.notify(v_owner, 'partner', 'catalog_' || p_action,
    case when p_action = 'approve' then 'Product approved: ' || c.name else 'Product not approved: ' || c.name end,
    coalesce(p_note, case when p_action = 'approve' then 'It is now searchable by customers.' else 'Please pick it from the catalog instead.' end),
    jsonb_build_object('catalog_product_id', c.id, 'url', '/partner/products'));
  perform private.audit('catalog_' || p_action, 'catalog_product', c.id::text, jsonb_build_object('note', p_note));
  return to_jsonb(c);
end $$;

-- Moves every listing from p_source to p_target and marks the source as merged.
create or replace function public.admin_merge_catalog_products(p_source uuid, p_target uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_moved int;
  v_dropped int;
begin
  perform private.require_admin();
  if p_source = p_target then raise exception 'SAME_PRODUCT' using errcode = 'P0001'; end if;
  -- Listings that would clash with an existing listing of the target are removed
  delete from public.shop_products sp
   where sp.catalog_product_id = p_source
     and exists (select 1 from public.shop_products t where t.catalog_product_id = p_target
                 and t.shop_id = sp.shop_id and t.condition = sp.condition);
  get diagnostics v_dropped = row_count;
  update public.shop_products set catalog_product_id = p_target where catalog_product_id = p_source;
  get diagnostics v_moved = row_count;
  update public.featured set catalog_product_id = p_target where catalog_product_id = p_source;
  update public.catalog_products set status = 'merged', merged_into = p_target where id = p_source;
  update public.catalog_products set popularity = popularity + coalesce((select popularity from public.catalog_products where id = p_source), 0)
   where id = p_target;
  perform private.audit('catalog_merge', 'catalog_product', p_source::text, jsonb_build_object('target', p_target));
  return jsonb_build_object('moved', v_moved, 'dropped', v_dropped);
end $$;

-- ---------------------------------------------------------------------------
-- Content: push campaigns
-- p_segment: all | customers | shop_owners | area (with p_area_id)
-- ---------------------------------------------------------------------------
create or replace function public.admin_send_campaign(p_title text, p_body text, p_segment text default 'customers', p_area_id int default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_count int;
  v_id int;
begin
  perform private.require_admin();
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_body), '') = '' then
    raise exception 'TITLE_AND_BODY_REQUIRED' using errcode = 'P0001';
  end if;
  insert into public.campaigns (title, body, segment, area_id, created_by)
  values (p_title, p_body, p_segment, p_area_id, auth.uid()) returning id into v_id;

  insert into public.notifications (user_id, app, kind, title, body, data)
  select u.id, case when u.role = 'shop_owner' then 'partner' else 'customer' end, 'campaign', p_title, p_body,
         jsonb_build_object('campaign_id', v_id)
  from public.users u
  where u.deleted_at is null and not u.is_blocked
    and case p_segment
          when 'all' then true
          when 'customers' then u.role = 'customer'
          when 'shop_owners' then u.role = 'shop_owner'
          when 'area' then u.last_area_id = p_area_id
            or exists (select 1 from public.addresses a where a.user_id = u.id and a.area_id = p_area_id)
          else false end;
  get diagnostics v_count = row_count;
  update public.campaigns set sent_count = v_count where id = v_id;
  perform private.audit('campaign_send', 'campaign', v_id::text, jsonb_build_object('segment', p_segment, 'count', v_count));
  return jsonb_build_object('campaign_id', v_id, 'sent', v_count);
end $$;

create or replace function public.admin_referrals(p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'total_joined', (select count(*) from public.referrals),
    'total_ordered', (select count(*) from public.referrals where status = 'ordered'),
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', x.referrer_id, 'name', u.name, 'phone', u.phone, 'code', u.referral_code,
                                          'joined', x.joined, 'ordered', x.ordered) order by x.joined desc)
      from (select referrer_id, count(*) as joined, count(*) filter (where status = 'ordered') as ordered
            from public.referrals group by referrer_id order by count(*) desc limit p_limit) x
      join public.users u on u.id = x.referrer_id), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create or replace function public.admin_reports(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_to date := coalesce(p_to, (now() at time zone 'Asia/Kolkata')::date);
  v_from date := coalesce(p_from, coalesce(p_to, (now() at time zone 'Asia/Kolkata')::date) - 29);
begin
  perform private.require_admin();
  return jsonb_build_object(
    'from', v_from, 'to', v_to,
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'orders', coalesce(x.orders, 0), 'delivered', coalesce(x.delivered, 0),
                 'order_value', coalesce(x.order_value, 0), 'paid_value', coalesce(x.paid_value, 0),
                 'searches', coalesce(sl.n, 0)) order by d.day), '[]'::jsonb)
      from generate_series(v_from, v_to, interval '1 day') d(day)
      left join (
        select (requested_at at time zone 'Asia/Kolkata')::date as day, count(*) as orders,
               count(*) filter (where status = 'DELIVERED') as delivered,
               sum(grand_total) filter (where status not in ('REJECTED', 'CANCELLED', 'EXPIRED')) as order_value,
               sum(grand_total) filter (where paid_at is not null and status not in ('REJECTED', 'CANCELLED', 'EXPIRED')) as paid_value
        from public.orders
        where (requested_at at time zone 'Asia/Kolkata')::date between v_from and v_to
        group by 1) x on x.day = d.day::date
      left join (
        select (created_at at time zone 'Asia/Kolkata')::date as day, count(*) as n
        from public.search_logs where (created_at at time zone 'Asia/Kolkata')::date between v_from and v_to
        group by 1) sl on sl.day = d.day::date),
    'totals', (
      select jsonb_build_object('orders', count(*), 'delivered', count(*) filter (where status = 'DELIVERED'),
               'order_value', coalesce(sum(grand_total) filter (where status not in ('REJECTED', 'CANCELLED', 'EXPIRED')), 0),
               'paid_value', coalesce(sum(grand_total) filter (where paid_at is not null and status not in ('REJECTED', 'CANCELLED', 'EXPIRED')), 0),
               'rejected', count(*) filter (where status = 'REJECTED'), 'expired', count(*) filter (where status = 'EXPIRED'),
               'cancelled', count(*) filter (where status = 'CANCELLED'))
      from public.orders where (requested_at at time zone 'Asia/Kolkata')::date between v_from and v_to),
    'top_shops', (
      select coalesce(jsonb_agg(t order by t.orders desc), '[]'::jsonb)
      from (select s.id, s.name, a.name as area, count(*) as orders, count(*) filter (where o.status = 'DELIVERED') as delivered,
                   coalesce(sum(o.grand_total) filter (where o.paid_at is not null and o.status not in ('REJECTED', 'CANCELLED', 'EXPIRED')), 0) as value,
                   s.rating_avg
            from public.orders o join public.shops s on s.id = o.shop_id left join public.areas a on a.id = s.area_id
            where (o.requested_at at time zone 'Asia/Kolkata')::date between v_from and v_to
            group by s.id, s.name, a.name, s.rating_avg order by count(*) desc limit 15) t),
    'top_searches', (
      select coalesce(jsonb_agg(t order by t.n desc), '[]'::jsonb)
      from (select mode() within group (order by query) as query, normalized, count(*) as n,
                   round(avg(results_count), 1) as avg_results
            from public.search_logs where (created_at at time zone 'Asia/Kolkata')::date between v_from and v_to
            group by normalized order by count(*) desc limit 25) t),
    'zero_result_searches', (
      select coalesce(jsonb_agg(t order by t.n desc), '[]'::jsonb)
      from (select mode() within group (order by l.query) as query, l.normalized, count(*) as n, max(l.created_at) as last_at,
                   mode() within group (order by a.name) as top_area
            from public.search_logs l left join public.areas a on a.id = l.area_id
            where l.results_count = 0 and (l.created_at at time zone 'Asia/Kolkata')::date between v_from and v_to
            group by l.normalized order by count(*) desc limit 25) t),
    'new_shops', (
      select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'area', a.name, 'status', s.status,
                 'approved_at', s.approved_at, 'created_at', s.created_at) order by s.created_at desc), '[]'::jsonb)
      from public.shops s left join public.areas a on a.id = s.area_id
      where (s.created_at at time zone 'Asia/Kolkata')::date between v_from and v_to),
    'customers', jsonb_build_object(
      'new', (select count(*) from public.users where role = 'customer' and (created_at at time zone 'Asia/Kolkata')::date between v_from and v_to),
      'active', (select count(distinct customer_id) from public.orders where (requested_at at time zone 'Asia/Kolkata')::date between v_from and v_to),
      'repeat', (select count(*) from (select customer_id from public.orders
                                         where (requested_at at time zone 'Asia/Kolkata')::date between v_from and v_to
                                           and status not in ('REJECTED', 'CANCELLED', 'EXPIRED')
                                         group by customer_id having count(*) >= 2) r)),
    'by_area', (
      select coalesce(jsonb_agg(t order by t.orders desc), '[]'::jsonb)
      from (select a.name as area, count(*) as orders from public.orders o join public.areas a on a.id = o.area_id
            where (o.requested_at at time zone 'Asia/Kolkata')::date between v_from and v_to
            group by a.name order by count(*) desc limit 15) t)
  );
end $$;
