-- Gadget Galli · 0002 · core tables

create or replace function private.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Hyderabad zones and areas (admin-editable)
-- ---------------------------------------------------------------------------
create table public.zones (
  id serial primary key,
  name text not null unique,
  sort int not null default 0,
  is_active boolean not null default true
);

create table public.areas (
  id serial primary key,
  zone_id int not null references public.zones(id) on update cascade,
  name text not null,
  pincode text not null check (pincode ~ '^[1-9][0-9]{5}$'),
  lat double precision,
  lng double precision,
  is_active boolean not null default true,
  unique (name, pincode)
);
create index areas_zone_idx on public.areas(zone_id);

-- ---------------------------------------------------------------------------
-- Users (profile for auth.users; no FK so a deleted login keeps anonymised order history)
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key,
  phone text unique,
  email text,
  name text,
  role public.user_role not null default 'customer',
  admin_role public.admin_role,
  language text not null default 'en' check (language in ('en', 'te', 'hi')),
  referral_code text unique,
  referred_by uuid references public.users(id),
  is_blocked boolean not null default false,
  avatar_path text,
  last_area_id int references public.areas(id) on delete set null,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger users_touch before update on public.users for each row execute function private.touch_updated_at();

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  label public.address_label not null default 'home',
  label_custom text,
  contact_name text,
  house text,
  building text,
  street text,
  landmark text,
  area_id int references public.areas(id) on delete set null,
  area_name text,
  pincode text,
  lat double precision,
  lng double precision,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses(user_id);
create trigger addresses_touch before update on public.addresses for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Catalog: categories, brands, master products
-- ---------------------------------------------------------------------------
create table public.categories (
  id serial primary key,
  slug text not null unique,
  name text not null,
  name_te text,
  name_hi text,
  icon text not null default 'cube',
  parent_id int references public.categories(id) on delete cascade,
  shop_type public.shop_type,
  sort int not null default 0,
  is_active boolean not null default true
);
create index categories_parent_idx on public.categories(parent_id);

create table public.brands (
  id serial primary key,
  name text not null unique,
  slug text not null unique,
  logo_path text,
  is_active boolean not null default true
);

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id),
  slug text unique,
  name text,
  shop_types public.shop_type[] not null default '{}',
  description text,
  hours jsonb not null default '{}'::jsonb,
  weekly_holiday text check (weekly_holiday is null or weekly_holiday in ('sun','mon','tue','wed','thu','fri','sat')),
  owner_name text,
  owner_phone text,
  contact_phone text,
  whatsapp_phone text,
  email text,
  address_line text,
  area_id int references public.areas(id),
  pincode text,
  landmark text,
  lat double precision,
  lng double precision,
  delivery_mode public.delivery_mode not null default 'areas',
  delivery_radius_km numeric(5,1),
  delivery_charge_type public.delivery_charge_type not null default 'flat',
  delivery_charge numeric(10,2) not null default 0 check (delivery_charge >= 0),
  free_delivery_above numeric(12,2),
  min_order numeric(12,2) not null default 0,
  usual_delivery_mins int not null default 120,
  store_pickup boolean not null default true,
  upi_id text,
  upi_name text,
  upi_qr_path text,
  upi_verified boolean not null default false,
  logo_path text,
  cover_path text,
  status public.shop_status not null default 'draft',
  status_reason text,
  verified boolean not null default false,
  is_open boolean not null default true,
  registration_step int not null default 1,
  rating_avg numeric(2,1) not null default 0,
  rating_count int not null default 0,
  avg_delivery_mins int,
  orders_delivered int not null default 0,
  warnings_count int not null default 0,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shops_owner_idx on public.shops(owner_id);
create index shops_status_idx on public.shops(status);
create index shops_area_idx on public.shops(area_id);
create trigger shops_touch before update on public.shops for each row execute function private.touch_updated_at();

create table public.shop_private (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  gst_number text,
  admin_notes text,
  updated_at timestamptz not null default now()
);

