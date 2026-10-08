import type { Category, OrderCard, OrderStatus, ShopStatus } from '@gg/shared';

export interface Overview {
  shops_pending: number;
  shops_live: number;
  issues_open: number;
  stuck_orders: number;
  catalog_pending: number;
  orders_today: number;
  delivered_today: number;
  gmv_today: number;
  customers: number;
  searches_today: number;
  active_orders: number;
}

export interface AdminShopRow {
  id: string;
  name: string | null;
  status: ShopStatus;
  status_reason: string | null;
  verified: boolean;
  upi_verified: boolean;
  area: string | null;
  shop_types: string[];
  owner_name: string | null;
  owner_phone: string | null;
  contact_phone: string | null;
  rating_avg: number;
  rating_count: number;
  orders_delivered: number;
  warnings_count: number;
  product_count: number;
  registration_step: number;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
  logo_path: string | null;
}

export interface Paged<T> {
  total: number;
  items: T[];
}

export type AdminOrderRow = OrderCard & { stuck_reason: string | null };

export interface AdminIssueRow {
  id: string;
  type: string;
  description: string | null;
  photos: string[];
  status: 'open' | 'in_progress' | 'resolved';
  resolution: string | null;
  shop_action: string | null;
  created_at: string;
  resolved_at: string | null;
  order_id: string;
  order_no: string;
  order_status: OrderStatus;
  grand_total: number;
  shop_id: string;
  shop_name: string;
  shop_phone: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  notes_count: number;
}

export interface AdminUserRow {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  role: 'customer' | 'shop_owner';
  admin_role: 'super_admin' | 'support' | null;
  is_blocked: boolean;
  created_at: string;
  deleted: boolean;
  referral_code: string | null;
  orders: number;
  delivered: number;
  last_order_at: string | null;
  area: string | null;
}

export interface CatalogRow {
  id: string;
  name: string;
  brand: string | null;
  brand_id: number | null;
  category: string;
  category_id: number;
  model: string | null;
  model_number: string | null;
  variant: Record<string, string>;
  key_specs: string[];
  specs: Record<string, string>;
  description: string | null;
  in_the_box: string | null;
  photos: string[];
  keywords: string | null;
  mrp: number | null;
  status: 'approved' | 'pending' | 'rejected' | 'merged';
  review_note: string | null;
  popularity: number;
  merged_into: string | null;
  created_by_shop: string | null;
  listings: number;
  created_at: string;
}

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

export type AdminCategory = Category & { sort: number; is_active: boolean };

export interface Brand {
  id: number;
  name: string;
  slug: string;
  logo_path: string | null;
  is_active: boolean;
}

export interface Synonym {
  id: number;
  words: string[];
  created_at: string;
}

export interface Banner {
  id: number;
  title: string;
  subtitle: string | null;
  image_path: string | null;
  bg_color: string;
  link_type: 'search' | 'category' | 'shop' | 'product' | 'url' | 'none';
  link_value: string | null;
  area_id: number | null;
  sort: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

export interface Featured {
  id: number;
  kind: 'shop' | 'product';
  shop_id: string | null;
  catalog_product_id: string | null;
  sort: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
}

export interface Campaign {
  id: number;
  title: string;
  body: string;
  segment: string;
  area_id: number | null;
  sent_count: number;
  created_at: string;
}

export interface NotifyMe {
  id: number;
  user_id: string | null;
  phone: string | null;
  place: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

export interface Reports {
  from: string;
  to: string;
  daily: { day: string; orders: number; delivered: number; order_value: number; paid_value: number; searches: number }[];
  totals: { orders: number; delivered: number; order_value: number; paid_value: number; rejected: number; expired: number; cancelled: number };
  top_shops: { id: string; name: string; area: string | null; orders: number; delivered: number; value: number; rating_avg: number }[];
  top_searches: { query: string; normalized: string; n: number; avg_results: number }[];
  zero_result_searches: { query: string; normalized: string; n: number; last_at: string; top_area: string | null }[];
  new_shops: { id: string; name: string | null; area: string | null; status: ShopStatus; approved_at: string | null; created_at: string }[];
  customers: { new: number; active: number; repeat: number };
  by_area: { area: string; orders: number }[];
}

export interface Referrals {
  total_joined: number;
  total_ordered: number;
  top: { user_id: string; name: string | null; phone: string | null; code: string | null; joined: number; ordered: number }[];
}
