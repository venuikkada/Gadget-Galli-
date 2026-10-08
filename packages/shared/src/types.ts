/**
 * Shapes of the JSON returned by the database API functions (supabase/migrations/*.sql).
 * Numbers that are NUMERIC in Postgres arrive as numbers in JSON.
 */
import type { Condition, DeliveryService, IssueType, OrderStatus, PaymentMethod, ShopType } from './constants';
import type { AddressSnapshot, OrderItem } from './order';
import type { ShopHours } from './hours';

export type Uuid = string;
export type UserRole = 'customer' | 'shop_owner';
export type AdminRole = 'super_admin' | 'support';
export type ShopStatus = 'draft' | 'under_review' | 'changes_requested' | 'approved' | 'rejected' | 'suspended';
export type Language = 'en' | 'te' | 'hi';
export type Fulfilment = 'delivery' | 'pickup';
export type ContactMethod = 'call' | 'whatsapp';
export type DeliveryChargeType = 'free' | 'flat' | 'per_km';
export type DeliveryMode = 'areas' | 'radius';
export type DocType = 'gst_certificate' | 'trade_licence' | 'udyam_certificate' | 'owner_id_proof' | 'other';
export type PhotoKind = 'front' | 'inside' | 'logo' | 'cover';

export interface Zone {
  id: number;
  name: string;
  sort: number;
  is_active: boolean;
}

export interface Area {
  id: number;
  zone_id: number;
  name: string;
  pincode: string;
  lat: number | null;
  lng: number | null;
  is_active: boolean;
}

export interface Category {
  id: number;
  slug: string;
  name: string;
  name_te?: string | null;
  name_hi?: string | null;
  icon: string;
  parent_id: number | null;
  shop_type?: ShopType | null;
  sort?: number;
  is_active?: boolean;
}

export interface Brand {
  id: number;
  name: string;
  slug: string;
}

export interface Address {
  id: Uuid;
  user_id: Uuid;
  label: 'home' | 'office' | 'other';
  label_custom: string | null;
  contact_name: string | null;
  house: string | null;
  building: string | null;
  street: string | null;
  landmark: string | null;
  area_id: number | null;
  area_name: string | null;
  pincode: string | null;
  lat: number | null;
  lng: number | null;
  is_default: boolean;
}

export interface Profile {
  user: {
    id: Uuid;
    phone: string | null;
    email: string | null;
    name: string | null;
    role: UserRole;
    admin_role: AdminRole | null;
    language: Language;
    referral_code: string | null;
    referred: boolean;
    is_blocked: boolean;
    avatar_path: string | null;
    last_area_id: number | null;
    onboarded: boolean;
    created_at: string;
    deleted: boolean;
  };
  addresses: Address[];
  shops: { id: Uuid; name: string | null; status: ShopStatus; status_reason: string | null; registration_step: number; is_open: boolean; verified: boolean }[];
  unread: number;
  cart_count: number;
  favourite_shop_ids: Uuid[];
}

export interface ResolvedLocation {
  area_id: number | null;
  area_name: string | null;
  pincode: string | null;
  zone: string | null;
  distance_km: number | null;
  in_service: boolean;
}

/** One product card in search results (grouped by product). */
export interface ProductCard {
  product_id: Uuid;
  name: string;
  brand: string | null;
  category_id: number;
  photo: string | null;
  key_specs: string[];
  variant?: Record<string, string>;
  mrp: number | null;
  min_price: number | null;
  max_price?: number | null;
  shop_count: number;
  nearest_km?: number | null;
  fastest_mins?: number | null;
  best_rating?: number | null;
  score?: number;
}

export interface SearchResult {
  total: number;
  items: ProductCard[];
  normalized: string;
  variants: string[];
  elsewhere_count: number | null;
}

export interface SearchFilters {
  category_id?: number | null;
  brand_ids?: number[];
  price_min?: number | null;
  price_max?: number | null;
  conditions?: Condition[];
  max_delivery_mins?: number | null;
  min_rating?: number | null;
  deliver_only?: boolean;
}

export interface Suggestions {
  products: { id: Uuid; name: string; brand: string | null; photo: string | null; min_price: number | null; category_id: number }[];
  brands: { id: number; name: string }[];
  shops: { id: Uuid; name: string; area: string | null; logo_path: string | null; rating_avg: number; verified: boolean }[];
  categories: { id: number; name: string; icon: string; parent_id: number | null }[];
}

