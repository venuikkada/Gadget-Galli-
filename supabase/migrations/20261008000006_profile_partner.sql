-- Gadget Galli · 0006 · profile, referrals, push tokens, Shop Partner functions

-- ---------------------------------------------------------------------------
-- Profile
-- ---------------------------------------------------------------------------
create or replace function public.my_profile() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  u public.users;
begin
  if v_uid is null then return null; end if;
  select * into u from public.users where id = v_uid;
  if u.id is null then
    -- auth trigger did not run (e.g. user created before migration): create the profile now
    insert into public.users (id, referral_code) values (v_uid, private.gen_referral_code())
    on conflict (id) do nothing;
    select * into u from public.users where id = v_uid;
  end if;
  return jsonb_build_object(
    'user', jsonb_build_object(
      'id', u.id, 'phone', u.phone, 'email', u.email, 'name', u.name, 'role', u.role, 'admin_role', u.admin_role,
      'language', u.language, 'referral_code', u.referral_code, 'referred', u.referred_by is not null,
      'is_blocked', u.is_blocked, 'avatar_path', u.avatar_path, 'last_area_id', u.last_area_id,
      'onboarded', u.onboarded, 'created_at', u.created_at, 'deleted', u.deleted_at is not null),
    'addresses', coalesce((select jsonb_agg(to_jsonb(a) order by a.is_default desc, a.updated_at desc)
                           from public.addresses a where a.user_id = v_uid), '[]'::jsonb),
    'shops', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'status', s.status,
                          'status_reason', s.status_reason, 'registration_step', s.registration_step,
                          'is_open', s.is_open, 'verified', s.verified) order by s.created_at)
                       from public.shops s where s.owner_id = v_uid), '[]'::jsonb),
    'unread', (select count(*) from public.notifications n where n.user_id = v_uid and n.read_at is null
               and n.app = case when u.role = 'shop_owner' then 'partner' else 'customer' end),
    'cart_count', coalesce((select sum(ci.qty) from public.cart_items ci join public.carts c on c.id = ci.cart_id
                            where c.user_id = v_uid), 0),
    'favourite_shop_ids', coalesce((select jsonb_agg(f.shop_id) from public.favourites f where f.user_id = v_uid), '[]'::jsonb)
  );
end $$;

-- patch keys: name, email, language, role, last_area_id, onboarded
create or replace function public.update_my_profile(p_patch jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
begin
  if p_patch ? 'name' and length(btrim(coalesce(p_patch->>'name', ''))) < 2 then
    raise exception 'NAME_REQUIRED' using errcode = 'P0001';
  end if;
  update public.users set
    name = case when p_patch ? 'name' then left(btrim(p_patch->>'name'), 80) else name end,
    email = case when p_patch ? 'email' then nullif(btrim(p_patch->>'email'), '') else email end,
    language = case when p_patch ? 'language' then coalesce(p_patch->>'language', 'en') else language end,
    role = case when p_patch ? 'role' then (p_patch->>'role')::public.user_role else role end,
    last_area_id = case when p_patch ? 'last_area_id' then (p_patch->>'last_area_id')::int else last_area_id end,
    onboarded = case when p_patch ? 'onboarded' then (p_patch->>'onboarded')::boolean else onboarded end
  where id = v_uid;
  return public.my_profile();
end $$;

create or replace function public.apply_referral(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  me public.users;
  ref public.users;
begin
  select * into me from public.users where id = v_uid;
  if me.referred_by is not null then raise exception 'ALREADY_REFERRED' using errcode = 'P0001'; end if;
  if me.created_at < now() - interval '30 days' then raise exception 'REFERRAL_TOO_LATE' using errcode = 'P0001'; end if;
  select * into ref from public.users where referral_code = upper(btrim(p_code)) and deleted_at is null;
  if ref.id is null or ref.id = v_uid then raise exception 'INVALID_REFERRAL_CODE' using errcode = 'P0001'; end if;
  update public.users set referred_by = ref.id where id = v_uid;
  insert into public.referrals (referrer_id, referred_id, code) values (ref.id, v_uid, ref.referral_code)
  on conflict (referred_id) do nothing;
  perform private.notify(ref.id, 'customer', 'referral_joined', 'Your friend joined Gadget Galli 🎉',
    coalesce(me.name, 'A friend') || ' signed up with your code.', jsonb_build_object('url', '/referral'));
  return jsonb_build_object('ok', true, 'referrer_name', ref.name);
end $$;

create or replace function public.my_referrals() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', (select referral_code from public.users where id = auth.uid()),
    'joined', (select count(*) from public.referrals where referrer_id = auth.uid()),
    'ordered', (select count(*) from public.referrals where referrer_id = auth.uid() and status = 'ordered'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(split_part(u.name, ' ', 1), 'Friend'),
                          'status', r.status, 'created_at', r.created_at) order by r.created_at desc)
                       from public.referrals r join public.users u on u.id = r.referred_id
                       where r.referrer_id = auth.uid()), '[]'::jsonb));
$$;

create or replace function public.register_push_token(p_token text, p_platform text default null, p_app text default 'customer')
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
begin
  if coalesce(btrim(p_token), '') = '' then return; end if;
  insert into public.push_tokens (token, user_id, platform, app, updated_at)
  values (p_token, v_uid, p_platform, coalesce(p_app, 'customer'), now())
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform,
                                    app = excluded.app, updated_at = now();
end $$;

create or replace function public.unregister_push_token(p_token text) returns void
language sql volatile security definer set search_path = public as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

