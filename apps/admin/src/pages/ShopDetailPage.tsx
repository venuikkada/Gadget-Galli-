import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, ExternalLink, FileText, MapPin, Phone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import {
  formatDateTimeIST,
  formatDuration,
  formatINR,
  formatPhone,
  hoursTable,
  mapsUrl,
  SHOP_TYPE_LABEL,
  type MyShop,
  type ShopType,
} from '@gg/shared';

import { MiniMap } from '@/components/MiniMap';
import { Badge, Button, Card, ErrorBox, PageHeader, ReasonModal, ShopStatusBadge, Spinner, Textarea, toast, Toggle } from '@/components/ui';
import { errorMessage, publicUrl, rpc, signedUrl } from '@/lib/api';

type AdminShop = MyShop & {
  owner: { id: string; name: string | null; phone: string | null; email: string | null; is_blocked: boolean; created_at: string } | null;
  admin_notes: string | null;
  delivery_zone_names: string[];
  delivery_area_names: string[];
  stats: { orders: number; delivered: number; rejected: number; expired: number; issues: number; value: number };
  audit: { action: string; details: Record<string, unknown>; created_at: string; admin: string | null }[];
};

const DOC_LABEL: Record<string, string> = {
  gst_certificate: 'GST certificate',
  trade_licence: 'Trade licence',
  udyam_certificate: 'Udyam certificate',
  owner_id_proof: 'Owner ID proof',
  other: 'Other document',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 text-sm">
      <div className="text-ink-muted">{label}</div>
      <div className="col-span-2 break-words">{children}</div>
    </div>
  );
}

