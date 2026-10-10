import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';

import { formatINR, formatPhone, ISSUE_TYPE_LABEL, timeAgo, type IssueType } from '@gg/shared';

import { Badge, Card, Empty, ErrorBox, OrderStatusBadge, PageHeader, Spinner, Table, Tabs, Td, Th, Tr } from '@/components/ui';
import { errorMessage, rpc } from '@/lib/api';
import type { AdminIssueRow } from '@/lib/types';

type Filter = 'open' | 'in_progress' | 'resolved' | 'all';
const TONE = { open: 'error', in_progress: 'warning', resolved: 'success' } as const;

export default function IssuesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as Filter | null) ?? 'open';
  const q = useQuery({
    queryKey: ['issues', status],
    queryFn: () => rpc<AdminIssueRow[]>('admin_list_issues', { p_status: status === 'all' ? null : status, p_limit: 200 }),
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Problems" subtitle="Customer complaints: wrong item, damaged, not received, paid but not sent. Aim to call both sides within 2 hours." />
      <Tabs
        value={status}
        onChange={(v) => setParams((p) => (p.set('status', v), p))}
        options={[
          { value: 'open', label: 'Open' },
          { value: 'in_progress', label: 'In progress' },
          { value: 'resolved', label: 'Resolved' },
          { value: 'all', label: 'All' },
        ]}
      />
      {q.isError ? <ErrorBox error={errorMessage(q.error)} onRetry={() => q.refetch()} /> : null}
      <Card padded={false}>
        {q.isLoading ? (
          <Spinner />
        ) : q.data && !q.data.length ? (
          <Empty title={status === 'open' ? 'No open problems' : 'Nothing here'} body={status === 'open' ? 'Great: every complaint has been handled.' : undefined} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Problem</Th>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Shop</Th>
                <Th>Status</Th>
                <Th>Reported</Th>
              </tr>
            </thead>
            <tbody>
              {q.data?.map((i) => (
                <Tr key={i.id} onClick={() => navigate(`/problems/${i.id}`)}>
                  <Td>
                    <div className="font-semibold">{ISSUE_TYPE_LABEL[i.type as IssueType] ?? i.type}</div>
                    <div className="max-w-72 truncate text-xs text-ink-muted">{i.description ?? '—'}</div>
                  </Td>
                  <Td>
                    <div className="font-semibold">{i.order_no}</div>
                    <div className="flex items-center gap-2 text-xs text-ink-muted">
                      {formatINR(i.grand_total)} <OrderStatusBadge status={i.order_status} />
                    </div>
                  </Td>
                  <Td>
                    <div>{i.customer_name ?? '—'}</div>
                    <div className="text-xs text-ink-muted">{formatPhone(i.customer_phone)}</div>
                  </Td>
                  <Td>
                    <div>{i.shop_name}</div>
                    <div className="text-xs text-ink-muted">{formatPhone(i.shop_phone)}</div>
                  </Td>
                  <Td>
                    <Badge tone={TONE[i.status]}>{i.status.replace('_', ' ')}</Badge>
                    {i.notes_count ? <div className="mt-1 text-xs text-ink-muted">{i.notes_count} notes</div> : null}
                  </Td>
                  <Td className="text-xs text-ink-muted">{timeAgo(i.created_at)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
