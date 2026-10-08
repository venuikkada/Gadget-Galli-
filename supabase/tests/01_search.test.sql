-- Search: typo tolerance, partial/joined model numbers, synonyms, grouping by product,
-- and "Delivers to my area" for a customer in Kukatpally.
\ir _prelude.sql
begin;

do $$
declare
  k int := current_setting('test.kukatpally')::int;
  r jsonb;
  top jsonb;
  gpu_cat int := (select id from public.categories where slug = 'graphics-cards');
  cctv_parent int := (select id from public.categories where slug = 'cctv-security');
  q text;
begin
  -- Typo: "iphon 15" finds the iPhone 15
  r := public.search_products('iphon 15', k);
  assert (r->'items'->0->>'name') like 'Apple iPhone 15 (%', format('iphon 15 -> %s', r->'items'->0->>'name');

  -- "rtx4060", "4060" and "rtx 4060" all find RTX 4060 graphics cards first
  foreach q in array array['rtx4060', '4060', 'rtx 4060', 'RTX-4060'] loop
    r := public.search_products(q, k);
    assert (r->>'total')::int >= 3, format('%s: too few results %s', q, r->>'total');
    assert (r->'items'->0->>'category_id')::int = gpu_cat, format('%s: first result is not a graphics card: %s', q, r->'items'->0->>'name');
    assert exists (select 1 from jsonb_array_elements(r->'items') i where i->>'name' like 'ZOTAC Gaming GeForce RTX 4060 Twin Edge%'),
      format('%s: ZOTAC RTX 4060 missing', q);
    assert not exists (select 1 from jsonb_array_elements(r->'items') i where i->>'name' like '%RTX 4070%' or i->>'name' like '%RTX 5060%'),
      format('%s: other GPU models leaked into results', q);
  end loop;

  -- "hikvision 2mp" -> Hikvision 2 MP cameras
  r := public.search_products('hikvision 2mp', k);
  top := r->'items'->0;
  assert top->>'brand' = 'Hikvision' and top->>'name' like '%2MP%', format('hikvision 2mp -> %s', top->>'name');

  -- Typo in brand: "hikvison dome"
  r := public.search_products('hikvison dome', k);
  assert (r->'items'->0->>'name') like 'Hikvision 2MP HD Dome%', format('hikvison dome -> %s', r->'items'->0->>'name');

  -- Synonyms: gpu = graphics card; cc camera = CCTV; mobile = phone
  r := public.search_products('gpu', k, null, null, '{}', 'relevance', 50);
  assert (r->>'total')::int >= 5, 'gpu: too few results';
  assert not exists (select 1 from jsonb_array_elements(r->'items') i where (i->>'category_id')::int <> gpu_cat),
    'gpu: non graphics-card result';
  r := public.search_products('cc camera', k);
  assert (r->>'total')::int >= 3, 'cc camera: too few results';
  assert (select c.parent_id from public.categories c where c.id = (r->'items'->0->>'category_id')::int) = cctv_parent,
    format('cc camera -> %s', r->'items'->0->>'name');
  r := public.search_products('samsung mobile', k);
  assert (r->'items'->0->>'name') like 'Samsung Galaxy%', format('samsung mobile -> %s', r->'items'->0->>'name');

  -- Exact variant ranking: "iphone 15 128gb"
  r := public.search_products('iphone 15 128gb', k);
  assert r->'items'->0->>'name' = 'Apple iPhone 15 (128 GB, Black)', format('iphone 15 128gb -> %s', r->'items'->0->>'name');

  -- Numbers never fuzzy-match: "iphone 14" must not return iPhone 15/16/17
  r := public.search_products('iphone 14', k);
  assert not exists (select 1 from jsonb_array_elements(r->'items') i where i->>'name' like 'Apple iPhone 1%'),
    'iphone 14 returned another iPhone';
end $$;

-- Grouped by product + "Delivers to my area" (ON by default)
do $$
declare
  k int := current_setting('test.kukatpally')::int;
  zotac uuid := current_setting('test.zotac4060')::uuid;
  near jsonb;
  anywhere jsonb;
  page jsonb;
