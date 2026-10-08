-- Gadget Galli · 0004 · search, product pages, shop pages, home feed
--
-- How matching works (gg_match_score):
--   * query and product text are normalised the same way (gg_norm): "RTX4060" == "rtx 4060"
--   * every query word must match a word in the product text:
--       exact word = 1.0, word prefix = 0.85 ("card" ~ "cards"),
--       typo (trigram word_similarity >= 0.5, words of 4+ letters) = 0.8 x similarity ("iphon" ~ "iphone")
--   * numbers must match exactly or as a prefix ("15" never matches "16")
--   * with 4+ words, one non-numeric word may be missing
--   * or the whole query without spaces is a substring of the product ("rtx4060", "oneplus12")
--   * synonym groups (gpu = graphics card, mobile = phone, cc camera = cctv) add query variants

create or replace function public.gg_token_score(tok text, txt text) returns real
language sql immutable parallel safe set search_path = public, extensions as $$
  select case
    when position(' ' || tok || ' ' in ' ' || txt || ' ') > 0 then 1.0::real
    when tok ~ '^[0-9]+$' and length(tok) <= 2 then 0::real
    when position(' ' || tok in ' ' || txt) > 0 then 0.85::real
    when length(tok) < 4 or tok ~ '^[0-9]+$' then 0::real
    else (select case when ws >= 0.5 then (ws * 0.8)::real else 0::real end
            from (select extensions.word_similarity(tok, txt) as ws) x)
  end;
$$;

create or replace function public.gg_match_score(p_text text, p_compact text, p_variants text[])
returns real
language plpgsql immutable parallel safe set search_path = public, extensions as $$
declare
  v text;
  toks text[];
  tok text;
  s real;
  total real;
  matched int;
  n int;
  num_missing int;
  best real := 0;
  qc text;
begin
  if p_variants is null then return 0; end if;
  foreach v in array p_variants loop
    continue when v is null or v = '';
    toks := string_to_array(v, ' ');
    n := coalesce(array_length(toks, 1), 0);
    continue when n = 0;
    total := 0; matched := 0; num_missing := 0;
    foreach tok in array toks loop
      s := public.gg_token_score(tok, p_text);
      if s > 0 then
        matched := matched + 1;
        total := total + s;
      elsif tok ~ '^[0-9]+$' then
        num_missing := num_missing + 1;
      end if;
    end loop;
    if num_missing = 0 and matched >= greatest(1, n - case when n >= 4 then 1 else 0 end) then
      s := total / n;
      if position(v in p_text) > 0 then s := s + 0.3; end if;
      best := greatest(best, s);
    end if;
    qc := replace(v, ' ', '');
    if length(qc) >= 4 and position(qc in coalesce(p_compact, '')) > 0 then
      best := greatest(best, 1.1::real);
    end if;
  end loop;
  return best;
end $$;

-- The normalised query plus one variant per applicable synonym substitution.
create or replace function public.gg_query_variants(p_norm text) returns text[]
language sql stable security definer set search_path = public as $$
  select array_agg(v) from (
    select distinct btrim(v) as v from (
      select p_norm as v
      union all
      select replace(' ' || p_norm || ' ', ' ' || public.gg_norm(w1) || ' ', ' ' || public.gg_norm(w2) || ' ')
      from public.search_synonyms s
      cross join lateral unnest(s.words) w1
      cross join lateral unnest(s.words) w2
      where w1 <> w2 and coalesce(p_norm, '') <> ''
        and position(' ' || public.gg_norm(w1) || ' ' in ' ' || p_norm || ' ') > 0
    ) t
    where btrim(v) <> ''
    limit 12
  ) u;
$$;

