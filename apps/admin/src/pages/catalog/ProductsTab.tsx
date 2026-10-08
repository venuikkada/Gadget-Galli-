import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GitMerge, ImagePlus, Plus, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { formatINR, timeAgo, variantText } from '@gg/shared';

import { fromKV, KeyValueEditor, toKV, type KV } from '@/components/KeyValueEditor';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, Pagination, ReasonModal, Select, Spinner, Table, Tabs, Td, Textarea, Th, toast, Tr } from '@/components/ui';
import { errorMessage, publicUrl, rpc, uploadPublic } from '@/lib/api';
import { categoryLabel, useCategories } from '@/lib/reference';
import type { CatalogRow, Paged } from '@/lib/types';

const LIMIT = 50;
type StatusFilter = 'approved' | 'pending' | 'rejected' | 'merged' | 'all';

function useCatalog(status: StatusFilter, query: string, categoryId: number | null, offset: number) {
  return useQuery({
    queryKey: ['catalog', status, query, categoryId, offset],
    queryFn: () => rpc<Paged<CatalogRow>>('admin_catalog_list', { p_status: status === 'all' ? null : status, p_query: query || null, p_category_id: categoryId, p_limit: LIMIT, p_offset: offset }),
    placeholderData: (prev) => prev,
  });
}

