-- Delivery estimates that depend on distance (docs/DECISIONS.md, "Delivery time").
-- The same formula lives in packages/shared/src/map/eta.ts; supabase/tests/07_delivery_eta.test.sql and the
-- TypeScript tests check the same examples, so the app and the database always agree.

-- Two-wheeler ride time for a straight-line distance: roads ~40% longer, 18 km/h in Hyderabad traffic.
create or replace function public.gg_ride_mins(p_km double precision) returns int
language sql immutable parallel safe as $$
  select case when p_km is null then null else greatest(5, ceil(p_km * 1.4 / 18 * 60))::int end;
$$;

-- A shop's usual delivery time covers a typical 4 km trip; nearer customers get it sooner, farther ones later.
-- Rounded to 5 minutes and never under 20. Without a distance it is the shop's usual time.
create or replace function public.gg_delivery_eta_mins(p_avg int, p_usual int, p_km double precision) returns int
language sql immutable parallel safe as $$
  select case
    when p_km is null then public.gg_shop_delivery_mins(p_avg, p_usual)
    else greatest(20, (round(((public.gg_shop_delivery_mins(p_avg, p_usual) + (p_km - 4) * 1.4 / 18 * 60) / 5)::numeric) * 5)::int)
  end;
$$;

-- search_products from 20261008000004_search.sql, unchanged except that each offer's delivery time (used for the
-- "fastest" figure, the delivery-time filter and sorting) is now the estimate for the customer's location.
create or replace function public.search_products(
  p_query text default '',
  p_area_id int default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_filters jsonb default '{}'::jsonb,
  p_sort text default 'relevance',
  p_limit int default 20,
  p_offset int default 0,
  p_log boolean default false
) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_norm text := public.gg_norm(p_query);
  v_variants text[];
  v_deliver_only boolean := coalesce((f->>'deliver_only')::boolean, true);
  v_category int := nullif(f->>'category_id', '')::int;
  v_brands int[];
  v_conditions public.product_condition[];
  v_price_min numeric := nullif(f->>'price_min', '')::numeric;
  v_price_max numeric := nullif(f->>'price_max', '')::numeric;
  v_max_mins int := nullif(f->>'max_delivery_mins', '')::int;
  v_min_rating numeric := nullif(f->>'min_rating', '')::numeric;
  v_lat double precision := p_lat;
  v_lng double precision := p_lng;
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_sort text := coalesce(p_sort, 'relevance');
  v_total int := 0;
  v_items jsonb;
  v_elsewhere int;
