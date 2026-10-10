import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, MapPin, Phone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import {
  addressLines,
  CONDITION_LABEL,
  DELIVERY_SERVICE_LABEL,
  formatDateTimeIST,
  formatINR,
  formatPhone,
  ISSUE_TYPE_LABEL,
  mapsUrl,
  ORDER_STATUSES,
  PAYMENT_METHOD_LABEL,
  STATUS_LABEL,
  variantText,
  type Order,
  type OrderStatus,
} from '@gg/shared';

import { MiniMap } from '@/components/MiniMap';
import { Badge, Button, Card, ErrorBox, Field, Modal, OrderStatusBadge, PageHeader, Select, Spinner, Textarea, toast } from '@/components/ui';
import { errorMessage, publicUrl, rpc, signedUrl } from '@/lib/api';

const ACTOR: Record<string, string> = { customer: 'Customer', shop: 'Shop', admin: 'Admin', system: 'System' };

function ChangeStatus({ order, onDone }: { order: Order; onDone: (o: Order) => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => (setStatus(order.status), setNote(''), setOpen(true))}>
        Change status
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Change status of ${order.order_no}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={status === order.status || !note.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  const o = await rpc<Order>('admin_set_order_status', { p_order_id: order.id, p_status: status, p_note: note.trim() });
                  onDone(o);
                  toast('Status changed. Customer and shop were notified.');
                  setOpen(false);
                } catch (e) {
                  toast(errorMessage(e), 'error');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">Use this only to fix a stuck or wrong order, for example after a call with the customer and the shop. Every change is logged.</p>
        <Field label="New status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note (required, shown in the timeline)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Customer confirmed on call that the item was received." />
        </Field>
      </Modal>
    </>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['order', id], queryFn: () => rpc<Order | null>('get_order', { p_order_id: id }), enabled: !!id });
  const o = q.data;
  const [media, setMedia] = useState<{ label: string; url: string }[]>([]);

  useEffect(() => {
    if (!o) return;
    const list: [string, string | null | undefined][] = [
      ...o.payments.map((p, i) => [`Payment proof ${o.payments.length > 1 ? i + 1 : ''}`.trim(), p.proof_path] as [string, string | null]),
      ['Package photo', o.pack_photo_path],
      ['Bill photo', o.bill_photo_path],
      ['Dispatch photo', o.dispatch?.package_photo_path],
    ];
    Promise.all(list.filter(([, p]) => p).map(async ([label, p]) => ({ label, url: (await signedUrl('order-media', p)) ?? '' }))).then((r) => setMedia(r.filter((m) => m.url)));
  }, [o]);

  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorBox error={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (!o) return <ErrorBox error="Order not found." />;

  const updated = (n: Order) => {
    qc.setQueryData(['order', id], n);
    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['overview'] });
  };

  return (
    <div className="space-y-6">
      <Link to="/orders" className="inline-flex items-center gap-1 text-sm font-semibold text-link">
        <ArrowLeft className="size-4" /> Orders
      </Link>
      <PageHeader
        title={o.order_no}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={o.status} />
            {o.status === 'ISSUE_REPORTED' && o.status_before_issue ? <span>(was {STATUS_LABEL[o.status_before_issue]})</span> : null}
            <span>· placed {formatDateTimeIST(o.requested_at)} by {o.contact_method === 'whatsapp' ? 'WhatsApp' : 'call'}</span>
            {o.fulfilment === 'pickup' ? <Badge tone="primary">Store pickup</Badge> : null}
          </span>
        }
        actions={<ChangeStatus order={o} onDone={updated} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Items">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {o.items.map((i, idx) => (
                <li key={`${i.shop_product_id}-${idx}`} className="flex items-start gap-3 py-3">
                  {i.photo ? <img src={publicUrl('product-photos', i.photo) ?? ''} alt="" className="size-14 rounded-lg bg-slate-100 object-cover" /> : <div className="size-14 rounded-lg bg-slate-100 dark:bg-slate-800" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{i.name}</div>
                    <div className="text-xs text-ink-muted">
                      {[i.brand, variantText(i.variant), CONDITION_LABEL[i.condition], i.warranty_months ? `${i.warranty_months} mo warranty` : null].filter(Boolean).join(' · ')}
                    </div>
                    {i.with_installation ? <Badge tone="primary" className="mt-1">Installation {formatINR(i.installation_charge)}</Badge> : null}
                  </div>
                  <div className="text-right text-sm">
                    <div className="tabular font-semibold">{formatINR(i.line_total)}</div>
                    <div className="text-xs text-ink-muted">
                      {i.qty} × {formatINR(i.price)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
              <div className="flex justify-between">
                <span className="text-ink-muted">Items</span>
                <span className="tabular">{formatINR(o.item_total)}</span>
              </div>
              {o.installation_total ? (
                <div className="flex justify-between">
                  <span className="text-ink-muted">Installation</span>
                  <span className="tabular">{formatINR(o.installation_total)}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-ink-muted">Delivery</span>
                <span className="tabular">{o.delivery_charge ? formatINR(o.delivery_charge) : 'Free'}</span>
              </div>
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span className="tabular">{formatINR(o.grand_total)}</span>
              </div>
              {o.updated_by_shop ? <p className="text-xs text-warning-ink">The shop edited this order when confirming it.</p> : null}
            </div>
          </Card>

          <Card title="Timeline">
            <ol className="relative space-y-4 border-l-2 border-slate-200 pl-5 dark:border-slate-700">
              {o.events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute top-1 -left-[27px] size-3 rounded-full border-2 border-white bg-primary dark:border-slate-900" />
                  <div className="flex flex-wrap items-center gap-2">
                    <OrderStatusBadge status={e.to} />
                    <span className="text-xs text-ink-muted">
                      {ACTOR[e.actor_role] ?? e.actor_role} · {formatDateTimeIST(e.created_at)}
                    </span>
                  </div>
                  {e.note ? <p className="mt-1 text-sm">{e.note}</p> : null}
                </li>
              ))}
            </ol>
            {o.reject_reason ? <p className="mt-3 text-sm text-error-ink">Rejected: {o.reject_reason}</p> : null}
            {o.cancel_reason ? <p className="mt-1 text-sm text-ink-muted">Cancelled: {o.cancel_reason}</p> : null}
          </Card>

          {o.issues.length ? (
            <Card title="Problems reported">
              <ul className="space-y-3">
                {o.issues.map((i) => (
                  <li key={i.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{ISSUE_TYPE_LABEL[i.type]}</span>
                      <Badge tone={i.status === 'resolved' ? 'success' : 'error'}>{i.status.replace('_', ' ')}</Badge>
                    </div>
                    {i.description ? <p className="mt-1 text-sm">{i.description}</p> : null}
                    {i.resolution ? <p className="mt-1 text-sm text-success-ink">Resolution: {i.resolution}</p> : null}
                    <Link to={`/problems/${i.id}`} className="mt-2 inline-block text-sm font-semibold text-link">
                      Open problem
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {media.length ? (
            <Card title="Photos and proofs">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {media.map((m) => (
                  <a key={m.label} href={m.url} target="_blank" rel="noreferrer" className="block">
                    <img src={m.url} alt={m.label} className="aspect-square w-full rounded-xl bg-slate-100 object-cover" />
                    <span className="mt-1 block text-xs text-ink-muted">{m.label}</span>
                  </a>
                ))}
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card title="Customer">
            <div className="font-semibold">{o.customer_name ?? '—'}</div>
            {o.customer_phone ? (
              <a href={`tel:${o.customer_phone}`} className="mt-1 inline-flex items-center gap-1 text-sm text-link">
                <Phone className="size-3.5" /> {formatPhone(o.customer_phone)}
              </a>
            ) : null}
            {o.fulfilment === 'delivery' && o.address ? (
              <div className="mt-3 text-sm">
                <div className="whitespace-pre-line">{addressLines(o.address)}</div>
                {o.address.lat != null ? (
                  <>
                    <MiniMap shop={o.shop} home={o.address} height={200} />
                    <a href={mapsUrl(o.address.lat, o.address.lng, o.address.area ?? undefined)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-link">
                      <MapPin className="size-3.5" /> Map {o.distance_km != null ? `· ${o.distance_km} km from shop` : ''}
                    </a>
                  </>
                ) : null}
              </div>
            ) : null}
            {o.note ? <p className="mt-3 rounded-lg bg-warning-soft p-2 text-sm text-warning-ink">Note: {o.note}</p> : null}
          </Card>

          <Card title="Shop">
            <Link to={`/shops/${o.shop.id}`} className="font-semibold text-link">
              {o.shop.name}
            </Link>
            <div className="text-sm text-ink-muted">{o.shop.area}</div>
            {o.shop.contact_phone ? (
              <a href={`tel:${o.shop.contact_phone}`} className="mt-1 inline-flex items-center gap-1 text-sm text-link">
                <Phone className="size-3.5" /> {formatPhone(o.shop.contact_phone)}
              </a>
            ) : null}
            <div className="mt-2 text-xs text-ink-muted">UPI: {o.shop.upi_id ?? '—'}</div>
          </Card>

          <Card title="Payment">
            {o.payments.length ? (
              <ul className="space-y-2 text-sm">
                {o.payments.map((p, i) => (
                  <li key={i}>
                    <div className="font-semibold">
                      {formatINR(p.amount)} by {PAYMENT_METHOD_LABEL[p.method]}
                    </div>
                    <div className="text-xs text-ink-muted">
                      {p.upi_txn_id ? `Ref ${p.upi_txn_id} · ` : ''}
                      {formatDateTimeIST(p.created_at)}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">Not paid yet. Customers pay the shop directly by UPI.</p>
            )}
          </Card>

          {o.dispatch ? (
            <Card title="Dispatch">
              <div className="space-y-1 text-sm">
                <div className="font-semibold">{DELIVERY_SERVICE_LABEL[o.dispatch.service]}</div>
                {o.dispatch.rider_name || o.dispatch.rider_phone ? (
                  <div>
                    {o.dispatch.rider_name} {o.dispatch.rider_phone ? `· ${formatPhone(o.dispatch.rider_phone)}` : ''}
                  </div>
                ) : null}
                {o.dispatch.vehicle_no ? <div>Vehicle {o.dispatch.vehicle_no}</div> : null}
                {o.dispatch.delivery_otp ? <div>OTP {o.dispatch.delivery_otp}</div> : null}
                {o.dispatch.eta ? <div>ETA {formatDateTimeIST(o.dispatch.eta)}</div> : null}
                {o.dispatch.tracking_url ? (
                  <a href={o.dispatch.tracking_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-link">
                    Tracking link <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
              </div>
            </Card>
          ) : null}

          {o.review ? (
            <Card title="Review">
              <div className="font-semibold">{'★'.repeat(o.review.rating)}{'☆'.repeat(5 - o.review.rating)}</div>
              {o.review.body ? <p className="mt-1 text-sm">{o.review.body}</p> : null}
              {o.review.shop_reply ? <p className="mt-2 rounded-lg bg-slate-100 p-2 text-sm dark:bg-slate-800">Shop: {o.review.shop_reply}</p> : null}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
