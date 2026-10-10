import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';

import { mapHtml, type MapCommand } from '@gg/shared/map';

import { config } from '../config';
import { useTranslation } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import { MapFrame, type MapFrameHandle } from './MapFrame';

export interface MapPickerProps {
  lat?: number | null;
  lng?: number | null;
  height?: number;
  /** Called when the map stops moving; `byUser` is true when the person dragged or zoomed it. */
  onChange: (lat: number, lng: number, byUser: boolean) => void;
  testID?: string;
}

/**
 * OpenStreetMap with a fixed centre pin: drag the map to put the pin on the building. Works the same on the
 * websites, Android and iOS. New lat/lng props (GPS, a search result) move the map without reloading it.
 */
export function MapPicker({ lat, lng, height = 260, onChange, testID = 'map-picker' }: MapPickerProps) {
  const { colors, dark } = useTheme();
  const { t } = useTranslation();
  const frame = useRef<MapFrameHandle>(null);
  const shown = useRef<{ lat: number; lng: number } | null>(lat != null && lng != null ? { lat, lng } : null);
  const ready = useRef(false);
  const pending = useRef<MapCommand | null>(null);

  // Built once per theme; it opens where the map was last shown.
  const html = useMemo(
    () => mapHtml({ mode: 'pick', center: shown.current, dark, tileUrl: config.mapTileUrl, attribution: config.mapAttribution }),
    [dark],
  );

  const send = (cmd: MapCommand) => {
    if (ready.current) frame.current?.send(cmd);
    else pending.current = cmd;
  };

  useEffect(() => {
    if (lat == null || lng == null) return;
    const s = shown.current;
    if (s && Math.abs(s.lat - lat) < 1e-6 && Math.abs(s.lng - lng) < 1e-6) return;
    shown.current = { lat, lng };
    send({ type: 'center', lat, lng, zoom: 17 });
  }, [lat, lng]);

  return (
    <View style={{ height, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border }}>
      <MapFrame
        ref={frame}
        html={html}
        style={{ flex: 1 }}
        testID={testID}
        label={t('location.moveMap')}
        onMessage={(m) => {
          if (m.type === 'ready') {
            ready.current = true;
            if (pending.current) frame.current?.send(pending.current);
            pending.current = null;
          } else if (m.type === 'move') {
            shown.current = { lat: m.lat, lng: m.lng };
            onChange(m.lat, m.lng, m.user);
          }
        }}
      />
    </View>
  );
}