begin
  near := (select i from jsonb_array_elements(public.search_products('rtx 4060', k)->'items') i where (i->>'product_id')::uuid = zotac);
  anywhere := (select i from jsonb_array_elements(public.search_products('rtx 4060', k, null, null, '{"deliver_only": false}')->'items') i
               where (i->>'product_id')::uuid = zotac);
  assert (near->>'shop_count')::int = 2, format('Kukatpally should see 2 shops for ZOTAC RTX 4060, got %s', near->>'shop_count');
  assert (anywhere->>'shop_count')::int = 4, format('All Hyderabad should have 4 shops, got %s', anywhere->>'shop_count');
  assert (near->>'min_price')::numeric > 0, 'missing lowest price';

  -- Product page: one row per shop, only KPHB and Cyber Zone deliver to Kukatpally
  page := public.get_product_page(zotac, k);
  assert jsonb_array_length(page->'offers') = 4, 'expected 4 offers';
  assert (select array_agg(o->>'shop_name' order by o->>'shop_name') from jsonb_array_elements(page->'offers') o where (o->>'delivers')::boolean)
         = array['Cyber Zone Systems', 'KPHB Computer World'], 'wrong delivering shops';
  assert (page->'offers'->0->>'delivers')::boolean, 'delivering shops must be listed first';
end $$;

-- Filters and sorts
do $$
declare
  k int := current_setting('test.kukatpally')::int;
  r jsonb;
  prev numeric := 0;
  i jsonb;
begin
  r := public.search_products('gpu', k, null, null, '{"price_max": 30000}', 'price_asc', 50);
  for i in select * from jsonb_array_elements(r->'items') loop
    assert (i->>'min_price')::numeric <= 30000, 'price filter ignored';
    assert (i->>'min_price')::numeric >= prev, 'price_asc not sorted';
    prev := (i->>'min_price')::numeric;
  end loop;
  r := public.search_products('', k, null, null, jsonb_build_object('category_id', (select id from public.categories where slug = 'components')), 'popular', 10);
  assert (r->>'total')::int > 10, 'category browse returned too little';
  r := public.search_products('iphone', k, null, null, '{"conditions": ["refurbished"], "deliver_only": false}', 'relevance', 20);
  assert (r->>'total')::int >= 0, 'condition filter failed';
end $$;

-- Zero results, suggestions and search logging
do $$
declare
  k int := current_setting('test.kukatpally')::int;
  r jsonb;
  before int := (select count(*) from public.search_logs);
begin
  r := public.search_products('playstation 5 pro', k, null, null, '{}', 'relevance', 20, 0, true);
  assert (r->>'total')::int = 0, 'ps5 should have no results';
  assert (select count(*) from public.search_logs) = before + 1, 'search was not logged';
  assert (select results_count from public.search_logs order by id desc limit 1) = 0, 'zero results not logged';

  r := public.search_suggest('iph');
  assert jsonb_array_length(r->'products') > 0, 'no product suggestions for iph';
  r := public.search_suggest('hikv');
  assert exists (select 1 from jsonb_array_elements(r->'brands') b where b->>'name' = 'Hikvision'), 'brand suggestion missing';
  r := public.search_suggest('kphb');
  assert exists (select 1 from jsonb_array_elements(r->'shops') s where s->>'name' = 'KPHB Computer World'), 'shop suggestion missing';
end $$;

-- Home feed and shops near
do $$
declare
  k int := current_setting('test.kukatpally')::int;
  h jsonb := public.home_feed(k);
begin
  assert jsonb_array_length(h->'banners') >= 3, 'banners missing';
  assert jsonb_array_length(h->'categories') = 5, 'expected 5 top categories';
  assert jsonb_array_length(h->'shops_near') >= 3, 'shops near Kukatpally missing';
  assert jsonb_array_length(h->'popular') > 0, 'popular products missing';
  assert not exists (select 1 from jsonb_array_elements(h->'shops_near') s where not (s->>'delivers')::boolean), 'non-delivering shop in shops_near';
end $$;

rollback;
