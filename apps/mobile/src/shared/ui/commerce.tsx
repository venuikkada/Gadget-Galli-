import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { avatarColor, familyFor, formatINR, initials, ORDER_FLOW, percentOff, statusColors, type OrderStatus } from '@gg/shared';

import { publicUrl, thumbUrl, type Bucket } from '../api/storage';
import { useTranslation } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import { fonts, shadow } from '../theme/tokens';
import { useFont } from '../theme/useFont';
import { AppText, Icon, Row } from './primitives';

// Category -> icon (MaterialCommunityIcons) and top-level slug, for product placeholders when no photo exists.
const CATEGORY_ICON: Record<number, string> = {};
const CATEGORY_ROOT: Record<number, string> = {};
export function registerCategoryIcons(categories: { id: number; icon: string; slug?: string; parent_id?: number | null }[]) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  categories.forEach((c) => {
    CATEGORY_ICON[c.id] = c.icon;
    let root = c;
    for (let i = 0; i < 5 && root.parent_id != null && byId.has(root.parent_id); i++) root = byId.get(root.parent_id)!;
    if (root.slug) CATEGORY_ROOT[c.id] = root.slug;
  });
}

/** The colour family of a category (by its top-level slug); unknown categories get a stable one from `seed`. */
export function categoryFamily(categoryId: number | null | undefined, seed = '') {
  return familyFor(categoryId ? CATEGORY_ROOT[categoryId] : null, seed || String(categoryId ?? ''));
}

