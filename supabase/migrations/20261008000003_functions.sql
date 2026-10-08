-- Gadget Galli · 0003 · helper functions, auth sync, derived columns

-- ---------------------------------------------------------------------------
-- Text normalisation used by search (mirrors packages/shared/src/search.ts)
-- "Apple iPhone 15 (128GB)" -> "apple iphone 15 128 gb", "RTX4060" -> "rtx 4060"
-- ---------------------------------------------------------------------------
create or replace function public.gg_norm(t text) returns text
language sql immutable parallel safe as $$
  select btrim(regexp_replace(
           regexp_replace(
             regexp_replace(lower(coalesce(t, '')), '([a-z])([0-9])', '\1 \2', 'g'),
             '([0-9])([a-z])', '\1 \2', 'g'),
           '[^a-z0-9]+', ' ', 'g'));
$$;

create or replace function public.gg_compact(t text) returns text
language sql immutable parallel safe as $$
  select replace(public.gg_norm(t), ' ', '');
$$;

-- Great-circle distance in km (haversine). Null if any coordinate is missing.
create or replace function public.gg_distance_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql immutable parallel safe as $$
  select case when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else 2 * 6371 * asin(least(1, sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    ))) end;
$$;

-- ---------------------------------------------------------------------------
-- Role helpers (used by RLS policies)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.admin_role is not null and not u.is_blocked
  );
$$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.admin_role = 'super_admin' and not u.is_blocked
  );
$$;

create or replace function public.owns_shop(p_shop_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shops s where s.id = p_shop_id and s.owner_id = auth.uid());
$$;

create or replace function public.my_shop_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select s.id from public.shops s where s.owner_id = auth.uid();
$$;

create or replace function public.shop_is_public(p_shop_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shops s where s.id = p_shop_id and s.status = 'approved');
$$;

-- Can the current user see this order (as its customer, its shop or an admin)?
create or replace function public.can_see_order(p_order_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.orders o
    left join public.shops s on s.id = o.shop_id
    where o.id = p_order_id
      and (o.customer_id = auth.uid() or s.owner_id = auth.uid() or public.is_admin())
  );
$$;

create or replace function private.require_user() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if exists (select 1 from public.users where id = v_uid and is_blocked) then
    raise exception 'ACCOUNT_BLOCKED' using errcode = '42501';
  end if;
  return v_uid;
end $$;

create or replace function private.require_admin() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

create or replace function private.require_shop_owner(p_shop_id uuid) returns public.shops
language plpgsql stable security definer set search_path = public as $$
declare
  v_shop public.shops;
begin
  perform private.require_user();
  select * into v_shop from public.shops where id = p_shop_id;
  if v_shop.id is null or v_shop.owner_id <> auth.uid() then
    raise exception 'NOT_YOUR_SHOP' using errcode = '42501';
  end if;
  return v_shop;
end $$;

-- ---------------------------------------------------------------------------
-- Shop hours: open now (IST)
-- hours = {"mon":{"open":"10:00","close":"21:00","closed":false}, ...}
-- ---------------------------------------------------------------------------
create or replace function public.gg_shop_open_now(p_hours jsonb, p_is_open boolean, p_at timestamptz default now())
returns boolean
language plpgsql stable as $$
declare
  v_local timestamp := p_at at time zone 'Asia/Kolkata';
  v_days text[] := array['sun','mon','tue','wed','thu','fri','sat'];
  v_today text := v_days[extract(dow from v_local)::int + 1];
  v_yday text := v_days[((extract(dow from v_local)::int + 6) % 7) + 1];
  v_min int := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  d jsonb;
  o int; c int;
begin
  if not coalesce(p_is_open, false) then return false; end if;
  if p_hours is null or p_hours = '{}'::jsonb then return true; end if;
  d := p_hours -> v_today;
  if d is not null and not coalesce((d->>'closed')::boolean, false) then
    o := split_part(d->>'open', ':', 1)::int * 60 + split_part(d->>'open', ':', 2)::int;
    c := split_part(d->>'close', ':', 1)::int * 60 + split_part(d->>'close', ':', 2)::int;
    if c > o and v_min >= o and v_min < c then return true; end if;
    if c <= o and (v_min >= o or v_min < c) then return true; end if;
  end if;
  d := p_hours -> v_yday;
  if d is not null and not coalesce((d->>'closed')::boolean, false) then
    o := split_part(d->>'open', ':', 1)::int * 60 + split_part(d->>'open', ':', 2)::int;
    c := split_part(d->>'close', ':', 1)::int * 60 + split_part(d->>'close', ':', 2)::int;
    if c <= o and v_min < c then return true; end if;
  end if;
  return false;
