import { useQuery } from '@tanstack/react-query';

import { selectAll } from './api';
import type { AdminCategory, Area, Brand, Zone } from './types';

export const useCategories = () => useQuery({ queryKey: ['ref', 'categories'], queryFn: () => selectAll<AdminCategory>('categories', 'sort'), staleTime: 120_000 });
export const useBrands = () => useQuery({ queryKey: ['ref', 'brands'], queryFn: () => selectAll<Brand>('brands', 'name'), staleTime: 120_000 });
export const useZones = () => useQuery({ queryKey: ['ref', 'zones'], queryFn: () => selectAll<Zone>('zones', 'sort'), staleTime: 120_000 });
export const useAreas = () => useQuery({ queryKey: ['ref', 'areas'], queryFn: () => selectAll<Area>('areas', 'name'), staleTime: 120_000 });

/** Category label with its parent, e.g. "Components › Graphics cards". */
export function categoryLabel(cats: AdminCategory[], id: number | null | undefined) {
  const c = cats.find((x) => x.id === id);
  if (!c) return '';
  const parent = cats.find((x) => x.id === c.parent_id);
  return parent ? `${parent.name} › ${c.name}` : c.name;
}
