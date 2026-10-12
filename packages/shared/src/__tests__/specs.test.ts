import { describe, expect, it } from 'vitest';

import { buildSpecPatch, GENERIC_SPEC_TEMPLATE, SPEC_TEMPLATES, specTemplateFor } from '../specs';

describe('specification templates', () => {
  it('has a form for every category in the demo catalog', async () => {
    const url = new URL('../../../../supabase/seed/data-places.mjs', import.meta.url).href;
    const { CATEGORIES } = (await import(/* @vite-ignore */ url)) as { CATEGORIES: { slug: string; children: { slug: string }[] }[] };
    const slugs = CATEGORIES.flatMap((c) => [c.slug, ...c.children.map((x) => x.slug)]);
    expect(slugs.length).toBeGreaterThan(30);
    expect(slugs.filter((s) => !SPEC_TEMPLATES[s])).toEqual([]);
  });

  it('uses unique keys, lowercase for variant options', () => {
    for (const [slug, t] of Object.entries(SPEC_TEMPLATES)) {
      const keys = [...t.variant, ...t.specs].map((f) => f.key);
      expect(new Set(keys).size, slug).toBe(keys.length);
      for (const f of t.variant) expect(f.key, slug).toBe(f.key.toLowerCase());
      for (const f of [...t.variant, ...t.specs]) if (f.highlight) expect(f.highlight, slug).toContain('{v}');
    }
  });

  it('falls back to the main category, then to the generic form', () => {
    expect(specTemplateFor('laptops', 'laptops-computers')).toBe(SPEC_TEMPLATES.laptops);
    expect(specTemplateFor('mini-pcs', 'laptops-computers')).toBe(SPEC_TEMPLATES['laptops-computers']);
    expect(specTemplateFor('drones', 'gadgets')).toBe(GENERIC_SPEC_TEMPLATE);
    expect(specTemplateFor(null, null)).toBe(GENERIC_SPEC_TEMPLATE);
  });

  it('builds variant, specs and highlights, leaving blanks out', () => {
    const patch = buildSpecPatch(
      SPEC_TEMPLATES.laptops,
      { ram: ' 16 GB ', storage: '512 GB SSD', colour: '', Processor: 'Ryzen 5 7535HS', Display: '15.6-inch FHD 144Hz', Graphics: 'RTX 2050 4 GB', OS: '  ', Unknown: 'ignored' },
      [{ k: 'Warranty card', v: 'Yes' }, { k: ' ', v: 'no name' }, { k: 'Empty', v: '' }],
    );
    expect(patch.variant).toEqual({ ram: '16 GB', storage: '512 GB SSD' });
    expect(patch.specs).toEqual({ Processor: 'Ryzen 5 7535HS', Display: '15.6-inch FHD 144Hz', Graphics: 'RTX 2050 4 GB', 'Warranty card': 'Yes' });
    expect(patch.key_specs).toEqual(['Ryzen 5 7535HS', '15.6-inch FHD 144Hz', 'RTX 2050 4 GB', '16 GB RAM']);
  });

  it('fills highlight templates', () => {
    const patch = buildSpecPatch(SPEC_TEMPLATES.smartphones, { 'Rear camera': '50 MP', ram: '8 GB' });
    expect(patch.key_specs).toEqual(['50 MP camera', '8 GB RAM']);
  });
});
