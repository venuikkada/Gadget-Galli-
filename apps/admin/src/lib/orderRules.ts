import { ORDER_STATUSES, type Order, type OrderStatus } from '@gg/shared';

/**
 * Statuses an admin may set by hand. Payments go through "Payment received", so the money trail and stock stay right;
 * packing, sending and delivery need a confirmed payment (the database refuses them too, docs/DECISIONS.md #55).
 */
export function manualStatuses(order: Pick<Order, 'status' | 'paid_at'>): OrderStatus[] {
  return ORDER_STATUSES.filter((s) => s === order.status || (order.paid_at ? true : !['PAID', 'PACKED', 'DISPATCHED', 'DELIVERED'].includes(s)));
}
