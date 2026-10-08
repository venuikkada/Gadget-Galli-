import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Phone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import { formatDateTimeIST, formatINR, formatPhone, ISSUE_TYPE_LABEL, ORDER_STATUSES, STATUS_LABEL, type IssueType, type Order, type OrderStatus } from '@gg/shared';

import { Badge, Button, Card, ErrorBox, Field, OrderStatusBadge, PageHeader, Select, ShopStatusBadge, Spinner, Textarea, toast } from '@/components/ui';
import { errorMessage, rpc, signedUrl } from '@/lib/api';

interface IssueDetail {
  id: string;
  type: IssueType;
  description: string | null;
  photos: string[];
  status: 'open' | 'in_progress' | 'resolved';
  resolution: string | null;
  shop_action: string | null;
  created_at: string;
  resolved_at: string | null;
  order: Order;
  notes: { id: string; note: string; created_at: string; author: string | null }[];
  shop: { id: string; name: string; status: 'approved' | 'suspended' | 'under_review' | 'draft' | 'rejected' | 'changes_requested'; contact_phone: string | null; warnings_count: number };
  customer: { id: string; name: string | null; phone: string | null };
}

export default function IssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['issue', id], queryFn: () => rpc<IssueDetail | null>('admin_get_issue', { p_issue_id: id }), enabled: !!id });
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState('');
  const [shopAction, setShopAction] = useState<'none' | 'warn' | 'suspend'>('none');
  const [orderStatus, setOrderStatus] = useState<OrderStatus | ''>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const i = q.data;
  useEffect(() => setResolution(i?.resolution ?? ''), [i?.resolution]);
  useEffect(() => {
    // Problem photos live in the private order-media bucket.
    Promise.all((i?.photos ?? []).map((p) => signedUrl('order-media', p))).then((urls) => setPhotoUrls(urls.filter((u): u is string => !!u)));
  }, [i?.photos]);

  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorBox error={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (!i) return <ErrorBox error="Problem not found." />;

  const save = (data: IssueDetail) => {
    qc.setQueryData(['issue', id], data);
    qc.invalidateQueries({ queryKey: ['issues'] });
    qc.invalidateQueries({ queryKey: ['overview'] });
    qc.invalidateQueries({ queryKey: ['order', data.order.id] });
  };

  const addNote = async () => {
    setBusy('note');
    try {
      save(await rpc<IssueDetail>('admin_add_issue_note', { p_issue_id: i.id, p_note: note.trim() }));
      setNote('');
      toast('Note added');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const resolve = async () => {
    setBusy('resolve');
    try {
      save(await rpc<IssueDetail>('admin_resolve_issue', { p_issue_id: i.id, p_resolution: resolution.trim(), p_shop_action: shopAction, p_order_status: orderStatus || null }));
      toast('Resolved. The customer was notified.');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const o = i.order;
  return (
    <div className="space-y-6">
      <Link to="/problems" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
        <ArrowLeft className="size-4" /> Problems
      </Link>
      <PageHeader
        title={`${ISSUE_TYPE_LABEL[i.type] ?? i.type} · ${o.order_no}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={i.status === 'resolved' ? 'success' : i.status === 'in_progress' ? 'warning' : 'error'}>{i.status.replace('_', ' ')}</Badge>
            reported {formatDateTimeIST(i.created_at)}
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="What the customer said">
            <p className="whitespace-pre-line">{i.description || 'No description.'}</p>
            {photoUrls.length ? (
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {photoUrls.map((u) => (
                  <a key={u} href={u} target="_blank" rel="noreferrer">
                    <img src={u} alt="" className="aspect-square w-full rounded-xl object-cover" />
                  </a>
                ))}
              </div>
            ) : null}
          </Card>

          <Card title="Notes">
            <ol className="space-y-3">
              {i.notes.map((n) => (
                <li key={n.id} className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
                  <div className="whitespace-pre-line">{n.note}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {n.author ?? 'Admin'} · {formatDateTimeIST(n.created_at)}
                  </div>
                </li>
              ))}
              {!i.notes.length ? <li className="text-sm text-slate-500">No notes yet. Add what you learn from calls with the customer and the shop.</li> : null}
            </ol>
            {i.status !== 'resolved' ? (
              <div className="mt-4 space-y-2">
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called the shop: rider delivered to the wrong flat. Shop will re-deliver by 6 PM." />
                <Button size="sm" variant="secondary" loading={busy === 'note'} disabled={!note.trim()} onClick={addNote}>
                  Add note
                </Button>
              </div>
            ) : null}
          </Card>

          <Card title={i.status === 'resolved' ? 'Resolution' : 'Resolve'}>
            {i.status === 'resolved' ? (
              <div className="space-y-1 text-sm">
                <p className="whitespace-pre-line">{i.resolution}</p>
                <p className="text-xs text-slate-500">
                  {i.resolved_at ? formatDateTimeIST(i.resolved_at) : ''} · shop action: {i.shop_action ?? 'none'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <Field label="Resolution (sent to the customer)">
                  <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="e.g. The shop replaced the damaged item today. Sorry for the trouble." />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Action on the shop">
                    <Select value={shopAction} onChange={(e) => setShopAction(e.target.value as typeof shopAction)}>
                      <option value="none">No action</option>
                      <option value="warn">Send a warning</option>
                      <option value="suspend">Suspend the shop</option>
                    </Select>
                  </Field>
                  <Field label="Order status after resolving" hint="Leave as is to return the order to its previous status.">
                    <Select value={orderStatus} onChange={(e) => setOrderStatus(e.target.value as OrderStatus | '')}>
                      <option value="">Keep / restore automatically</option>
                      {ORDER_STATUSES.filter((s) => s !== 'ISSUE_REPORTED').map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Button variant="success" loading={busy === 'resolve'} disabled={!resolution.trim()} onClick={resolve}>
                  Mark resolved
                </Button>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Order">
            <Link to={`/orders/${o.id}`} className="font-semibold text-primary">
              {o.order_no}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <OrderStatusBadge status={o.status} /> {formatINR(o.grand_total)}
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {o.items.map((it, idx) => (
                <li key={idx}>
                  {it.qty} × {it.name}
                </li>
              ))}
            </ul>
            <div className="mt-2 text-xs text-slate-500">
              {o.delivered_at ? `Delivered ${formatDateTimeIST(o.delivered_at)}` : o.dispatched_at ? `Dispatched ${formatDateTimeIST(o.dispatched_at)}` : `Placed ${formatDateTimeIST(o.requested_at)}`}
            </div>
          </Card>
          <Card title="Customer">
            <div className="font-semibold">{i.customer.name ?? '—'}</div>
            {i.customer.phone ? (
              <a href={`tel:${i.customer.phone}`} className="inline-flex items-center gap-1 text-sm text-primary">
                <Phone className="size-3.5" /> {formatPhone(i.customer.phone)}
              </a>
            ) : null}
          </Card>
          <Card title="Shop">
            <Link to={`/shops/${i.shop.id}`} className="font-semibold text-primary">
              {i.shop.name}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <ShopStatusBadge status={i.shop.status} />
              {i.shop.warnings_count ? <Badge tone="warning">{i.shop.warnings_count} warnings</Badge> : null}
            </div>
            {i.shop.contact_phone ? (
              <a href={`tel:${i.shop.contact_phone}`} className="mt-1 inline-flex items-center gap-1 text-sm text-primary">
                <Phone className="size-3.5" /> {formatPhone(i.shop.contact_phone)}
              </a>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