-- Relevance used for ranking: match score + bonus when the query names the model.
create or replace function public.gg_rank_score(p_score real, p_model_norm text, p_norm text) returns real
language sql immutable parallel safe set search_path = public, extensions as $$
  select case when coalesce(p_norm, '') = '' then p_score else
    p_score
    + case
        when p_model_norm <> '' and (p_model_norm = p_norm or p_model_norm like p_norm || ' %') then 0.5
        when (' ' || p_model_norm || ' ') like ('% ' || p_norm || ' %') then 0.4
        else 0 end
    + 0.6 * extensions.similarity(p_norm, p_model_norm)
  end::real;
$$;

-- ---------------------------------------------------------------------------
-- search_products: results grouped by product
-- filters: {category_id, brand_ids[], price_min, price_max, conditions[], max_delivery_mins, min_rating, deliver_only}
-- sort: relevance | price_asc | price_desc | nearest | fastest | rating | popular
-- ---------------------------------------------------------------------------
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
      public.gg_shop_delivery_mins(sh.avg_delivery_mins, sh.usual_delivery_mins) as mins,
      sh.rating_avg
    from matched m
    join public.shop_products sp on sp.catalog_product_id = m.id and sp.is_active and sp.in_stock
    join public.shops sh on sh.id = sp.shop_id and sh.status = 'approved'
    where m.match_score > 0
      and (v_conditions is null or sp.condition = any(v_conditions))
      and (v_price_min is null or sp.price >= v_price_min)
      and (v_price_max is null or sp.price <= v_price_max)
      and (v_max_mins is null or public.gg_shop_delivery_mins(sh.avg_delivery_mins, sh.usual_delivery_mins) <= v_max_mins)
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

-- ---------------------------------------------------------------------------
-- Live suggestions while typing: products, brands, shops, categories
-- ---------------------------------------------------------------------------
create or replace function public.search_suggest(p_query text, p_limit int default 6)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_norm text := public.gg_norm(p_query);
  v_first text := split_part(public.gg_norm(p_query), ' ', 1);
  v_variants text[];
  v_products jsonb;
  v_brands jsonb;
  v_shops jsonb;
  v_categories jsonb;
begin
  if v_norm = '' then
    return jsonb_build_object('products', '[]'::jsonb, 'brands', '[]'::jsonb, 'shops', '[]'::jsonb, 'categories', '[]'::jsonb);
  end if;
  v_variants := public.gg_query_variants(v_norm);

  select coalesce(jsonb_agg(x.j order by x.r desc, x.pop desc), '[]'::jsonb) into v_products
  from (
    select jsonb_build_object('id', p.id, 'name', p.name, 'brand', b.name, 'photo', p.photos[1],
             'min_price', (select min(sp.price) from public.shop_products sp join public.shops s on s.id = sp.shop_id
                           where sp.catalog_product_id = p.id and sp.is_active and sp.in_stock and s.status = 'approved'),
             'category_id', p.category_id) as j,
           public.gg_rank_score(public.gg_match_score(p.search_text, p.search_compact, v_variants), p.model_norm, v_norm) as r,
           p.popularity as pop
    from public.catalog_products p
    left join public.brands b on b.id = p.brand_id
    where p.status = 'approved'
      and public.gg_match_score(p.search_text, p.search_compact, v_variants) > 0
      and exists (select 1 from public.shop_products sp join public.shops s on s.id = sp.shop_id
                  where sp.catalog_product_id = p.id and sp.is_active and s.status = 'approved')
    order by r desc, p.popularity desc
    limit least(greatest(p_limit, 1), 10)
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.name), '[]'::jsonb) into v_brands
  from (
    select b.* from public.brands b
    where b.is_active
      and (public.gg_norm(b.name) like v_first || '%'
           or (length(v_first) >= 4 and extensions.word_similarity(v_first, public.gg_norm(b.name)) >= 0.6))
    order by b.name
    limit 3
  ) b;

  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'area', a.name, 'logo_path', s.logo_path,
                                               'rating_avg', s.rating_avg, 'verified', s.verified)), '[]'::jsonb) into v_shops
  from (
    select s.* from public.shops s
    where s.status = 'approved'
      and public.gg_match_score(public.gg_norm(s.name), public.gg_compact(s.name), array[v_norm]) > 0
    order by s.rating_avg desc
    limit 3
  ) s
  left join public.areas a on a.id = s.area_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'icon', c.icon, 'parent_id', c.parent_id)), '[]'::jsonb)
    into v_categories
  from (
    select c.* from public.categories c
    where c.is_active
      and public.gg_match_score(public.gg_norm(c.name || ' ' || c.slug), public.gg_compact(c.name), v_variants) > 0
    order by c.parent_id nulls first, c.sort
    limit 3
  ) c;

  return jsonb_build_object('products', v_products, 'brands', v_brands, 'shops', v_shops, 'categories', v_categories);
