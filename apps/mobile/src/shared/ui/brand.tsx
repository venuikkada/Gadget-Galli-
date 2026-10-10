import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, G, Path, Rect, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

import { marigold, teal } from '@gg/shared';

import { useTheme } from '../theme/ThemeProvider';
import { BRAND_MARK } from './brandMark';

/**
 * The teal brand gradient behind headers and hero cards, with a soft glow in the top-right corner.
 * `partner` is the deeper version used across the Shop Partner app.
 */
export function BrandGradient({ children, variant = 'brand', style, glow = true, vertical }: { children?: ReactNode; variant?: 'brand' | 'partner'; style?: StyleProp<ViewStyle>; glow?: boolean; vertical?: boolean }) {
  const { gradients } = useTheme();
  const colors = variant === 'partner' ? gradients.partnerHeader : gradients.header;
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={vertical ? { x: 0, y: 1 } : { x: 1, y: 1 }} style={[{ overflow: 'hidden' }, style]}>
      {glow ? <View pointerEvents="none" style={{ position: 'absolute', width: 260, height: 260, borderRadius: 130, right: -90, top: -120, backgroundColor: teal[500], opacity: 0.35 }} /> : null}
      {children}
    </LinearGradient>
  );
}

/**
 * The Gadget Galli mark: a marigold bag with a teal bolt. `tile` puts it on the rounded brand tile (like the app
 * icon); without it, the bag sits on whatever is behind it.
 */
export function BrandMark({ size = 40, tile = false }: { size?: number; tile?: boolean }) {
  const mark = (
    <>
      <Path d={BRAND_MARK.handle} fill="none" stroke={marigold[600]} strokeWidth={BRAND_MARK.handleWidth} strokeLinecap="round" />
      <Path d={BRAND_MARK.bag} fill="url(#gg-bag)" />
      <Path d={BRAND_MARK.bolt} fill={teal[800]} stroke={teal[800]} strokeWidth={10} strokeLinejoin="round" />
    </>
  );
  return (
    <Svg width={size} height={size} viewBox={BRAND_MARK.viewBox}>
      <Defs>
        <SvgGradient id="gg-bag" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={marigold[400]} />
          <Stop offset="1" stopColor={marigold[500]} />
        </SvgGradient>
        <SvgGradient id="gg-tile" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={teal[500]} />
          <Stop offset="0.55" stopColor={teal[700]} />
          <Stop offset="1" stopColor={teal[900]} />
        </SvgGradient>
      </Defs>
      {tile ? (
        <>
          <Rect width={1024} height={1024} rx={230} fill="url(#gg-tile)" />
          <G transform="translate(512 512) scale(1.1) translate(-512 -525)">{mark}</G>
        </>
      ) : (
        <G transform="translate(512 512) scale(1.5) translate(-512 -525)">{mark}</G>
      )}
    </Svg>
  );
}
