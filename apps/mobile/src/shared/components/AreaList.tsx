import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import type { Area } from '@gg/shared';

import { useAreas, useZones } from '../hooks/reference';
import { useTranslation } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import { AppText, Loading, Row } from '../ui';

/** Hyderabad areas grouped by zone, filtered by name or pincode. */
export function AreaList({ query, onPick, selectedId }: { query: string; onPick: (a: Area) => void; selectedId?: number | null }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: areas, isLoading } = useAreas();
  const { data: zones = [] } = useZones();
  if (isLoading || !areas) return <Loading />;
  const q = query.trim().toLowerCase();
  const filtered = areas.filter((a) => !q || a.name.toLowerCase().includes(q) || a.pincode.startsWith(q));
  if (!filtered.length) return <AppText variant="bodySmall" color="textMuted">{t('location.noMatch', { q: query })}</AppText>;
  return (
    <View style={{ gap: 14 }}>
      {zones
        .map((z) => ({ zone: z, list: filtered.filter((a) => a.zone_id === z.id) }))
        .filter((g) => g.list.length)
        .map(({ zone, list }) => (
          <View key={zone.id} style={{ gap: 4 }}>
            <AppText variant="overline" color="textSubtle">{zone.name}</AppText>
            {list.map((a) => (
              <Pressable key={a.id} testID={`area-${a.name}`} onPress={() => onPick(a)} style={({ pressed }) => ({ paddingVertical: 11, paddingHorizontal: 4, borderRadius: 10, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}>
                <Row justify="space-between">
                  <Row gap={10}>
                    <Ionicons name="location-outline" size={18} color={colors.textMuted} />
                    <AppText variant="body">{a.name}</AppText>
                  </Row>
                  <Row gap={8}>
                    <AppText variant="caption" color="textSubtle">{a.pincode}</AppText>
                    {selectedId === a.id ? <Ionicons name="checkmark-circle" size={18} color={colors.primary} /> : null}
                  </Row>
                </Row>
              </Pressable>
            ))}
          </View>
        ))}
    </View>
  );
}