end $$;

-- ---------------------------------------------------------------------------
-- Product page: product details + "Available at these shops"
-- ---------------------------------------------------------------------------
create or replace function public.get_product_page(
  p_product_id uuid,
  p_area_id int default null,
  p_lat double precision default null,
  p_lng double precision default null
) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_id uuid;
  v_lat double precision := p_lat;
  v_lng double precision := p_lng;
  v_product jsonb;
  v_offers jsonb;
  v_variants jsonb;
  v_brand_id int;
  v_model text;
begin
  select coalesce(p.merged_into, p.id) into v_id from public.catalog_products p where p.id = p_product_id;
  if v_id is null then return null; end if;
  if (v_lat is null or v_lng is null) and p_area_id is not null then
    select a.lat, a.lng into v_lat, v_lng from public.areas a where a.id = p_area_id;
  end if;

  select jsonb_build_object(
      'id', p.id, 'name', p.name, 'model', p.model, 'model_number', p.model_number,
      'brand', b.name, 'brand_id', p.brand_id,
      'category', jsonb_build_object('id', c.id, 'name', c.name, 'parent_id', c.parent_id, 'parent_name', pc.name, 'icon', c.icon),
      'variant', p.variant, 'key_specs', p.key_specs, 'specs', p.specs, 'description', p.description,
      'in_the_box', p.in_the_box, 'photos', to_jsonb(p.photos), 'mrp', p.mrp, 'status', p.status),
    p.brand_id, p.model_norm
  into v_product, v_brand_id, v_model
  from public.catalog_products p
  left join public.brands b on b.id = p.brand_id
  join public.categories c on c.id = p.category_id
  left join public.categories pc on pc.id = c.parent_id
  where p.id = v_id
    and (p.status in ('approved', 'pending') or public.is_admin());

  if v_product is null then return null; end if;

  select coalesce(jsonb_agg(x.j order by x.delivers desc, x.in_stock desc, x.price asc, x.dist asc nulls last), '[]'::jsonb)
  into v_offers
  from (
    select jsonb_build_object(
        'shop_product_id', sp.id, 'shop_id', s.id, 'shop_name', s.name, 'shop_slug', s.slug,
        'area', a.name, 'verified', s.verified, 'rating_avg', s.rating_avg, 'rating_count', s.rating_count,
        'logo_path', s.logo_path, 'price', sp.price, 'mrp', coalesce(sp.mrp, p.mrp), 'condition', sp.condition,
        'in_stock', sp.in_stock, 'stock_qty', sp.stock_qty, 'warranty_months', sp.warranty_months,
        'warranty_type', sp.warranty_type, 'installation_available', sp.installation_available,
        'installation_charge', sp.installation_charge,
        'distance_km', round(public.gg_distance_km(s.lat, s.lng, v_lat, v_lng)::numeric, 1),
        'delivers', public.shop_delivers_to(s.id, p_area_id, v_lat, v_lng),
        'delivery_mins', public.gg_shop_delivery_mins(s.avg_delivery_mins, s.usual_delivery_mins),
        'delivery_charge', public.gg_delivery_charge(s.delivery_charge_type, s.delivery_charge, s.free_delivery_above,
                              public.gg_distance_km(s.lat, s.lng, v_lat, v_lng), sp.price),
        'store_pickup', s.store_pickup,
        'is_open_now', public.gg_shop_open_now(s.hours, s.is_open)
      ) as j,
      public.shop_delivers_to(s.id, p_area_id, v_lat, v_lng) as delivers,
      sp.in_stock, sp.price,
      public.gg_distance_km(s.lat, s.lng, v_lat, v_lng) as dist
    from public.shop_products sp
    join public.shops s on s.id = sp.shop_id and s.status = 'approved'
    join public.catalog_products p on p.id = sp.catalog_product_id
    left join public.areas a on a.id = s.area_id
    where sp.catalog_product_id = v_id and sp.is_active
  ) x;

  -- Same model in other storage/colour variants
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'variant', p.variant,
            'min_price', (select min(sp.price) from public.shop_products sp join public.shops s on s.id = sp.shop_id
                          where sp.catalog_product_id = p.id and sp.is_active and sp.in_stock and s.status = 'approved'))
          order by p.name), '[]'::jsonb)
  into v_variants
  from public.catalog_products p
  where p.status = 'approved' and p.id <> v_id and v_model <> ''
    and p.model_norm = v_model and p.brand_id is not distinct from v_brand_id;

  return jsonb_build_object('product', v_product, 'offers', v_offers, 'variants', v_variants);