create or replace function public.my_notifications(p_app text default 'customer', p_limit int default 50) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body,
           'data', n.data, 'read_at', n.read_at, 'created_at', n.created_at) order by n.created_at desc), '[]'::jsonb)
  from (select * from public.notifications n where n.user_id = auth.uid() and n.app = p_app
        order by n.created_at desc limit least(greatest(p_limit, 1), 100)) n;
$$;

create or replace function public.mark_notifications_read(p_app text default 'customer') returns void
language sql volatile security definer set search_path = public as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and app = p_app and read_at is null;
$$;

create or replace function public.toggle_favourite(p_shop_id uuid) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
begin
  if exists (select 1 from public.favourites where user_id = v_uid and shop_id = p_shop_id) then
    delete from public.favourites where user_id = v_uid and shop_id = p_shop_id;
    return false;
  end if;
  insert into public.favourites (user_id, shop_id) values (v_uid, p_shop_id);
  return true;
end $$;

create or replace function public.my_favourite_shops() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'area', a.name, 'rating_avg', s.rating_avg, 'rating_count', s.rating_count,
      'verified', s.verified, 'logo_path', s.logo_path, 'is_open_now', public.gg_shop_open_now(s.hours, s.is_open),
      'delivery_mins', public.gg_shop_delivery_mins(s.avg_delivery_mins, s.usual_delivery_mins),
      'shop_types', to_jsonb(s.shop_types)) order by f.created_at desc), '[]'::jsonb)
  from public.favourites f
  join public.shops s on s.id = f.shop_id and s.status = 'approved'
  left join public.areas a on a.id = s.area_id
  where f.user_id = auth.uid();
$$;

create or replace function public.my_reviews() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'order_id', r.order_id, 'rating', r.rating, 'body', r.body,
           'photos', to_jsonb(r.photos), 'shop_reply', r.shop_reply, 'created_at', r.created_at,
           'shop_id', s.id, 'shop_name', s.name) order by r.created_at desc), '[]'::jsonb)
  from public.reviews r join public.shops s on s.id = r.shop_id
  where r.customer_id = auth.uid();
$$;

-- Saves the customer's address; the first one (or p_default) becomes the default.
create or replace function public.save_address(p_address jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  a public.addresses;
  v_id uuid := nullif(p_address->>'id', '')::uuid;
  v_area public.areas;
  v_default boolean := coalesce((p_address->>'is_default')::boolean, false)
                       or not exists (select 1 from public.addresses where user_id = auth.uid());
begin
  if p_address->>'area_id' is not null then
    select * into v_area from public.areas where id = (p_address->>'area_id')::int;
  end if;
  if v_id is not null and not exists (select 1 from public.addresses where id = v_id and user_id = v_uid) then
    raise exception 'ADDRESS_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_default then
    update public.addresses set is_default = false where user_id = v_uid;
  end if;
  if v_id is null then
    insert into public.addresses (user_id, label, label_custom, contact_name, house, building, street, landmark,
                                  area_id, area_name, pincode, lat, lng, is_default)
    values (v_uid, coalesce(p_address->>'label', 'home')::public.address_label, p_address->>'label_custom',
            p_address->>'contact_name', p_address->>'house', p_address->>'building', p_address->>'street',
            p_address->>'landmark', v_area.id, coalesce(p_address->>'area_name', v_area.name),
            coalesce(p_address->>'pincode', v_area.pincode),
            coalesce((p_address->>'lat')::double precision, v_area.lat),
            coalesce((p_address->>'lng')::double precision, v_area.lng), v_default)
    returning * into a;
  else
    update public.addresses set
      label = coalesce(p_address->>'label', label::text)::public.address_label,
      label_custom = p_address->>'label_custom', contact_name = p_address->>'contact_name',
      house = p_address->>'house', building = p_address->>'building', street = p_address->>'street',
      landmark = p_address->>'landmark', area_id = coalesce(v_area.id, area_id),
      area_name = coalesce(p_address->>'area_name', v_area.name, area_name),
      pincode = coalesce(p_address->>'pincode', v_area.pincode, pincode),
      lat = coalesce((p_address->>'lat')::double precision, v_area.lat, lat),
      lng = coalesce((p_address->>'lng')::double precision, v_area.lng, lng),
      is_default = is_default or v_default
    where id = v_id returning * into a;
  end if;
  update public.users set last_area_id = coalesce(a.area_id, last_area_id) where id = v_uid;
  return to_jsonb(a);
end $$;

create or replace function public.delete_address(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_was_default boolean;
begin
  delete from public.addresses where id = p_id and user_id = v_uid returning is_default into v_was_default;
  if v_was_default then
    update public.addresses set is_default = true
     where id = (select id from public.addresses where user_id = v_uid order by updated_at desc limit 1);
  end if;
end $$;

create or replace function public.notify_me_outside(p_place text, p_lat double precision default null, p_lng double precision default null)
returns void
language sql volatile security definer set search_path = public as $$
  insert into public.notify_me (user_id, phone, place, lat, lng)
  values (auth.uid(), (select phone from public.users where id = auth.uid()), left(p_place, 200), p_lat, p_lng);
$$;

-- Anonymises the account (orders are kept for the shop's records). The edge function
-- "delete-account" calls this and then removes the login.
create or replace function public.delete_my_account() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
begin
  if exists (select 1 from public.orders where customer_id = v_uid
             and status in ('REQUESTED', 'CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED')) then
    raise exception 'ACTIVE_ORDERS' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.orders o join public.shops s on s.id = o.shop_id where s.owner_id = v_uid
             and o.status in ('REQUESTED', 'CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED')) then
    raise exception 'SHOP_HAS_ACTIVE_ORDERS' using errcode = 'P0001';
  end if;
  update public.shops set status = 'suspended', status_reason = 'Owner deleted their account', is_open = false
   where owner_id = v_uid;
  delete from public.addresses where user_id = v_uid;
  delete from public.push_tokens where user_id = v_uid;
  delete from public.favourites where user_id = v_uid;
  delete from public.carts where user_id = v_uid;
  update public.reviews set customer_name = 'Former customer' where customer_id = v_uid;
  update public.orders set customer_name = 'Deleted user', address = case when address is null then null
         else jsonb_build_object('area', address->>'area', 'pincode', address->>'pincode') end
   where customer_id = v_uid;
  update public.users set name = 'Deleted user', phone = null, email = null, avatar_path = null,
         deleted_at = now(), referral_code = null
   where id = v_uid;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- Shop Partner: registration and settings
-- ---------------------------------------------------------------------------
create or replace function private.shop_json(p_shop_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(s) || jsonb_build_object(
    'area', (select jsonb_build_object('id', a.id, 'name', a.name, 'pincode', a.pincode, 'zone_id', a.zone_id)
             from public.areas a where a.id = s.area_id),
    'gst_number', (select gst_number from public.shop_private where shop_id = s.id),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', ph.id, 'kind', ph.kind, 'path', ph.path, 'sort', ph.sort)
                         order by ph.kind, ph.sort) from public.shop_photos ph where ph.shop_id = s.id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'doc_type', d.doc_type, 'doc_number', d.doc_number,
                         'status', d.status, 'note', d.note, 'path', d.path, 'created_at', d.created_at) order by d.created_at)
                         from public.shop_documents d where d.shop_id = s.id), '[]'::jsonb),
    'delivery_zone_ids', coalesce((select jsonb_agg(da.zone_id) from public.delivery_areas da where da.shop_id = s.id and da.zone_id is not null), '[]'::jsonb),
    'delivery_area_ids', coalesce((select jsonb_agg(da.area_id) from public.delivery_areas da where da.shop_id = s.id and da.area_id is not null), '[]'::jsonb),
    'is_open_now', public.gg_shop_open_now(s.hours, s.is_open),
    'product_count', (select count(*) from public.shop_products sp where sp.shop_id = s.id and sp.is_active)
  )
  from public.shops s where s.id = p_shop_id;
