import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';

import { HYDERABAD_CENTER } from '@gg/shared';

import { useTheme } from '../theme/ThemeProvider';
import { AppText, Input, Row } from '../ui';
import type { MapPickerProps } from './MapPicker';

/** Web fallback: an embedded Google Map preview plus editable coordinates (react-native-maps is native only). */
export function MapPicker({ lat, lng, height = 260, onChange }: MapPickerProps) {
  const { colors } = useTheme();
  const [la, setLa] = useState(String(lat ?? HYDERABAD_CENTER.lat));
  const [ln, setLn] = useState(String(lng ?? HYDERABAD_CENTER.lng));
  const src = `https://maps.google.com/maps?q=${la},${ln}&z=16&output=embed`;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ height, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surfaceAlt }}>
        {/* eslint-disable-next-line react/no-unknown-property */}
        <iframe title="map" src={src} style={{ border: 0, width: '100%', height: '100%' }} />
        <View pointerEvents="none" style={{ position: 'absolute', right: 10, top: 10, backgroundColor: colors.surface, borderRadius: 8, padding: 6 }}>
          <Ionicons name="location" size={18} color={colors.action} />
        </View>
      </View>
      <Row gap={8}>
        <Input
          style={{ flex: 1 }}
          value={la}
          onChangeText={(v) => {
            setLa(v);
            const n = Number(v);
            if (Number.isFinite(n)) onChange(n, Number(ln));
          }}
          placeholder="Latitude"
        />
        <Input
          style={{ flex: 1 }}
          value={ln}
          onChangeText={(v) => {
            setLn(v);
            const n = Number(v);
            if (Number.isFinite(n)) onChange(Number(la), n);
          }}
          placeholder="Longitude"
        />
      </Row>
      <AppText variant="caption" color="textSubtle">Map dragging is available in the Android and iOS apps.</AppText>
    </View>
  );
}
