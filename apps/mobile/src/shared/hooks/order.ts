import { useQuery } from '@tanstack/react-query';

import type { Order } from '@gg/shared';

import { rpc } from '../api/rpc';

/** One order with items, timeline, payments and dispatch. Used by both the customer and the shop side. */
export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => rpc<Order | null>('get_order', { p_order_id: id }),
    enabled: !!id,
    refetchInterval: 30_000,
  });
}
