import { ACTIVE_STATUSES, CONDITION_LABEL, ORDER_FLOW, type Condition, type OrderStatus } from './constants';
import { formatINR, waNumber } from './format';

export type Actor = 'customer' | 'shop' | 'admin' | 'system';

/** Item snapshot stored in orders.items at order time. */
export interface OrderItem {
  shop_product_id: string | null;
  catalog_product_id: string | null;
  name: string;
  brand?: string | null;
  variant?: Record<string, string> | null;
  condition: Condition;
  price: number;
  mrp?: number | null;
  qty: number;
  photo?: string | null;
  warranty_months?: number | null;
  with_installation?: boolean;
  installation_charge?: number | null;
  line_total: number;
}

export interface AddressSnapshot {
  name?: string | null;
  label?: string | null;
  house?: string | null;
  building?: string | null;
  street?: string | null;
  landmark?: string | null;
  area?: string | null;
  pincode?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/**
 * Allowed transitions and who may make them. Mirrors gg_allowed_transition() in SQL.
 * ISSUE_REPORTED is handled separately: the flow continues from the status before the issue.
 */
export const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderStatus, Actor[]>>> = {
  REQUESTED: { CONFIRMED: ['shop'], REJECTED: ['shop'], CANCELLED: ['customer'], EXPIRED: ['system'] },
  CONFIRMED: { PAID: ['shop'], REJECTED: ['shop'], CANCELLED: ['customer'], ISSUE_REPORTED: ['customer'] },
  PAID: { PACKED: ['shop'], ISSUE_REPORTED: ['customer'] },
  PACKED: { DISPATCHED: ['shop'], ISSUE_REPORTED: ['customer'] },
  DISPATCHED: { DELIVERED: ['customer', 'system'], ISSUE_REPORTED: ['customer'] },
  DELIVERED: { ISSUE_REPORTED: ['customer'] },
  REJECTED: {},
  CANCELLED: {},
  EXPIRED: {},
  ISSUE_REPORTED: {},
};

export function canTransition(from: OrderStatus, to: OrderStatus, actor: Actor, statusBeforeIssue?: OrderStatus | null): boolean {
  if (actor === 'admin') return from !== to;
  const effective = from === 'ISSUE_REPORTED' && statusBeforeIssue ? statusBeforeIssue : from;
  if (from === 'ISSUE_REPORTED' && to === 'ISSUE_REPORTED') return false;
  return (TRANSITIONS[effective]?.[to] ?? []).includes(actor);
}

export function isActive(status: OrderStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/** The status used to drive the flow (the status before an issue was reported, if any). */
export function effectiveStatus(status: OrderStatus, statusBeforeIssue?: OrderStatus | null): OrderStatus {
  return status === 'ISSUE_REPORTED' && statusBeforeIssue ? statusBeforeIssue : status;
}

/** Index in the happy-path timeline (REQUESTED=0 ... DELIVERED=5), -1 if off the path. */
export function flowIndex(status: OrderStatus): number {
  return ORDER_FLOW.indexOf(status);
}

/** The next step a shop takes, for the big step button. */
export function nextShopStep(status: OrderStatus): 'confirm' | 'payment' | 'pack' | 'dispatch' | 'await_customer' | null {
  switch (status) {
    case 'REQUESTED':
      return 'confirm';
    case 'CONFIRMED':
      return 'payment';
    case 'PAID':
      return 'pack';
    case 'PACKED':
      return 'dispatch';
    case 'DISPATCHED':
      return 'await_customer';
    default:
      return null;
  }
}

export function customerCanCancel(status: OrderStatus): boolean {
  return status === 'REQUESTED' || status === 'CONFIRMED';
}

export function canReportIssue(status: OrderStatus, deliveredAt: string | null | undefined, now: Date = new Date()): boolean {
  if (['CONFIRMED', 'PAID', 'PACKED', 'DISPATCHED'].includes(status)) return true;
  if (status === 'DELIVERED' && deliveredAt) {
    return now.getTime() - new Date(deliveredAt).getTime() <= 7 * 86_400_000;
  }
  return false;
}

export function itemTotal(items: Pick<OrderItem, 'price' | 'qty' | 'with_installation' | 'installation_charge'>[]): number {
  return items.reduce(
    (sum, i) => sum + i.price * i.qty + (i.with_installation ? (i.installation_charge ?? 0) * i.qty : 0),
    0,
  );
}

export function variantText(variant: Record<string, string> | null | undefined): string {
  if (!variant) return '';
  return Object.values(variant).filter(Boolean).join(' · ');
}

export function addressLines(a: AddressSnapshot | null | undefined): string {
  if (!a) return '';
  return [a.house, a.building, a.street, a.area, a.pincode].filter((x) => x && String(x).trim()).join(', ');
}

export interface WhatsAppOrderInput {
  orderNo: string;
  shopName: string;
  customerName?: string | null;
  items: Pick<OrderItem, 'name' | 'qty' | 'price' | 'condition' | 'variant' | 'with_installation' | 'installation_charge'>[];
  itemTotal: number;
  deliveryCharge: number;
  grandTotal: number;
  fulfilment: 'delivery' | 'pickup';
  address?: AddressSnapshot | null;
  note?: string | null;
}

/** The ready-made WhatsApp message the customer sends to the shop. */
export function buildWhatsAppOrderMessage(o: WhatsAppOrderInput): string {
  const lines: string[] = [];
  lines.push(`Hi ${o.shopName} 👋`);
  lines.push(`I'd like to order via Gadget Galli.`);
  lines.push('');
  lines.push(`*Order no: ${o.orderNo}*`);
  o.items.forEach((item, idx) => {
    const cond = item.condition && item.condition !== 'new' ? ` (${CONDITION_LABEL[item.condition]})` : '';
    lines.push(`${idx + 1}. ${item.name}${cond}`);
    lines.push(`   ${item.qty} × ${formatINR(item.price)} = ${formatINR(item.price * item.qty)}`);
    if (item.with_installation && item.installation_charge) {
      lines.push(`   + Installation ${item.qty} × ${formatINR(item.installation_charge)}`);
    }
  });
  lines.push('');
  lines.push(`Item total: ${formatINR(o.itemTotal)}`);
  if (o.fulfilment === 'delivery') {
    lines.push(`Delivery: ${o.deliveryCharge > 0 ? formatINR(o.deliveryCharge) : 'Free'}`);
  }
  lines.push(`*Total: ${formatINR(o.grandTotal)}*`);
  lines.push('');
  if (o.fulfilment === 'pickup') {
    lines.push('I will pick it up from the shop.');
  } else if (o.address) {
    lines.push(`Deliver to: ${[o.customerName, addressLines(o.address)].filter(Boolean).join(', ')}`);
    if (o.address.landmark) lines.push(`Landmark: ${o.address.landmark}`);
  }
  if (o.note) lines.push(`Note: ${o.note}`);
  lines.push('');
  lines.push('Please confirm availability. I will pay by UPI after you confirm.');
  return lines.join('\n');
}

export function whatsappUrl(phone: string, text?: string): string {
  const base = `https://wa.me/${waNumber(phone)}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export interface UpiInput {
  upiId: string;
  payeeName: string;
  amount: number;
  orderNo: string;
}

/**
 * UPI deep link (NPCI "upi://pay" format) that opens GPay / PhonePe / Paytm with the amount filled in.
 * Only pa, pn, am, cu and tn are sent: extra merchant parameters (tr, mc) make some apps
 * reject payments to ordinary (non-merchant) UPI IDs.
 */
export function upiPaymentUrl({ upiId, payeeName, amount, orderNo }: UpiInput): string {
  const params = [
    `pa=${encodeURIComponent(upiId.trim())}`,
    `pn=${encodeURIComponent(payeeName.trim().slice(0, 40))}`,
    `am=${amount.toFixed(2)}`,
    'cu=INR',
    `tn=${encodeURIComponent(`Gadget Galli ${orderNo}`)}`,
  ];
  return `upi://pay?${params.join('&')}`;
}

export function isValidUpiId(upi: string | null | undefined): boolean {
  return !!upi && /^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z][a-zA-Z0-9]{1,64}$/.test(upi.trim());
}

export function mapsUrl(lat: number | null | undefined, lng: number | null | undefined, label?: string): string {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label ?? 'Hyderabad')}`;
}
