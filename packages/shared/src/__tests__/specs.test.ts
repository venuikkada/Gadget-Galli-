import { describe, expect, it } from 'vitest';

import { variantText } from '../order';
import {
  buildSpecPatch,
  GENERIC_SPEC_TEMPLATE,
  listingKeys,
  missingRequired,
  modelHint,
  orderSpecEntries,
  SPEC_TEMPLATES,
  specTemplateFor,
  splitBrandModel,
  suggestProductName,
  visibleListingFields,
} from '../specs';

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

  it('asks for the fields that define each kind of product', () => {
    const required: Record<string, string[]> = {
      smartphones: ['storage', 'colour'],
      'cctv-cameras': ['resolution', 'type'],
      'dvr-nvr': ['channels', 'Type'],
      'cctv-kits': ['channels', 'resolution', 'Cameras'],
      laptops: ['ram', 'storage', 'Processor'],
      monitors: ['size', 'Resolution'],
      'graphics-cards': ['memory', 'GPU'],
      ram: ['capacity', 'Type'],
      storage: ['capacity', 'Type'],
      psu: ['wattage'],
      earbuds: [],
    };
    for (const [slug, keys] of Object.entries(required)) expect(missingRequired(SPEC_TEMPLATES[slug]!, {}), slug).toEqual(keys);
    expect(missingRequired(SPEC_TEMPLATES.smartphones!, { storage: '128 GB', colour: ' ' })).toEqual(['colour']);
    expect(missingRequired(SPEC_TEMPLATES.smartphones!, { storage: '128 GB', colour: 'Blue' })).toEqual([]);
  });

  it('keeps the shop\'s own details apart from the product\'s specs', () => {
    for (const [slug, t] of Object.entries(SPEC_TEMPLATES)) {
      const product = new Set([...t.variant, ...t.specs].map((f) => f.key));
      const own = listingKeys(t);
      expect(new Set(own).size, slug).toBe(own.length);
      expect(own.filter((k) => product.has(k)), slug).toEqual([]);
      expect(own, slug).toContain('Bill');
    }
  });

  it('asks about wear only for pre-owned pieces', () => {
    const phone = SPEC_TEMPLATES.smartphones!;
    expect(visibleListingFields(phone, 'new').map((f) => f.key)).toEqual(['Bill']);
    expect(visibleListingFields(phone, 'used').map((f) => f.key)).toEqual(['Battery health', 'Repairs', 'Physical condition', 'Box & accessories', 'Bill']);
    expect(visibleListingFields(SPEC_TEMPLATES['graphics-cards']!, 'refurbished').map((f) => f.key)).toContain('Used for mining');
    expect(visibleListingFields(SPEC_TEMPLATES['dvr-nvr']!, 'new').map((f) => f.key)).toEqual(['HDD included', 'Bill']);
    expect(visibleListingFields(GENERIC_SPEC_TEMPLATE, 'open_box').map((f) => f.key)).toEqual(['Physical condition', 'Box & accessories', 'Bill']);
  });

  it('suggests a full product name from brand, model and variant', () => {
    const phone = SPEC_TEMPLATES.smartphones!;
    expect(suggestProductName({ brand: 'Samsung', model: 'Galaxy S24 FE', template: phone, values: { ram: '8 GB', storage: '128 GB', colour: 'Blue' } })).toBe(
      'Samsung Galaxy S24 FE (8 GB RAM, 128 GB, Blue)',
    );
    expect(suggestProductName({ brand: 'Samsung', model: 'Samsung Galaxy A15', template: phone, values: {} })).toBe('Samsung Galaxy A15');
    expect(suggestProductName({ brand: 'CP Plus', model: 'CP-UNC-TA21PL3', template: SPEC_TEMPLATES['cctv-cameras']!, values: { resolution: '2 MP', type: 'Dome' } })).toBe(
      'CP Plus CP-UNC-TA21PL3 (2 MP, Dome camera)',
    );
    expect(suggestProductName({ brand: ' ', model: '', template: phone, values: { storage: '128 GB' } })).toBe('');
  });

  it('splits a typed search into brand and model', () => {
    const brands = ['CP', 'CP Plus', 'Samsung'];
    expect(splitBrandModel('samsung  galaxy s24 fe', brands)).toEqual({ brand: 'Samsung', model: 'galaxy s24 fe' });
    expect(splitBrandModel('cp plus 2mp dome', brands)).toEqual({ brand: 'CP Plus', model: '2mp dome' });
    expect(splitBrandModel('samsungs', brands)).toEqual({ brand: '', model: 'samsungs' });
    expect(splitBrandModel('Samsung', brands)).toEqual({ brand: 'Samsung', model: '' });
  });

  it('gives a model example without the brand', () => {
    expect(modelHint(SPEC_TEMPLATES.smartphones!)).toBe('Galaxy S24 FE 5G');
    expect(modelHint(SPEC_TEMPLATES['cctv-cameras']!)).toBe('2MP Full HD IR Dome Camera');
    expect(modelHint(GENERIC_SPEC_TEMPLATE)).toBeUndefined();
  });

  it('orders spec rows like the form, then the shop\'s details, then the rest', () => {
    const rows = orderSpecEntries({ OS: 'Windows 11', Bill: 'GST bill', RAM: '16 GB', Display: '15.6-inch', Processor: 'Ryzen 5' }, SPEC_TEMPLATES.laptops);
    expect(rows.map(([k]) => k)).toEqual(['Processor', 'Display', 'OS', 'Bill', 'RAM']);
    expect(orderSpecEntries({ b: '1', a: '2' }, null).map(([k]) => k)).toEqual(['b', 'a']);
  });

  it('reads variants in a fixed order', () => {
    expect(variantText({ colour: 'Blue', storage: '128 GB', ram: '8 GB' })).toBe('8 GB · 128 GB · Blue');
    expect(variantText({ colour: 'Black', finish: 'Matte', type: 'Dome' })).toBe('Dome · Matte · Black');
    expect(variantText(null)).toBe('');
  });
});
