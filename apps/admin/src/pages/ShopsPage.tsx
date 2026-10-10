import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { formatPhone, SHOP_TYPE_LABEL, timeAgo, type ShopStatus, type ShopType } from '@gg/shared';

import { Badge, Card, Empty, ErrorBox, Input, PageHeader, Pagination, ShopStatusBadge, Spinner, Table, Tabs, Td, Th, Tr } from '@/components/ui';
import { errorMessage, publicUrl, rpc } from '@/lib/api';
import type { AdminShopRow, Paged } from '@/lib/types';

const LIMIT = 50;
type Filter = ShopStatus | 'all';

export default function ShopsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as Filter | null) ?? 'under_review';
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(query);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(h);
  }, [query]);
  useEffect(() => setOffset(0), [status, debounced]);

  const q = useQuery({
    queryKey: ['shops', status, debounced, offset],
    queryFn: () => rpc<Paged<AdminShopRow>>('admin_list_shops', { p_status: status === 'all' ? null : status, p_query: debounced || null, p_limit: LIMIT, p_offset: offset }),
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Shops" subtitle="Review new shops, verify them and keep the marketplace trustworthy." />
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={status}
          onChange={(v) => setParams((p) => (p.set('status', v), p))}
          options={[
            { value: 'under_review', label: 'To review' },
            { value: 'changes_requested', label: 'Changes asked' },
            { value: 'approved', label: 'Live' },
            { value: 'suspended', label: 'Suspended' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'draft', label: 'Drafts' },
            { value: 'all', label: 'All' },
          ]}
        />
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search by name or phone" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      {q.isError ? <ErrorBox error={errorMessage(q.error)} onRetry={() => q.refetch()} /> : null}
      <Card padded={false}>
        {q.isLoading ? (
          <Spinner />
        ) : q.data && !q.data.items.length ? (
          <Empty title="No shops here" body={status === 'under_review' ? 'New registrations will appear here for review.' : undefined} />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Shop</Th>
                  <Th>Area</Th>
                  <Th>Owner</Th>
                  <Th>Products</Th>
                  <Th>Rating</Th>
                  <Th>Status</Th>
                  <Th>Submitted</Th>
                </tr>
              </thead>
              <tbody>
                {q.data?.items.map((s) => (
                  <Tr key={s.id} onClick={() => navigate(`/shops/${s.id}`)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        {s.logo_path ? (
                          <img src={publicUrl('shop-media', s.logo_path) ?? ''} alt="" className="size-9 rounded-lg object-cover" />
                        ) : (
                          <div className="flex size-9 items-center justify-center rounded-lg bg-primary-soft font-bold text-link">{(s.name ?? '?')[0]}</div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 font-semibold">
                            <span className="truncate">{s.name ?? 'Unnamed shop'}</span>
                            {s.verified ? <BadgeCheck className="size-4 text-link" /> : null}
                          </div>
                          <div className="truncate text-xs text-ink-muted">{s.shop_types.map((t) => SHOP_TYPE_LABEL[t as ShopType] ?? t).join(', ')}</div>
                        </div>
                      </div>
                    </Td>
                    <Td>{s.area ?? '—'}</Td>
                    <Td>
                      <div>{s.owner_name ?? '—'}</div>
                      <div className="text-xs text-ink-muted">{formatPhone(s.owner_phone ?? s.contact_phone)}</div>
                    </Td>
                    <Td className="tabular">{s.product_count}</Td>
                    <Td className="tabular">{s.rating_count ? `${Number(s.rating_avg).toFixed(1)} ★ (${s.rating_count})` : '—'}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <ShopStatusBadge status={s.status} />
                        {s.warnings_count ? <Badge tone="warning">{s.warnings_count} warnings</Badge> : null}
                        {s.status === 'draft' ? <Badge>Step {s.registration_step}/8</Badge> : null}
                      </div>
                    </Td>
                    <Td className="text-xs text-ink-muted">{s.submitted_at ? timeAgo(s.submitted_at) : '—'}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination total={q.data?.total ?? 0} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        )}
      </Card>
    </div>
  );
}
