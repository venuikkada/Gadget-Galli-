import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Plus, Send, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

import { bannerPresets, bannerStyle, formatDateIST, formatDateTimeIST, formatPhone } from '@gg/shared';

import { Badge, Button, Card, cx, Empty, Field, Input, Modal, PageHeader, Select, Spinner, Stat, Table, Tabs, Td, Textarea, Th, toast, Toggle, Tr } from '@/components/ui';
import { deleteRow, errorMessage, publicUrl, rpc, selectAll, uploadPublic, upsertRow } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAreas, useCategories } from '@/lib/reference';
import type { AdminShopRow, Banner, Campaign, CatalogRow, Featured, Paged, Referrals } from '@/lib/types';

type Tab = 'banners' | 'featured' | 'campaigns' | 'referrals';

const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(0, 16) : '');
const fromLocalInput = (v: string) => (v ? new Date(`${v}:00+05:30`).toISOString() : null);
/** A banner's gradient and text colour, drawn the way the customer app shows it. */
const bannerCss = (color: string) => {
  const b = bannerStyle(color);
  return { background: `linear-gradient(135deg, ${b.gradient[0]}, ${b.gradient[1]})`, color: b.text };
};

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------
function BannerForm({ banner, open, onClose }: { banner: Banner | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: areas = [] } = useAreas();
  const { data: cats = [] } = useCategories();
  const empty = { title: '', subtitle: '', image_path: null as string | null, bg_color: bannerPresets[0]!.color, link_type: 'search' as Banner['link_type'], link_value: '', area_id: '' as number | '', sort: 0, is_active: true, starts_at: '', ends_at: '' };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(
      banner
        ? { title: banner.title, subtitle: banner.subtitle ?? '', image_path: banner.image_path, bg_color: banner.bg_color, link_type: banner.link_type, link_value: banner.link_value ?? '', area_id: banner.area_id ?? '', sort: banner.sort, is_active: banner.is_active, starts_at: toLocalInput(banner.starts_at), ends_at: toLocalInput(banner.ends_at) }
        : empty,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, banner]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const img = publicUrl('banners', f.image_path);

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={banner ? 'Edit banner' : 'New home banner'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!f.title.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await upsertRow('banners', {
                  ...(banner ? { id: banner.id } : {}),
                  title: f.title.trim(),
                  subtitle: f.subtitle.trim() || null,
                  image_path: f.image_path,
                  bg_color: f.bg_color,
                  link_type: f.link_type,
                  link_value: f.link_type === 'none' ? null : f.link_value.trim() || null,
                  area_id: f.area_id || null,
                  sort: Number(f.sort) || 0,
                  is_active: f.is_active,
                  starts_at: fromLocalInput(f.starts_at),
                  ends_at: fromLocalInput(f.ends_at),
                });
                toast('Banner saved');
                qc.invalidateQueries({ queryKey: ['banners'] });
                onClose();
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
      {/* Live preview, roughly as it appears on the home screen */}
      <div className="relative flex h-36 items-center overflow-hidden rounded-2xl p-5" style={bannerCss(f.bg_color)}>
        {img ? <img src={img} alt="" className="absolute inset-y-0 right-0 h-full w-1/2 object-cover opacity-90" /> : null}
        <div className="relative max-w-[60%]">
          <div className="font-display text-xl font-bold leading-tight">{f.title || 'Banner title'}</div>
          {f.subtitle ? <div className="mt-1 text-sm opacity-90">{f.subtitle}</div> : null}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title">
          <Input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="RTX 4060 in stock near you" />
        </Field>
        <Field label="Subtitle">
          <Input value={f.subtitle} onChange={(e) => set('subtitle', e.target.value)} placeholder="Compare prices from 6 shops · delivered today" />
        </Field>
        <Field label="Background colour">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {bannerPresets.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  title={p.label}
                  aria-label={`${p.label} colour`}
                  onClick={() => set('bg_color', p.color)}
                  className={cx('size-8 rounded-full border-2 transition', f.bg_color.toUpperCase() === p.color.toUpperCase() ? 'border-accent ring-2 ring-accent/40' : 'border-white shadow dark:border-slate-700')}
                  style={{ background: `linear-gradient(135deg, ${p.gradient[0]}, ${p.gradient[1]})` }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <input type="color" value={f.bg_color} onChange={(e) => set('bg_color', e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300" />
              <Input value={f.bg_color} onChange={(e) => set('bg_color', e.target.value)} />
            </div>
          </div>
        </Field>
        <Field label="Image (optional, right side)">
          <div className="flex items-center gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
              <ImagePlus className="size-4" /> Upload
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    set('image_path', await uploadPublic('banners', 'home', file));
                  } catch (err) {
                    toast(errorMessage(err), 'error');
                  }
                }}
              />
            </label>
            {f.image_path ? (
              <Button size="sm" variant="ghost" onClick={() => set('image_path', null)}>
                Remove
              </Button>
            ) : null}
          </div>
        </Field>
        <Field label="When tapped, open">
          <Select value={f.link_type} onChange={(e) => set('link_type', e.target.value as Banner['link_type'])}>
            <option value="search">Search results</option>
            <option value="category">Category</option>
            <option value="shop">Shop</option>
            <option value="product">Product</option>
            <option value="url">Web link</option>
            <option value="none">Nothing</option>
          </Select>
        </Field>
        {f.link_type === 'category' ? (
          <Field label="Category">
            <Select value={f.link_value} onChange={(e) => set('link_value', e.target.value)}>
              <option value="">Choose…</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parent_id ? '— ' : ''}
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : f.link_type !== 'none' ? (
          <Field label={f.link_type === 'search' ? 'Search words' : f.link_type === 'url' ? 'URL' : `${f.link_type === 'shop' ? 'Shop' : 'Product'} ID`}>
            <Input value={f.link_value} onChange={(e) => set('link_value', e.target.value)} placeholder={f.link_type === 'search' ? 'rtx 4060' : ''} />
          </Field>
        ) : (
          <div />
        )}
        <Field label="Show only in area (optional)">
          <Select value={f.area_id} onChange={(e) => set('area_id', e.target.value ? Number(e.target.value) : '')}>
            <option value="">All of Hyderabad</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sort order">
          <Input type="number" value={f.sort} onChange={(e) => set('sort', Number(e.target.value))} />
        </Field>
        <Field label="Starts (IST, optional)">
          <Input type="datetime-local" value={f.starts_at} onChange={(e) => set('starts_at', e.target.value)} />
        </Field>
        <Field label="Ends (IST, optional)">
          <Input type="datetime-local" value={f.ends_at} onChange={(e) => set('ends_at', e.target.value)} />
        </Field>
      </div>
      <Toggle checked={f.is_active} onChange={(v) => set('is_active', v)} label="Active" />
    </Modal>
  );
}

function BannersTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['banners'], queryFn: () => selectAll<Banner>('banners', 'sort') });
  const [editing, setEditing] = useState<Banner | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
          New banner
        </Button>
      </div>
      {q.isLoading ? <Spinner /> : null}
      {q.data && !q.data.length ? <Empty title="No banners" body="Banners appear in the carousel at the top of the customer home screen." /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {q.data?.map((b) => (
          <Card key={b.id} padded={false} className="overflow-hidden">
            <div className="relative flex h-28 items-center p-4" style={bannerCss(b.bg_color)}>
              {b.image_path ? <img src={publicUrl('banners', b.image_path) ?? ''} alt="" className="absolute inset-y-0 right-0 h-full w-1/2 object-cover" /> : null}
              <div className="relative max-w-[60%]">
                <div className="font-display text-lg font-bold leading-tight">{b.title}</div>
                {b.subtitle ? <div className="text-xs opacity-90">{b.subtitle}</div> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-ink-muted">
              <span className="flex flex-wrap items-center gap-2">
                {b.is_active ? <Badge tone="success">Active</Badge> : <Badge>Off</Badge>}
                <span>
                  {b.link_type}
                  {b.link_value ? `: ${b.link_value}` : ''}
                </span>
                {b.ends_at ? <span>until {formatDateIST(b.ends_at)}</span> : null}
              </span>
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(b)}>
                  Edit
                </Button>
                <button
                  type="button"
                  aria-label="Delete banner"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-error-ink dark:hover:bg-slate-800"
                  onClick={async () => {
                    if (!window.confirm('Delete this banner?')) return;
                    try {
                      await deleteRow('banners', b.id);
                      qc.invalidateQueries({ queryKey: ['banners'] });
                    } catch (e) {
                      toast(errorMessage(e), 'error');
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              </span>
            </div>
          </Card>
        ))}
      </div>
      <BannerForm open={creating || !!editing} banner={editing} onClose={() => (setEditing(null), setCreating(false))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Featured shops and products
// ---------------------------------------------------------------------------
function FeaturedTab() {
  const qc = useQueryClient();
  const featured = useQuery({ queryKey: ['featured'], queryFn: () => selectAll<Featured>('featured', 'sort') });
  const shops = useQuery({ queryKey: ['shops', 'approved', 'all'], queryFn: () => rpc<Paged<AdminShopRow>>('admin_list_shops', { p_status: 'approved', p_limit: 200 }) });
  const [productQuery, setProductQuery] = useState('');
  const products = useQuery({
    queryKey: ['catalog', 'featured-pick', productQuery],
    queryFn: () => rpc<Paged<CatalogRow>>('admin_catalog_list', { p_status: 'approved', p_query: productQuery, p_limit: 8 }),
    enabled: productQuery.trim().length >= 2,
  });
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const ids = (featured.data ?? []).filter((f) => f.kind === 'product' && f.catalog_product_id && !names[f.catalog_product_id]).map((f) => f.catalog_product_id!);
    if (!ids.length) return;
    rpc<{ product_id: string; name: string }[]>('products_by_ids', { p_ids: ids })
      .then((rows) => setNames((n) => ({ ...n, ...Object.fromEntries(rows.map((r) => [r.product_id, r.name])) })))
      .catch(() => undefined);
  }, [featured.data, names]);

  const add = async (row: Partial<Featured>) => {
    try {
      await upsertRow('featured', { sort: (featured.data?.length ?? 0) + 1, is_active: true, ...row });
      qc.invalidateQueries({ queryKey: ['featured'] });
      toast('Added to featured');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };
  const shopName = (id: string | null) => shops.data?.items.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Featured now" padded={false}>
        {featured.isLoading ? <Spinner /> : null}
        {featured.data && !featured.data.length ? <Empty title="Nothing featured" body="Featured shops and products appear on the home screen." /> : null}
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {featured.data?.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span>
                <Badge tone={f.kind === 'shop' ? 'action' : 'primary'}>{f.kind}</Badge>{' '}
                <span className="font-semibold">{f.kind === 'shop' ? shopName(f.shop_id) : names[f.catalog_product_id ?? ''] ?? f.catalog_product_id}</span>
              </span>
              <span className="flex items-center gap-2">
                <Toggle
                  checked={f.is_active}
                  onChange={async (v) => {
                    await upsertRow('featured', { ...f, is_active: v }).catch((e) => toast(errorMessage(e), 'error'));
                    qc.invalidateQueries({ queryKey: ['featured'] });
                  }}
                />
                <button
                  type="button"
                  aria-label="Remove"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-error-ink dark:hover:bg-slate-800"
                  onClick={async () => {
                    await deleteRow('featured', f.id).catch((e) => toast(errorMessage(e), 'error'));
                    qc.invalidateQueries({ queryKey: ['featured'] });
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <div className="space-y-6">
        <Card title="Feature a shop">
          <Select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) add({ kind: 'shop', shop_id: e.target.value });
              e.target.value = '';
            }}
          >
            <option value="">Choose a live shop…</option>
            {shops.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.area}
              </option>
            ))}
          </Select>
        </Card>
        <Card title="Feature a product">
          <Input placeholder="Search the catalog" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} />
          <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
            {products.data?.items.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>{p.name}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setNames((n) => ({ ...n, [p.id]: p.name }));
                    add({ kind: 'product', catalog_product_id: p.id });
                  }}
                >
                  Feature
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Push campaigns
// ---------------------------------------------------------------------------
function CampaignsTab() {
  const qc = useQueryClient();
  const { data: areas = [] } = useAreas();
  const history = useQuery({ queryKey: ['campaigns'], queryFn: () => selectAll<Campaign>('campaigns', 'created_at', false) });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [segment, setSegment] = useState<'customers' | 'shop_owners' | 'all' | 'area'>('customers');
  const [areaId, setAreaId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!window.confirm(`Send this notification to ${segment === 'area' ? 'people in the chosen area' : segment.replace('_', ' ')} now?`)) return;
    setBusy(true);
    try {
      const r = await rpc<{ sent: number }>('admin_send_campaign', { p_title: title.trim(), p_body: body.trim(), p_segment: segment, p_area_id: segment === 'area' ? areaId || null : null });
      toast(`Sent to ${r.sent} people`);
      setTitle('');
      setBody('');
      qc.invalidateQueries({ queryKey: ['campaigns'] });
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card title="Send a push notification" className="h-fit lg:col-span-2">
        <div className="space-y-4">
          <Field label="Title" hint={`${title.length}/60`}>
            <Input maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Diwali deals near you 🪔" />
          </Field>
          <Field label="Message" hint={`${body.length}/160`}>
            <Textarea maxLength={160} value={body} onChange={(e) => setBody(e.target.value)} placeholder="CCTV kits, phones and GPUs at local prices. Order on WhatsApp, delivered today." />
          </Field>
          <Field label="Send to">
            <Select value={segment} onChange={(e) => setSegment(e.target.value as typeof segment)}>
              <option value="customers">All customers</option>
              <option value="shop_owners">All shop owners</option>
              <option value="area">People in one area</option>
              <option value="all">Everyone</option>
            </Select>
          </Field>
          {segment === 'area' ? (
            <Field label="Area">
              <Select value={areaId} onChange={(e) => setAreaId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Choose…</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <div className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">
            <div className="text-xs font-semibold text-ink-muted">Preview</div>
            <div className="mt-1 font-semibold">{title || 'Title'}</div>
            <div className="text-slate-600 dark:text-slate-300">{body || 'Message'}</div>
          </div>
          <Button variant="action" icon={<Send className="size-4" />} loading={busy} disabled={!title.trim() || !body.trim() || (segment === 'area' && !areaId)} onClick={send}>
            Send now
          </Button>
          <p className="text-xs text-ink-muted">Keep it to 1–2 campaigns a week. Too many pushes make people turn notifications off.</p>
        </div>
      </Card>
      <Card title="Sent campaigns" padded={false} className="lg:col-span-3">
        {history.isLoading ? <Spinner /> : null}
        {history.data && !history.data.length ? <Empty title="No campaigns yet" /> : null}
        {history.data?.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Campaign</Th>
                <Th>Audience</Th>
                <Th>Sent</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {history.data.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <div className="font-semibold">{c.title}</div>
                    <div className="max-w-80 truncate text-xs text-ink-muted">{c.body}</div>
                  </Td>
                  <Td className="text-xs">{c.segment === 'area' ? `Area: ${areas.find((a) => a.id === c.area_id)?.name ?? c.area_id}` : c.segment.replace('_', ' ')}</Td>
                  <Td className="tabular">{c.sent_count}</Td>
                  <Td className="text-xs text-ink-muted">{formatDateTimeIST(c.created_at)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------
function ReferralsTab() {
  const q = useQuery({ queryKey: ['referrals'], queryFn: () => rpc<Referrals>('admin_referrals', { p_limit: 50 }) });
  if (q.isLoading) return <Spinner />;
  const d = q.data;
  if (!d) return null;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Joined with a code" value={d.total_joined} />
        <Stat label="…and ordered" value={d.total_ordered} tone="success" />
        <Stat label="Conversion" value={d.total_joined ? `${Math.round((d.total_ordered / d.total_joined) * 100)}%` : '—'} tone="action" />
      </div>
      <Card title="Top referrers" padded={false}>
        {!d.top.length ? (
          <Empty title="No referrals yet" body="Customers share their code from Profile → Invite friends." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Customer</Th>
                <Th>Code</Th>
                <Th>Joined</Th>
                <Th>Ordered</Th>
              </tr>
            </thead>
            <tbody>
              {d.top.map((r) => (
                <Tr key={r.user_id}>
                  <Td>
                    <div className="font-semibold">{r.name ?? '—'}</div>
                    <div className="text-xs text-ink-muted">{formatPhone(r.phone)}</div>
                  </Td>
                  <Td className="font-mono text-xs">{r.code}</Td>
                  <Td className="tabular">{r.joined}</Td>
                  <Td className="tabular">{r.ordered}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

export default function ContentPage() {
  const { isSuper } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'banners';
  return (
    <div className="space-y-5">
      <PageHeader title="Content & growth" subtitle="Home banners, featured shops and products, push campaigns and referrals." />
      <Tabs
        value={tab}
        onChange={(v) => setParams({ tab: v })}
        options={[
          { value: 'banners', label: 'Banners' },
          { value: 'featured', label: 'Featured' },
          { value: 'campaigns', label: 'Push campaigns' },
          { value: 'referrals', label: 'Referrals' },
        ]}
      />
      {!isSuper && tab === 'campaigns' ? <p className="text-sm text-ink-muted">Support admins can send campaigns too. Please check the message with the team first.</p> : null}
      {tab === 'banners' ? <BannersTab /> : tab === 'featured' ? <FeaturedTab /> : tab === 'campaigns' ? <CampaignsTab /> : <ReferralsTab />}
    </div>
  );
}