end $$;

create or replace function public.track_product_view(p_product_id uuid) returns void
language sql volatile security definer set search_path = public as $$
  update public.catalog_products set popularity = popularity + 1 where id = p_product_id;
$$;

-- ---------------------------------------------------------------------------
-- Shops near a location
-- ---------------------------------------------------------------------------
create or replace function public.shops_near(
  p_area_id int default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_limit int default 20,
  p_offset int default 0,
  p_only_delivering boolean default true,
  p_shop_type public.shop_type default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_lat double precision := p_lat;
  v_lng double precision := p_lng;
  v_items jsonb;
begin
  if (v_lat is null or v_lng is null) and p_area_id is not null then
    select a.lat, a.lng into v_lat, v_lng from public.areas a where a.id = p_area_id;
  end if;
  select coalesce(jsonb_agg(x.j order by x.open_now desc, x.dist asc nulls last, x.rating desc), '[]'::jsonb) into v_items
  from (
    select jsonb_build_object(
        'id', s.id, 'slug', s.slug, 'name', s.name, 'area', a.name, 'shop_types', to_jsonb(s.shop_types),
        'rating_avg', s.rating_avg, 'rating_count', s.rating_count, 'verified', s.verified,
        'logo_path', s.logo_path, 'cover_path', s.cover_path,
        'cover_photo', (select ph.path from public.shop_photos ph where ph.shop_id = s.id and ph.kind in ('front', 'cover') order by ph.kind desc, ph.sort limit 1),
        'distance_km', round(public.gg_distance_km(s.lat, s.lng, v_lat, v_lng)::numeric, 1),
        'delivery_mins', public.gg_shop_delivery_mins(s.avg_delivery_mins, s.usual_delivery_mins),
        'is_open_now', public.gg_shop_open_now(s.hours, s.is_open),
        'delivers', public.shop_delivers_to(s.id, p_area_id, v_lat, v_lng),
        'store_pickup', s.store_pickup
      ) as j,
      public.gg_shop_open_now(s.hours, s.is_open) as open_now,
      public.gg_distance_km(s.lat, s.lng, v_lat, v_lng) as dist,
      s.rating_avg as rating
    from public.shops s
    left join public.areas a on a.id = s.area_id
    where s.status = 'approved'
      and (p_shop_type is null or p_shop_type = any(s.shop_types))
      and (not p_only_delivering or s.id in (select d from public.gg_delivering_shop_ids(p_area_id, v_lat, v_lng) d))
    order by public.gg_shop_open_now(s.hours, s.is_open) desc, public.gg_distance_km(s.lat, s.lng, v_lat, v_lng) asc nulls last
    limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
  ) x;
  return v_items;
end $$;

-- ---------------------------------------------------------------------------
-- Home screen in one round trip (slow mobile data friendly)
-- ---------------------------------------------------------------------------
create or replace function public.home_feed(
  p_area_id int default null,
  p_lat double precision default null,
  p_lng double precision default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_banners jsonb;
  v_categories jsonb;
  v_featured_shops jsonb;
  v_featured_products jsonb;
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

  return jsonb_build_object(
    'banners', v_banners,
    'categories', v_categories,
    'shops_near', public.shops_near(p_area_id, p_lat, p_lng, 10, 0, true, null),
    'popular', public.search_products('', p_area_id, p_lat, p_lng, '{"deliver_only": true}'::jsonb, 'popular', 10, 0, false) -> 'items',
    'featured_shop_ids', v_featured_shops,
    'featured_product_ids', v_featured_products
  );
end $$;

-- Products by id (recently viewed, featured), with lowest price near the customer.
create or replace function public.products_by_ids(
  p_ids uuid[],
  p_area_id int default null,
  p_lat double precision default null,
  p_lng double precision default null
) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', p.id, 'name', p.name, 'brand', b.name, 'photo', p.photos[1], 'key_specs', p.key_specs,
      'category_id', p.category_id, 'mrp', p.mrp,
      'min_price', (select min(sp.price) from public.shop_products sp join public.shops s on s.id = sp.shop_id
                    where sp.catalog_product_id = p.id and sp.is_active and sp.in_stock and s.status = 'approved'),
      'shop_count', (select count(distinct sp.shop_id) from public.shop_products sp join public.shops s on s.id = sp.shop_id
                     where sp.catalog_product_id = p.id and sp.is_active and sp.in_stock and s.status = 'approved'
                       and s.id in (select d from public.gg_delivering_shop_ids(p_area_id, p_lat, p_lng) d))
    ) order by array_position(p_ids, p.id)), '[]'::jsonb)
  from public.catalog_products p
  left join public.brands b on b.id = p.brand_id
  where p.id = any(p_ids) and p.status = 'approved';
