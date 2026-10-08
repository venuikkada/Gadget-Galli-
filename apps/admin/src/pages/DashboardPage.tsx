import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatDateIST, formatINR, formatINRCompact, timeAgo } from '@gg/shared';

import { useOverview } from '@/components/Layout';
import { Badge, Card, Empty, ErrorBox, OrderStatusBadge, PageHeader, ShopStatusBadge, Spinner, Stat } from '@/components/ui';
import { errorMessage, rpc } from '@/lib/api';
import type { AdminIssueRow, AdminOrderRow, AdminShopRow, Paged, Reports } from '@/lib/types';

function istDate(offsetDays = 0) {
  const d = new Date(Date.now() + 5.5 * 3600_000 + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const overview = useOverview();
  const o = overview.data;
  const trend = useQuery({ queryKey: ['reports', 'dash'], queryFn: () => rpc<Reports>('admin_reports', { p_from: istDate(-13), p_to: istDate(0) }) });
  const shops = useQuery({ queryKey: ['shops', 'under_review', 'dash'], queryFn: () => rpc<Paged<AdminShopRow>>('admin_list_shops', { p_status: 'under_review', p_limit: 5 }) });
  const stuck = useQuery({ queryKey: ['orders', 'stuck', 'dash'], queryFn: () => rpc<Paged<AdminOrderRow>>('admin_list_orders', { p_filters: { stuck_only: true }, p_limit: 6 }) });
  const issues = useQuery({ queryKey: ['issues', 'open', 'dash'], queryFn: () => rpc<AdminIssueRow[]>('admin_list_issues', { p_status: 'open', p_limit: 5 }) });

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle={`Today in Hyderabad · ${formatDateIST(new Date())}`} />
      {overview.isError ? <ErrorBox error={errorMessage(overview.error)} onRetry={() => overview.refetch()} /> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Orders today" value={o?.orders_today ?? '–'} hint={`${o?.delivered_today ?? 0} delivered`} />
        <Stat label="Paid value today" value={o ? formatINRCompact(o.gmv_today) : '–'} tone="success" hint="Paid to shops directly by UPI" />
        <Stat label="Active orders" value={o?.active_orders ?? '–'} tone="action" onClick={() => navigate('/orders')} />
        <Stat label="Searches today" value={o?.searches_today ?? '–'} tone="primary" onClick={() => navigate('/reports')} />
        <Stat label="Shops to review" value={o?.shops_pending ?? '–'} tone="warning" onClick={() => navigate('/shops?status=under_review')} />
        <Stat label="Stuck orders" value={o?.stuck_orders ?? '–'} tone="error" onClick={() => navigate('/orders?stuck=1')} />
        <Stat label="Open problems" value={o?.issues_open ?? '–'} tone="error" onClick={() => navigate('/problems')} />
        <Stat label="Live shops" value={o?.shops_live ?? '–'} tone="success" hint={`${o?.customers ?? 0} customers · ${o?.catalog_pending ?? 0} products to review`} onClick={() => navigate('/shops?status=approved')} />
      </div>

      <Card title="Orders and paid value, last 14 days">
        {trend.isLoading ? (
          <Spinner />
        ) : trend.data ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend.data.daily.map((d) => ({ ...d, label: formatDateIST(d.day, false) }))} margin={{ left: 0, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="gOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#4F46E5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="o" allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                <YAxis yAxisId="v" orientation="right" tickFormatter={(v: number) => formatINRCompact(v)} tick={{ fontSize: 11 }} width={60} />
                <Tooltip formatter={(v, name) => (name === 'Paid value' ? formatINR(Number(v)) : v)} />
                <Area yAxisId="o" type="monotone" dataKey="orders" name="Orders" stroke="#4F46E5" fill="url(#gOrders)" strokeWidth={2} />
                <Area yAxisId="v" type="monotone" dataKey="paid_value" name="Paid value" stroke="#16A34A" fill="none" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Shops waiting for review" actions={<Link to="/shops?status=under_review" className="text-sm font-semibold text-primary">See all</Link>} padded={false}>
          {shops.data && !shops.data.items.length ? <Empty title="All caught up" body="No shop is waiting for review." /> : null}
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {shops.data?.items.map((s) => (
              <li key={s.id}>
                <Link to={`/shops/${s.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{s.name ?? 'Unnamed shop'}</div>
                    <div className="text-xs text-slate-500">
                      {s.area ?? '—'} · {s.submitted_at ? `submitted ${timeAgo(s.submitted_at)}` : 'draft'}
                    </div>
                  </div>
                  <ShopStatusBadge status={s.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Stuck orders" actions={<Link to="/orders?stuck=1" className="text-sm font-semibold text-primary">See all</Link>} padded={false}>
          {stuck.data && !stuck.data.items.length ? <Empty title="Nothing stuck" body="Every order is moving on time." /> : null}
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {stuck.data?.items.map((r) => (
              <li key={r.id}>
                <Link to={`/orders/${r.id}`} className="block px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{r.order_no}</span>
                    <OrderStatusBadge status={r.status} />
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {r.shop_name} · {formatINR(r.grand_total)}
                  </div>
                  <Badge tone="error" className="mt-1">
                    {r.stuck_reason}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Open problems" actions={<Link to="/problems" className="text-sm font-semibold text-primary">See all</Link>} padded={false}>
          {issues.data && !issues.data.length ? <Empty title="No open problems" /> : null}
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {issues.data?.map((i) => (
              <li key={i.id}>
                <Link to={`/problems/${i.id}`} className="block px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{i.order_no}</span>
                    <span className="text-xs text-slate-500">{timeAgo(i.created_at)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    {i.shop_name} · {i.customer_name}
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm">{i.description ?? i.type}</div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
