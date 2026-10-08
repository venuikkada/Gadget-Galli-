-- Shared setup for the SQL tests: ids of demo users/shops in GUCs (readable inside DO blocks)
-- and a helper to act as a signed-in user. Each test file runs in its own transaction and rolls back.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

do $$
begin
  perform set_config('test.admin', (select id::text from public.users where email = 'admin@gadgetgalli.in'), false);
  perform set_config('test.ravi', (select id::text from public.users where phone = '+919000000001'), false);
  perform set_config('test.priya', (select id::text from public.users where phone = '+919000000002'), false);
  perform set_config('test.arjun', (select id::text from public.users where phone = '+919000000003'), false);
  perform set_config('test.newowner', (select id::text from public.users where phone = '+919000019999'), false);
  perform set_config('test.kphb', (select id::text from public.shops where name = 'KPHB Computer World'), false);
  perform set_config('test.kphb_owner', (select owner_id::text from public.shops where name = 'KPHB Computer World'), false);
  perform set_config('test.cyber', (select id::text from public.shops where name = 'Cyber Zone Systems'), false);
  perform set_config('test.deccan', (select id::text from public.shops where name = 'Deccan PC Components'), false);
  perform set_config('test.deccan_owner', (select owner_id::text from public.shops where name = 'Deccan PC Components'), false);
  perform set_config('test.hitech', (select id::text from public.shops where name = 'Hitech Gadget Hub'), false);
  perform set_config('test.hitech_owner', (select owner_id::text from public.shops where name = 'Hitech Gadget Hub'), false);
  perform set_config('test.pending_shop', (select id::text from public.shops where status = 'under_review' limit 1), false);
  perform set_config('test.kukatpally', (select id::text from public.areas where name = 'Kukatpally'), false);
  perform set_config('test.dilsukhnagar', (select id::text from public.areas where name = 'Dilsukhnagar'), false);
  perform set_config('test.zotac4060', (select id::text from public.catalog_products where model_number = 'ZT-D40600H-10M'), false);
end $$;

create function pg_temp.act_as(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.' || p_key), 'role', 'authenticated')::text, false);
end $$;

create function pg_temp.act_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', false);
end $$;

-- Runs p_sql and asserts it fails with an error message matching p_pattern (LIKE).
create function pg_temp.expect_error(p_sql text, p_pattern text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not like p_pattern then
      raise exception 'expected error like "%" from [%], got "%"', p_pattern, p_sql, sqlerrm;
    end if;
    return;
  end;
  raise exception 'expected error like "%" from [%], but it succeeded', p_pattern, p_sql;
end $$;
grant execute on all functions in schema pg_temp to public;