export interface Offer {
  shop_product_id: Uuid;
  shop_id: Uuid;
  shop_name: string;
  shop_slug: string | null;
  area: string | null;
  verified: boolean;
  rating_avg: number;
  rating_count: number;
  logo_path: string | null;
  price: number;
  mrp: number | null;
  condition: Condition;
  in_stock: boolean;
  stock_qty: number | null;
  warranty_months: number;
  warranty_type: 'brand' | 'shop' | 'none';
  installation_available: boolean;
  installation_charge: number | null;
  distance_km: number | null;
  delivers: boolean;
  delivery_mins: number;
  delivery_charge: number;
  store_pickup: boolean;
  is_open_now: boolean;
}

export interface ProductDetail {
  id: Uuid;
  name: string;
  model: string | null;
  model_number: string | null;
  brand: string | null;
  brand_id: number | null;
  category: { id: number; name: string; parent_id: number | null; parent_name: string | null; icon: string };
  variant: Record<string, string>;
  key_specs: string[];
  specs: Record<string, string>;
  description: string | null;
  in_the_box: string | null;
  photos: string[];
  mrp: number | null;
  status: string;
}

export interface ProductPage {
  product: ProductDetail;
  offers: Offer[];
  variants: { id: Uuid; name: string; variant: Record<string, string>; min_price: number | null }[];
}

export interface ShopCard {
  id: Uuid;
  slug: string | null;
  name: string;
  area: string | null;
  shop_types: ShopType[];
  rating_avg: number;
  rating_count: number;
  verified: boolean;
  logo_path: string | null;
  cover_path: string | null;
  cover_photo?: string | null;
  distance_km: number | null;
  delivery_mins: number;
  is_open_now: boolean;
  delivers: boolean;
  store_pickup: boolean;
}

export interface Banner {
  id: number;
  title: string;
  subtitle: string | null;
  image_path: string | null;
  bg_color: string;
  link_type: 'search' | 'category' | 'shop' | 'product' | 'url' | 'none';
  link_value: string | null;
}

export interface HomeFeed {
  banners: Banner[];
  categories: Category[];
  shops_near: ShopCard[];
  popular: ProductCard[];
  featured_shop_ids: Uuid[];
  featured_product_ids: Uuid[];
}

export interface ShopPage {
  id: Uuid;
  slug: string | null;
  name: string;
  description: string | null;
  shop_types: ShopType[];
  status: ShopStatus;
  verified: boolean;
  rating_avg: number;
  rating_count: number;
  address_line: string | null;
  landmark: string | null;
  pincode: string | null;
  area: { id: number; name: string; pincode: string; zone: string } | null;
  lat: number | null;
  lng: number | null;
  hours: ShopHours;
  weekly_holiday: string | null;
  is_open: boolean;
  is_open_now: boolean;
  contact_phone: string | null;
  whatsapp_phone: string | null;
  logo_path: string | null;
  cover_path: string | null;
  photos: { id: Uuid; kind: PhotoKind; path: string }[];
  delivery: {
    mode: DeliveryMode;
    radius_km: number | null;
    zones: string[];
    areas: string[];
    charge_type: DeliveryChargeType;
    charge: number;
    free_above: number | null;
    min_order: number;
    store_pickup: boolean;
    usual_mins: number;
    avg_mins: number | null;
    delivery_mins: number;
    orders_delivered: number;
    delivers_to_me: boolean;
    distance_km: number | null;
    my_charge: number;
  };
  tabs: { category_id: number; name: string; icon: string; count: number }[];
  is_favourite: boolean;
}

export interface Listing {
  id: Uuid;
  shop_product_id: Uuid;
  catalog_product_id: Uuid;
  name: string;
  brand: string | null;
  model: string | null;
  model_number: string | null;
  variant: Record<string, string>;
  key_specs: string[];
  category_id: number;
  photo: string | null;
  photos: string[];
  condition: Condition;
  price: number;
  mrp: number | null;
  in_stock: boolean;
  stock_qty: number | null;
  warranty_months: number;
  warranty_type: 'brand' | 'shop' | 'none';
  installation_available: boolean;
  installation_charge: number | null;
  is_active: boolean;
  catalog_status: string;
  updated_at: string;
}

export interface Paged<T> {
  total: number;
  items: T[];
}

export interface ShopProductDetail {
  id: Uuid;
  shop_id: Uuid;
  catalog_product_id: Uuid;
  name: string;
  brand: string | null;
  model: string | null;
  model_number: string | null;
  variant: Record<string, string>;
  key_specs: string[];
  specs: Record<string, string>;
  description: string | null;
  in_the_box: string | null;
  photos: string[];
  category: { id: number; name: string; icon: string };
  condition: Condition;
  price: number;
  mrp: number | null;
  warranty_months: number;
  warranty_type: 'brand' | 'shop' | 'none';
  stock_qty: number | null;
  in_stock: boolean;
  is_active: boolean;
  installation_available: boolean;
  installation_charge: number | null;
  shop: {
    id: Uuid;
    name: string;
    area: string | null;
    verified: boolean;
    rating_avg: number;
    rating_count: number;
    is_open_now: boolean;
    delivers_to_me: boolean;
    delivery_mins: number;
    distance_km: number | null;
    store_pickup: boolean;
  };
}

