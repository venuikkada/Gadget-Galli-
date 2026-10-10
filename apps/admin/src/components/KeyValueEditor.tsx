import { Plus, X } from 'lucide-react';

import { Button, Input } from './ui';

export type KV = { k: string; v: string }[];

export const toKV = (o: Record<string, string> | null | undefined): KV => Object.entries(o ?? {}).map(([k, v]) => ({ k, v: String(v) }));
export const fromKV = (rows: KV): Record<string, string> => Object.fromEntries(rows.filter((r) => r.k.trim() && r.v.trim()).map((r) => [r.k.trim(), r.v.trim()]));

/** Small editor for variant / specs maps (name → value). */
export function KeyValueEditor({ rows, onChange, keyPlaceholder, valuePlaceholder }: { rows: KV; onChange: (rows: KV) => void; keyPlaceholder: string; valuePlaceholder: string }) {
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <Input className="flex-1" placeholder={keyPlaceholder} value={r.k} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} />
          <Input className="flex-[1.4]" placeholder={valuePlaceholder} value={r.v} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} />
          <button type="button" className="rounded-lg px-2 text-slate-400 hover:bg-slate-100 hover:text-error-ink dark:hover:bg-slate-800" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove">
            <X className="size-4" />
          </button>
        </div>
      ))}
      <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => onChange([...rows, { k: '', v: '' }])}>
        Add
      </Button>
    </div>
  );
}
