-- Gadget Galli · 0008 · row-level security and privileges
--
-- Rules:
--   * customers see only their own addresses, carts, orders and issues
--   * shop owners see only their own shop, products and orders
--   * shop documents are visible to admins (and the owner who uploaded them) only
--   * the customer's phone is never on the orders table: shops get it from get_order(),
--     which returns it only while the order is active
--   * orders are written only through the SECURITY DEFINER workflow functions

do $$
declare
  t text;
begin
  foreach t in array array[
    'zones', 'areas', 'users', 'addresses', 'categories', 'brands', 'shops', 'shop_private', 'shop_photos',
    'shop_documents', 'delivery_areas', 'catalog_products', 'shop_products', 'carts', 'cart_items', 'orders',
    'order_events', 'payments_log', 'dispatch_details', 'reviews', 'issues', 'issue_notes', 'search_logs',
    'search_synonyms', 'referrals', 'banners', 'featured', 'campaigns', 'notifications', 'push_tokens', 'notify_me',
    'favourites', 'shop_stats_daily', 'app_config', 'admin_audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Reference data: everyone reads, admins write
create policy zones_read on public.zones for select using (true);
create policy zones_admin on public.zones for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy areas_read on public.areas for select using (true);
create policy areas_admin on public.areas for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy categories_read on public.categories for select using (true);
create policy categories_admin on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy brands_read on public.brands for select using (true);
create policy brands_admin on public.brands for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy synonyms_read on public.search_synonyms for select using (true);
create policy synonyms_admin on public.search_synonyms for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy banners_read on public.banners for select using (is_active or public.is_admin());
create policy banners_admin on public.banners for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy featured_read on public.featured for select using (true);
create policy featured_admin on public.featured for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy campaigns_admin on public.campaigns for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Users
create policy users_select on public.users for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());
create policy users_update_own on public.users for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy addresses_own on public.addresses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy addresses_admin on public.addresses for select to authenticated using (public.is_admin());

-- Shops
create policy shops_select on public.shops for select
  using (status = 'approved' or owner_id = (select auth.uid()) or public.is_admin());
create policy shops_admin_update on public.shops for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy shop_private_select on public.shop_private for select to authenticated
  using (public.owns_shop(shop_id) or public.is_admin());
create policy shop_private_admin on public.shop_private for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy shop_photos_select on public.shop_photos for select
  using (public.shop_is_public(shop_id) or public.owns_shop(shop_id) or public.is_admin());
create policy shop_photos_owner on public.shop_photos for all to authenticated
  using (public.owns_shop(shop_id) or public.is_admin()) with check (public.owns_shop(shop_id) or public.is_admin());

create policy shop_documents_select on public.shop_documents for select to authenticated
  using (public.owns_shop(shop_id) or public.is_admin());
create policy shop_documents_insert on public.shop_documents for insert to authenticated
  with check (public.owns_shop(shop_id));
create policy shop_documents_delete on public.shop_documents for delete to authenticated
  using ((public.owns_shop(shop_id) and status <> 'accepted') or public.is_admin());
create policy shop_documents_admin on public.shop_documents for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy delivery_areas_read on public.delivery_areas for select using (true);
create policy delivery_areas_owner on public.delivery_areas for all to authenticated
  using (public.owns_shop(shop_id) or public.is_admin()) with check (public.owns_shop(shop_id) or public.is_admin());

-- Catalog and listings
create policy catalog_read on public.catalog_products for select
  using (
    status = 'approved'
    or created_by = (select auth.uid())
    or public.is_admin()
    or (status = 'pending' and exists (
          select 1 from public.shop_products sp
          where sp.catalog_product_id = catalog_products.id and public.shop_is_public(sp.shop_id)))
  );
create policy catalog_admin on public.catalog_products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy shop_products_read on public.shop_products for select
  using ((is_active and public.shop_is_public(shop_id)) or public.owns_shop(shop_id) or public.is_admin());
create policy shop_products_owner_update on public.shop_products for update to authenticated
  using (public.owns_shop(shop_id)) with check (public.owns_shop(shop_id));
create policy shop_products_owner_delete on public.shop_products for delete to authenticated
  using (public.owns_shop(shop_id) or public.is_admin());

-- Cart (writes go through cart_* functions)
create policy carts_own on public.carts for select to authenticated using (user_id = (select auth.uid()));
create policy cart_items_own on public.cart_items for select to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())));

-- Orders and their children (read only; writes through workflow functions)
create policy orders_read on public.orders for select to authenticated
  using (customer_id = (select auth.uid()) or public.owns_shop(shop_id) or public.is_admin());
create policy order_events_read on public.order_events for select to authenticated using (public.can_see_order(order_id));
create policy payments_read on public.payments_log for select to authenticated using (public.can_see_order(order_id));
create policy dispatch_read on public.dispatch_details for select to authenticated using (public.can_see_order(order_id));

create policy reviews_read on public.reviews for select
  using (not is_hidden or customer_id = (select auth.uid()) or public.owns_shop(shop_id) or public.is_admin());
create policy reviews_admin on public.reviews for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy issues_read on public.issues for select to authenticated
  using (customer_id = (select auth.uid()) or public.owns_shop(shop_id) or public.is_admin());
create policy issue_notes_admin on public.issue_notes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Search logs: written by search_products(); admins read
create policy search_logs_admin on public.search_logs for select to authenticated using (public.is_admin());

-- Growth and notifications
create policy referrals_read on public.referrals for select to authenticated
  using (referrer_id = (select auth.uid()) or referred_id = (select auth.uid()) or public.is_admin());
create policy notifications_own on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy push_tokens_own on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notify_me_insert on public.notify_me for insert to authenticated with check (user_id = (select auth.uid()));
create policy notify_me_admin on public.notify_me for select to authenticated using (public.is_admin());
create policy favourites_own on public.favourites for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy shop_stats_read on public.shop_stats_daily for select to authenticated
  using (public.owns_shop(shop_id) or public.is_admin());
create policy audit_admin on public.admin_audit_log for select to authenticated using (public.is_admin());
-- app_config: no policies on purpose (server-side only)

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

revoke all on public.app_config from anon, authenticated;

-- Users may edit only these profile columns directly (role/admin/block flags go through functions)
revoke update on public.users from authenticated;
grant update (name, email, language, avatar_path, last_area_id, onboarded) on public.users to authenticated;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Internal helpers are not callable from the API
revoke all on all functions in schema private from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all functions in schema private from anon, authenticated';
  end if;
end $$;

-- API functions: signed-in users only, except the read-only browsing functions
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function
  public.is_admin(), public.is_super_admin(), public.owns_shop(uuid), public.my_shop_ids(), public.shop_is_public(uuid),
  public.can_see_order(uuid), public.gg_norm(text), public.gg_compact(text),
  public.gg_distance_km(double precision, double precision, double precision, double precision),
  public.gg_shop_open_now(jsonb, boolean, timestamptz),
  public.resolve_location(double precision, double precision),
  public.search_products(text, int, double precision, double precision, jsonb, text, int, int, boolean),
  public.search_suggest(text, int),
  public.get_product_page(uuid, int, double precision, double precision),
  public.shops_near(int, double precision, double precision, int, int, boolean, public.shop_type),
  public.home_feed(int, double precision, double precision),
  public.products_by_ids(uuid[], int, double precision, double precision),
  public.get_shop_page(uuid, int, double precision, double precision),
  public.shop_catalog(uuid, text, int, int, int, boolean),
  public.get_shop_product(uuid, int, double precision, double precision),
  public.shop_reviews(uuid, int, int)
to anon;
