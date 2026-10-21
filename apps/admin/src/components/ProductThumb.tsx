import { useMemo } from 'react';

import { deviceArtDataUri, deviceKindFor } from '@gg/shared';

import { publicUrl } from '@/lib/api';
import { useCategories } from '@/lib/reference';

import { cx } from './ui';

/**
 * Product photo, or the same device drawing the apps show when a product has no photo (by category, coloured per
 * brand), so a product looks the same everywhere.
 */
export function ProductThumb({
  photo,
  categoryId,
  name,
  brand,
  className,
}: {
  photo?: string | null;
  categoryId?: number | null;
  name?: string | null;
  brand?: string | null;
  className?: string;
}) {
  const cats = useCategories().data;
  const slug = categoryId ? cats?.find((c) => c.id === categoryId)?.slug : null;
  const art = useMemo(
    () => (photo ? null : deviceArtDataUri({ kind: deviceKindFor(slug, `${brand ?? ''} ${name ?? ''}`), seed: `${brand ?? ''}|${name ?? ''}` })),
    [photo, slug, brand, name],
  );
  const src = photo ? (/^https?:/.test(photo) ? photo : publicUrl('product-photos', photo)) : art;
  return (
    <img
      src={src ?? ''}
      alt=""
      loading="lazy"
      className={cx(
        'shrink-0 rounded-lg object-contain',
        photo ? 'bg-slate-100 dark:bg-slate-800' : 'bg-gradient-to-br from-primary-soft to-slate-100 p-0.5 dark:from-slate-800 dark:to-slate-900',
        className,
      )}
    />
  );
}