create table public.shop_photos (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  kind public.photo_kind not null default 'inside',
  path text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index shop_photos_shop_idx on public.shop_photos(shop_id);

create table public.shop_documents (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  doc_type public.doc_type not null,
  path text not null,
  doc_number text,
  status text not null default 'submitted' check (status in ('submitted', 'accepted', 'rejected')),
  note text,
  created_at timestamptz not null default now()
);
create index shop_documents_shop_idx on public.shop_documents(shop_id);

-- A row with zone_id covers the whole zone (including areas added later); a row with area_id covers one area.
create table public.delivery_areas (
  id bigserial primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  zone_id int references public.zones(id) on delete cascade,
  area_id int references public.areas(id) on delete cascade,
  check ((zone_id is null) <> (area_id is null))
);
create unique index delivery_areas_zone_uq on public.delivery_areas(shop_id, zone_id) where zone_id is not null;
create unique index delivery_areas_area_uq on public.delivery_areas(shop_id, area_id) where area_id is not null;

create table public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  category_id int not null references public.categories(id),
  brand_id int references public.brands(id),
  name text not null,
  model text,
  model_number text,
  variant jsonb not null default '{}'::jsonb,
  key_specs text[] not null default '{}',
  specs jsonb not null default '{}'::jsonb,
  description text,
  in_the_box text,
  photos text[] not null default '{}',
  keywords text,
  mrp numeric(12,2),
  status public.catalog_status not null default 'approved',
  review_note text,
  created_by uuid references public.users(id),
  created_by_shop uuid references public.shops(id) on delete set null,
  merged_into uuid references public.catalog_products(id),
  popularity int not null default 0,
  search_text text not null default '',
  search_compact text not null default '',
  model_norm text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index catalog_category_idx on public.catalog_products(category_id);
create index catalog_brand_idx on public.catalog_products(brand_id);
create index catalog_status_idx on public.catalog_products(status);
create index catalog_search_trgm on public.catalog_products using gin (search_text extensions.gin_trgm_ops);
create index catalog_compact_trgm on public.catalog_products using gin (search_compact extensions.gin_trgm_ops);
create trigger catalog_touch before update on public.catalog_products for each row execute function private.touch_updated_at();

create table public.shop_products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  catalog_product_id uuid not null references public.catalog_products(id),
  condition public.product_condition not null default 'new',
  price numeric(12,2) not null check (price >= 0),
  mrp numeric(12,2) check (mrp is null or mrp >= 0),
  warranty_months int not null default 12 check (warranty_months >= 0),
  warranty_type public.warranty_type not null default 'brand',
  stock_qty int check (stock_qty is null or stock_qty >= 0),
  in_stock boolean not null default true,
  photos text[] not null default '{}',
  description text,
  specs jsonb not null default '{}'::jsonb,
  in_the_box text,
  installation_available boolean not null default false,
  installation_charge numeric(10,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, catalog_product_id, condition)
);
create index shop_products_catalog_idx on public.shop_products(catalog_product_id) where is_active and in_stock;
create index shop_products_shop_idx on public.shop_products(shop_id);
create trigger shop_products_touch before update on public.shop_products for each row execute function private.touch_updated_at();

-- When stock is tracked by quantity, in_stock follows it.
create or replace function private.sync_in_stock() returns trigger
language plpgsql as $$
begin
  if new.stock_qty is not null then
    new.in_stock := new.stock_qty > 0;
  end if;
  return new;
end $$;
create trigger shop_products_stock before insert or update on public.shop_products
  for each row execute function private.sync_in_stock();

-- ---------------------------------------------------------------------------
-- Cart (one shop per cart, one cart per user)
-- ---------------------------------------------------------------------------
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  shop_id uuid references public.shops(id) on delete set null,
  fulfilment public.fulfilment_type not null default 'delivery',
  address_id uuid references public.addresses(id) on delete set null,
  note text,
  updated_at timestamptz not null default now()
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  shop_product_id uuid not null references public.shop_products(id) on delete cascade,
  qty int not null default 1 check (qty between 1 and 99),
  with_installation boolean not null default false,
  added_at timestamptz not null default now(),
  unique (cart_id, shop_product_id)
);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create sequence public.order_no_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  customer_id uuid not null references public.users(id),
  shop_id uuid not null references public.shops(id),
  status public.order_status not null default 'REQUESTED',
  status_before_issue public.order_status,
  contact_method public.contact_method not null,
  fulfilment public.fulfilment_type not null default 'delivery',
  items jsonb not null,
  item_total numeric(12,2) not null,
  installation_total numeric(12,2) not null default 0,
  delivery_charge numeric(10,2) not null default 0,
  grand_total numeric(12,2) not null,
  customer_name text,
  address jsonb,
  area_id int references public.areas(id),
  distance_km numeric(6,2),
  note text,
  shop_snapshot jsonb not null default '{}'::jsonb,
  updated_by_shop boolean not null default false,
  reject_reason text,
  cancel_reason text,
  delivered_by text check (delivered_by in ('customer', 'auto', 'admin')),
  pack_photo_path text,
  bill_photo_path text,
  reminder_sent_at timestamptz,
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  paid_at timestamptz,
  packed_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz,
  issue_reported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_customer_idx on public.orders(customer_id, created_at desc);
