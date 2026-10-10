import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { formatINR, SHOP_TYPE_LABEL, SHOP_TYPES, type SearchResult, type ShopType } from '@gg/shared';

import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Spinner, Table, Td, Th, toast, Toggle, Tr } from '@/components/ui';
import { deleteRow, errorMessage, rpc, selectAll, upsertRow } from '@/lib/api';
import { useBrands, useCategories } from '@/lib/reference';
import type { AdminCategory, Brand, Synonym } from '@/lib/types';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
function CategoryForm({ category, parentId, open, onClose }: { category: AdminCategory | null; parentId: number | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: cats = [] } = useCategories();
  const [form, setForm] = useState({ name: '', name_te: '', name_hi: '', slug: '', icon: 'cube-outline', parent_id: '' as number | '', shop_type: '' as ShopType | '', sort: 0, is_active: true });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForm({
      name: category?.name ?? '',
      name_te: category?.name_te ?? '',
      name_hi: category?.name_hi ?? '',
      slug: category?.slug ?? '',
      icon: category?.icon ?? 'cube-outline',
      parent_id: category ? category.parent_id ?? '' : parentId ?? '',
      shop_type: (category?.shop_type as ShopType | null) ?? '',
      sort: category?.sort ?? 0,
      is_active: category?.is_active ?? true,
    });
  }, [open, category, parentId]);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={category ? `Edit ${category.name}` : 'New category'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!form.name.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await upsertRow('categories', {
                  ...(category ? { id: category.id } : {}),
                  name: form.name.trim(),
                  name_te: form.name_te.trim() || null,
                  name_hi: form.name_hi.trim() || null,
                  slug: form.slug.trim() || slugify(form.name),
                  icon: form.icon.trim() || 'cube-outline',
                  parent_id: form.parent_id || null,
                  shop_type: form.shop_type || null,
                  sort: Number(form.sort) || 0,
                  is_active: form.is_active,
                });
                toast('Category saved');
                qc.invalidateQueries({ queryKey: ['ref', 'categories'] });
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
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name (English)">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Telugu">
          <Input value={form.name_te} onChange={(e) => set('name_te', e.target.value)} />
        </Field>
        <Field label="Hindi">
          <Input value={form.name_hi} onChange={(e) => set('name_hi', e.target.value)} />
        </Field>
        <Field label="Slug (used in bulk upload)">
          <Input value={form.slug} onChange={(e) => set('slug', e.target.value)} placeholder={slugify(form.name)} />
        </Field>
        <Field label="Icon" hint="Material Community Icons name">
          <Input value={form.icon} onChange={(e) => set('icon', e.target.value)} />
        </Field>
        <Field label="Sort order">
          <Input type="number" value={form.sort} onChange={(e) => set('sort', Number(e.target.value))} />
        </Field>
        <Field label="Parent">
          <Select value={form.parent_id} onChange={(e) => set('parent_id', e.target.value ? Number(e.target.value) : '')}>
            <option value="">Top-level group</option>
            {cats
              .filter((c) => c.parent_id == null && c.id !== category?.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Shop type">
          <Select value={form.shop_type} onChange={(e) => set('shop_type', e.target.value as ShopType | '')}>
            <option value="">—</option>
            {SHOP_TYPES.map((s) => (
              <option key={s} value={s}>
                {SHOP_TYPE_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end pb-2">
          <Toggle checked={form.is_active} onChange={(v) => set('is_active', v)} label="Visible" />
        </div>
      </div>
    </Modal>
  );
}

export function CategoriesTab() {
  const qc = useQueryClient();
  const { data: cats = [], isLoading } = useCategories();
  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [creatingIn, setCreatingIn] = useState<number | null | undefined>(undefined);
  const parents = cats.filter((c) => c.parent_id == null);

  const remove = async (c: AdminCategory) => {
    if (!window.confirm(`Delete "${c.name}"${c.parent_id == null ? ' and its sub-categories' : ''}?`)) return;
    try {
      await deleteRow('categories', c.id);
      toast('Deleted');
      qc.invalidateQueries({ queryKey: ['ref', 'categories'] });
    } catch (e) {
      toast(`${errorMessage(e)} Hide it instead.`, 'error');
    }
  };

  if (isLoading) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={<Plus className="size-4" />} onClick={() => setCreatingIn(null)}>
          New group
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {parents.map((p) => (
          <Card
            key={p.id}
            title={
              <span className="flex items-center gap-2">
                {p.name}
                <span className="text-xs font-normal text-ink-muted">
                  {p.name_te} · {p.name_hi}
                </span>
                {!p.is_active ? <Badge>Hidden</Badge> : null}
              </span>
            }
            actions={
              <>
                <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                  Edit
                </Button>
                <Button size="sm" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => setCreatingIn(p.id)}>
                  Sub-category
                </Button>
              </>
            }
            padded={false}
          >
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {cats
                .filter((c) => c.parent_id === p.id)
                .map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span>
                      <span className="font-semibold">{c.name}</span> <span className="text-xs text-ink-muted">{c.slug}</span>
                      {!c.is_active ? <Badge className="ml-2">Hidden</Badge> : null}
                    </span>
                    <span className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                        Edit
                      </Button>
                      <button type="button" onClick={() => remove(c)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-error-ink dark:hover:bg-slate-800" aria-label="Delete">
                        <Trash2 className="size-4" />
                      </button>
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>
      <CategoryForm open={!!editing || creatingIn !== undefined} category={editing} parentId={creatingIn ?? null} onClose={() => (setEditing(null), setCreatingIn(undefined))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------
export function BrandsTab() {
  const qc = useQueryClient();
  const { data: brands = [], isLoading } = useBrands();
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useMemo(() => brands.filter((b) => b.name.toLowerCase().includes(query.toLowerCase())), [brands, query]);

  const save = async (b: Partial<Brand>) => {
    try {
      await upsertRow('brands', b);
      qc.invalidateQueries({ queryKey: ['ref', 'brands'] });
      toast('Brand saved');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  if (isLoading) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search brands" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <form
          className="ml-auto flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            setBusy(true);
            await save({ name: name.trim(), slug: slugify(name), is_active: true });
            setName('');
            setBusy(false);
          }}
        >
          <Input placeholder="New brand name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" loading={busy} icon={<Plus className="size-4" />}>
            Add
          </Button>
        </form>
      </div>
      <Card padded={false}>
        <Table>
          <thead>
            <tr>
              <Th>Brand</Th>
              <Th>Slug</Th>
              <Th>Visible</Th>
            </tr>
          </thead>
          <tbody>
            {list.map((b) => (
              <Tr key={b.id}>
                <Td className="font-semibold">{b.name}</Td>
                <Td className="text-xs text-ink-muted">{b.slug}</Td>
                <Td>
                  <Toggle checked={b.is_active} onChange={(v) => save({ id: b.id, name: b.name, slug: b.slug, is_active: v })} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search synonyms
// ---------------------------------------------------------------------------
export function SynonymsTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['ref', 'synonyms'], queryFn: () => selectAll<Synonym>('search_synonyms', 'id') });
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setDebounced(test), 400);
    return () => clearTimeout(h);
  }, [test]);
  const results = useQuery({
    queryKey: ['search-test', debounced],
    queryFn: () => rpc<SearchResult>('search_products', { p_query: debounced, p_filters: { deliver_only: false }, p_limit: 6, p_log: false }),
    enabled: debounced.trim().length >= 2,
  });

  const add = async () => {
    const list = words
      .split(',')
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);
    if (list.length < 2) return toast('Enter at least two words separated by commas', 'error');
    setBusy(true);
    try {
      await upsertRow('search_synonyms', { words: list });
      setWords('');
      toast('Synonyms added. Search uses them right away.');
      qc.invalidateQueries({ queryKey: ['ref', 'synonyms'] });
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card title="Add a synonym group">
          <p className="mb-3 text-sm text-ink-muted">Words in a group mean the same thing in search. Use the zero-result searches report to find new ones.</p>
          <div className="flex gap-2">
            <Input placeholder="e.g. gpu, graphics card, video card" value={words} onChange={(e) => setWords(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <Button loading={busy} onClick={add} icon={<Plus className="size-4" />}>
              Add
            </Button>
          </div>
        </Card>
        <Card padded={false} title={`Synonym groups (${q.data?.length ?? 0})`}>
          {q.isLoading ? (
            <Spinner />
          ) : !q.data?.length ? (
            <Empty title="No synonyms yet" />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {q.data.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span className="flex flex-wrap gap-1.5">
                    {s.words.map((w) => (
                      <Badge key={w} tone="primary">
                        {w}
                      </Badge>
                    ))}
                  </span>
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-error-ink dark:hover:bg-slate-800"
                    aria-label="Delete"
                    onClick={async () => {
                      try {
                        await deleteRow('search_synonyms', s.id);
                        qc.invalidateQueries({ queryKey: ['ref', 'synonyms'] });
                      } catch (e) {
                        toast(errorMessage(e), 'error');
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card title="Try a search" className="h-fit lg:col-span-2">
        <Input placeholder="e.g. cc camera, iphon 15, rtx4060" value={test} onChange={(e) => setTest(e.target.value)} />
        <div className="mt-3 space-y-2">
          {results.isFetching ? <Spinner /> : null}
          {results.data?.items.map((p) => (
            <div key={p.product_id} className="rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800">
              <div className="font-semibold">{p.name}</div>
              <div className="text-xs text-ink-muted">
                {p.min_price != null ? `from ${formatINR(p.min_price)} · ` : ''}
                {p.shop_count} shops
              </div>
            </div>
          ))}
          {results.data && !results.data.items.length ? <p className="text-sm text-error-ink">No results. Add a synonym or a catalog keyword.</p> : null}
        </div>
      </Card>
    </div>
  );
}
