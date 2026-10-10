-- Distance-aware delivery estimates: the same examples as packages/shared/src/__tests__/eta.test.ts, and the
-- search filter and "fastest" figure using them.
\ir _prelude.sql
begin;

do $$
declare
  k int := current_setting('test.kukatpally')::int;
  r jsonb;
  item jsonb;
begin
  assert public.gg_ride_mins(0.3) = 5, format('ride 0.3 km = %s', public.gg_ride_mins(0.3));
  assert public.gg_ride_mins(3.8) = 18, format('ride 3.8 km = %s', public.gg_ride_mins(3.8));
  assert public.gg_ride_mins(12) = 56, format('ride 12 km = %s', public.gg_ride_mins(12));

  assert public.gg_delivery_eta_mins(null, 90, 4) = 90, 'usual time at the typical distance';
  assert public.gg_delivery_eta_mins(null, 90, 0.3) = 75, format('90 min shop at 0.3 km = %s', public.gg_delivery_eta_mins(null, 90, 0.3));
  assert public.gg_delivery_eta_mins(null, 90, 12) = 125, format('90 min shop at 12 km = %s', public.gg_delivery_eta_mins(null, 90, 12));
  assert public.gg_delivery_eta_mins(120, 90, 3.8) = 120, 'the real average wins over the declared time';
  assert public.gg_delivery_eta_mins(null, 30, 0.2) = 20, 'never under 20 minutes';
  assert public.gg_delivery_eta_mins(null, 90, null) = 90, 'no distance: the usual time';

  -- Every result's "fastest" time respects the delivery-time filter
  r := public.search_products('iphone', k, null, null, '{"max_delivery_mins": 120}'::jsonb);
  assert (r->>'total')::int > 0, 'no iPhones within 2 hours';
  for item in select * from jsonb_array_elements(r->'items') loop
    assert (item->>'fastest_mins')::int <= 120, format('%s: fastest %s > 120', item->>'name', item->>'fastest_mins');
  end loop;
end $$;

rollback;