$$;

create or replace function public.my_shop() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid;
begin
  perform private.require_user();
  select id into v_id from public.shops where owner_id = auth.uid() order by created_at limit 1;
  if v_id is null then return null; end if;
  return private.shop_json(v_id);
end $$;

-- Creates the shop (first call) or saves wizard / settings fields.
create or replace function public.shop_upsert(p_patch jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  me public.users;
  s public.shops;
  p jsonb := coalesce(p_patch, '{}'::jsonb);
begin
  select * into me from public.users where id = v_uid;
  if p ? 'id' and p->>'id' is not null then
    s := private.require_shop_owner((p->>'id')::uuid);
  else
    select * into s from public.shops where owner_id = v_uid order by created_at limit 1;
  end if;

  if s.id is null then
    insert into public.shops (owner_id, owner_name, owner_phone, contact_phone, whatsapp_phone, hours)
    values (v_uid, me.name, me.phone, me.phone, me.phone,
            '{"mon":{"open":"10:00","close":"21:00"},"tue":{"open":"10:00","close":"21:00"},"wed":{"open":"10:00","close":"21:00"},"thu":{"open":"10:00","close":"21:00"},"fri":{"open":"10:00","close":"21:00"},"sat":{"open":"10:00","close":"21:00"},"sun":{"open":"10:00","close":"21:00","closed":true}}'::jsonb)
    returning * into s;
    update public.users set role = 'shop_owner' where id = v_uid;
  end if;

  if p ? 'contact_phone' and private.normalize_phone(p->>'contact_phone') !~ '^\+91[6-9][0-9]{9}$' then
    raise exception 'INVALID_PHONE: contact_phone' using errcode = 'P0001';
  end if;
  if p ? 'whatsapp_phone' and nullif(p->>'whatsapp_phone', '') is not null
     and private.normalize_phone(p->>'whatsapp_phone') !~ '^\+91[6-9][0-9]{9}$' then
    raise exception 'INVALID_PHONE: whatsapp_phone' using errcode = 'P0001';
  end if;
  if p ? 'upi_id' and nullif(p->>'upi_id', '') is not null
     and (p->>'upi_id') !~ '^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z][a-zA-Z0-9]{1,64}$' then
    raise exception 'INVALID_UPI_ID' using errcode = 'P0001';
  end if;

  update public.shops set
    name = case when p ? 'name' then nullif(btrim(p->>'name'), '') else name end,
    shop_types = case when p ? 'shop_types' then
                   coalesce((select array_agg(x::public.shop_type) from jsonb_array_elements_text(p->'shop_types') x), '{}')
                 else shop_types end,
    description = case when p ? 'description' then left(nullif(btrim(p->>'description'), ''), 600) else description end,
    hours = case when p ? 'hours' then coalesce(p->'hours', '{}'::jsonb) else hours end,
    weekly_holiday = case when p ? 'weekly_holiday' then nullif(p->>'weekly_holiday', '') else weekly_holiday end,
    owner_name = case when p ? 'owner_name' then nullif(btrim(p->>'owner_name'), '') else owner_name end,
    contact_phone = case when p ? 'contact_phone' then p->>'contact_phone' else contact_phone end,
    whatsapp_phone = case when p ? 'whatsapp_phone' then nullif(p->>'whatsapp_phone', '') else whatsapp_phone end,
    email = case when p ? 'email' then nullif(btrim(p->>'email'), '') else email end,
    address_line = case when p ? 'address_line' then nullif(btrim(p->>'address_line'), '') else address_line end,
    area_id = case when p ? 'area_id' then (p->>'area_id')::int else area_id end,
    pincode = case when p ? 'pincode' then nullif(p->>'pincode', '') else pincode end,
    landmark = case when p ? 'landmark' then nullif(btrim(p->>'landmark'), '') else landmark end,
    lat = case when p ? 'lat' then (p->>'lat')::double precision else lat end,
    lng = case when p ? 'lng' then (p->>'lng')::double precision else lng end,
    delivery_mode = case when p ? 'delivery_mode' then (p->>'delivery_mode')::public.delivery_mode else delivery_mode end,
    delivery_radius_km = case when p ? 'delivery_radius_km' then (p->>'delivery_radius_km')::numeric else delivery_radius_km end,
    delivery_charge_type = case when p ? 'delivery_charge_type' then (p->>'delivery_charge_type')::public.delivery_charge_type else delivery_charge_type end,
    delivery_charge = case when p ? 'delivery_charge' then coalesce((p->>'delivery_charge')::numeric, 0) else delivery_charge end,
    free_delivery_above = case when p ? 'free_delivery_above' then (p->>'free_delivery_above')::numeric else free_delivery_above end,
    min_order = case when p ? 'min_order' then coalesce((p->>'min_order')::numeric, 0) else min_order end,
    usual_delivery_mins = case when p ? 'usual_delivery_mins' then greatest(15, coalesce((p->>'usual_delivery_mins')::int, 120)) else usual_delivery_mins end,
    store_pickup = case when p ? 'store_pickup' then coalesce((p->>'store_pickup')::boolean, true) else store_pickup end,
    upi_id = case when p ? 'upi_id' then nullif(btrim(p->>'upi_id'), '') else upi_id end,
    upi_name = case when p ? 'upi_name' then nullif(btrim(p->>'upi_name'), '') else upi_name end,
    upi_qr_path = case when p ? 'upi_qr_path' then nullif(p->>'upi_qr_path', '') else upi_qr_path end,
    logo_path = case when p ? 'logo_path' then nullif(p->>'logo_path', '') else logo_path end,
    cover_path = case when p ? 'cover_path' then nullif(p->>'cover_path', '') else cover_path end,
    registration_step = case when p ? 'registration_step' then greatest(registration_step, (p->>'registration_step')::int) else registration_step end
  where id = s.id;

  if p ? 'gst_number' then
    insert into public.shop_private (shop_id, gst_number) values (s.id, upper(nullif(btrim(p->>'gst_number'), '')))
    on conflict (shop_id) do update set gst_number = excluded.gst_number, updated_at = now();
  end if;

  return private.shop_json(s.id);
end $$;

create or replace function public.shop_set_delivery_areas(p_shop_id uuid, p_zone_ids int[], p_area_ids int[]) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_shop_owner(p_shop_id);
  delete from public.delivery_areas where shop_id = p_shop_id;
  insert into public.delivery_areas (shop_id, zone_id)
  select p_shop_id, z from unnest(coalesce(p_zone_ids, '{}')) z
  where exists (select 1 from public.zones where id = z);
  -- Areas inside an already-ticked zone are redundant
  insert into public.delivery_areas (shop_id, area_id)
  select p_shop_id, a.id from public.areas a
  where a.id = any(coalesce(p_area_ids, '{}')) and not (a.zone_id = any(coalesce(p_zone_ids, '{}')));
  return private.shop_json(p_shop_id);
end $$;

create or replace function public.shop_add_photo(p_shop_id uuid, p_kind public.photo_kind, p_path text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_shop_owner(p_shop_id);
  if p_kind = 'inside' and (select count(*) from public.shop_photos where shop_id = p_shop_id and kind = 'inside') >= 10 then
    raise exception 'TOO_MANY_PHOTOS' using errcode = 'P0001';
  end if;
  if p_kind in ('front', 'logo', 'cover') then
    delete from public.shop_photos where shop_id = p_shop_id and kind = p_kind;
  end if;
  insert into public.shop_photos (shop_id, kind, path, sort)
  values (p_shop_id, p_kind, p_path, coalesce((select max(sort) + 1 from public.shop_photos where shop_id = p_shop_id), 0));
  if p_kind = 'logo' then update public.shops set logo_path = p_path where id = p_shop_id; end if;
  if p_kind in ('front', 'cover') then update public.shops set cover_path = p_path where id = p_shop_id; end if;
  return private.shop_json(p_shop_id);
end $$;

create or replace function public.shop_remove_photo(p_photo_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  ph public.shop_photos;
begin
  select * into ph from public.shop_photos where id = p_photo_id;
  if ph.id is null then raise exception 'PHOTO_NOT_FOUND' using errcode = 'P0002'; end if;
  perform private.require_shop_owner(ph.shop_id);
  delete from public.shop_photos where id = ph.id;
  if ph.kind = 'logo' then update public.shops set logo_path = null where id = ph.shop_id and logo_path = ph.path; end if;
  if ph.kind in ('front', 'cover') then update public.shops set cover_path = null where id = ph.shop_id and cover_path = ph.path; end if;
  return private.shop_json(ph.shop_id);
end $$;

create or replace function public.shop_add_document(p_shop_id uuid, p_doc_type public.doc_type, p_path text, p_doc_number text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_shop_owner(p_shop_id);
  delete from public.shop_documents where shop_id = p_shop_id and doc_type = p_doc_type and status <> 'accepted';
  insert into public.shop_documents (shop_id, doc_type, path, doc_number)
  values (p_shop_id, p_doc_type, p_path, nullif(btrim(p_doc_number), ''));
  return private.shop_json(p_shop_id);
end $$;

-- Validates the registration and sends it for admin review.
create or replace function public.shop_submit(p_shop_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
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
  if (s.delivery_mode = 'areas' and not exists (select 1 from public.delivery_areas where shop_id = s.id))
     or (s.delivery_mode = 'radius' and coalesce(s.delivery_radius_km, 0) <= 0) then
    v_missing := v_missing || 'delivery_areas'::text;
  end if;
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

create or replace function public.shop_set_open(p_shop_id uuid, p_open boolean) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  perform private.require_shop_owner(p_shop_id);
  update public.shops set is_open = p_open where id = p_shop_id;
  return jsonb_build_object('is_open', p_open,
    'is_open_now', (select public.gg_shop_open_now(hours, is_open) from public.shops where id = p_shop_id));
end $$;

-- Views, shares, call and WhatsApp taps (owner's own taps are not counted).
create or replace function public.track_shop_event(p_shop_id uuid, p_kind text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if public.owns_shop(p_shop_id) or not public.shop_is_public(p_shop_id) then return; end if;
  insert into public.shop_stats_daily (shop_id, day, views, call_taps, whatsapp_taps, shares)
  values (p_shop_id, (now() at time zone 'Asia/Kolkata')::date,
          (p_kind = 'view')::int, (p_kind = 'call')::int, (p_kind = 'whatsapp')::int, (p_kind = 'share')::int)
  on conflict (shop_id, day) do update set
    views = public.shop_stats_daily.views + excluded.views,
    call_taps = public.shop_stats_daily.call_taps + excluded.call_taps,
    whatsapp_taps = public.shop_stats_daily.whatsapp_taps + excluded.whatsapp_taps,
    shares = public.shop_stats_daily.shares + excluded.shares;
end $$;

-- ---------------------------------------------------------------------------
-- Shop Partner: dashboard and insights
-- ---------------------------------------------------------------------------
create or replace function public.shop_dashboard(p_shop_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s public.shops := private.require_shop_owner(p_shop_id);
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  return jsonb_build_object(
    'shop', jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug, 'status', s.status, 'is_open', s.is_open,
      'is_open_now', public.gg_shop_open_now(s.hours, s.is_open), 'verified', s.verified,
      'rating_avg', s.rating_avg, 'rating_count', s.rating_count, 'logo_path', s.logo_path,
      'avg_delivery_mins', s.avg_delivery_mins, 'orders_delivered', s.orders_delivered),
    'today', jsonb_build_object(
      'new_requests', (select count(*) from public.orders where shop_id = s.id and status = 'REQUESTED'),
      'active_orders', (select count(*) from public.orders where shop_id = s.id
                        and status in ('CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED', 'ISSUE_REPORTED')),
      'delivered', (select count(*) from public.orders where shop_id = s.id and status = 'DELIVERED'
                    and (delivered_at at time zone 'Asia/Kolkata')::date = v_today),
      'sales', (select coalesce(sum(grand_total), 0) from public.orders where shop_id = s.id and paid_at is not null
                and (paid_at at time zone 'Asia/Kolkata')::date = v_today
                and status not in ('REJECTED', 'CANCELLED', 'EXPIRED')),
      'orders_today', (select count(*) from public.orders where shop_id = s.id
                       and (requested_at at time zone 'Asia/Kolkata')::date = v_today),
      'views', coalesce((select views from public.shop_stats_daily where shop_id = s.id and day = v_today), 0),
      'call_taps', coalesce((select call_taps from public.shop_stats_daily where shop_id = s.id and day = v_today), 0),
      'whatsapp_taps', coalesce((select whatsapp_taps from public.shop_stats_daily where shop_id = s.id and day = v_today), 0)),
    'attention', coalesce((select jsonb_agg(private.order_card(o) order by o.requested_at)
                           from (select * from public.orders where shop_id = s.id
                                 and status in ('REQUESTED', 'CONFIRMED', 'PAID', 'PACKED', 'ISSUE_REPORTED')
                                 order by requested_at limit 10) o), '[]'::jsonb),
    'low_stock', (select count(*) from public.shop_products where shop_id = s.id and is_active
                  and ((stock_qty is not null and stock_qty <= 2) or not in_stock)),
    'unread_reviews', (select count(*) from public.reviews where shop_id = s.id and shop_reply is null)
  );
end $$;

-- p_period: day (last 14 days) | week (last 12 weeks) | month (last 12 months)
create or replace function public.shop_insights(p_shop_id uuid, p_period text default 'day') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s public.shops := private.require_shop_owner(p_shop_id);
  v_unit text := case when p_period in ('week', 'month') then p_period else 'day' end;
  v_n int := case when p_period = 'week' then 12 when p_period = 'month' then 12 else 14 end;
  v_now timestamp := now() at time zone 'Asia/Kolkata';
  v_start timestamp;
begin
  v_start := date_trunc(v_unit, v_now) - ((v_n - 1) || ' ' || v_unit)::interval;
  return jsonb_build_object(
    'period', v_unit,
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'bucket', b.bucket::date,
          'label', case v_unit when 'day' then to_char(b.bucket, 'DD Mon') when 'week' then 'Wk ' || to_char(b.bucket, 'DD Mon')
                               else to_char(b.bucket, 'Mon YY') end,
          'orders', coalesce(x.orders, 0), 'delivered', coalesce(x.delivered, 0), 'sales', coalesce(x.sales, 0))
        order by b.bucket), '[]'::jsonb)
      from generate_series(v_start, date_trunc(v_unit, v_now), ('1 ' || v_unit)::interval) b(bucket)
      left join (
        select date_trunc(v_unit, o.requested_at at time zone 'Asia/Kolkata') as bucket,
               count(*) as orders,
               count(*) filter (where o.status = 'DELIVERED') as delivered,
               sum(o.grand_total) filter (where o.paid_at is not null and o.status not in ('REJECTED', 'CANCELLED', 'EXPIRED')) as sales
        from public.orders o
        where o.shop_id = s.id and o.requested_at at time zone 'Asia/Kolkata' >= v_start
        group by 1
      ) x on x.bucket = b.bucket),
    'totals', (
      select jsonb_build_object(
        'orders', count(*),
        'confirmed', count(*) filter (where o.confirmed_at is not null),
        'delivered', count(*) filter (where o.status = 'DELIVERED'),
        'sales', coalesce(sum(o.grand_total) filter (where o.paid_at is not null and o.status not in ('REJECTED', 'CANCELLED', 'EXPIRED')), 0),
        'avg_order_value', coalesce(round(avg(o.grand_total) filter (where o.paid_at is not null)), 0),
        'avg_dispatch_mins', round(avg(extract(epoch from (o.dispatched_at - o.paid_at)) / 60) filter (where o.dispatched_at is not null and o.paid_at is not null)),
        'avg_confirm_mins', round(avg(extract(epoch from (o.confirmed_at - o.requested_at)) / 60) filter (where o.confirmed_at is not null)))
      from public.orders o
      where o.shop_id = s.id and o.requested_at at time zone 'Asia/Kolkata' >= v_start),
    'top_products', (
      select coalesce(jsonb_agg(t order by t.qty desc), '[]'::jsonb)
      from (
        select i->>'name' as name, sum((i->>'qty')::int) as qty, sum((i->>'line_total')::numeric) as sales
        from public.orders o, jsonb_array_elements(o.items) i
        where o.shop_id = s.id and o.paid_at is not null and o.status not in ('REJECTED', 'CANCELLED', 'EXPIRED')
          and o.requested_at at time zone 'Asia/Kolkata' >= v_start
        group by i->>'name'
        order by 2 desc
        limit 10
      ) t),
    'rating', jsonb_build_object('avg', s.rating_avg, 'count', s.rating_count),
    'avg_delivery_mins', s.avg_delivery_mins
  );
end $$;

-- "Demand near you": what people near the shop search for that the shop does not list.
create or replace function public.shop_demand_insights(p_shop_id uuid, p_days int default 7) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  s public.shops := private.require_shop_owner(p_shop_id);
  v_radius numeric := greatest(coalesce(s.delivery_radius_km, 0), 10);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('query', q.display, 'normalized', q.normalized, 'searches', q.n,
                     'zero_results', q.zero) order by q.n desc)
    from (
      select l.normalized, mode() within group (order by l.query) as display, count(*) as n,
             count(*) filter (where l.results_count = 0) as zero
      from public.search_logs l
      left join public.areas a on a.id = l.area_id
      where l.created_at > now() - make_interval(days => greatest(p_days, 1))
        and (
          public.gg_distance_km(s.lat, s.lng, coalesce(l.lat, a.lat), coalesce(l.lng, a.lng)) <= v_radius
          or (s.delivery_mode = 'areas' and exists (
                select 1 from public.delivery_areas da
                where da.shop_id = s.id and (da.area_id = l.area_id or da.zone_id = a.zone_id)))
        )
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

-- ---------------------------------------------------------------------------
-- Shop Partner: products
-- ---------------------------------------------------------------------------
create or replace function private.my_first_shop() returns public.shops
language sql stable security definer set search_path = public as $$
  select * from public.shops where owner_id = auth.uid() order by created_at limit 1;
$$;

-- patch: id? | shop_id?, catalog_product_id, condition, price, mrp, warranty_months, warranty_type,
--        stock_qty (null = simple In/Out switch), in_stock, photos[], description, specs{}, in_the_box,
--        installation_available, installation_charge, is_active
create or replace function public.shop_upsert_product(p_patch jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  p jsonb := coalesce(p_patch, '{}'::jsonb);
  v_shop public.shops;
  sp public.shop_products;
  v_id uuid := nullif(p->>'id', '')::uuid;
begin
  perform private.require_user();
  if v_id is not null then
    select * into sp from public.shop_products where id = v_id;
    if sp.id is null then raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002'; end if;
    v_shop := private.require_shop_owner(sp.shop_id);
  else
    if p->>'shop_id' is not null then
      v_shop := private.require_shop_owner((p->>'shop_id')::uuid);
    else
      v_shop := private.my_first_shop();
      if v_shop.id is null then raise exception 'NO_SHOP' using errcode = 'P0001'; end if;
    end if;
  end if;

  if p ? 'price' and coalesce((p->>'price')::numeric, -1) < 0 then
    raise exception 'INVALID_PRICE' using errcode = 'P0001';
  end if;
  if p ? 'photos' and jsonb_array_length(coalesce(p->'photos', '[]'::jsonb)) > 8 then
    raise exception 'TOO_MANY_PHOTOS' using errcode = 'P0001';
  end if;

  if v_id is null then
    if not exists (select 1 from public.catalog_products where id = (p->>'catalog_product_id')::uuid
                   and (status = 'approved' or (status = 'pending' and created_by_shop = v_shop.id))) then
      raise exception 'CATALOG_PRODUCT_NOT_FOUND' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.shop_products where shop_id = v_shop.id
               and catalog_product_id = (p->>'catalog_product_id')::uuid
               and condition = coalesce(p->>'condition', 'new')::public.product_condition) then
      raise exception 'ALREADY_LISTED' using errcode = 'P0001';
    end if;
    insert into public.shop_products (shop_id, catalog_product_id, condition, price, mrp, warranty_months, warranty_type,
      stock_qty, in_stock, photos, description, specs, in_the_box, installation_available, installation_charge, is_active)
    values (v_shop.id, (p->>'catalog_product_id')::uuid, coalesce(p->>'condition', 'new')::public.product_condition,
      (p->>'price')::numeric, (p->>'mrp')::numeric, coalesce((p->>'warranty_months')::int, 12),
      coalesce(p->>'warranty_type', 'brand')::public.warranty_type, (p->>'stock_qty')::int,
      coalesce((p->>'in_stock')::boolean, true),
      coalesce((select array_agg(x) from jsonb_array_elements_text(p->'photos') x), '{}'),
      nullif(btrim(p->>'description'), ''), coalesce(p->'specs', '{}'::jsonb), nullif(btrim(p->>'in_the_box'), ''),
      coalesce((p->>'installation_available')::boolean, false), (p->>'installation_charge')::numeric,
      coalesce((p->>'is_active')::boolean, true))
    returning * into sp;
  else
    update public.shop_products set
      catalog_product_id = case when p ? 'catalog_product_id' then (p->>'catalog_product_id')::uuid else catalog_product_id end,
      condition = case when p ? 'condition' then (p->>'condition')::public.product_condition else condition end,
      price = case when p ? 'price' then (p->>'price')::numeric else price end,
      mrp = case when p ? 'mrp' then (p->>'mrp')::numeric else mrp end,
      warranty_months = case when p ? 'warranty_months' then coalesce((p->>'warranty_months')::int, 0) else warranty_months end,
      warranty_type = case when p ? 'warranty_type' then (p->>'warranty_type')::public.warranty_type else warranty_type end,
      stock_qty = case when p ? 'stock_qty' then (p->>'stock_qty')::int else stock_qty end,
      in_stock = case when p ? 'in_stock' then coalesce((p->>'in_stock')::boolean, in_stock) else in_stock end,
      photos = case when p ? 'photos' then coalesce((select array_agg(x) from jsonb_array_elements_text(p->'photos') x), '{}') else photos end,
      description = case when p ? 'description' then nullif(btrim(p->>'description'), '') else description end,
      specs = case when p ? 'specs' then coalesce(p->'specs', '{}'::jsonb) else specs end,
      in_the_box = case when p ? 'in_the_box' then nullif(btrim(p->>'in_the_box'), '') else in_the_box end,
      installation_available = case when p ? 'installation_available' then coalesce((p->>'installation_available')::boolean, false) else installation_available end,
      installation_charge = case when p ? 'installation_charge' then (p->>'installation_charge')::numeric else installation_charge end,
      is_active = case when p ? 'is_active' then coalesce((p->>'is_active')::boolean, true) else is_active end
    where id = v_id
    returning * into sp;
  end if;
  return public.get_shop_product(sp.id);
end $$;

-- One-tap price / stock change from the quick-edit list.
create or replace function public.shop_quick_update(p_id uuid, p_price numeric default null, p_in_stock boolean default null, p_stock_qty int default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  sp public.shop_products;
begin
  select * into sp from public.shop_products where id = p_id;
  if sp.id is null then raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002'; end if;
  perform private.require_shop_owner(sp.shop_id);
  if p_price is not null and p_price < 0 then raise exception 'INVALID_PRICE' using errcode = 'P0001'; end if;
  update public.shop_products set
    price = coalesce(p_price, price),
    stock_qty = case when p_stock_qty is not null then greatest(p_stock_qty, 0)
                     when p_in_stock is not null then null else stock_qty end,
    in_stock = coalesce(p_in_stock, in_stock)
  where id = p_id returning * into sp;
  return jsonb_build_object('id', sp.id, 'price', sp.price, 'in_stock', sp.in_stock, 'stock_qty', sp.stock_qty);
end $$;

create or replace function public.shop_delete_product(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  sp public.shop_products;
begin
  select * into sp from public.shop_products where id = p_id;
  if sp.id is null then return; end if;
  perform private.require_shop_owner(sp.shop_id);
  delete from public.shop_products where id = p_id;
end $$;

create or replace function private.find_or_create_brand(p_name text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_id int;
  v_name text := btrim(p_name);
begin
  if coalesce(v_name, '') = '' then return null; end if;
  select id into v_id from public.brands where lower(name) = lower(v_name);
  if v_id is null then
    insert into public.brands (name, slug) values (v_name, private.slugify(v_name))
    on conflict (slug) do update set name = public.brands.name
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- Custom product (not found in the master catalog): pending until an admin approves it.
create or replace function public.shop_create_custom_product(p_patch jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  p jsonb := coalesce(p_patch, '{}'::jsonb);
  v_shop public.shops := private.my_first_shop();
  c public.catalog_products;
begin
  perform private.require_user();
  if v_shop.id is null then raise exception 'NO_SHOP' using errcode = 'P0001'; end if;
  if coalesce(btrim(p->>'name'), '') = '' or p->>'category_id' is null then
    raise exception 'NAME_AND_CATEGORY_REQUIRED' using errcode = 'P0001';
  end if;
  insert into public.catalog_products (category_id, brand_id, name, model, model_number, variant, key_specs, specs,
    description, in_the_box, photos, keywords, mrp, status, created_by, created_by_shop)
  values ((p->>'category_id')::int, private.find_or_create_brand(p->>'brand'), btrim(p->>'name'),
    nullif(btrim(p->>'model'), ''), nullif(btrim(p->>'model_number'), ''), coalesce(p->'variant', '{}'::jsonb),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p->'key_specs') x), '{}'),
    coalesce(p->'specs', '{}'::jsonb), nullif(btrim(p->>'description'), ''), nullif(btrim(p->>'in_the_box'), ''),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p->'photos') x), '{}'),
    nullif(btrim(p->>'keywords'), ''), (p->>'mrp')::numeric, 'pending', auth.uid(), v_shop.id)
  returning * into c;
  perform private.notify_admins('catalog_pending', 'New custom product: ' || c.name, coalesce(v_shop.name, ''),
    jsonb_build_object('catalog_product_id', c.id));
  return jsonb_build_object('id', c.id, 'name', c.name, 'status', c.status, 'category_id', c.category_id);
end $$;

-- Bulk upload from the CSV/Excel template.
-- rows: [{catalog_product_id?, name?, brand?, model_number?, category? (slug or name), condition?, price, mrp?,
--         stock_qty?, in_stock?, warranty_months?}]
create or replace function public.shop_bulk_upsert(p_shop_id uuid, p_rows jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  s public.shops := private.require_shop_owner(p_shop_id);
  r jsonb;
  i int := 0;
  v_results jsonb := '[]'::jsonb;
  v_cat_id uuid;
  v_category int;
  v_cond public.product_condition;
  v_existing uuid;
  v_status text;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'ROWS_INVALID' using errcode = 'P0001';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      v_cat_id := null;
      v_cond := coalesce(nullif(lower(replace(btrim(r->>'condition'), ' ', '_')), ''), 'new')::public.product_condition;
      if coalesce((r->>'price')::numeric, -1) < 0 then raise exception 'Price is missing'; end if;

      if r->>'catalog_product_id' is not null then
        select id into v_cat_id from public.catalog_products where id = (r->>'catalog_product_id')::uuid and status = 'approved';
      end if;
      if v_cat_id is null and coalesce(btrim(r->>'model_number'), '') <> '' then
        select id into v_cat_id from public.catalog_products
         where status = 'approved' and public.gg_compact(model_number) = public.gg_compact(r->>'model_number')
         order by popularity desc limit 1;
      end if;
      if v_cat_id is null and coalesce(btrim(r->>'name'), '') <> '' then
        select id into v_cat_id from public.catalog_products
         where status in ('approved', 'pending') and public.gg_norm(name) = public.gg_norm(r->>'name')
           and (status = 'approved' or created_by_shop = s.id)
         order by status, popularity desc limit 1;
      end if;
      v_status := 'matched';
      if v_cat_id is null then
        select id into v_category from public.categories
         where slug = lower(btrim(r->>'category')) or lower(name) = lower(btrim(r->>'category')) limit 1;
        if v_category is null or coalesce(btrim(r->>'name'), '') = '' then
          raise exception 'Not found in catalog. Add name and category to create it.';
        end if;
        insert into public.catalog_products (category_id, brand_id, name, model_number, status, created_by, created_by_shop, mrp)
        values (v_category, private.find_or_create_brand(r->>'brand'), btrim(r->>'name'), nullif(btrim(r->>'model_number'), ''),
                'pending', auth.uid(), s.id, (r->>'mrp')::numeric)
        returning id into v_cat_id;
        v_status := 'custom_created';
      end if;

      select id into v_existing from public.shop_products
       where shop_id = s.id and catalog_product_id = v_cat_id and condition = v_cond;
      if v_existing is null then
        insert into public.shop_products (shop_id, catalog_product_id, condition, price, mrp, stock_qty, in_stock, warranty_months)
        values (s.id, v_cat_id, v_cond, (r->>'price')::numeric, (r->>'mrp')::numeric, (r->>'stock_qty')::int,
                coalesce((r->>'in_stock')::boolean, true), coalesce((r->>'warranty_months')::int, 12));
        v_status := case when v_status = 'custom_created' then 'custom_created' else 'created' end;
      else
        update public.shop_products set price = (r->>'price')::numeric, mrp = coalesce((r->>'mrp')::numeric, mrp),
          stock_qty = case when r ? 'stock_qty' then (r->>'stock_qty')::int else stock_qty end,
          in_stock = coalesce((r->>'in_stock')::boolean, in_stock),
          warranty_months = coalesce((r->>'warranty_months')::int, warranty_months), is_active = true
        where id = v_existing;
        v_status := 'updated';
      end if;
      v_results := v_results || jsonb_build_object('row', i, 'status', v_status, 'name', coalesce(r->>'name', r->>'model_number'));
    exception when others then
      v_results := v_results || jsonb_build_object('row', i, 'status', 'error', 'name', coalesce(r->>'name', r->>'model_number'),
                                                   'message', sqlerrm);
    end;
  end loop;
  return jsonb_build_object(
    'results', v_results,
    'created', (select count(*) from jsonb_array_elements(v_results) x where x->>'status' in ('created', 'custom_created')),
    'updated', (select count(*) from jsonb_array_elements(v_results) x where x->>'status' = 'updated'),
    'errors', (select count(*) from jsonb_array_elements(v_results) x where x->>'status' = 'error'));
end $$;