export interface Review {
  id: Uuid;
  order_id: Uuid;
  rating: number;
  body: string | null;
  photos: string[];
  customer_name: string;
  shop_reply: string | null;
  shop_replied_at: string | null;
  created_at: string;
  items?: string | null;
}

export interface ReviewsResult {
  summary: { avg: number; count: number; dist: Record<'1' | '2' | '3' | '4' | '5', number> };
  items: Review[];
}

export interface CartItem {
  shop_product_id: Uuid;
  catalog_product_id: Uuid;
  name: string;
  brand: string | null;
  variant: Record<string, string>;
  condition: Condition;
  photo: string | null;
  price: number;
  mrp: number | null;
  qty: number;
  in_stock: boolean;
  stock_qty: number | null;
  with_installation: boolean;
  installation_available: boolean;
  installation_charge: number | null;
  warranty_months: number;
  category_id: number;
  line_total: number;
}

export type CartProblem =
  | 'SHOP_UNAVAILABLE'
  | 'SHOP_CLOSED'
  | 'ITEM_UNAVAILABLE'
  | 'PICKUP_NOT_AVAILABLE'
  | 'ADDRESS_REQUIRED'
  | 'AREA_NOT_SERVED'
  | 'MIN_ORDER_NOT_MET';

export interface Cart {
  cart: { id: Uuid; shop_id: Uuid | null; fulfilment: Fulfilment; address_id: Uuid | null; note: string | null };
  shop: {
    id: Uuid;
    name: string;
    slug: string | null;
    area: string | null;
    logo_path: string | null;
    contact_phone: string | null;
    whatsapp_phone: string | null;
    store_pickup: boolean;
    min_order: number;
    is_open_now: boolean;
    charge_type: DeliveryChargeType;
    charge: number;
    free_above: number | null;
    delivery_mins: number;
    address_line: string | null;
    lat: number | null;
    lng: number | null;
    verified: boolean;
    upi_verified: boolean;
    delivers_to_address: boolean | null;
    distance_km: number | null;
  } | null;
  items: CartItem[];
  address: Address | null;
  totals: {
    item_count: number;
    item_total: number;
    installation_total: number;
    delivery_charge: number;
    grand_total: number;
    min_order_gap: number;
  };
  problems: CartProblem[];
}

export type CartAddResult =
  | { status: 'ok'; cart: Cart }
  | { status: 'conflict'; current_shop: { id: Uuid; name: string }; new_shop: { id: Uuid; name: string } };

