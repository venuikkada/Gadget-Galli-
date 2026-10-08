import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Platform, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { HYDERABAD_CENTER } from '@gg/shared';

import { useTheme } from '../theme/ThemeProvider';

export interface MapPickerProps {
  lat?: number | null;
  lng?: number | null;
  height?: number;
  onChange: (lat: number, lng: number) => void;
}

/** Map with a fixed centre pin: drag the map to place the pin on the building. */
export function MapPicker({ lat, lng, height = 260, onChange }: MapPickerProps) {
  const { colors } = useTheme();
  const ref = useRef<MapView>(null);
  const initial: Region = {
    latitude: lat ?? HYDERABAD_CENTER.lat,
    longitude: lng ?? HYDERABAD_CENTER.lng,
    latitudeDelta: lat ? 0.008 : 0.25,
    longitudeDelta: lng ? 0.008 : 0.25,
  };
  return (
    <View style={{ height, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surfaceAlt }}>
      <MapView
        ref={ref}
        style={{ flex: 1 }}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={initial}
        showsUserLocation
        onRegionChangeComplete={(r) => onChange(r.latitude, r.longitude)}
      />
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ marginBottom: 34 }}>
          <Ionicons name="location" size={42} color={colors.action} />
        </View>
      </View>
    </View>
  );
}