create index orders_shop_idx on public.orders(shop_id, created_at desc);
create index orders_status_idx on public.orders(status);
create trigger orders_touch before update on public.orders for each row execute function private.touch_updated_at();

create table public.order_events (
  id bigserial primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  actor_id uuid references public.users(id),
  actor_role public.actor_role not null,
  note text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events(order_id, created_at);

create table public.payments_log (
  id bigserial primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  method public.payment_method not null,
  amount numeric(12,2) not null,
  upi_txn_id text,
  proof_path text,
  recorded_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index payments_order_idx on public.payments_log(order_id);

create table public.dispatch_details (
  order_id uuid primary key references public.orders(id) on delete cascade,
  service public.delivery_service not null,
  rider_name text,
  rider_phone text,
  vehicle_no text,
  tracking_url text,
  delivery_otp text,
  eta timestamptz,
  package_photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null references public.users(id),
  customer_name text,
  rating int not null check (rating between 1 and 5),
  body text,
  photos text[] not null default '{}',
  shop_reply text,
  shop_replied_at timestamptz,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index reviews_shop_idx on public.reviews(shop_id, created_at desc);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid not null references public.users(id),
  shop_id uuid not null references public.shops(id),
  type public.issue_type not null,
  description text,
  photos text[] not null default '{}',
  status public.issue_status not null default 'open',
  resolution text,
  shop_action text check (shop_action in ('none', 'warned', 'suspended')),
  resolved_by uuid references public.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index issues_status_idx on public.issues(status, created_at desc);

create table public.issue_notes (
  id bigserial primary key,
  issue_id uuid not null references public.issues(id) on delete cascade,
  author_id uuid references public.users(id),
  note text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------
create table public.search_logs (
  id bigserial primary key,
  user_id uuid references public.users(id) on delete set null,
  query text not null,
  normalized text not null,
  area_id int references public.areas(id) on delete set null,
  lat double precision,
  lng double precision,
  results_count int not null,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index search_logs_created_idx on public.search_logs(created_at desc);
create index search_logs_norm_idx on public.search_logs(normalized);

-- Each row is a group of equivalent words, e.g. {gpu, graphics card, vga}.
create table public.search_synonyms (
  id serial primary key,
  words text[] not null check (array_length(words, 1) >= 2),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Growth, content, notifications
-- ---------------------------------------------------------------------------
create table public.referrals (
  id bigserial primary key,
  referrer_id uuid not null references public.users(id),
  referred_id uuid not null unique references public.users(id),
  code text not null,
  status text not null default 'joined' check (status in ('joined', 'ordered')),
  created_at timestamptz not null default now(),
  converted_at timestamptz
);

create table public.banners (
  id serial primary key,
  title text not null,
  subtitle text,
  image_path text,
  bg_color text not null default '#4F46E5',
  link_type text not null default 'search' check (link_type in ('search', 'category', 'shop', 'product', 'url', 'none')),
  link_value text,
  area_id int references public.areas(id) on delete set null,
  sort int not null default 0,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.featured (
  id serial primary key,
  kind text not null check (kind in ('shop', 'product')),
  shop_id uuid references public.shops(id) on delete cascade,
  catalog_product_id uuid references public.catalog_products(id) on delete cascade,
  sort int not null default 0,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  check ((kind = 'shop' and shop_id is not null) or (kind = 'product' and catalog_product_id is not null))
);

create table public.campaigns (
  id serial primary key,
  title text not null,
  body text not null,
  segment text not null,
  area_id int references public.areas(id),
  sent_count int not null default 0,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  app text not null default 'customer' check (app in ('customer', 'partner', 'admin')),
  kind text not null default 'general',
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  push_status text not null default 'pending' check (push_status in ('pending', 'sent', 'failed', 'skipped')),
  push_error text,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
create index notifications_pending_idx on public.notifications(push_status) where push_status = 'pending';

create table public.push_tokens (
  token text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  platform text,
  app text not null default 'customer' check (app in ('customer', 'partner')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens(user_id);

create table public.notify_me (
  id bigserial primary key,
  user_id uuid references public.users(id) on delete cascade,
  phone text,
  place text,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

create table public.favourites (
  user_id uuid not null references public.users(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, shop_id)
);

create table public.shop_stats_daily (
  shop_id uuid not null references public.shops(id) on delete cascade,
  day date not null,
  views int not null default 0,
  call_taps int not null default 0,
  whatsapp_taps int not null default 0,
  shares int not null default 0,
  primary key (shop_id, day)
);

-- Server-side settings (push webhook URL/secret). No API access: RLS on, no policies.
create table public.app_config (
  key text primary key,
  value text not null
);

create table public.admin_audit_log (
  id bigserial primary key,
  admin_id uuid references public.users(id),
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