end $$;

-- ---------------------------------------------------------------------------
-- Delivery coverage
-- ---------------------------------------------------------------------------
-- Shops (approved) that deliver to an area / point.
create or replace function public.gg_delivering_shop_ids(p_area_id int, p_lat double precision, p_lng double precision)
returns setof uuid
language sql stable security definer set search_path = public as $$
  with loc as (
    select a.zone_id,
           coalesce(p_lat, a.lat) as lat,
           coalesce(p_lng, a.lng) as lng
    from (select 1) one
    left join public.areas a on a.id = p_area_id
  )
  select s.id
  from public.shops s, loc
  where s.status = 'approved'
    and (
      (s.delivery_mode = 'radius'
        and public.gg_distance_km(s.lat, s.lng, loc.lat, loc.lng) <= coalesce(s.delivery_radius_km, 0))
      or (s.delivery_mode = 'areas' and exists (
        select 1 from public.delivery_areas da
        where da.shop_id = s.id
          and ((p_area_id is not null and da.area_id = p_area_id) or (loc.zone_id is not null and da.zone_id = loc.zone_id))
      ))
    );
$$;

create or replace function public.shop_delivers_to(p_shop_id uuid, p_area_id int, p_lat double precision, p_lng double precision)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.shops s
    left join public.areas a on a.id = p_area_id
    where s.id = p_shop_id
      and (
        (s.delivery_mode = 'radius'
          and public.gg_distance_km(s.lat, s.lng, coalesce(p_lat, a.lat), coalesce(p_lng, a.lng)) <= coalesce(s.delivery_radius_km, 0))
        or (s.delivery_mode = 'areas' and exists (
          select 1 from public.delivery_areas da
          where da.shop_id = s.id
            and ((p_area_id is not null and da.area_id = p_area_id) or (a.zone_id is not null and da.zone_id = a.zone_id))
        ))
      )
  );
$$;

-- Delivery charge for a basket of value p_item_total at distance p_km.
create or replace function public.gg_delivery_charge(
  p_type public.delivery_charge_type, p_amount numeric, p_free_above numeric, p_km double precision, p_item_total numeric
) returns numeric
language sql immutable as $$
  select case
    when p_free_above is not null and p_item_total >= p_free_above then 0
    when p_type = 'free' then 0
    when p_type = 'flat' then coalesce(p_amount, 0)
    when p_type = 'per_km' then round(coalesce(p_amount, 0) * greatest(1, ceil(coalesce(p_km, 1))))
    else 0
  end;
$$;

-- Effective "usually delivers in" minutes: real average once a shop has history, else what it declared.
create or replace function public.gg_shop_delivery_mins(p_avg int, p_usual int) returns int
language sql immutable as $$
  select coalesce(p_avg, p_usual, 120);
$$;

-- ---------------------------------------------------------------------------
-- Location: nearest area for GPS coordinates, and whether we serve it
-- ---------------------------------------------------------------------------
create or replace function public.resolve_location(p_lat double precision, p_lng double precision)
returns jsonb
language sql stable security definer set search_path = public as $$
  with nearest as (
    select a.id, a.name, a.pincode, z.name as zone, public.gg_distance_km(a.lat, a.lng, p_lat, p_lng) as km
    from public.areas a join public.zones z on z.id = a.zone_id
    where a.is_active and a.lat is not null
    order by public.gg_distance_km(a.lat, a.lng, p_lat, p_lng)
    limit 1
  )
  select jsonb_build_object(
    'area_id', n.id,
    'area_name', n.name,
    'pincode', n.pincode,
    'zone', n.zone,
    'distance_km', round(n.km::numeric, 2),
    'in_service', coalesce(n.km <= 8 and public.gg_distance_km(17.385, 78.4867, p_lat, p_lng) <= 35, false)
  )
  from (select 1) one left join nearest n on true;
$$;