$$;

-- ---------------------------------------------------------------------------
-- Shop page
-- ---------------------------------------------------------------------------
create or replace function public.get_shop_page(
  p_shop_id uuid,
  p_area_id int default null,
  p_lat double precision default null,
  p_lng double precision default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s public.shops;
  v_lat double precision := p_lat;
  v_lng double precision := p_lng;
  v_area jsonb;
  v_photos jsonb;
  v_zones jsonb;
  v_areas jsonb;
  v_tabs jsonb;
  v_km double precision;
begin
  select * into s from public.shops where id = p_shop_id;
  if s.id is null or (s.status <> 'approved' and s.owner_id is distinct from auth.uid() and not public.is_admin()) then
    return null;
  end if;
  if (v_lat is null or v_lng is null) and p_area_id is not null then
    select a.lat, a.lng into v_lat, v_lng from public.areas a where a.id = p_area_id;
  end if;
  v_km := public.gg_distance_km(s.lat, s.lng, v_lat, v_lng);

  select jsonb_build_object('id', a.id, 'name', a.name, 'pincode', a.pincode, 'zone', z.name) into v_area
  from public.areas a join public.zones z on z.id = a.zone_id where a.id = s.area_id;

  select coalesce(jsonb_agg(jsonb_build_object('id', ph.id, 'kind', ph.kind, 'path', ph.path) order by ph.kind, ph.sort), '[]'::jsonb)
  into v_photos from public.shop_photos ph where ph.shop_id = s.id;

  select coalesce(jsonb_agg(z.name order by z.sort), '[]'::jsonb) into v_zones
  from public.delivery_areas da join public.zones z on z.id = da.zone_id where da.shop_id = s.id;
  select coalesce(jsonb_agg(a.name order by a.name), '[]'::jsonb) into v_areas
  from public.delivery_areas da join public.areas a on a.id = da.area_id where da.shop_id = s.id;

  select coalesce(jsonb_agg(jsonb_build_object('category_id', t.id, 'name', t.name, 'icon', t.icon, 'count', t.n)
                  order by t.n desc), '[]'::jsonb)
  into v_tabs
  from (
    select c.id, c.name, c.icon, count(*) as n
    from public.shop_products sp
    join public.catalog_products p on p.id = sp.catalog_product_id
    join public.categories c on c.id = p.category_id
    where sp.shop_id = s.id and sp.is_active
    group by c.id, c.name, c.icon
  ) t;

  return jsonb_build_object(
    'id', s.id, 'slug', s.slug, 'name', s.name, 'description', s.description, 'shop_types', to_jsonb(s.shop_types),
    'status', s.status, 'verified', s.verified, 'rating_avg', s.rating_avg, 'rating_count', s.rating_count,
    'address_line', s.address_line, 'landmark', s.landmark, 'pincode', s.pincode, 'area', v_area,
    'lat', s.lat, 'lng', s.lng, 'hours', s.hours, 'weekly_holiday', s.weekly_holiday,
    'is_open', s.is_open, 'is_open_now', public.gg_shop_open_now(s.hours, s.is_open),
    'contact_phone', s.contact_phone, 'whatsapp_phone', coalesce(s.whatsapp_phone, s.contact_phone),
    'logo_path', s.logo_path, 'cover_path', s.cover_path, 'photos', v_photos,
    'delivery', jsonb_build_object(
      'mode', s.delivery_mode, 'radius_km', s.delivery_radius_km, 'zones', v_zones, 'areas', v_areas,
      'charge_type', s.delivery_charge_type, 'charge', s.delivery_charge, 'free_above', s.free_delivery_above,
      'min_order', s.min_order, 'store_pickup', s.store_pickup,
      'usual_mins', s.usual_delivery_mins, 'avg_mins', s.avg_delivery_mins,
      'delivery_mins', public.gg_shop_delivery_mins(s.avg_delivery_mins, s.usual_delivery_mins),
      'orders_delivered', s.orders_delivered,
      'delivers_to_me', public.shop_delivers_to(s.id, p_area_id, v_lat, v_lng),
      'distance_km', round(v_km::numeric, 1),
      'my_charge', public.gg_delivery_charge(s.delivery_charge_type, s.delivery_charge, null, v_km, 0)
    ),
    'tabs', v_tabs,
    'is_favourite', exists (select 1 from public.favourites f where f.user_id = auth.uid() and f.shop_id = s.id)
  );
end $$;

-- Listings of one shop, with search inside the shop and category tabs.
create or replace function public.shop_catalog(
  p_shop_id uuid,
  p_query text default '',
  p_category_id int default null,
  p_limit int default 30,
  p_offset int default 0,
  p_include_inactive boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_norm text := public.gg_norm(p_query);
  v_variants text[];
  v_owner boolean := public.owns_shop(p_shop_id) or public.is_admin();
  v_total int;
  v_items jsonb;
begin
  if not v_owner and not public.shop_is_public(p_shop_id) then
    return jsonb_build_object('total', 0, 'items', '[]'::jsonb);
  end if;
  if v_norm <> '' then v_variants := public.gg_query_variants(v_norm); end if;

  with base as (
    select sp.*, p.name, p.model, p.model_number, p.variant, p.key_specs, p.photos as catalog_photos,
           p.category_id, p.status as catalog_status, p.mrp as catalog_mrp, b.name as brand,
           case when v_norm = '' then 1.0::real else public.gg_match_score(p.search_text, p.search_compact, v_variants) end as score
    from public.shop_products sp
    join public.catalog_products p on p.id = sp.catalog_product_id
    left join public.brands b on b.id = p.brand_id
    where sp.shop_id = p_shop_id
      and (sp.is_active or (p_include_inactive and v_owner))
      and (p_category_id is null or p.category_id = p_category_id
           or p.category_id in (select c.id from public.categories c where c.parent_id = p_category_id))
  ),
  ordered as (
    select base.*, count(*) over () as total,
      row_number() over (order by base.in_stock desc, base.score desc, base.name) as ord
    from base where base.score > 0
  )
  select coalesce(max(total), 0)::int,
    coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'shop_product_id', o.id, 'catalog_product_id', o.catalog_product_id, 'name', o.name,
      'brand', o.brand, 'model', o.model, 'model_number', o.model_number, 'variant', o.variant,
      'key_specs', o.key_specs, 'category_id', o.category_id,
      'photo', coalesce(o.photos[1], o.catalog_photos[1]), 'photos', to_jsonb(o.photos),
      'condition', o.condition, 'price', o.price, 'mrp', coalesce(o.mrp, o.catalog_mrp),
      'in_stock', o.in_stock, 'stock_qty', o.stock_qty, 'warranty_months', o.warranty_months,
      'warranty_type', o.warranty_type, 'installation_available', o.installation_available,
      'installation_charge', o.installation_charge, 'is_active', o.is_active, 'catalog_status', o.catalog_status,
      'updated_at', o.updated_at
    ) order by o.ord) filter (where o.ord > greatest(p_offset, 0) and o.ord <= greatest(p_offset, 0) + least(greatest(p_limit, 1), 100)), '[]'::jsonb)
  into v_total, v_items
  from ordered o;

  return jsonb_build_object('total', v_total, 'items', v_items);
