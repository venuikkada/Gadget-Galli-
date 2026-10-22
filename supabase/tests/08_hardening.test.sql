-- Security hardening (20261014000013): pinned search paths, closed function grants, rate limits and the optional
-- admin 2-step verification.
\ir _prelude.sql
begin;

-- Every function has a fixed search_path
do $$
begin
  assert not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prokind = 'f'
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  ), 'a function has no fixed search_path';
end $$;

-- Signed-out visitors can browse, but not reach admin, cart or order functions
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    assert has_function_privilege('anon', 'public.search_products(text, int, double precision, double precision, jsonb, text, int, int, boolean)', 'execute'), 'anon cannot search';
    assert has_function_privilege('anon', 'public.home_feed(int, double precision, double precision)', 'execute'), 'anon cannot open the home feed';
    assert not has_function_privilege('anon', 'public.admin_overview()', 'execute'), 'anon can run admin_overview';
    assert not has_function_privilege('anon', 'public.admin_security_overview()', 'execute'), 'anon can run admin_security_overview';
    assert not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and (p.proname like 'admin\_%' or p.proname like 'cart\_%' or p.proname like 'shop\_%' or p.proname = 'place_order')
         and p.proname not in ('shop_catalog', 'shop_reviews', 'shop_is_public', 'shop_payment_terms')
         and has_function_privilege('anon', p.oid, 'execute')
    ), 'anon can run a signed-in function';
    assert not has_function_privilege('anon', 'private.hit_limit(text, int, interval)', 'execute'), 'anon can run private helpers';
  end if;
end $$;

-- Rate limit: the sixth problem report in a day is refused
select pg_temp.act_as('arjun');
do $$
begin
  for i in 1..5 loop
    perform private.hit_limit('test_bucket', 5, interval '1 day');
  end loop;
end $$;
select pg_temp.expect_error($q$select private.hit_limit('test_bucket', 5, interval '1 day')$q$, 'RATE_LIMITED%');
-- ...and the spammable tables run it on every insert
do $$
begin
  assert (select count(*) from pg_trigger where tgname = 'rate_limit'
           and tgrelid in ('public.issues'::regclass, 'public.reviews'::regclass, 'public.catalog_products'::regclass,
                           'public.push_tokens'::regclass, 'public.notify_me'::regclass, 'public.addresses'::regclass)) = 6,
    'rate limit triggers missing';
end $$;
-- A real insert over the limit is refused (30 addresses a day)
do $$
begin
  insert into private.rate_hits (bucket, who) select 'addresses', current_setting('test.arjun')::uuid from generate_series(1, 30);
end $$;
select pg_temp.expect_error(
  format($q$insert into public.addresses (user_id, house, lat, lng) values (%L, 'Flat 1', 17.4, 78.4)$q$, current_setting('test.arjun')),
  '%RATE_LIMITED%');

-- Admins are not limited
select pg_temp.act_as('admin');
do $$
begin
  for i in 1..10 loop
    perform private.hit_limit('test_admin', 1, interval '1 day');
  end loop;
end $$;

-- Optional 2-step verification: an admin with a verified authenticator is an admin only after passing it
do $$
begin
  if to_regclass('auth.mfa_factors') is null then
    create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, status text not null);
  end if;
end $$;
select pg_temp.act_as('admin');
do $$ begin assert public.is_admin(), 'admin without 2-step is not an admin'; end $$;
insert into auth.mfa_factors (user_id, status) values (current_setting('test.admin')::uuid, 'verified');
do $$ begin assert not public.is_admin() and not public.is_super_admin(), 'password-only session passes as admin with 2-step on'; end $$;
do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.admin'), 'role', 'authenticated', 'aal', 'aal2')::text, false);
  assert public.is_admin() and public.is_super_admin(), 'aal2 session is not an admin';
  assert jsonb_array_length(public.admin_security_overview()) >= 1, 'security overview is empty';
  assert exists (select 1 from jsonb_array_elements(public.admin_security_overview()) e where (e->>'mfa')::boolean), 'overview misses the 2-step admin';
end $$;

rollback;
