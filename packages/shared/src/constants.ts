/** Order statuses, exactly as stored in the database enum `order_status`. */
export const ORDER_STATUSES = [
  'REQUESTED',
  'CONFIRMED',
  'PAID',
  'PACKED',
  'DISPATCHED',
  'DELIVERED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'ISSUE_REPORTED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** The happy path shown as the order timeline. */
export const ORDER_FLOW: OrderStatus[] = ['REQUESTED', 'CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED', 'DELIVERED'];

/** Orders in these statuses are "active": the shop can see the customer's phone. */
export const ACTIVE_STATUSES: OrderStatus[] = ['REQUESTED', 'CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED'];
export const CLOSED_STATUSES: OrderStatus[] = ['DELIVERED', 'REJECTED', 'CANCELLED', 'EXPIRED'];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  REQUESTED: 'Requested',
  CONFIRMED: 'Confirmed',
  PAID: 'Paid',
  PACKED: 'Packed',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  ISSUE_REPORTED: 'Issue reported',
};

/** Chip colours (background, text) for each status, shared by the apps and the admin panel. */
export const STATUS_COLORS: Record<OrderStatus, { bg: string; fg: string; dot: string }> = {
  REQUESTED: { bg: '#FFF3EC', fg: '#C2410C', dot: '#FF6B35' },
  CONFIRMED: { bg: '#EEF2FF', fg: '#3730A3', dot: '#4F46E5' },
  PAID: { bg: '#ECFEFF', fg: '#0E7490', dot: '#0891B2' },
  PACKED: { bg: '#F5F3FF', fg: '#6D28D9', dot: '#7C3AED' },
  DISPATCHED: { bg: '#FEF3C7', fg: '#92400E', dot: '#F59E0B' },
  DELIVERED: { bg: '#DCFCE7', fg: '#166534', dot: '#16A34A' },
  REJECTED: { bg: '#FEE2E2', fg: '#991B1B', dot: '#DC2626' },
  CANCELLED: { bg: '#F1F5F9', fg: '#475569', dot: '#64748B' },
  EXPIRED: { bg: '#F1F5F9', fg: '#475569', dot: '#94A3B8' },
  ISSUE_REPORTED: { bg: '#FEE2E2', fg: '#991B1B', dot: '#DC2626' },
};

export const BRAND_COLORS = {
  primary: '#4F46E5',
  action: '#FF6B35',
  success: '#16A34A',
  warning: '#F59E0B',
  error: '#DC2626',
  background: '#F8FAFC',
  text: '#0F172A',
} as const;

export const CONDITIONS = ['new', 'open_box', 'refurbished', 'used'] as const;
export type Condition = (typeof CONDITIONS)[number];
export const CONDITION_LABEL: Record<Condition, string> = {
  new: 'New',
  open_box: 'Open box',
  refurbished: 'Refurbished',
  used: 'Used',
};

export const SHOP_TYPES = ['mobiles', 'cctv_security', 'computers_laptops', 'components_peripherals'] as const;
export type ShopType = (typeof SHOP_TYPES)[number];
export const SHOP_TYPE_LABEL: Record<ShopType, string> = {
  mobiles: 'Mobile shop',
  cctv_security: 'CCTV & Security',
  computers_laptops: 'Computers & Laptops',
  components_peripherals: 'Components & Peripherals',
};

export const DELIVERY_SERVICES = ['porter', 'rapido', 'uber', 'own', 'other', 'store_pickup'] as const;
export type DeliveryService = (typeof DELIVERY_SERVICES)[number];
export const DELIVERY_SERVICE_LABEL: Record<DeliveryService, string> = {
  porter: 'Porter',
  rapido: 'Rapido',
  uber: 'Uber',
  own: "Shop's own delivery",
  other: 'Other',
  store_pickup: 'Store pickup',
};

export const PAYMENT_METHODS = ['upi', 'bank_transfer', 'cash'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  upi: 'UPI',
  bank_transfer: 'Bank transfer',
  cash: 'Cash at pickup',
};

export const ISSUE_TYPES = ['wrong_item', 'damaged', 'not_received', 'paid_not_sent', 'other'] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];
export const ISSUE_TYPE_LABEL: Record<IssueType, string> = {
  wrong_item: 'Wrong item',
  damaged: 'Damaged',
  not_received: 'Not received',
  paid_not_sent: 'Paid but not sent',
  other: 'Other',
};

export const REJECT_REASONS = ['out_of_stock', 'area_not_served', 'customer_not_reachable', 'other'] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];
export const REJECT_REASON_LABEL: Record<RejectReason, string> = {
  out_of_stock: 'Out of stock',
  area_not_served: 'Area not served',
  customer_not_reachable: 'Customer not reachable',
  other: 'Other',
};

export const USUAL_DELIVERY_OPTIONS = [
  { mins: 60, label: '1 hr' },
  { mins: 120, label: '2 hrs' },
  { mins: 240, label: '4 hrs' },
  { mins: 480, label: 'Same day' },
] as const;

export const RADIUS_OPTIONS_KM = [5, 10, 15, 20] as const;

export const SEARCH_SORTS = ['relevance', 'price_asc', 'price_desc', 'nearest', 'fastest', 'rating'] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];
export const SEARCH_SORT_LABEL: Record<SearchSort, string> = {
  relevance: 'Relevance',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  nearest: 'Nearest',
  fastest: 'Fastest delivery',
  rating: 'Top rated',
};

/** Centre of Hyderabad (Abids) and the service radius used for the "outside Hyderabad" check. */
export const HYDERABAD_CENTER = { lat: 17.385, lng: 78.4867 };
export const SERVICE_RADIUS_KM = 35;

/** Thresholds used to flag stuck orders in the admin panel (minutes). */
export const STUCK_THRESHOLDS = {
  REQUESTED: 30,
  PAID: 180,
  DISPATCHED: 24 * 60,
} as const;

export const ISSUE_WINDOW_DAYS = 7;
export const MAX_PRODUCT_PHOTOS = 8;
export const MAX_SHOP_INSIDE_PHOTOS = 10;
export const MAX_IMAGE_BYTES = 300 * 1024;

export const SUPPORT = {
  phone: '+919000000000',
  whatsapp: '+919000000000',
  email: 'support@gadgetgalli.in',
};

export const DELIVERY_APPS: Record<'porter' | 'rapido' | 'uber', { name: string; android: string; ios: string; web: string; scheme: string }> = {
  porter: {
    name: 'Porter',
    android: 'market://details?id=com.theporter.android.customerapp',
    ios: 'https://apps.apple.com/in/app/porter-delivery-app/id1066209097',
    web: 'https://porter.in',
    scheme: 'porter://',
  },
  rapido: {
    name: 'Rapido',
    android: 'market://details?id=com.rapido.passenger',
    ios: 'https://apps.apple.com/in/app/rapido-bike-taxi-auto-cabs/id1198464606',
    web: 'https://www.rapido.bike',
    scheme: 'rapido://',
  },
  uber: {
    name: 'Uber',
    android: 'market://details?id=com.ubercab',
    ios: 'https://apps.apple.com/in/app/uber-request-a-ride/id368677368',
    web: 'https://m.uber.com',
    scheme: 'uber://',
  },
};