end $$;

-- One listing with full product details (shop product detail screen).
create or replace function public.get_shop_product(
  p_shop_product_id uuid,
  p_area_id int default null,
  p_lat double precision default null,
  p_lng double precision default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
  v_lat double precision := p_lat;
  v_lng double precision := p_lng;
begin
  if (v_lat is null or v_lng is null) and p_area_id is not null then
    select a.lat, a.lng into v_lat, v_lng from public.areas a where a.id = p_area_id;
  end if;
  select jsonb_build_object(
    'id', sp.id, 'shop_id', sp.shop_id, 'catalog_product_id', p.id, 'name', p.name, 'brand', b.name,
    'model', p.model, 'model_number', p.model_number, 'variant', p.variant, 'key_specs', p.key_specs,
    'specs', p.specs || coalesce(sp.specs, '{}'::jsonb), 'description', coalesce(sp.description, p.description),
    'in_the_box', coalesce(sp.in_the_box, p.in_the_box),
    'photos', to_jsonb(case when cardinality(sp.photos) > 0 then sp.photos else p.photos end),
    'category', jsonb_build_object('id', c.id, 'name', c.name, 'icon', c.icon),
    'condition', sp.condition, 'price', sp.price, 'mrp', coalesce(sp.mrp, p.mrp),
    'warranty_months', sp.warranty_months, 'warranty_type', sp.warranty_type,
    'stock_qty', sp.stock_qty, 'in_stock', sp.in_stock, 'is_active', sp.is_active,
    'installation_available', sp.installation_available, 'installation_charge', sp.installation_charge,
    'shop', jsonb_build_object('id', s.id, 'name', s.name, 'area', a.name, 'verified', s.verified,
      'rating_avg', s.rating_avg, 'rating_count', s.rating_count, 'is_open_now', public.gg_shop_open_now(s.hours, s.is_open),
      'delivers_to_me', public.shop_delivers_to(s.id, p_area_id, v_lat, v_lng),
      'delivery_mins', public.gg_shop_delivery_mins(s.avg_delivery_mins, s.usual_delivery_mins),
      'distance_km', round(public.gg_distance_km(s.lat, s.lng, v_lat, v_lng)::numeric, 1),
      'store_pickup', s.store_pickup),
    -- The shop's own values (not merged with the catalog) so the owner's edit form shows only what they wrote.
    'own', case when s.owner_id = auth.uid() then jsonb_build_object(
      'description', sp.description, 'specs', coalesce(sp.specs, '{}'::jsonb), 'in_the_box', sp.in_the_box,
      'photos', to_jsonb(sp.photos), 'mrp', sp.mrp) end
  ) into v
  from public.shop_products sp
  join public.catalog_products p on p.id = sp.catalog_product_id
  join public.categories c on c.id = p.category_id
  join public.shops s on s.id = sp.shop_id
  left join public.brands b on b.id = p.brand_id
  left join public.areas a on a.id = s.area_id
  where sp.id = p_shop_product_id
    and (s.status = 'approved' or s.owner_id = auth.uid() or public.is_admin());
  return v;
end $$;

-- Reviews with a star breakdown.
create or replace function public.shop_reviews(p_shop_id uuid, p_limit int default 20, p_offset int default 0)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'summary', (
      select jsonb_build_object(
        'avg', coalesce(round(avg(r.rating)::numeric, 1), 0),
        'count', count(*),
        'dist', jsonb_build_object(
          '5', count(*) filter (where r.rating = 5), '4', count(*) filter (where r.rating = 4),
          '3', count(*) filter (where r.rating = 3), '2', count(*) filter (where r.rating = 2),
          '1', count(*) filter (where r.rating = 1)))
      from public.reviews r where r.shop_id = p_shop_id and not r.is_hidden),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', r.id, 'order_id', r.order_id, 'rating', r.rating, 'body', r.body, 'photos', to_jsonb(r.photos),
          'customer_name', coalesce(r.customer_name, 'Customer'), 'shop_reply', r.shop_reply,
          'shop_replied_at', r.shop_replied_at, 'created_at', r.created_at,
          'items', (select string_agg(i->>'name', ', ') from public.orders o, jsonb_array_elements(o.items) i where o.id = r.order_id))
        order by r.created_at desc)
      from (select * from public.reviews r2 where r2.shop_id = p_shop_id and not r2.is_hidden
            order by r2.created_at desc limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)) r
    ), '[]'::jsonb)
  );