/** Product photo, or designed placeholder art (category icon on the category's colours, plus the brand) when there is no photo. */
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
  const fam = categoryFamily(categoryId, name ?? brand ?? '')[dark ? 'dark' : 'light'];
  const icon = (categoryId && CATEGORY_ICON[categoryId]) || 'cube-outline';
  const numericH = typeof h === 'number' ? h : 72;
  const iconSize = Math.max(18, Math.min(56, numericH * 0.4));
  const disc = Math.round(iconSize * 1.9);
  return (
    <LinearGradient colors={[fam.tint, fam.tint2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ width: w, height: h, borderRadius: radius, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, style]}>
      <View style={{ position: 'absolute', width: disc * 1.6, height: disc * 1.6, borderRadius: disc, right: -disc * 0.55, top: -disc * 0.6, backgroundColor: dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.45)' }} />
      <View style={{ width: disc, height: disc, borderRadius: disc / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)' }}>
        <Icon name={icon} set="mci" size={iconSize} color={fam.icon} />
      </View>
      {brand && numericH >= 90 ? (
        <Text numberOfLines={1} style={{ marginTop: 8, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.6, color: fam.icon, maxWidth: '86%', textTransform: 'uppercase' }}>
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
  return (
    <View style={{ width: size, height: size, borderRadius: size / 3.2, backgroundColor: avatarColor(name), alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.onBrand, fontFamily: fonts.headingBold, fontSize: size * 0.36 }}>{initials(name)}</Text>
    </View>
  );
}

/** A shop-front awning drawn across the top of a cover: alternating stripes with scalloped edges. */
function Awning({ height = 22 }: { height?: number }) {
  const stripe = 24;
  const n = 40;
  return (
    <Svg width="100%" height={height + 6} viewBox={`0 0 ${stripe * n} ${height + 6}`} preserveAspectRatio="xMinYMin slice" style={{ position: 'absolute', top: 0, left: 0 }}>
      {Array.from({ length: n }, (_, i) => (
        <Path
          key={i}
          d={`M ${i * stripe} 0 H ${(i + 1) * stripe} V ${height - stripe / 2} A ${stripe / 2} ${stripe / 2} 0 0 1 ${i * stripe} ${height - stripe / 2} Z`}
          fill={i % 2 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.24)'}
        />
      ))}
    </Svg>
  );
}

/** Shop cover: the photo, or the shop type's colours with an awning and a storefront watermark. */
export function ShopCover({ name, path, type, height = 120, radius = 0, children }: { name: string; path?: string | null; type?: string | null; height?: number; radius?: number; children?: ReactNode }) {
  const uri = publicUrl('shop-media', path);
  const fam = familyFor(type, name);
  return (
    <View style={{ height, borderRadius: radius, overflow: 'hidden' }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height }} contentFit="cover" transition={200} />
      ) : (
        <LinearGradient colors={fam.cover} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
          <Awning />
          <Ionicons name="storefront" size={height * 0.46} color="rgba(255,255,255,0.16)" style={{ position: 'absolute', right: 12, bottom: 6 }} />
        </LinearGradient>
      )}
      {children}
    </View>
  );
}

/**
 * Price with the struck MRP and "% off". `stacked` puts MRP and the discount on a second line (for tiles).
 */
export function PriceText({ price, mrp, size = 'md', showOff = true, from, stacked }: { price: number | null | undefined; mrp?: number | null; size?: 'sm' | 'md' | 'lg'; showOff?: boolean; from?: string; stacked?: boolean }) {
  const { t } = useTranslation();
  const off = percentOff(price ?? 0, mrp);
  const variant = size === 'lg' ? 'priceLarge' : 'price';
  const extras =
    mrp && off > 0 ? (
      <>
        <AppText variant="caption" color="textSubtle" strike style={{ marginBottom: 2 }}>{formatINR(mrp)}</AppText>
        {showOff ? <AppText variant="caption" color="offer" weight="bold" style={{ marginBottom: 2 }}>{t('product.off', { pct: off })}</AppText> : null}
      </>
    ) : null;
  if (stacked) {
    return (
      <View>
        <Row gap={4} align="flex-end">
          {from ? <AppText variant="caption" color="textMuted" style={{ marginBottom: 2 }}>{from}</AppText> : null}
          <AppText variant={variant} style={size === 'sm' ? { fontSize: 14 } : undefined}>{formatINR(price)}</AppText>
        </Row>
        {extras ? <Row gap={6}>{extras}</Row> : null}
      </View>
    );
  }
  return (
    <Row gap={6} align="flex-end" wrap>
      {from ? <AppText variant="caption" color="textMuted" style={{ marginBottom: 2 }}>{from}</AppText> : null}
      <AppText variant={variant} style={size === 'sm' ? { fontSize: 14 } : undefined}>{formatINR(price)}</AppText>
      {extras}
    </Row>
  );
}

/** Marigold "x% off" pill for product tiles and rows; nothing when there is no discount. */
export function DiscountBadge({ price, mrp, style }: { price: number | null | undefined; mrp?: number | null; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const ff = useFont();
  const off = percentOff(price ?? 0, mrp);
  if (off <= 0) return null;
  return (
    <View style={[{ backgroundColor: colors.accent, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' }, style]}>
      <Text style={{ color: colors.onAccent, fontFamily: ff(fonts.bodyBold), fontSize: 11 }}>{t('product.off', { pct: off })}</Text>
    </View>
  );
}

/** Rating pill: green from 4.0, amber below. */
export function Rating({ value, count, size = 'sm' }: { value: number | null | undefined; count?: number; size?: 'sm' | 'md' }) {
  const { colors } = useTheme();
  if (!value) return null;
  const good = value >= 4;
  const fg = good ? colors.onSuccess : colors.onWarning;
  return (
    <Row gap={4}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: good ? colors.success : colors.warning, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
        <Text style={{ color: fg, fontFamily: fonts.bodyBold, fontSize: size === 'md' ? 13 : 11.5 }}>{Number(value).toFixed(1)}</Text>
        <Ionicons name="star" size={size === 'md' ? 11 : 10} color={fg} />
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

export function StatusChip({ status, label, onBrand }: { status: OrderStatus; label?: string; onBrand?: boolean }) {
  const { t } = useTranslation();
  const ff = useFont();
  const { dark } = useTheme();
  // On the brand gradients the chip is white with the light-mode colours.
  const c = statusColors(status, dark && !onBrand);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: onBrand ? '#FFFFFF' : c.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: 'flex-start' }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.dot }} />
      <Text style={{ color: c.fg, fontFamily: ff(fonts.bodySemi), fontSize: 12 }}>{label ?? t(`status.${status}`)}</Text>
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

/** + / − stepper (same size as the Add button). In a cart the minus turns into a bin at 1; for stock counts (`stock`) it stays a minus and stops at 0. */
export function QtyStepper({ qty, onChange, max = 99, compact, loading, stock }: { qty: number; onChange: (q: number) => void; max?: number; compact?: boolean; loading?: boolean; stock?: boolean }) {
  const { colors, dark } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const prev = useRef(qty);
  useEffect(() => {
    if (prev.current !== qty) {
      prev.current = qty;
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.12, useNativeDriver: true, speed: 50, bounciness: 12 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }),
      ]).start();
    }
  }, [qty, scale]);
  const h = compact ? 34 : 40;
  const fg = colors.onAction;
  return (
    <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minWidth: 92, backgroundColor: colors.action, borderRadius: 10, height: h, opacity: loading ? 0.7 : 1, transform: [{ scale }] }, shadow(1, dark)]}>
      <Pressable accessibilityLabel="decrease" onPress={() => (stock ? qty > 0 && onChange(qty - 1) : onChange(qty - 1))} style={{ width: h - 4, height: h, alignItems: 'center', justifyContent: 'center', opacity: stock && qty <= 0 ? 0.5 : 1 }} hitSlop={4}>
        <Ionicons name={!stock && qty <= 1 ? 'trash-outline' : 'remove'} size={17} color={fg} />
      </Pressable>
      <Text style={{ color: fg, fontFamily: fonts.bodyBold, fontSize: 15, minWidth: 18, textAlign: 'center' }}>{qty}</Text>
      <Pressable accessibilityLabel="increase" onPress={() => qty < max && onChange(qty + 1)} style={{ width: h - 4, height: h, alignItems: 'center', justifyContent: 'center', opacity: qty >= max ? 0.5 : 1 }} hitSlop={4}>
        <Ionicons name="add" size={18} color={fg} />
      </Pressable>
    </Animated.View>
  );
}