function DocumentLink({ path, label }: { path: string; label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      loading={busy}
      icon={<FileText className="size-4" />}
      onClick={async () => {
        setBusy(true);
        try {
          const url = await signedUrl('shop-documents', path, 300);
          if (url) window.open(url, '_blank', 'noopener');
          else toast('Could not open the document', 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      {label}
    </Button>
  );
}

export default function ShopDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['shop', id], queryFn: () => rpc<AdminShop | null>('admin_get_shop', { p_shop_id: id }), enabled: !!id });
  const [modal, setModal] = useState<null | 'reject' | 'request_changes' | 'suspend' | 'warn'>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [upiQr, setUpiQr] = useState<string | null>(null);
  const s = q.data;
  useEffect(() => setNotes(s?.admin_notes ?? ''), [s?.admin_notes]);
  useEffect(() => {
    if (s?.upi_qr_path) signedUrl('shop-media', s.upi_qr_path).then((u) => setUpiQr(u ?? publicUrl('shop-media', s.upi_qr_path)));
  }, [s?.upi_qr_path]);

  const refresh = (shop?: AdminShop) => {
    if (shop) qc.setQueryData(['shop', id], shop);
    qc.invalidateQueries({ queryKey: ['shops'] });
    qc.invalidateQueries({ queryKey: ['overview'] });
  };

  const run = async (key: string, fn: () => Promise<AdminShop | void>, ok: string) => {
    setBusy(key);
    try {
      const res = await fn();
      refresh(res ?? undefined);
      toast(ok);
    } catch (e) {
      toast(errorMessage(e), 'error');
      throw e;
    } finally {
      setBusy(null);
    }
  };

  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorBox error={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (!s) return <ErrorBox error="Shop not found." />;

  const photos = [...s.photos].sort((a, b) => (a.kind === 'front' ? -1 : b.kind === 'front' ? 1 : a.sort - b.sort));
  const canReview = s.status === 'under_review' || s.status === 'changes_requested' || s.status === 'rejected';

  return (
    <div className="space-y-6">
      <Link to="/shops" className="inline-flex items-center gap-1 text-sm font-semibold text-link">
        <ArrowLeft className="size-4" /> Shops
      </Link>
      <PageHeader
        title={s.name ?? 'Unnamed shop'}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <ShopStatusBadge status={s.status} />
            {s.verified ? (
              <Badge tone="primary">
                <BadgeCheck className="size-3.5" /> Verified
              </Badge>
            ) : null}
            {s.area ? <span>{s.area.name}</span> : null}
            {s.submitted_at ? <span>· submitted {formatDateTimeIST(s.submitted_at)}</span> : null}
          </span>
        }
        actions={
          <>
            {canReview ? (
              <>
                <Button variant="success" loading={busy === 'approve'} onClick={() => run('approve', () => rpc<AdminShop>('admin_review_shop', { p_shop_id: s.id, p_action: 'approve' }), 'Shop approved and the owner was notified').catch(() => undefined)} data-testid="approve-shop">
                  Approve
                </Button>
                <Button variant="outline" onClick={() => setModal('request_changes')}>
                  Ask for changes
                </Button>
                <Button variant="danger" onClick={() => setModal('reject')}>
                  Reject
                </Button>
              </>
            ) : null}
            {s.status === 'approved' ? (
              <>
                <Button variant="outline" onClick={() => setModal('warn')}>
                  Warn
                </Button>
                <Button variant="danger" onClick={() => setModal('suspend')}>
                  Suspend
                </Button>
              </>
            ) : null}
            {s.status === 'suspended' ? (
              <Button variant="success" loading={busy === 'unsuspend'} onClick={() => run('unsuspend', () => rpc<AdminShop>('admin_suspend_shop', { p_shop_id: s.id, p_suspend: false }), 'Shop is live again').catch(() => undefined)}>
                Lift suspension
              </Button>
            ) : null}
          </>
        }
      />
      {s.status_reason ? <ErrorBox error={`Reason shown to the owner: ${s.status_reason}`} /> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Shop details">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              <Row label="Type">{s.shop_types.map((t) => SHOP_TYPE_LABEL[t as ShopType] ?? t).join(', ') || '—'}</Row>
              <Row label="Description">{s.description ?? '—'}</Row>
              <Row label="Address">
                <div>
                  {[s.address_line, s.landmark, s.area?.name, s.pincode]
                    .filter((part, i, all): part is string => !!part && !all.slice(0, i).some((prev) => prev?.includes(part)))
                    .join(', ') || '—'}
                </div>
                {s.lat != null ? (
                  <>
                    <MiniMap shop={s} height={200} />
                    <a href={mapsUrl(s.lat, s.lng, s.name ?? undefined)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-link">
                      <MapPin className="size-3.5" /> Open pin in Google Maps
                    </a>
                  </>
                ) : null}
              </Row>
              <Row label="Phones">
                <div className="flex flex-wrap gap-3">
                  <span className="inline-flex items-center gap-1">
                    <Phone className="size-3.5" /> {formatPhone(s.contact_phone)}
                  </span>
                  {s.whatsapp_phone ? <span>WhatsApp {formatPhone(s.whatsapp_phone)}</span> : null}
                  {s.email ? <span>{s.email}</span> : null}
                </div>
              </Row>
              <Row label="Owner">
                {s.owner_name ?? s.owner?.name ?? '—'} · {formatPhone(s.owner_phone ?? s.owner?.phone)}
                {s.owner?.is_blocked ? <Badge tone="error" className="ml-2">Blocked</Badge> : null}
              </Row>
              <Row label="Hours">
                <div className="grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2">
                  {hoursTable(s.hours).map((h) => (
                    <div key={h.day} className={h.closed ? 'whitespace-nowrap text-error-ink' : 'whitespace-nowrap'}>
                      <span className="inline-block w-9 font-semibold">{h.label.slice(0, 3)}</span> {h.text}
                    </div>
                  ))}
                </div>
              </Row>
              <Row label="Delivery">
                {s.delivery_mode === 'radius' ? `Within ${s.delivery_radius_km} km` : [...s.delivery_zone_names.map((z) => `${z} (whole zone)`), ...s.delivery_area_names].join(', ') || 'No areas yet'}
                <div className="mt-1 text-xs text-ink-muted">
                  {s.delivery_charge_type === 'free' ? 'Free delivery' : s.delivery_charge_type === 'flat' ? `${formatINR(s.delivery_charge)} per order` : `${formatINR(s.delivery_charge)} per km`}
                  {s.free_delivery_above ? ` · free above ${formatINR(s.free_delivery_above)}` : ''}
                  {s.min_order ? ` · min order ${formatINR(s.min_order)}` : ''}
                  {` · usually ${formatDuration(s.usual_delivery_mins)}`}
                  {s.store_pickup ? ' · store pickup' : ''}
                </div>
              </Row>
              <Row label="UPI">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono">{s.upi_id ?? '—'}</span>
                  {s.upi_name ? <span className="text-ink-muted">({s.upi_name})</span> : null}
                  {upiQr ? (
                    <a href={upiQr} target="_blank" rel="noreferrer" className="text-xs font-semibold text-link">
                      View UPI QR
                    </a>
                  ) : null}
                </div>
              </Row>
              <Row label="GST">{s.gst_number ?? '—'}</Row>
              <Row label="Products">{s.product_count} active listings</Row>
            </div>
          </Card>

          <Card title={`Photos (${photos.length})`}>
            {photos.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {photos.map((p) => (
                  <a key={p.id} href={publicUrl('shop-media', p.path) ?? '#'} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
                    <img src={publicUrl('shop-media', p.path) ?? ''} alt={p.kind} className="aspect-square w-full object-cover transition group-hover:scale-105" />
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white uppercase">{p.kind}</span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">No photos uploaded.</p>
            )}
          </Card>

          <Card title="Documents (private)">
            {s.documents.length ? (
              <div className="space-y-3">
                {s.documents.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                    <div>
                      <div className="font-semibold">{DOC_LABEL[d.doc_type] ?? d.doc_type}</div>
                      <div className="text-xs text-ink-muted">
                        {d.doc_number ? `No. ${d.doc_number} · ` : ''}uploaded {formatDateTimeIST(d.created_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={d.status === 'accepted' ? 'success' : d.status === 'rejected' ? 'error' : 'primary'}>{d.status}</Badge>
                      <DocumentLink path={d.path} label="Open" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">No documents uploaded.</p>
            )}
            <p className="mt-3 text-xs text-ink-muted">Links expire after 5 minutes. Documents are visible only to admins.</p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Trust badges">
            <div className="space-y-4">
              <Toggle
                checked={s.verified}
                disabled={busy === 'flags'}
                onChange={(v) => run('flags', () => rpc<AdminShop>('admin_set_shop_flags', { p_shop_id: s.id, p_verified: v }), v ? 'Verified badge added' : 'Verified badge removed').catch(() => undefined)}
                label={
                  <span>
                    <span className="font-semibold">Verified shop</span>
                    <span className="block text-xs text-ink-muted">Shown to customers after documents and a visit or video call check.</span>
                  </span>
                }
              />
              <Toggle
                checked={s.upi_verified}
                disabled={busy === 'flags'}
                onChange={(v) => run('flags', () => rpc<AdminShop>('admin_set_shop_flags', { p_shop_id: s.id, p_upi_verified: v }), 'UPI check saved').catch(() => undefined)}
                label={
                  <span>
                    <span className="font-semibold">UPI ID checked</span>
                    <span className="block text-xs text-ink-muted">The UPI name matches the shop or owner.</span>
                  </span>
                }
              />
            </div>
          </Card>

          <Card title="Performance">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-ink-muted">Orders</div>
                <div className="tabular text-lg font-bold">{s.stats.orders}</div>
              </div>
              <div>
                <div className="text-xs text-ink-muted">Delivered</div>
                <div className="tabular text-lg font-bold">{s.stats.delivered}</div>
              </div>
              <div>
                <div className="text-xs text-ink-muted">Rejected / expired</div>
                <div className="tabular text-lg font-bold">
                  {s.stats.rejected} / {s.stats.expired}
                </div>
              </div>
              <div>
                <div className="text-xs text-ink-muted">Problems</div>
                <div className="tabular text-lg font-bold">{s.stats.issues}</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-ink-muted">Paid order value</div>
                <div className="tabular text-lg font-bold">{formatINR(s.stats.value)}</div>
              </div>
              <div className="col-span-2 text-xs text-ink-muted">
                Rating {s.rating_count ? `${Number(s.rating_avg).toFixed(1)} ★ from ${s.rating_count}` : 'none yet'} · avg delivery {formatDuration(s.avg_delivery_mins) || '—'} · {s.status === 'approved' ? (s.is_open_now ? 'open now' : 'closed now') : ''}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to={`/orders?shop=${s.id}`} className="text-sm font-semibold text-link">
                View orders
              </Link>
              <a href={`/s/shop/${s.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-link">
                Public page <ExternalLink className="size-3.5" />
              </a>
            </div>
          </Card>

          <Card title="Internal notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Visit notes, calls, agreements… (not visible to the shop)" />
            <Button className="mt-3" size="sm" variant="secondary" loading={busy === 'notes'} onClick={() => run('notes', () => rpc<void>('admin_save_shop_notes', { p_shop_id: s.id, p_notes: notes }), 'Notes saved').catch(() => undefined)}>
              Save notes
            </Button>
          </Card>

          <Card title="History">
            {s.audit.length ? (
              <ol className="space-y-3">
                {s.audit.map((a, i) => (
                  <li key={i} className="text-sm">
                    <div className="font-semibold">{a.action.replace(/_/g, ' ')}</div>
                    <div className="text-xs text-ink-muted">
                      {a.admin ?? 'Admin'} · {formatDateTimeIST(a.created_at)}
                    </div>
                    {typeof a.details?.reason === 'string' || typeof a.details?.message === 'string' ? <div className="text-xs">{String(a.details.reason ?? a.details.message)}</div> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-ink-muted">No admin actions yet.</p>
            )}
          </Card>
        </div>
      </div>

      <ReasonModal
        open={modal === 'reject'}
        onClose={() => setModal(null)}
        title="Reject this shop"
        description="The owner sees this reason in the app."
        placeholder="e.g. We could not verify the shop address. The GST number does not match the shop name."
        confirmLabel="Reject shop"
        danger
        onConfirm={(reason) => run('reject', () => rpc<AdminShop>('admin_review_shop', { p_shop_id: s.id, p_action: 'reject', p_reason: reason }), 'Shop rejected')}
      />
      <ReasonModal
        open={modal === 'request_changes'}
        onClose={() => setModal(null)}
        title="Ask the owner for changes"
        description="Say exactly what to fix. The owner gets a notification and can edit and resubmit."
        placeholder="e.g. Please upload a clear photo of the shop front with the name board visible."
        confirmLabel="Send request"
        onConfirm={(reason) => run('changes', () => rpc<AdminShop>('admin_review_shop', { p_shop_id: s.id, p_action: 'request_changes', p_reason: reason }), 'Change request sent')}
      />
      <ReasonModal
        open={modal === 'suspend'}
        onClose={() => setModal(null)}
        title="Suspend this shop"
        description="The shop disappears from search and cannot take new orders. Active orders continue."
        placeholder="Reason (shown to the owner)"
        confirmLabel="Suspend"
        danger
        onConfirm={(reason) => run('suspend', () => rpc<AdminShop>('admin_suspend_shop', { p_shop_id: s.id, p_suspend: true, p_reason: reason }), 'Shop suspended')}
      />
      <ReasonModal
        open={modal === 'warn'}
        onClose={() => setModal(null)}
        title="Send a warning"
        description="The owner gets this message as a notification. Warnings are counted on the shop."
        placeholder="e.g. Two customers said orders were confirmed but not dispatched. Please update stock before accepting orders."
        confirmLabel="Send warning"
        onConfirm={(message) => run('warn', () => rpc<AdminShop>('admin_warn_shop', { p_shop_id: s.id, p_message: message }), 'Warning sent')}
      />
    </div>
  );
}
