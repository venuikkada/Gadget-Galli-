import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatDateIST, formatINR, formatINRCompact, timeAgo } from '@gg/shared';

import { Badge, Button, Card, Empty, ErrorBox, Input, PageHeader, ShopStatusBadge, Spinner, Stat, Table, Td, Th, Tr } from '@/components/ui';
import { errorMessage, rpc } from '@/lib/api';
import type { Reports } from '@/lib/types';

function istDate(offsetDays = 0) {
  return new Date(Date.now() + 5.5 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function CsvButton({ name, rows }: { name: string; rows: Record<string, unknown>[] }) {
  return (
    <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} disabled={!rows.length} onClick={() => downloadCsv(name, rows)}>
      CSV
    </Button>
  );
}

const PRESETS = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

export default function ReportsPage() {
  const [from, setFrom] = useState(istDate(-29));
  const [to, setTo] = useState(istDate(0));
  const q = useQuery({ queryKey: ['reports', from, to], queryFn: () => rpc<Reports>('admin_reports', { p_from: from, p_to: to }), placeholderData: (prev) => prev });
  const r = q.data;
  const daily = (r?.daily ?? []).map((d) => ({ ...d, label: formatDateIST(d.day, false) }));
  const conversion = r && r.totals.orders ? Math.round((r.totals.delivered / r.totals.orders) * 100) : 0;
  const searches = daily.reduce((n, d) => n + d.searches, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="How the marketplace is doing. Use searches with no results to decide which shops and products to add next."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <Button key={p.days} size="sm" variant={from === istDate(-(p.days - 1)) && to === istDate(0) ? 'secondary' : 'outline'} onClick={() => (setFrom(istDate(-(p.days - 1))), setTo(istDate(0)))}>
                {p.label}
              </Button>
            ))}
            <Input type="date" className="h-8 w-36 text-xs" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-slate-400">–</span>
            <Input type="date" className="h-8 w-36 text-xs" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
        }
      />
      {q.isError ? <ErrorBox error={errorMessage(q.error)} onRetry={() => q.refetch()} /> : null}
      {!r ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Orders" value={r.totals.orders} hint={`${r.totals.delivered} delivered (${conversion}%)`} />
            <Stat label="Paid order value" value={formatINRCompact(r.totals.paid_value)} tone="success" hint={`${formatINRCompact(r.totals.order_value)} requested`} />
            <Stat label="Searches" value={searches} tone="primary" hint={searches ? `${((r.totals.orders / searches) * 100).toFixed(1)}% became orders` : undefined} />
            <Stat label="Customers" value={r.customers.active} tone="action" hint={`${r.customers.new} new · ${r.customers.repeat} ordered twice or more`} />
            <Stat label="Rejected by shops" value={r.totals.rejected} tone="error" />
            <Stat label="Expired (no reply in 2 hrs)" value={r.totals.expired} tone="warning" />
            <Stat label="Cancelled by customers" value={r.totals.cancelled} tone="warning" />
            <Stat label="New shops" value={r.new_shops.length} tone="success" hint={`${r.new_shops.filter((s) => s.status === 'approved').length} live`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Orders per day" actions={<CsvButton name={`daily-${from}-${to}`} rows={r.daily} />}>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="orders" name="Orders" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="delivered" name="Delivered" fill="#16A34A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Order value per day (GMV)">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v: number) => formatINRCompact(v)} tick={{ fontSize: 11 }} width={60} />
                    <Tooltip formatter={(v) => formatINR(Number(v))} />
                    <Legend />
                    <Line type="monotone" dataKey="order_value" name="Requested" stroke="#FF6B35" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="paid_value" name="Paid" stroke="#16A34A" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card
            title={
              <span>
                Searches with no results <Badge tone="action">recruit shops for these</Badge>
              </span>
            }
            actions={
              <>
                <Link to="/catalog?tab=synonyms" className="text-sm font-semibold text-primary">
                  Add synonyms
                </Link>
                <CsvButton name={`zero-results-${from}-${to}`} rows={r.zero_result_searches} />
              </>
            }
            padded={false}
          >
            {!r.zero_result_searches.length ? (
              <Empty title="Every search found something" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>What people searched</Th>
                    <Th>Times</Th>
                    <Th>Mostly from</Th>
                    <Th>Last searched</Th>
                  </tr>
                </thead>
                <tbody>
                  {r.zero_result_searches.map((z) => (
                    <Tr key={z.normalized}>
                      <Td className="font-semibold">{z.query}</Td>
                      <Td className="tabular">{z.n}</Td>
                      <Td>{z.top_area ?? '—'}</Td>
                      <Td className="text-xs text-slate-500">{timeAgo(z.last_at)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Top searches" actions={<CsvButton name={`top-searches-${from}-${to}`} rows={r.top_searches} />} padded={false}>
              <Table>
                <thead>
                  <tr>
                    <Th>Search</Th>
                    <Th>Times</Th>
                    <Th>Avg results</Th>
                  </tr>
                </thead>
                <tbody>
                  {r.top_searches.map((s) => (
                    <Tr key={s.normalized}>
                      <Td className="font-semibold">{s.query}</Td>
                      <Td className="tabular">{s.n}</Td>
                      <Td className="tabular">{s.avg_results}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
            <Card title="Top shops" actions={<CsvButton name={`top-shops-${from}-${to}`} rows={r.top_shops} />} padded={false}>
              <Table>
                <thead>
                  <tr>
                    <Th>Shop</Th>
                    <Th>Orders</Th>
                    <Th>Delivered</Th>
                    <Th className="text-right">Paid value</Th>
                  </tr>
                </thead>
                <tbody>
                  {r.top_shops.map((s) => (
                    <Tr key={s.id}>
                      <Td>
                        <Link to={`/shops/${s.id}`} className="font-semibold text-primary">
                          {s.name}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {s.area} · {Number(s.rating_avg).toFixed(1)} ★
                        </div>
                      </Td>
                      <Td className="tabular">{s.orders}</Td>
                      <Td className="tabular">{s.delivered}</Td>
                      <Td className="tabular text-right">{formatINR(s.value)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Orders by customer area">
              {r.by_area.length ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={r.by_area} layout="vertical" margin={{ left: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="area" tick={{ fontSize: 11 }} width={100} />
                      <Tooltip />
                      <Bar dataKey="orders" name="Orders" fill="#FF6B35" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <Empty title="No orders in this period" />
              )}
            </Card>
            <Card title="New shops" padded={false}>
              {!r.new_shops.length ? (
                <Empty title="No new shops in this period" />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Shop</Th>
                      <Th>Area</Th>
                      <Th>Status</Th>
                      <Th>Registered</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.new_shops.map((s) => (
                      <Tr key={s.id}>
                        <Td>
                          <Link to={`/shops/${s.id}`} className="font-semibold text-primary">
                            {s.name ?? 'Unnamed'}
                          </Link>
                        </Td>
                        <Td>{s.area ?? '—'}</Td>
                        <Td>
                          <ShopStatusBadge status={s.status} />
                        </Td>
                        <Td className="text-xs text-slate-500">{formatDateIST(s.created_at)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
