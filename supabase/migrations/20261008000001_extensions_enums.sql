-- Gadget Galli · 0001 · extensions, schemas and enum types

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Internal helpers live in "private": it is not exposed through the REST API.
create schema if not exists private;
revoke all on schema private from public;

create type public.user_role as enum ('customer', 'shop_owner');
create type public.admin_role as enum ('super_admin', 'support');
create type public.shop_status as enum ('draft', 'under_review', 'changes_requested', 'approved', 'rejected', 'suspended');
create type public.shop_type as enum ('mobiles', 'cctv_security', 'computers_laptops', 'components_peripherals');
create type public.delivery_mode as enum ('areas', 'radius');
create type public.delivery_charge_type as enum ('free', 'flat', 'per_km');
create type public.product_condition as enum ('new', 'open_box', 'refurbished', 'used');
create type public.warranty_type as enum ('brand', 'shop', 'none');
create type public.catalog_status as enum ('approved', 'pending', 'rejected', 'merged');
create type public.order_status as enum (
  'REQUESTED', 'CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED', 'DELIVERED',
  'REJECTED', 'CANCELLED', 'EXPIRED', 'ISSUE_REPORTED'
);
create type public.contact_method as enum ('call', 'whatsapp');
create type public.fulfilment_type as enum ('delivery', 'pickup');
create type public.payment_method as enum ('upi', 'bank_transfer', 'cash');
create type public.delivery_service as enum ('porter', 'rapido', 'uber', 'own', 'other', 'store_pickup');
create type public.issue_type as enum ('wrong_item', 'damaged', 'not_received', 'paid_not_sent', 'other');
create type public.issue_status as enum ('open', 'in_progress', 'resolved');
create type public.doc_type as enum ('gst_certificate', 'trade_licence', 'udyam_certificate', 'owner_id_proof', 'other');
create type public.address_label as enum ('home', 'office', 'other');
create type public.photo_kind as enum ('front', 'inside', 'logo', 'cover');
create type public.actor_role as enum ('customer', 'shop', 'admin', 'system');
