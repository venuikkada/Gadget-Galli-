import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import type { Place, usePlaceSearch } from '../hooks/places';
import { useTranslation } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import { AppText, Card, InfoBanner, Loading, Row } from '../ui';

/** Under a search box: "Search the map for …", then OpenStreetMap results to tap, or what went wrong. */
export function PlaceResults({ query, search, onPick }: { query: string; search: ReturnType<typeof usePlaceSearch>; onPick: (p: Place) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const q = query.trim();
  if (q.length < 3) return null;
  if (search.loading) return <Loading />;
  if (search.failed) return <InfoBanner tone="warning" text={t('map.searchFailed')} />;
  if (search.results) {
    if (!search.results.length) return <AppText variant="caption" color="textMuted">{t('map.noResults')}</AppText>;
    return (
      <Card style={{ gap: 0 }} padded={false} testID="place-results">
        {search.results.map((p, i) => (
          <Pressable key={p.id} onPress={() => onPick(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: colors.divider }}>
            <Ionicons name="location-outline" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <AppText variant="title" numberOfLines={1}>{p.main}</AppText>
              {p.secondary ? <AppText variant="caption" color="textMuted" numberOfLines={1}>{p.secondary}</AppText> : null}
            </View>
          </Pressable>
        ))}
      </Card>
    );
  }
  return (
    <Pressable onPress={() => search.run(q)} testID="place-search" style={{ paddingVertical: 6 }}>
      <Row gap={8}>
        <Ionicons name="map-outline" size={18} color={colors.primary} />
        <AppText variant="label" color="primary">{t('map.searchFor', { q })}</AppText>
      </Row>
    </Pressable>
  );
}
