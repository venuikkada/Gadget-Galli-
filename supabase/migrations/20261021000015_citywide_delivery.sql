-- Gadget Galli · 0015 · every shop delivers all over Hyderabad (docs/DECISIONS.md #54)
--   Per-shop delivery coverage (zones, areas or a radius) is no longer used: every approved shop delivers to every
--   address in the service area. Addresses outside Hyderabad are still refused, because an address needs an area and
--   resolve_location only gives one inside the service area. Each shop keeps its own delivery charge; pickup stays.
--   The coverage columns and public.delivery_areas are kept (unused) so nothing is lost and this can be undone.
--   Every coverage check goes through the two functions below, so search, home, shop and product pages, the cart and
--   place_order all follow.

-- 1. Coverage: every approved shop, wherever the customer is ------------------------------------------------------
create or replace function public.gg_delivering_shop_ids(p_area_id int, p_lat double precision, p_lng double precision)
returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id from public.shops s where s.status = 'approved';
$$;

create or replace function public.shop_delivers_to(p_shop_id uuid, p_area_id int, p_lat double precision, p_lng double precision)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.shops s where s.id = p_shop_id);
$$;

-- 2. Shop registration no longer asks for delivery areas -------------------------------------------------------
create or replace function public.shop_submit(p_shop_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  s public.shops := private.require_shop_owner(p_shop_id);
  v_missing text[] := '{}';
begin
  if coalesce(s.name, '') = '' then v_missing := v_missing || 'name'::text; end if;
  if cardinality(s.shop_types) = 0 then v_missing := v_missing || 'shop_types'::text; end if;
  if s.hours = '{}'::jsonb then v_missing := v_missing || 'hours'::text; end if;
  if coalesce(s.owner_name, '') = '' then v_missing := v_missing || 'owner_name'::text; end if;
  if coalesce(s.contact_phone, '') = '' then v_missing := v_missing || 'contact_phone'::text; end if;
  if coalesce(s.address_line, '') = '' or s.area_id is null then v_missing := v_missing || 'address'::text; end if;
  if s.lat is null or s.lng is null then v_missing := v_missing || 'map_pin'::text; end if;
  if not exists (select 1 from public.shop_photos where shop_id = s.id and kind = 'front') then
    v_missing := v_missing || 'front_photo'::text;
  end if;
  if coalesce(s.upi_id, '') = '' then v_missing := v_missing || 'upi_id'::text; end if;
  if not exists (select 1 from public.shop_documents where shop_id = s.id and doc_type = 'owner_id_proof') then
    v_missing := v_missing || 'owner_id_proof'::text;
  end if;
  if not exists (select 1 from public.shop_documents where shop_id = s.id and doc_type in ('trade_licence', 'udyam_certificate', 'gst_certificate')) then
    v_missing := v_missing || 'shop_licence'::text;
  end if;

  if cardinality(v_missing) > 0 then
    return jsonb_build_object('ok', false, 'missing', to_jsonb(v_missing), 'shop', private.shop_json(s.id));
  end if;

  perform set_config('gg.admin_action', 'on', true);
  update public.shops set status = 'under_review', status_reason = null, submitted_at = now(), registration_step = 8
   where id = s.id and status in ('draft', 'changes_requested', 'rejected');
  perform private.notify_admins('shop_submitted', 'New shop to review: ' || s.name,
    coalesce((select name from public.areas where id = s.area_id), ''), jsonb_build_object('shop_id', s.id));
  return jsonb_build_object('ok', true, 'missing', '[]'::jsonb, 'shop', private.shop_json(s.id));
end $$;

-- 3. "Demand near you": searches from all over Hyderabad ---------------------------------------------------------
create or replace function public.shop_demand_insights(p_shop_id uuid, p_days int default 7) returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare
  s public.shops := private.require_shop_owner(p_shop_id);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('query', q.display, 'normalized', q.normalized, 'searches', q.n,
                     'zero_results', q.zero) order by q.n desc)
    from (
      select l.normalized, mode() within group (order by l.query) as display, count(*) as n,
             count(*) filter (where l.results_count = 0) as zero
      from public.search_logs l
      where l.created_at > now() - make_interval(days => greatest(p_days, 1))
      group by l.normalized
      order by count(*) desc
      limit 60
    ) q
    where not exists (
      select 1 from public.shop_products sp
      join public.catalog_products p on p.id = sp.catalog_product_id
      where sp.shop_id = s.id and sp.is_active and sp.in_stock
        and public.gg_match_score(p.search_text, p.search_compact, public.gg_query_variants(q.normalized)) >= 0.8
    )
    limit 20
  ), '[]'::jsonb);
end $$;
