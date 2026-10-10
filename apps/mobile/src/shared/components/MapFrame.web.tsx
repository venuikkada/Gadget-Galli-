import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';

import type { MapCommand, MapMessage } from '@gg/shared/map';

import type { MapFrameHandle, MapFrameProps } from './MapFrame';

/** Shows a map page from mapHtml() in an iframe (the websites). */
export const MapFrame = forwardRef<MapFrameHandle, MapFrameProps>(function MapFrame({ html, style, onMessage, testID, label }, ref) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const handler = useRef(onMessage);
  handler.current = onMessage;
  useImperativeHandle(ref, () => ({
    send: (cmd: MapCommand) => frame.current?.contentWindow?.postMessage(JSON.stringify(cmd), '*'),
  }));
  useEffect(() => {
    const listen = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      try {
        handler.current?.(JSON.parse(String(e.data)) as MapMessage);
      } catch {
        /* not a map message */
      }
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, []);
  return (
    <View style={style} testID={testID} accessibilityLabel={label}>
      <iframe ref={frame} title={label ?? 'Map'} srcDoc={html} style={{ border: 0, width: '100%', height: '100%', display: 'block' }} />
    </View>
  );
});