// ---------------------------------------------------------------------------
// Create / edit form
// ---------------------------------------------------------------------------
function ProductForm({ product, open, onClose }: { product: CatalogRow | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: cats = [] } = useCategories();
  const leaf = cats.filter((c) => c.parent_id != null);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [model, setModel] = useState('');
  const [modelNumber, setModelNumber] = useState('');
  const [variant, setVariant] = useState<KV>([]);
  const [specs, setSpecs] = useState<KV>([]);
  const [keySpecs, setKeySpecs] = useState('');
  const [description, setDescription] = useState('');
  const [inBox, setInBox] = useState('');
  const [keywords, setKeywords] = useState('');
  const [mrp, setMrp] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [status, setStatus] = useState<CatalogRow['status']>('approved');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const p = product;
    setName(p?.name ?? '');
    setBrand(p?.brand ?? '');
    setCategoryId(p?.category_id ?? '');
    setModel(p?.model ?? '');
    setModelNumber(p?.model_number ?? '');
    setVariant(toKV(p?.variant));
    setSpecs(toKV(p?.specs));
    setKeySpecs((p?.key_specs ?? []).join('\n'));
    setDescription(p?.description ?? '');
    setInBox(p?.in_the_box ?? '');
    setKeywords(p?.keywords ?? '');
    setMrp(p?.mrp != null ? String(p.mrp) : '');
    setPhotos(p?.photos ?? []);
    setStatus(p?.status ?? 'approved');
  }, [open, product]);

  const save = async () => {
    setBusy(true);
    try {
      await rpc('admin_save_catalog_product', {
        p_patch: {
          ...(product ? { id: product.id } : {}),
          name: name.trim(),
          brand: brand.trim() || null,
          category_id: categoryId || null,
          model: model.trim(),
          model_number: modelNumber.trim(),
          variant: fromKV(variant),
          specs: fromKV(specs),
          key_specs: keySpecs.split('\n').map((s) => s.trim()).filter(Boolean),
          description: description.trim(),
          in_the_box: inBox.trim(),
          keywords: keywords.trim(),
          mrp: mrp ? Number(mrp) : null,
          photos,
          status,
        },
      });
      toast(product ? 'Product saved' : 'Product added to the catalog');
      qc.invalidateQueries({ queryKey: ['catalog'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const paths: string[] = [];
      for (const f of Array.from(files).slice(0, 8 - photos.length)) {
        if (f.size > 2 * 1024 * 1024) {
          toast(`${f.name} is larger than 2 MB. Please compress it first.`, 'error');
          continue;
        }
        paths.push(await uploadPublic('product-photos', 'catalog', f));
      }
      setPhotos((p) => [...p, ...paths]);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={product ? 'Edit catalog product' : 'New catalog product'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!name.trim() || !categoryId} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name (as customers search it)" className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Apple iPhone 15 (128 GB, Black)" />
        </Field>
        <Field label="Brand">
          <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Apple" />
        </Field>
        <Field label="Category">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Choose…</option>
            {leaf.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryLabel(cats, c.id)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Model">
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="iPhone 15" />
        </Field>
        <Field label="Model number" hint="Used to match bulk uploads">
          <Input value={modelNumber} onChange={(e) => setModelNumber(e.target.value)} placeholder="MTP03HN/A" />
        </Field>
        <Field label="MRP (₹)">
          <Input type="number" min={0} value={mrp} onChange={(e) => setMrp(e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as CatalogRow['status'])}>
            <option value="approved">Approved (searchable)</option>
            <option value="pending">Pending review</option>
            <option value="rejected">Rejected</option>
          </Select>
        </Field>
      </div>
      <Field label="Variant (storage, RAM, colour, size…)">
        <KeyValueEditor rows={variant} onChange={setVariant} keyPlaceholder="storage" valuePlaceholder="128 GB" />
      </Field>
      <Field label="Key specs (one per line, shown on cards)">
        <Textarea value={keySpecs} onChange={(e) => setKeySpecs(e.target.value)} placeholder={'A16 Bionic\n48MP camera\nUSB-C'} />
      </Field>
      <Field label="Full specifications">
        <KeyValueEditor rows={specs} onChange={setSpecs} keyPlaceholder="Display" valuePlaceholder='6.1" Super Retina XDR' />
      </Field>
      <Field label="Description">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="In the box">
          <Input value={inBox} onChange={(e) => setInBox(e.target.value)} />
        </Field>
        <Field label="Extra search words" hint="Nicknames and common typos, e.g. 'iphon 15 i phone'">
          <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        </Field>
      </div>
      <Field label={`Photos (${photos.length}/8)`}>
        <div className="flex flex-wrap gap-3">
          {photos.map((p) => (
            <div key={p} className="relative">
              <img src={publicUrl('product-photos', p) ?? ''} alt="" className="size-20 rounded-lg bg-slate-100 object-cover" />
              <button type="button" onClick={() => setPhotos(photos.filter((x) => x !== p))} className="absolute -top-2 -right-2 rounded-full bg-error p-0.5 text-white" aria-label="Remove photo">
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          {photos.length < 8 ? (
            <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-primary hover:text-primary">
              {uploading ? '…' : <ImagePlus className="size-5" />}
              Add
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
            </label>
          ) : null}
        </div>
      </Field>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Merge duplicates
// ---------------------------------------------------------------------------
function MergeModal({ source, onClose }: { source: CatalogRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [target, setTarget] = useState<CatalogRow | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (source) {
      setQuery(source.model ?? source.name);
      setTarget(null);
    }
  }, [source]);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(h);
  }, [query]);
  const results = useQuery({
    queryKey: ['catalog', 'merge', debounced],
    queryFn: () => rpc<Paged<CatalogRow>>('admin_catalog_list', { p_status: 'approved', p_query: debounced, p_limit: 10 }),
    enabled: !!source && debounced.length >= 2,
  });

  return (
    <Modal
      open={!!source}
      onClose={onClose}
      title="Merge into an existing product"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!target}
            icon={<GitMerge className="size-4" />}
            onClick={async () => {
              if (!source || !target) return;
              setBusy(true);
              try {
                const r = await rpc<{ moved: number; dropped: number }>('admin_merge_catalog_products', { p_source: source.id, p_target: target.id });
                toast(`Merged. ${r.moved} listings moved${r.dropped ? `, ${r.dropped} duplicates removed` : ''}.`);
                qc.invalidateQueries({ queryKey: ['catalog'] });
                qc.invalidateQueries({ queryKey: ['overview'] });
                onClose();
              } catch (e) {
                toast(errorMessage(e), 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            Merge
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">
        All shop listings of <b>{source?.name}</b> move to the product you pick. The duplicate is then hidden from search.
      </p>
      <Input placeholder="Search the catalog" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {results.data?.items
          .filter((r) => r.id !== source?.id)
          .map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setTarget(r)} className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${target?.id === r.id ? 'bg-primary-soft dark:bg-indigo-950' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                <span>
                  <span className="font-semibold">{r.name}</span>
                  <span className="block text-xs text-slate-500">
                    {[r.brand, r.model_number, variantText(r.variant)].filter(Boolean).join(' · ')} · {r.listings} listings
                  </span>
                </span>
                {target?.id === r.id ? <Badge tone="primary">Selected</Badge> : null}
              </button>
            </li>
          ))}
        {results.data && !results.data.items.length ? <li className="px-3 py-4 text-sm text-slate-500">No matches</li> : null}
      </ul>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------
export function ProductsTab() {
  const qc = useQueryClient();
  const { data: cats = [] } = useCategories();
  const [status, setStatus] = useState<StatusFilter>('pending');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<CatalogRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [rejecting, setRejecting] = useState<CatalogRow | null>(null);
  const [merging, setMerging] = useState<CatalogRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(h);
  }, [query]);
  useEffect(() => setOffset(0), [status, debounced, categoryId]);
  const q = useCatalog(status, debounced, categoryId, offset);
  const parents = cats.filter((c) => c.parent_id == null);

  const review = async (row: CatalogRow, action: 'approve' | 'reject', note?: string) => {
    setBusy(row.id);
    try {
      await rpc('admin_review_catalog_product', { p_id: row.id, p_action: action, p_note: note ?? null });
      toast(action === 'approve' ? 'Approved. The shop was notified.' : 'Rejected. The shop was notified.');
      qc.invalidateQueries({ queryKey: ['catalog'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={status}
          onChange={setStatus}
          options={[
            { value: 'pending', label: 'Custom products to review' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'merged', label: 'Merged' },
            { value: 'all', label: 'All' },
          ]}
        />
        <Button className="ml-auto" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
          New product
        </Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search, e.g. rtx 4060, iphon 15" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select className="w-full sm:w-64" value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">All categories</option>
          {parents.map((p) => (
            <optgroup key={p.id} label={p.name}>
              <option value={p.id}>All {p.name}</option>
              {cats
                .filter((c) => c.parent_id === p.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      </div>
      {q.isError ? <ErrorBox error={errorMessage(q.error)} onRetry={() => q.refetch()} /> : null}
      <Card padded={false}>
        {q.isLoading ? (
          <Spinner />
        ) : q.data && !q.data.items.length ? (
          <Empty title={status === 'pending' ? 'No custom products waiting' : 'No products found'} />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th>Category</Th>
                  <Th>MRP</Th>
                  <Th>Listings</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {q.data?.items.map((p) => (
                  <Tr key={p.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        {p.photos[0] ? <img src={publicUrl('product-photos', p.photos[0]) ?? ''} alt="" className="size-10 rounded-lg bg-slate-100 object-cover" /> : <div className="size-10 rounded-lg bg-slate-100 dark:bg-slate-800" />}
                        <div className="min-w-0">
                          <div className="max-w-80 truncate font-semibold">{p.name}</div>
                          <div className="text-xs text-slate-500">{[p.brand, p.model_number, variantText(p.variant)].filter(Boolean).join(' · ')}</div>
                          {p.created_by_shop ? (
                            <div className="text-xs text-action">
                              Added by {p.created_by_shop} · {timeAgo(p.created_at)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </Td>
                    <Td className="text-xs">{categoryLabel(cats, p.category_id) || p.category}</Td>
                    <Td className="tabular">{p.mrp ? formatINR(p.mrp) : '—'}</Td>
                    <Td className="tabular">{p.listings}</Td>
                    <Td>
                      <Badge tone={p.status === 'approved' ? 'success' : p.status === 'pending' ? 'action' : p.status === 'rejected' ? 'error' : 'neutral'}>{p.status}</Badge>
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-2 whitespace-nowrap">
                        {p.status === 'pending' ? (
                          <>
                            <Button size="sm" variant="success" loading={busy === p.id} onClick={() => review(p, 'approve')}>
                              Approve
                            </Button>
                            <Button size="sm" variant="outline" icon={<GitMerge className="size-3.5" />} onClick={() => setMerging(p)}>
                              Merge
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setRejecting(p)}>
                              Reject
                            </Button>
                          </>
                        ) : p.status === 'approved' ? (
                          <Button size="sm" variant="ghost" icon={<GitMerge className="size-3.5" />} onClick={() => setMerging(p)}>
                            Merge
                          </Button>
                        ) : null}
                        <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                          Edit
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination total={q.data?.total ?? 0} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        )}
      </Card>
      <ProductForm open={creating || !!editing} product={editing} onClose={() => (setEditing(null), setCreating(false))} />
      <MergeModal source={merging} onClose={() => setMerging(null)} />
      <ReasonModal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Reject custom product"
        description="Tell the shop what to do instead, e.g. pick the existing catalog product."
        placeholder="e.g. Duplicate of 'Apple iPhone 15 (128 GB, Black)'. Please list that product instead."
        confirmLabel="Reject"
        danger
        onConfirm={async (note) => {
          if (rejecting) await review(rejecting, 'reject', note);
        }}
      />
    </div>
  );
}
