-- Gadget Galli · 0009 · storage buckets and policies
--
-- Paths:
--   shop-media/<shop_id>/...        shop front/inside photos, logo, UPI QR   (public)
--   product-photos/<shop_id>/...    listing and custom product photos         (public)
--   product-photos/catalog/...      master catalog photos (admins)            (public)
--   review-photos/<user_id>/...     review photos                             (public)
--   banners/...                     home banners (admins)                     (public)
--   shop-documents/<shop_id>/...    GST / licence / ID proof                  (admins + owner only)
--   order-media/<order_id>/...      payment proof, package & bill photos, issue photos (order parties + admins)

create or replace function public.gg_try_uuid(t text) returns uuid
language plpgsql immutable as $$
begin
  return t::uuid;
exception when others then
  return null;
end $$;
grant execute on function public.gg_try_uuid(text) to anon, authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('shop-media', 'shop-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('product-photos', 'product-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('review-photos', 'review-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('banners', 'banners', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('shop-documents', 'shop-documents', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('order-media', 'order-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public buckets: anyone can read
create policy gg_public_read on storage.objects for select
  using (bucket_id in ('shop-media', 'product-photos', 'review-photos', 'banners'));

-- Shop media and product photos: the shop owner writes inside the shop's folder
create policy gg_shop_media_write on storage.objects for insert to authenticated
  with check (bucket_id in ('shop-media', 'product-photos')
              and public.owns_shop(public.gg_try_uuid((storage.foldername(name))[1])));
create policy gg_shop_media_update on storage.objects for update to authenticated
  using (bucket_id in ('shop-media', 'product-photos')
         and public.owns_shop(public.gg_try_uuid((storage.foldername(name))[1])));
create policy gg_shop_media_delete on storage.objects for delete to authenticated
  using (bucket_id in ('shop-media', 'product-photos')
         and (public.owns_shop(public.gg_try_uuid((storage.foldername(name))[1])) or public.is_admin()));

-- Admin uploads: catalog photos and banners
create policy gg_admin_media_write on storage.objects for insert to authenticated
  with check (public.is_admin() and (bucket_id = 'banners' or (bucket_id = 'product-photos' and (storage.foldername(name))[1] = 'catalog')));
create policy gg_admin_media_modify on storage.objects for update to authenticated
  using (public.is_admin() and bucket_id in ('banners', 'product-photos'));
create policy gg_admin_media_delete on storage.objects for delete to authenticated
  using (public.is_admin() and bucket_id in ('banners', 'product-photos'));

-- Review photos: customers write in their own folder
create policy gg_review_photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'review-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Shop documents: private
create policy gg_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shop-documents' and public.owns_shop(public.gg_try_uuid((storage.foldername(name))[1])));
create policy gg_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'shop-documents'
         and (public.is_admin() or public.owns_shop(public.gg_try_uuid((storage.foldername(name))[1]))));
create policy gg_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'shop-documents'
         and (public.is_admin() or public.owns_shop(public.gg_try_uuid((storage.foldername(name))[1]))));

-- Order media: the customer and the shop of that order (and admins)
create policy gg_order_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'order-media' and public.can_see_order(public.gg_try_uuid((storage.foldername(name))[1])));
create policy gg_order_media_read on storage.objects for select to authenticated
  using (bucket_id = 'order-media' and public.can_see_order(public.gg_try_uuid((storage.foldername(name))[1])));
