import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { formatINR, initials, percentOff, STATUS_COLORS, type OrderStatus } from '@gg/shared';

import { publicUrl, thumbUrl, type Bucket } from '../api/storage';
import { useTranslation } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import { useFont } from '../theme/useFont';
import { AppText, Icon, Row } from './primitives';

// Category -> icon (MaterialCommunityIcons) for product placeholders when no photo exists.
const CATEGORY_ICON: Record<number, string> = {};
export function registerCategoryIcons(categories: { id: number; icon: string }[]) {
  categories.forEach((c) => {
    CATEGORY_ICON[c.id] = c.icon;
  });
}

const PLACEHOLDER_TINTS = [
  ['#EEF2FF', '#E0E7FF'],
  ['#FFF1EA', '#FFE4D6'],
  ['#ECFEFF', '#CFFAFE'],
  ['#F5F3FF', '#EDE9FE'],
  ['#F0FDF4', '#DCFCE7'],
] as const;
const DARK_TINTS = [
  ['#1E1B4B', '#272463'],
  ['#3A1E12', '#4A2717'],
  ['#0C2A33', '#0F3540'],
  ['#2A1F4A', '#33265A'],
  ['#0F2E1C', '#143B24'],
] as const;

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Product photo, or a tidy placeholder (category icon + brand) when the shop/catalog has no photo. */
export function ProductImage({
  path,
  bucket = 'product-photos',
  size = 72,
  width,
  height,
  categoryId,
  brand,
  name,
  radius = 12,
  thumb = true,
  style,
}: {
  path?: string | null;
  bucket?: Bucket;
  size?: number;
  width?: number | `${number}%`;
  height?: number;
  categoryId?: number | null;
  brand?: string | null;
  name?: string;
  radius?: number;
  thumb?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, dark } = useTheme();
  const w = width ?? size;
  const h = height ?? size;
  const [failedThumb, setFailedThumb] = useState(false);
  const uri = path ? (thumb && !failedThumb ? thumbUrl(bucket, path) : publicUrl(bucket, path)) : null;
  if (uri) {
    return (
      <Image
        source={{ uri }}
        onError={() => thumb && !failedThumb && setFailedThumb(true)}
        contentFit="contain"
        transition={200}
        style={[{ width: w, height: h, borderRadius: radius, backgroundColor: colors.surfaceAlt }, style as object]}
      />
    );
  }
  const tints = dark ? DARK_TINTS : PLACEHOLDER_TINTS;
  const tint = tints[hash(name ?? brand ?? String(categoryId ?? '')) % tints.length]!;
  const icon = (categoryId && CATEGORY_ICON[categoryId]) || 'cube-outline';
  const iconSize = Math.max(18, Math.min(56, (typeof h === 'number' ? h : 72) * 0.42));
  return (
    <LinearGradient colors={tint} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ width: w, height: h, borderRadius: radius, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, style]}>
      <Icon name={icon} set="mci" size={iconSize} color={dark ? '#A5B4FC' : colors.primary} />
      {brand && (typeof h === 'number' ? h : 0) >= 90 ? (
        <Text numberOfLines={1} style={{ marginTop: 6, fontFamily: fonts.bodySemi, fontSize: 11, color: colors.textMuted, maxWidth: '86%' }}>
          {brand}
        </Text>
      ) : null}
    </LinearGradient>
  );
}

/** Shop logo or coloured initials. */
export function ShopAvatar({ name, path, size = 44 }: { name: string; path?: string | null; size?: number }) {
  const { colors } = useTheme();
  const uri = thumbUrl('shop-media', path);
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 3.2, backgroundColor: colors.surfaceAlt }} contentFit="cover" />;
  const palette = ['#4F46E5', '#FF6B35', '#0891B2', '#7C3AED', '#16A34A', '#DB2777'];
  const bg = palette[hash(name) % palette.length];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 3.2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontFamily: fonts.headingBold, fontSize: size * 0.36 }}>{initials(name)}</Text>
    </View>
  );
}

/** Shop cover: photo or a branded gradient with the shop's initials. */
export function ShopCover({ name, path, height = 120, radius = 0, children }: { name: string; path?: string | null; height?: number; radius?: number; children?: React.ReactNode }) {
  const uri = publicUrl('shop-media', path);
  const gradients = [
    ['#4F46E5', '#7C3AED'],
    ['#FF6B35', '#F59E0B'],
    ['#0891B2', '#4F46E5'],
    ['#16A34A', '#0891B2'],
    ['#7C3AED', '#DB2777'],
  ] as const;
  const g = gradients[hash(name) % gradients.length]!;
  return (
    <View style={{ height, borderRadius: radius, overflow: 'hidden' }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height }} contentFit="cover" transition={200} />
      ) : (
        <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'flex-end', padding: 14 }}>
          <Ionicons name="storefront" size={height * 0.5} color="rgba(255,255,255,0.18)" style={{ position: 'absolute', right: 12, top: 8 }} />
        </LinearGradient>
      )}
      {children}
    </View>
  );
}