$$;

-- Master catalog lookup used by shops when adding products (no listing required).
create or replace function public.catalog_lookup(p_query text, p_category_id int default null, p_limit int default 20)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_norm text := public.gg_norm(p_query);
  v_variants text[];
begin
  perform private.require_user();
  if v_norm = '' and p_category_id is null then return '[]'::jsonb; end if;
  if v_norm <> '' then v_variants := public.gg_query_variants(v_norm); end if;
  return coalesce((
    select jsonb_agg(x.j order by x.r desc, x.pop desc)
    from (
      select jsonb_build_object('id', p.id, 'name', p.name, 'brand', b.name, 'brand_id', p.brand_id, 'model', p.model,
               'model_number', p.model_number, 'variant', p.variant, 'key_specs', p.key_specs, 'photo', p.photos[1],
               'mrp', p.mrp, 'category_id', p.category_id, 'category', c.name, 'status', p.status) as j,
             public.gg_rank_score(case when v_norm = '' then 1.0::real else public.gg_match_score(p.search_text, p.search_compact, v_variants) end, p.model_norm, v_norm) as r,
             p.popularity as pop
      from public.catalog_products p
      join public.categories c on c.id = p.category_id
      left join public.brands b on b.id = p.brand_id
      where (p.status = 'approved' or (p.status = 'pending' and p.created_by = auth.uid()))
        and (p_category_id is null or p.category_id = p_category_id or c.parent_id = p_category_id)
        and (v_norm = '' or public.gg_match_score(p.search_text, p.search_compact, v_variants) > 0)
      order by r desc, p.popularity desc
      limit least(greatest(p_limit, 1), 50)
    ) x
  ), '[]'::jsonb);
end $$;
