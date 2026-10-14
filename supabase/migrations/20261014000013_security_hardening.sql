-- Security hardening (docs/DECISIONS.md #49, docs/SECURITY.md)
--   1. Every function pins its search_path (the Supabase advisor's "function_search_path_mutable").
--   2. Functions start closed: new ones are not executable by everyone; the anon allowlist stays as in
--      20261008000008_rls_grants.sql, plus the two pure delivery-time helpers search uses.
--   3. Per-user rate limits on the writes a spammer would abuse.
--   4. Optional admin 2-step verification: an admin who turned on an authenticator code is only an admin in a
--      session that passed it (aal2). A stolen password alone then opens nothing.

-- 1. search_path on the remaining helpers --------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prokind = 'f'
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', f.sig);
  end loop;
end $$;

-- 2. Functions start closed -------------------------------------------------------------------------------------
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'alter default privileges in schema public revoke execute on functions from anon';
  end if;
end $$;
revoke execute on function public.gg_ride_mins(double precision), public.gg_delivery_eta_mins(int, int, double precision) from public;
grant execute on function public.gg_ride_mins(double precision), public.gg_delivery_eta_mins(int, int, double precision) to anon, authenticated, service_role;

-- 3. Rate limits ------------------------------------------------------------------------------------------------
create table if not exists private.rate_hits (
  bucket text not null,
  who uuid not null,
  at timestamptz not null default now()
);
create index if not exists rate_hits_lookup on private.rate_hits (bucket, who, at);

-- Counts this user's hits in the window and refuses the one over the limit (RATE_LIMITED).
create or replace function private.hit_limit(p_bucket text, p_max int, p_per interval) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_who uuid := auth.uid();
begin
  if v_who is null or public.is_admin() then return; end if;  -- jobs, seeds and admins are not limited
  if (select count(*) from private.rate_hits where bucket = p_bucket and who = v_who and at > now() - p_per) >= p_max then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  insert into private.rate_hits (bucket, who) values (p_bucket, v_who);
end $$;

create or replace function private.rate_limit_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform private.hit_limit(tg_table_name, tg_argv[0]::int, tg_argv[1]::interval);
  return new;
end $$;

-- How many rows one person may add per window, per table.
do $$
declare
  r record;
begin
  for r in select * from (values
    ('issues', 5, '1 day'),
    ('reviews', 10, '1 day'),
    ('catalog_products', 200, '1 day'),
    ('push_tokens', 20, '1 day'),
    ('notify_me', 10, '1 day'),
    ('addresses', 30, '1 day')
  ) as t(tbl, n, per) loop
    if to_regclass('public.' || r.tbl) is not null then
      execute format('drop trigger if exists rate_limit on public.%I', r.tbl);
      execute format('create trigger rate_limit before insert on public.%I for each row execute function private.rate_limit_insert(%L, %L)', r.tbl, r.n, r.per);
    end if;
  end loop;
end $$;

-- Old hits are only needed for the longest window (a day).
create or replace function private.prune_rate_hits() returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from private.rate_hits where at < now() - interval '2 days';
$$;
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'gg-prune-rate-hits';
    perform cron.schedule('gg-prune-rate-hits', '17 3 * * *', 'select private.prune_rate_hits()');
  end if;
exception when others then
  raise notice 'pg_cron not available: rate hits are pruned by hand (select private.prune_rate_hits())';
end $$;

-- 4. Optional admin 2-step verification ----------------------------------------------------------------------------
-- True unless this user has a verified authenticator and the session did not pass it.
create or replace function private.mfa_ok() returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_has boolean := false;
begin
  if to_regclass('auth.mfa_factors') is null then return true; end if;  -- local test database
  execute 'select exists (select 1 from auth.mfa_factors where user_id = $1 and status = ''verified'')'
    into v_has using auth.uid();
  return not v_has or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2';
end $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.admin_role is not null and not u.is_blocked
  ) and private.mfa_ok();
$$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.admin_role = 'super_admin' and not u.is_blocked
  ) and private.mfa_ok();
$$;

-- Which admins have 2-step verification on (super admins only).
create or replace function public.admin_security_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v jsonb;
begin
  if not public.is_super_admin() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if to_regclass('auth.mfa_factors') is null then
    select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'role', u.admin_role, 'mfa', false) order by u.name), '[]')
      into v from public.users u where u.admin_role is not null;
  else
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'email', u.email, 'role', u.admin_role,
        'mfa', exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified')) order by u.name), '[]')
        from public.users u where u.admin_role is not null
    $q$ into v;
  end if;
  return v;
end $$;
revoke execute on function public.admin_security_overview() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.admin_security_overview() from anon';
  end if;
end $$;
grant execute on function public.admin_security_overview() to authenticated, service_role;

revoke all on all functions in schema private from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all functions in schema private from anon, authenticated';
  end if;
end $$;