export function PriceText({ price, mrp, size = 'md', showOff = true, from }: { price: number | null | undefined; mrp?: number | null; size?: 'sm' | 'md' | 'lg'; showOff?: boolean; from?: string }) {
  const { t } = useTranslation();
  const off = percentOff(price ?? 0, mrp);
  const variant = size === 'lg' ? 'priceLarge' : 'price';
  return (
    <Row gap={6} align="flex-end" wrap>
      {from ? <AppText variant="caption" color="textMuted" style={{ marginBottom: 2 }}>{from}</AppText> : null}
      <AppText variant={variant} style={size === 'sm' ? { fontSize: 14 } : undefined}>{formatINR(price)}</AppText>
      {mrp && off > 0 ? (
        <AppText variant="caption" color="textSubtle" strike style={{ marginBottom: 2 }}>{formatINR(mrp)}</AppText>
      ) : null}
      {showOff && off > 0 ? (
        <AppText variant="caption" color="success" weight="semibold" style={{ marginBottom: 2 }}>{t('product.off', { pct: off })}</AppText>
      ) : null}
    </Row>
  );
}

export function Rating({ value, count, size = 'sm' }: { value: number | null | undefined; count?: number; size?: 'sm' | 'md' }) {
  const { colors } = useTheme();
  if (!value) return null;
  const good = value >= 4;
  return (
    <Row gap={4}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: good ? colors.success : colors.warning, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
        <Text style={{ color: '#fff', fontFamily: fonts.bodyBold, fontSize: size === 'md' ? 13 : 11.5 }}>{Number(value).toFixed(1)}</Text>
        <Ionicons name="star" size={size === 'md' ? 11 : 10} color="#fff" />
      </View>
      {count != null ? <AppText variant="caption" color="textMuted">({count})</AppText> : null}
    </Row>
  );
}

export function StarInput({ value, onChange, size = 40 }: { value: number; onChange: (v: number) => void; size?: number }) {
  const { colors } = useTheme();
  return (
    <Row gap={8} justify="center">
      {[1, 2, 3, 4, 5].map((s) => (
        <Pressable key={s} onPress={() => onChange(s)} hitSlop={6} accessibilityLabel={`${s} stars`}>
          <Ionicons name={s <= value ? 'star' : 'star-outline'} size={size} color={s <= value ? colors.star : colors.textSubtle} />
        </Pressable>
      ))}
    </Row>
  );
}

export function StatusChip({ status, label }: { status: OrderStatus; label?: string }) {
  const { t } = useTranslation();
  const ff = useFont();
  const { dark } = useTheme();
  const c = STATUS_COLORS[status];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: dark ? `${c.dot}26` : c.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: 'flex-start' }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.dot }} />
      <Text style={{ color: dark ? c.dot : c.fg, fontFamily: ff(fonts.bodySemi), fontSize: 12 }}>{label ?? t(`status.${status}`)}</Text>
    </View>
  );
}

export function VerifiedBadge({ small }: { small?: boolean }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Row gap={3}>
      <Ionicons name="checkmark-circle" size={small ? 14 : 16} color={colors.primary} />
      {!small ? <AppText variant="caption" color="primary" weight="semibold">{t('common.verified')}</AppText> : null}
    </Row>
  );
}

export function OpenDot({ open }: { open: boolean }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Row gap={5}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: open ? colors.success : colors.error }} />
      <AppText variant="caption" color={open ? 'success' : 'error'} weight="semibold">{open ? t('common.openNow') : t('common.closed')}</AppText>
    </Row>
  );
}

/** − qty + stepper with a small bounce whenever the quantity changes. */
/** + / − stepper. In a cart the minus turns into a bin at 1; for stock counts (`stock`) it stays a minus and stops at 0. */
export function QtyStepper({ qty, onChange, max = 99, compact, loading, stock }: { qty: number; onChange: (q: number) => void; max?: number; compact?: boolean; loading?: boolean; stock?: boolean }) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const prev = useRef(qty);
  useEffect(() => {
    if (prev.current !== qty) {
      prev.current = qty;
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.18, useNativeDriver: true, speed: 50, bounciness: 12 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }),
      ]).start();
    }
  }, [qty, scale]);
  const h = compact ? 32 : 38;
  return (
    <Animated.View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.action, borderRadius: 10, height: h, opacity: loading ? 0.7 : 1, transform: [{ scale }] }}>
      <Pressable accessibilityLabel="decrease" onPress={() => (stock ? qty > 0 && onChange(qty - 1) : onChange(qty - 1))} style={{ width: h, height: h, alignItems: 'center', justifyContent: 'center', opacity: stock && qty <= 0 ? 0.5 : 1 }} hitSlop={4}>
        <Ionicons name={!stock && qty <= 1 ? 'trash-outline' : 'remove'} size={17} color="#fff" />
      </Pressable>
      <Text style={{ color: '#fff', fontFamily: fonts.bodyBold, fontSize: 15, minWidth: 18, textAlign: 'center' }}>{qty}</Text>
      <Pressable accessibilityLabel="increase" onPress={() => qty < max && onChange(qty + 1)} style={{ width: h, height: h, alignItems: 'center', justifyContent: 'center', opacity: qty >= max ? 0.5 : 1 }} hitSlop={4}>
        <Ionicons name="add" size={18} color="#fff" />
      </Pressable>
    </Animated.View>
  );
}

export function AddButton({ onPress, label, disabled, compact }: { onPress: () => void; label: string; disabled?: boolean; compact?: boolean }) {
  const { colors } = useTheme();
  const ff = useFont();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => ({
        height: compact ? 32 : 38,
        paddingHorizontal: 16,
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: colors.action,
        backgroundColor: pressed ? colors.actionSoft : colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 4,
        opacity: disabled ? 0.45 : 1,
      })}
    >
      <Text style={{ color: colors.action, fontFamily: ff(fonts.bodyBold), fontSize: 14 }}>{label}</Text>
      <Ionicons name="add" size={16} color={colors.action} />
    </Pressable>
  );
}
