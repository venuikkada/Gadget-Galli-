import { useQuery } from '@tanstack/react-query';

import type { Area, Brand, Category, Zone } from '@gg/shared';

import { toApiError } from '../api/rpc';
import { supabase } from '../api/supabase';
import { registerCategoryIcons } from '../ui/commerce';

const HOUR = 60 * 60_000;

async function select<T>(table: string, order: string): Promise<T[]> {
  const { data, error } = await supabase.from(table).select('*').order(order);
  if (error) throw toApiError(error);
  return (data ?? []) as T[];
}

export function useAreas() {
  return useQuery({
    queryKey: ['areas'],
    queryFn: async () => (await select<Area>('areas', 'name')).filter((a) => a.is_active),
    staleTime: HOUR,
  });
}

export function useZones() {
  return useQuery({
    queryKey: ['zones'],
    queryFn: async () => (await select<Zone>('zones', 'sort')).filter((z) => z.is_active),
    staleTime: HOUR,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const cats = (await select<Category>('categories', 'sort')).filter((c) => c.is_active !== false);
      registerCategoryIcons(cats);
      return cats;
    },
    staleTime: HOUR,
  });
}

export function useBrands() {
  return useQuery({
    queryKey: ['brands'],
    queryFn: () => select<Brand>('brands', 'name'),
    staleTime: HOUR,
  });
}