-- ---------------------------------------------------------------------------
-- auth.users -> public.users
-- ---------------------------------------------------------------------------
create or replace function private.gen_referral_code() returns text
language plpgsql volatile as $$
declare
  v_code text;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  loop
    v_code := 'GG';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.users where referral_code = v_code);
  end loop;
  return v_code;
end $$;

create or replace function private.normalize_phone(p text) returns text
language plpgsql immutable as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if d = '' then return null; end if;
  if length(d) = 12 and left(d, 2) = '91' then d := substr(d, 3);
  elsif length(d) = 11 and left(d, 1) = '0' then d := substr(d, 2);
  end if;
  if d ~ '^[6-9][0-9]{9}$' then return '+91' || d; end if;
  return '+' || regexp_replace(coalesce(p, ''), '\D', '', 'g');
end $$;

create or replace function private.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, phone, email, name, referral_code)
  values (
    new.id,
    private.normalize_phone(new.phone),
    nullif(new.email, ''),
    nullif(coalesce(new.raw_user_meta_data->>'name', ''), ''),
    private.gen_referral_code()
  )
  on conflict (id) do update
    set phone = coalesce(excluded.phone, public.users.phone),
        email = coalesce(excluded.email, public.users.email);
  return new;
end $$;

create or replace function private.handle_auth_user_updated() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.users
     set phone = coalesce(private.normalize_phone(new.phone), phone),
         email = coalesce(nullif(new.email, ''), email)
   where id = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_auth_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated after update of phone, email on auth.users
  for each row execute function private.handle_auth_user_updated();

-- ---------------------------------------------------------------------------
-- Derived columns
-- ---------------------------------------------------------------------------
create or replace function private.slugify(t text) returns text
language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function private.shops_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_base text;
  v_slug text;
  n int := 1;
begin
  if new.name is not null and (new.slug is null or (tg_op = 'UPDATE' and new.name is distinct from old.name and old.status = 'draft')) then
    v_base := private.slugify(new.name || coalesce(' ' || (select name from public.areas where id = new.area_id), ''));
    if v_base = '' then v_base := 'shop'; end if;
    v_slug := v_base;
    while exists (select 1 from public.shops where slug = v_slug and id <> new.id) loop
      n := n + 1;
      v_slug := v_base || '-' || n;
    end loop;
    new.slug := v_slug;
  end if;
  new.owner_phone := coalesce(private.normalize_phone(new.owner_phone), new.owner_phone);
  new.contact_phone := coalesce(private.normalize_phone(new.contact_phone), new.contact_phone);
  new.whatsapp_phone := coalesce(private.normalize_phone(new.whatsapp_phone), new.whatsapp_phone);
  -- A changed UPI ID must be verified again before customers see it as verified.
  if tg_op = 'UPDATE' and new.upi_id is distinct from old.upi_id and not coalesce(current_setting('gg.admin_action', true), '') = 'on' then
    new.upi_verified := false;
  end if;
  return new;
end $$;

create trigger shops_before_write before insert or update on public.shops
  for each row execute function private.shops_before_write();

-- Builds search_text for a catalog product from its own fields plus brand and category names.
create or replace function private.catalog_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_brand text;
  v_cat text;
  v_parent text;
  v_variant text;
begin
  select name into v_brand from public.brands where id = new.brand_id;
  select c.name, p.name into v_cat, v_parent
    from public.categories c left join public.categories p on p.id = c.parent_id
   where c.id = new.category_id;
  if jsonb_typeof(new.variant) is distinct from 'object' then new.variant := '{}'::jsonb; end if;
  if jsonb_typeof(new.specs) is distinct from 'object' then new.specs := '{}'::jsonb; end if;
  select string_agg(value, ' ') into v_variant from jsonb_each_text(new.variant);

  new.search_text := public.gg_norm(concat_ws(' ',
    v_brand, new.name, new.model, new.model_number, v_variant, v_cat, v_parent, new.keywords));
  new.search_compact := replace(new.search_text, ' ', '');
  new.model_norm := public.gg_norm(coalesce(new.model, new.name));
  return new;
end $$;

create trigger catalog_before_write before insert or update on public.catalog_products
  for each row execute function private.catalog_before_write();

-- Re-run after renaming brands/categories.
create or replace function public.refresh_catalog_search() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  perform private.require_admin();
  update public.catalog_products set name = name;
  get diagnostics n = row_count;
  return n;
end $$;
