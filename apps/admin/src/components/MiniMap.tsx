import { useMemo } from 'react';

import { mapHtml, type MapPin } from '@gg/shared/map';

import { useIsDark } from '@/lib/chartTheme';
import { config } from '@/lib/config';

import { cx } from './ui';

type LatLng = { lat?: number | null; lng?: number | null } | null | undefined;

const valid = (p: LatLng): p is { lat: number; lng: number } => p?.lat != null && p?.lng != null;

/** OpenStreetMap with a shop pin (teal) and/or a customer pin (marigold), the same map the apps show. */
export function MiniMap({ shop, home, height = 220, className }: { shop?: LatLng; home?: LatLng; height?: number; className?: string }) {
  const dark = useIsDark();
  const pins: MapPin[] = [];
  if (valid(shop)) pins.push({ lat: shop.lat, lng: shop.lng, kind: 'shop' });
  if (valid(home)) pins.push({ lat: home.lat, lng: home.lng, kind: 'home' });
  const key = pins.map((p) => `${p.kind}:${p.lat},${p.lng}`).join('|');
  const html = useMemo(
    () => mapHtml({ mode: 'route', pins, interactive: true, dark, tileUrl: config.mapTileUrl, attribution: config.mapAttribution }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, dark],
  );
  if (!pins.length) return null;
  return <iframe title="Map" srcDoc={html} className={cx('mt-2 block w-full rounded-xl border border-slate-200 dark:border-slate-800', className)} style={{ height }} />;
}
