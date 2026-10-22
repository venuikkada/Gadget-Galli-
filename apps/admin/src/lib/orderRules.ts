import { ORDER_STATUSES, type Order, type OrderStatus } from '@gg/shared';

/**
 * Statuses an admin may set by hand. Payments go through "Payment received", so the money trail and stock stay right;
 * packing, sending and delivery need a confirmed payment (the database refuses them too, docs/DECISIONS.md #55),
 * except for orders paid on delivery, which are paid when they are delivered (#57).
 */
export function manualStatuses(order: Pick<Order, 'status' | 'paid_at' | 'payment_mode'>): OrderStatus[] {
  const blocked = order.paid_at ? [] : order.payment_mode === 'on_delivery' ? ['PAID'] : ['PAID', 'PACKED', 'DISPATCHED', 'DELIVERED'];
  return ORDER_STATUSES.filter((s) => s === order.status || !blocked.includes(s));
}