/** Raised white "Add" button with a small "+" at the corner (the label is shown in capitals by style only). */
export function AddButton({ onPress, label, disabled, compact }: { onPress: () => void; label: string; disabled?: boolean; compact?: boolean }) {
  const { colors, dark } = useTheme();
  const ff = useFont();
  const { i18n } = useTranslation();
  const latin = i18n.language === 'en';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        {
          height: compact ? 34 : 40,
          minWidth: 92,
          paddingHorizontal: 18,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: dark ? colors.border : '#C3D1D2',
          backgroundColor: pressed ? colors.actionSoft : colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.45 : 1,
        },
        shadow(1, dark),
      ]}
    >
      <Text style={{ color: colors.action, fontFamily: ff(fonts.bodyBold), fontSize: 14.5, letterSpacing: latin ? 0.6 : 0, textTransform: latin ? 'uppercase' : 'none' } as TextStyle}>{label}</Text>
      <Ionicons name="add" size={13} color={colors.action} style={{ position: 'absolute', top: 2, right: 5 }} />
    </Pressable>
  );
}

/** Label/value rows for a bill, with a dashed rule before the total. The last row is the total. */
export function BillDetails({ rows, totalTestID }: { rows: { label: string; value: string; tone?: 'offer' | 'muted' }[]; totalTestID?: string }) {
  const { colors } = useTheme();
  const total = rows[rows.length - 1];
  const lines = rows.slice(0, -1);
  return (
    <View style={{ gap: 8 }}>
      {lines.map((r) => (
        <Row key={r.label} justify="space-between">
          <AppText variant="bodySmall" color="textMuted">{r.label}</AppText>
          <AppText variant="bodySmall" color={r.tone === 'offer' ? 'offer' : r.tone === 'muted' ? 'textMuted' : 'text'} weight={r.tone === 'offer' ? 'bold' : 'semibold'}>{r.value}</AppText>
        </Row>
      ))}
      {total ? (
        <>
          <View style={{ borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.border, marginTop: 2 }} />
          <Row justify="space-between">
            <AppText variant="title">{total.label}</AppText>
            <AppText variant="priceLarge" testID={totalTestID}>{total.value}</AppText>
          </Row>
        </>
      ) : null}
    </View>
  );
}

/** Three reasons to trust the order: verified shops, pay the shop by UPI, delivered in hours. */
export function TrustStrip({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const items = [
    { icon: 'shield-checkmark', label: t('common.verifiedShops') },
    { icon: 'qr-code', label: t('home.step3') },
    { icon: 'flash', label: t('home.step4') },
  ] as const;
  return (
    <View style={[{ flexDirection: 'row', backgroundColor: colors.primarySoft, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 6 }, style]}>
      {items.map((it, i) => (
        <View key={it.icon} style={{ flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 4, borderLeftWidth: i ? 1 : 0, borderColor: colors.border }}>
          <Ionicons name={it.icon} size={18} color={colors.primary} />
          <AppText variant="caption" color="text" weight="semibold" align="center" numberOfLines={2}>{it.label}</AppText>
        </View>
      ))}
    </View>
  );
}

/** Six-step progress bar for an order; the current step is marigold. `onBrand` for the teal gradients. */
export function OrderProgress({ status, onBrand }: { status: OrderStatus; onBrand?: boolean }) {
  const { colors } = useTheme();
  const at = ORDER_FLOW.indexOf(status === 'ISSUE_REPORTED' ? 'DELIVERED' : status);
  const done = onBrand ? '#FFFFFF' : colors.primary;
  const todo = onBrand ? 'rgba(255,255,255,0.28)' : colors.border;
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {ORDER_FLOW.map((s, i) => (
        <View key={s} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: at < 0 ? todo : i < at ? done : i === at ? colors.accent : todo }} />
      ))}
    </View>
  );
}