export interface OrderEvent {
  id: number;
  from: OrderStatus | null;
  to: OrderStatus;
  actor_role: 'customer' | 'shop' | 'admin' | 'system';
  note: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface DispatchDetails {
  service: DeliveryService;
  rider_name: string | null;
  rider_phone: string | null;
  vehicle_no: string | null;
  tracking_url: string | null;
  delivery_otp: string | null;
  eta: string | null;
  package_photo_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: Uuid;
  order_no: string;
  status: OrderStatus;
  status_before_issue: OrderStatus | null;
  contact_method: ContactMethod;
  fulfilment: Fulfilment;
  items: OrderItem[];
  item_total: number;
  installation_total: number;
  delivery_charge: number;
  grand_total: number;
  customer_name: string | null;
  address: AddressSnapshot | null;
  distance_km: number | null;
  note: string | null;
  updated_by_shop: boolean;
  reject_reason: string | null;
  cancel_reason: string | null;
  delivered_by: 'customer' | 'auto' | 'admin' | null;
  pack_photo_path: string | null;
  bill_photo_path: string | null;
  requested_at: string;
  confirmed_at: string | null;
  paid_at: string | null;
  packed_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  expired_at: string | null;
  issue_reported_at: string | null;
  created_at: string;
  updated_at: string;
  viewer: 'customer' | 'shop' | 'admin';
  customer_phone: string | null;
  customer_id?: Uuid | null;
  shop: {
    id: Uuid;
    name: string;
    slug: string | null;
    area: string | null;
    address_line: string | null;
    landmark: string | null;
    lat: number | null;
    lng: number | null;
    logo_path: string | null;
    verified: boolean;
    contact_phone: string | null;
    whatsapp_phone: string | null;
    upi_id: string | null;
    upi_name: string | null;
    upi_qr_path: string | null;
    upi_verified: boolean;
  };
  events: OrderEvent[];
  dispatch: DispatchDetails | null;
  payments: { method: PaymentMethod; amount: number; upi_txn_id: string | null; proof_path: string | null; created_at: string }[];
  review: { id: Uuid; rating: number; body: string | null; photos: string[]; shop_reply: string | null; created_at: string } | null;
  issues: { id: Uuid; type: IssueType; description: string | null; photos: string[]; status: 'open' | 'in_progress' | 'resolved'; resolution: string | null; created_at: string; resolved_at: string | null }[];
}

export interface OrderCard {
  id: Uuid;
  order_no: string;
  status: OrderStatus;
  status_before_issue: OrderStatus | null;
  fulfilment: Fulfilment;
  contact_method: ContactMethod;
  grand_total: number;
  item_count: number;
  first_item: string | null;
  first_photo: string | null;
  customer_name: string | null;
  area: string | null;
  distance_km: number | null;
  note: string | null;
  shop_id: Uuid;
  shop_name: string;
  shop_logo: string | null;
  requested_at: string;
  updated_at: string;
  delivered_at: string | null;
  has_review: boolean;
  stuck_reason?: string | null;
}

export type ShopOrderFilter = 'new' | 'confirmed' | 'paid' | 'dispatched' | 'delivered' | 'cancelled' | 'issues' | 'active' | 'all';

export interface ShopOrdersResult {
  items: OrderCard[];
  counts: Record<'new' | 'confirmed' | 'paid' | 'dispatched' | 'delivered' | 'cancelled' | 'issues' | 'active', number>;
}

export interface AppNotification {
  id: number;
  kind: string;
  title: string;
  body: string;
  data: { order_id?: Uuid; url?: string; [k: string]: unknown };
  read_at: string | null;
  created_at: string;
}

/** Full shop record for its owner (my_shop / shop_upsert). */
export interface MyShop {
  id: Uuid;
  owner_id: Uuid;
  slug: string | null;
  name: string | null;
  shop_types: ShopType[];
  description: string | null;
  hours: ShopHours;
  weekly_holiday: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  contact_phone: string | null;
  whatsapp_phone: string | null;
  email: string | null;
  address_line: string | null;
  area_id: number | null;
  area: { id: number; name: string; pincode: string; zone_id: number } | null;
  pincode: string | null;
  landmark: string | null;
  lat: number | null;
  lng: number | null;
  delivery_mode: DeliveryMode;
  delivery_radius_km: number | null;
  delivery_charge_type: DeliveryChargeType;
  delivery_charge: number;
  free_delivery_above: number | null;
  min_order: number;
  usual_delivery_mins: number;
  store_pickup: boolean;
  upi_id: string | null;
  upi_name: string | null;
  upi_qr_path: string | null;
  upi_verified: boolean;
  logo_path: string | null;
  cover_path: string | null;
  status: ShopStatus;
  status_reason: string | null;
  verified: boolean;
  is_open: boolean;
  is_open_now: boolean;
  registration_step: number;
  rating_avg: number;
  rating_count: number;
  avg_delivery_mins: number | null;
  orders_delivered: number;
  gst_number: string | null;
  photos: { id: Uuid; kind: PhotoKind; path: string; sort: number }[];
  documents: { id: Uuid; doc_type: DocType; doc_number: string | null; status: string; note: string | null; path: string; created_at: string }[];
  delivery_zone_ids: number[];
  delivery_area_ids: number[];
  product_count: number;
  submitted_at: string | null;
  approved_at: string | null;
}

export interface ShopDashboard {
  shop: { id: Uuid; name: string; slug: string | null; status: ShopStatus; is_open: boolean; is_open_now: boolean; verified: boolean; rating_avg: number; rating_count: number; logo_path: string | null; avg_delivery_mins: number | null; orders_delivered: number };
  today: { new_requests: number; active_orders: number; delivered: number; sales: number; orders_today: number; views: number; call_taps: number; whatsapp_taps: number };
  attention: OrderCard[];
  low_stock: number;
  unread_reviews: number;
}

export interface ShopInsights {
  period: 'day' | 'week' | 'month';
  series: { bucket: string; label: string; orders: number; delivered: number; sales: number }[];
  totals: { orders: number; confirmed: number; delivered: number; sales: number; avg_order_value: number; avg_dispatch_mins: number | null; avg_confirm_mins: number | null };
  top_products: { name: string; qty: number; sales: number }[];
  rating: { avg: number; count: number };
  avg_delivery_mins: number | null;
}

export interface DemandItem {
  query: string;
  normalized: string;
  searches: number;
  zero_results: number;
}

export interface CatalogLookupItem {
  id: Uuid;
  name: string;
  brand: string | null;
  brand_id: number | null;
  model: string | null;
  model_number: string | null;
  variant: Record<string, string>;
  key_specs: string[];
  photo: string | null;
  mrp: number | null;
  category_id: number;
  category: string;
  status: string;
}
