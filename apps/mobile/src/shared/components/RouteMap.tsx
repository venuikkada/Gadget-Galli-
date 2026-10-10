import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { View } from 'react-native';

import { formatDistance, marigold, teal } from '@gg/shared';
import { mapHtml, rideMins, roadKm, type MapPin, type MapPoint } from '@gg/shared/map';

import { config } from '../config';
import { useTranslation } from '../i18n';
import { tDuration } from '../i18n/format';
import { useTheme } from '../theme/ThemeProvider';
import { AppText, Row } from '../ui';
import { MapFrame } from './MapFrame';

/** Anything with coordinates: a shop, an address, the customer's chosen location. */
type LatLng = { lat?: number | null; lng?: number | null };

const valid = (p?: LatLng | null): p is MapPoint => p?.lat != null && p?.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng);

/**
 * Map of a shop (teal pin) and a delivery address (marigold pin) with a dashed line between them. Static by default
 * so the page scrolls past it; `homeLabel` names the marigold pin in the legend.
 */
export function RouteMap({
  shop,
  home,
  homeLabel = 'you',
  height = 170,
  interactive = false,
  testID,
}: {
  shop?: LatLng | null;
  home?: LatLng | null;
  homeLabel?: 'you' | 'customer';
  height?: number;
  interactive?: boolean;
  testID?: string;
}) {
  const { colors, dark } = useTheme();
  const { t } = useTranslation();
  const pins: MapPin[] = [];
  if (valid(shop)) pins.push({ lat: shop.lat, lng: shop.lng, kind: 'shop' });
  if (valid(home)) pins.push({ lat: home.lat, lng: home.lng, kind: 'home' });
  const key = pins.map((p) => `${p.kind}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');
  const html = useMemo(
    () => mapHtml({ mode: 'route', pins, interactive, dark, tileUrl: config.mapTileUrl, attribution: config.mapAttribution }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, dark, interactive],
  );
  if (!pins.length) return null;
  return (
    <View style={{ height, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surfaceAlt }}>
      <MapFrame html={html} style={{ flex: 1 }} testID={testID} label={t('map.directions')} />
      <View pointerEvents="none" style={{ position: 'absolute', left: 8, top: 8, flexDirection: 'row', gap: 6 }}>
        {pins.map((p) => (
          <Row key={p.kind} gap={5} style={{ backgroundColor: colors.elevated, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: p.kind === 'shop' ? teal[600] : marigold[500] }} />
            <AppText variant="caption" weight="semibold">{p.kind === 'shop' ? t('map.shop') : t(homeLabel === 'you' ? 'map.you' : 'map.customer')}</AppText>
          </Row>
        ))}
      </View>
    </View>
  );
}

/** "3.8 km away · ≈ 5.3 km by road · about 20 min ride" for a straight-line distance. */
export function RouteFacts({ km }: { km: number | null | undefined }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (km == null || !Number.isFinite(km)) return null;
  return (
    <Row gap={12} wrap>
      <Row gap={4}>
        <Ionicons name="navigate-outline" size={14} color={colors.primary} />
        <AppText variant="label">{t('common.km', { km: formatDistance(km) })}</AppText>
      </Row>
      <AppText variant="caption" color="textMuted">{t('map.byRoad', { km: formatDistance(roadKm(km)) })}</AppText>
      <Row gap={4}>
        <Ionicons name="bicycle" size={15} color={colors.primary} />
        <AppText variant="caption" color="textMuted">{t('map.ride', { time: tDuration(rideMins(km)) })}</AppText>
      </Row>
    </Row>
  );
}