begin
  if jsonb_typeof(f->'brand_ids') = 'array' and jsonb_array_length(f->'brand_ids') > 0 then
    select array_agg(x::int) into v_brands from jsonb_array_elements_text(f->'brand_ids') x;
  end if;
  if jsonb_typeof(f->'conditions') = 'array' and jsonb_array_length(f->'conditions') > 0 then
    select array_agg(x::public.product_condition) into v_conditions from jsonb_array_elements_text(f->'conditions') x;
  end if;
  if (v_lat is null or v_lng is null) and p_area_id is not null then
    select a.lat, a.lng into v_lat, v_lng from public.areas a where a.id = p_area_id;
  end if;
  if v_norm <> '' then
    v_variants := public.gg_query_variants(v_norm);
  end if;

  with deliverers as (
    select d.id from public.gg_delivering_shop_ids(p_area_id, v_lat, v_lng) as d(id)
  ),
  matched as (
    select p.id, p.popularity,
      public.gg_rank_score(
        case when v_norm = '' then 1.0::real else public.gg_match_score(p.search_text, p.search_compact, v_variants) end,
        p.model_norm, v_norm) as rank_score,
      case when v_norm = '' then 1.0::real else public.gg_match_score(p.search_text, p.search_compact, v_variants) end as match_score
    from public.catalog_products p
    where p.status = 'approved'
      and (v_category is null or p.category_id = v_category
           or p.category_id in (select c.id from public.categories c where c.parent_id = v_category))
      and (v_brands is null or p.brand_id = any(v_brands))
  ),
  offers as (
    select m.id as product_id, m.rank_score, m.popularity, sp.price, sh.id as shop_id,
      public.gg_distance_km(sh.lat, sh.lng, v_lat, v_lng) as dist,
      public.gg_delivery_eta_mins(sh.avg_delivery_mins, sh.usual_delivery_mins, public.gg_distance_km(sh.lat, sh.lng, v_lat, v_lng)) as mins,
      sh.rating_avg
    from matched m
    join public.shop_products sp on sp.catalog_product_id = m.id and sp.is_active and sp.in_stock
    join public.shops sh on sh.id = sp.shop_id and sh.status = 'approved'
    where m.match_score > 0
      and (v_conditions is null or sp.condition = any(v_conditions))
      and (v_price_min is null or sp.price >= v_price_min)
      and (v_price_max is null or sp.price <= v_price_max)
      and (v_max_mins is null or public.gg_delivery_eta_mins(sh.avg_delivery_mins, sh.usual_delivery_mins, public.gg_distance_km(sh.lat, sh.lng, v_lat, v_lng)) <= v_max_mins)
      and (v_min_rating is null or sh.rating_avg >= v_min_rating)
      and (not v_deliver_only or sh.id in (select id from deliverers))
  ),
  grouped as (
    select product_id,
      max(rank_score) as rank_score,
      max(popularity) as popularity,
      min(price) as min_price,
      max(price) as max_price,
      count(distinct shop_id)::int as shop_count,
      min(dist) as nearest_km,
      min(mins) as fastest_mins,
      max(rating_avg) as best_rating
    from offers
    group by product_id
  ),
  ordered as (
    select g.*,
      count(*) over () as total,
      row_number() over (order by
        case when v_sort = 'price_asc' then g.min_price end asc nulls last,
        case when v_sort = 'price_desc' then g.min_price end desc nulls last,
        case when v_sort = 'nearest' then g.nearest_km end asc nulls last,
        case when v_sort = 'fastest' then g.fastest_mins end asc nulls last,
        case when v_sort = 'rating' then g.best_rating end desc nulls last,
        case when v_sort = 'popular' then g.popularity end desc nulls last,
        g.rank_score desc, g.shop_count desc, g.popularity desc, g.product_id
      ) as ord
    from grouped g
  )
  select coalesce(max(o.total), 0)::int,
    coalesce(jsonb_agg(jsonb_build_object(
      'product_id', p.id,
      'name', p.name,
      'brand', b.name,
      'category_id', p.category_id,
      'photo', p.photos[1],
      'key_specs', p.key_specs,
      'variant', p.variant,
      'mrp', p.mrp,
      'min_price', o.min_price,
      'max_price', o.max_price,
      'shop_count', o.shop_count,
      'nearest_km', round(o.nearest_km::numeric, 1),
      'fastest_mins', o.fastest_mins,
      'best_rating', o.best_rating,
      'score', round(o.rank_score::numeric, 3)
    ) order by o.ord) filter (where o.ord > v_offset and o.ord <= v_offset + v_limit), '[]'::jsonb)
  into v_total, v_items
  from ordered o
  join public.catalog_products p on p.id = o.product_id
  left join public.brands b on b.id = p.brand_id;

  if v_total = 0 and v_deliver_only and v_norm <> '' then
    v_elsewhere := (public.search_products(p_query, p_area_id, v_lat, v_lng,
                      f || jsonb_build_object('deliver_only', false), 'relevance', 1, 0, false) ->> 'total')::int;
  end if;

  if p_log and v_norm <> '' then
    insert into public.search_logs (user_id, query, normalized, area_id, lat, lng, results_count, filters)
    values (auth.uid(), left(p_query, 200), left(v_norm, 200), p_area_id, v_lat, v_lng, v_total, f);
  end if;

  return jsonb_build_object(
    'total', v_total,
    'items', v_items,
    'normalized', v_norm,
    'variants', coalesce(to_jsonb(v_variants), '[]'::jsonb),
    'elsewhere_count', v_elsewhere
  );
end $$;
