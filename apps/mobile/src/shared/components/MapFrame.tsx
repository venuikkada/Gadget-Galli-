import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Linking, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

import type { MapCommand, MapMessage } from '@gg/shared/map';

export interface MapFrameHandle {
  send: (cmd: MapCommand) => void;
}

export interface MapFrameProps {
  html: string;
  style?: StyleProp<ViewStyle>;
  onMessage?: (m: MapMessage) => void;
  testID?: string;
  label?: string;
}

// The map page is loaded as if from this address, so tile servers see a proper referrer.
const BASE_URL = 'https://gadgetgalli.in/';

/** Shows a map page from mapHtml() in a WebView (Android, iOS). Links tapped inside open in the browser. */
export const MapFrame = forwardRef<MapFrameHandle, MapFrameProps>(function MapFrame({ html, style, onMessage, testID, label }, ref) {
  const view = useRef<WebView>(null);
  useImperativeHandle(ref, () => ({
    send: (cmd) => view.current?.injectJavaScript(`window.ggMap && window.ggMap(${JSON.stringify(cmd)}); true;`),
  }));
  return (
    <View style={style} testID={testID} accessibilityLabel={label}>
      <WebView
        ref={view}
        source={{ html, baseUrl: BASE_URL }}
        originWhitelist={['*']}
        applicationNameForUserAgent="GadgetGalli"
        style={{ flex: 1, backgroundColor: 'transparent' }}
        scrollEnabled={false}
        nestedScrollEnabled
        setSupportMultipleWindows={false}
        onMessage={(e) => {
          try {
            onMessage?.(JSON.parse(e.nativeEvent.data) as MapMessage);
          } catch {
            /* not a map message */
          }
        }}
        onShouldStartLoadWithRequest={(r) => {
          if (r.url === BASE_URL || r.url.startsWith('about:') || r.url.startsWith('data:')) return true;
          Linking.openURL(r.url).catch(() => undefined);
          return false;
        }}
      />
    </View>
  );
});
