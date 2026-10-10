import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { formatDateTimeIST, formatINR, ORDER_STATUSES, STATUS_LABEL, timeAgo } from '@gg/shared';

import { Badge, Button, Card, Empty, ErrorBox, Input, OrderStatusBadge, PageHeader, Pagination, Select, Spinner, Table, Td, Th, Toggle, Tr } from '@/components/ui';
import { errorMessage, rpc, selectAll } from '@/lib/api';
import type { AdminOrderRow, AdminShopRow, Area, Paged } from '@/lib/types';

const LIMIT = 50;

export default function OrdersPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const shopId = params.get('shop') ?? '';
  const areaId = params.get('area') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const stuck = params.get('stuck') === '1';
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const h = setTimeout(() => setParams((p) => (query ? p.set('q', query) : p.delete('q'), p), { replace: true }), 350);
    return () => clearTimeout(h);
  }, [query, setParams]);
  const q0 = params.get('q') ?? '';
  useEffect(() => setOffset(0), [status, shopId, areaId, from, to, stuck, q0]);

  const set = (key: string, value: string | null) =>
    setParams((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
      return p;
    });

  const filters = useMemo(
    () => ({
      ...(status ? { status } : {}),
      ...(shopId ? { shop_id: shopId } : {}),
      ...(areaId ? { area_id: Number(areaId) } : {}),
      ...(from ? { date_from: from } : {}),
      ...(to ? { date_to: to } : {}),
      ...(q0 ? { q: q0 } : {}),
      ...(stuck ? { stuck_only: true } : {}),
    }),
    [status, shopId, areaId, from, to, q0, stuck],
  );

  const orders = useQuery({
    queryKey: ['orders', filters, offset],
    queryFn: () => rpc<Paged<AdminOrderRow>>('admin_list_orders', { p_filters: filters, p_limit: LIMIT, p_offset: offset }),
    placeholderData: (prev) => prev,
    refetchInterval: 60_000,
  });
  const shops = useQuery({ queryKey: ['shops', 'approved', 'options'], queryFn: () => rpc<Paged<AdminShopRow>>('admin_list_shops', { p_status: null, p_limit: 200 }), staleTime: 300_000 });
  const areas = useQuery({ queryKey: ['areas-admin'], queryFn: () => selectAll<Area>('areas', 'name'), staleTime: 300_000 });
  const hasFilters = Object.keys(filters).length > 0;

  return (
    <div className="space-y-5">
      <PageHeader title="Orders" subtitle="Every order across all shops, with its full timeline. Stuck orders are flagged automatically." />
      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Order no. or customer name" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Select value={status} onChange={(e) => set('status', e.target.value || null)} aria-label="Status">
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select value={shopId} onChange={(e) => set('shop', e.target.value || null)} aria-label="Shop">
            <option value="">All shops</option>
            {shops.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name ?? 'Unnamed'}
              </option>
            ))}
          </Select>
          <Select value={areaId} onChange={(e) => set('area', e.target.value || null)} aria-label="Area">
            <option value="">All areas</option>
            {areas.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <div className="flex items-center">
            <Toggle checked={stuck} onChange={(v) => set('stuck', v ? '1' : null)} label="Stuck only" />
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <span className="w-8 shrink-0">From</span>
            <Input type="date" className="min-w-0 flex-1" value={from} onChange={(e) => set('from', e.target.value || null)} />
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <span className="w-8 shrink-0">To</span>
            <Input type="date" className="min-w-0 flex-1" value={to} onChange={(e) => set('to', e.target.value || null)} />
          </label>
          {hasFilters ? (
            <Button
              variant="ghost"
              onClick={() => {
                setQuery('');
                setParams(new URLSearchParams());
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </Card>

      {orders.isError ? <ErrorBox error={errorMessage(orders.error)} onRetry={() => orders.refetch()} /> : null}
      <Card padded={false}>
        {orders.isLoading ? (
          <Spinner />
        ) : orders.data && !orders.data.items.length ? (
          <Empty title="No orders match these filters" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Order</Th>
                  <Th>Customer</Th>
                  <Th>Shop</Th>
                  <Th>Items</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {orders.data?.items.map((o) => (
                  <Tr key={o.id} onClick={() => navigate(`/orders/${o.id}`)}>
                    <Td>
                      <div className="whitespace-nowrap font-semibold">{o.order_no}</div>
                      <div className="text-xs text-ink-muted" title={formatDateTimeIST(o.requested_at)}>
                        {timeAgo(o.requested_at)} · {o.contact_method === 'whatsapp' ? 'WhatsApp' : 'Call'}
                      </div>
                    </Td>
                    <Td>
                      <div>{o.customer_name ?? '—'}</div>
                      <div className="text-xs text-ink-muted">{o.fulfilment === 'pickup' ? 'Store pickup' : o.area ?? '—'}</div>
                    </Td>
                    <Td>{o.shop_name}</Td>
                    <Td>
                      <div className="max-w-56 truncate">{o.first_item}</div>
                      {o.item_count > 1 ? <div className="text-xs text-ink-muted">+{o.item_count - 1} more</div> : null}
                    </Td>
                    <Td className="tabular text-right font-semibold">{formatINR(o.grand_total)}</Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        <OrderStatusBadge status={o.status} />
                        {o.stuck_reason ? <Badge tone="error">{o.stuck_reason}</Badge> : null}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination total={orders.data?.total ?? 0} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        )}
      </Card>
    </div>
  );
}
