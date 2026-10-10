import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, View, type DimensionValue } from 'react-native';

import { ACTIVE_STATUSES, deliveryEtaMins, formatDateIST, formatDistance, formatINR, variantText, type Offer, type OrderCard, type ProductCard as ProductCardT, type Review, type ShopCard as ShopCardT } from '@gg/shared';

import { thumbUrl } from '@/shared/api/storage';
import { useTranslation } from '@/shared/i18n';
import { tDateTime, tDeliversIn, tDuration } from '@/shared/i18n/format';
import { useTheme } from '@/shared/theme/ThemeProvider';
import {
  AddButton,
  AppText,
  Card,
  DiscountBadge,
  OrderProgress,
  PriceText,
  ProductImage,
  QtyStepper,
  Rating,
  Row,
  ShopAvatar,
  ShopCover,
  StatusChip,
  Tag,
  VerifiedBadge,
} from '@/shared/ui';

// ---------------------------------------------------------------------------
// Product cards
// ---------------------------------------------------------------------------
export function ProductRow({ p, nearOnly = true }: { p: ProductCardT; nearOnly?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const shops =
    p.shop_count === 1
      ? t(nearOnly ? 'search.availableNearOne' : 'search.availableAllOne')
      : t(nearOnly ? 'search.availableNear' : 'search.availableAll', { count: p.shop_count });
  return (
    <Card onPress={() => router.push(`/product/${p.product_id}`)} testID={`product-${p.product_id}`}>
      <Row align="flex-start" gap={12}>
        <View>
          <ProductImage path={p.photo} categoryId={p.category_id} brand={p.brand} name={p.name} size={96} />
          <DiscountBadge price={p.min_price} mrp={p.mrp} style={{ position: 'absolute', top: 6, left: 6 }} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="title" numberOfLines={2}>{p.name}</AppText>
          {p.key_specs?.length ? (
            <AppText variant="caption" color="textMuted" numberOfLines={2}>{p.key_specs.slice(0, 3).join(' · ')}</AppText>
          ) : null}
          <PriceText price={p.min_price} mrp={p.mrp} showOff={false} from={p.shop_count > 1 ? t('search.from') : undefined} />
          <Row gap={6} wrap>
            <Ionicons name="storefront-outline" size={13} color={colors.primary} />
            <AppText variant="caption" color="primary" weight="semibold">{shops}</AppText>
          </Row>
          <Row gap={10} wrap>
            {p.best_rating ? <Rating value={p.best_rating} /> : null}
            {p.fastest_mins ? (
              <Row gap={3}>
                <Ionicons name="flash" size={12} color={colors.accentInk} />
                <AppText variant="caption" color="textMuted">{tDuration(p.fastest_mins)}</AppText>
              </Row>
            ) : null}
            {p.nearest_km != null ? <AppText variant="caption" color="textMuted">{formatDistance(p.nearest_km)}</AppText> : null}
          </Row>
        </View>
      </Row>
    </Card>
  );
}

export function ProductTile({ p, width = 160 }: { p: ProductCardT; width?: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card padded={false} onPress={() => router.push(`/product/${p.product_id}`)} style={{ width, overflow: 'hidden' }}>
      <View style={{ padding: 8, paddingBottom: 0 }}>
        <ProductImage path={p.photo} categoryId={p.category_id} brand={p.brand} name={p.name} width={width - 16} height={width - 36} radius={12} />
        <DiscountBadge price={p.min_price} mrp={p.mrp} style={{ position: 'absolute', top: 14, left: 14 }} />
      </View>
      <View style={{ padding: 10, gap: 4 }}>
        <AppText variant="bodySmall" weight="semibold" numberOfLines={2} style={{ minHeight: 38 }}>{p.name}</AppText>
        <PriceText price={p.min_price} mrp={p.mrp} size="sm" stacked showOff={false} />
        {p.shop_count > 0 ? (
          <Row gap={4}>
            <Ionicons name="storefront-outline" size={12} color={colors.primary} />
            <AppText variant="caption" color="primary" weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>
              {p.shop_count === 1 ? t('search.availableAllOne') : t('search.availableAll', { count: p.shop_count })}
            </AppText>
          </Row>
        ) : null}
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shop cards
// ---------------------------------------------------------------------------
export function ShopTile({ s, width = 248, coverHeight = 118, fastest }: { s: ShopCardT; width?: DimensionValue; coverHeight?: number; fastest?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card padded={false} onPress={() => router.push(`/shop/${s.id}`)} style={{ width, overflow: 'hidden' }} testID={`shop-${s.id}`}>
      <ShopCover name={s.name} path={s.cover_photo ?? s.cover_path} type={s.shop_types?.[0]} height={coverHeight}>
        <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.42)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 60 }} />
        <View style={{ position: 'absolute', left: 10, top: 10, flexDirection: 'row', gap: 6 }}>
          {!s.is_open_now ? <Tag label={t('common.closed')} tone="error" icon="moon" /> : null}
          {fastest && s.is_open_now ? (
            <Row gap={3} style={{ backgroundColor: colors.accent, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
              <Ionicons name="flash" size={11} color={colors.onAccent} />
              <AppText variant="caption" color="onAccent" weight="bold" style={{ fontSize: 11, lineHeight: 14 }}>{t('sort.fastest')}</AppText>
            </Row>
          ) : null}
        </View>
        <Row gap={3} style={{ position: 'absolute', right: 10, bottom: 8 }}>
          <Ionicons name="flash" size={12} color={colors.accent} />
          <AppText variant="caption" color="onBrand" weight="bold">{tDuration(deliveryEtaMins(s.delivery_mins, s.distance_km))}</AppText>
        </Row>
      </ShopCover>
      <View style={{ position: 'absolute', top: coverHeight - 26, left: 12, borderRadius: 16, borderWidth: 3, borderColor: colors.surface }}>
        <ShopAvatar name={s.name} path={s.logo_path} size={46} />
      </View>
      <View style={{ padding: 12, paddingTop: 28, gap: 5 }}>
        <Row gap={6}>
          <AppText variant="title" weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>{s.name}</AppText>
          {s.verified ? <VerifiedBadge small /> : null}
        </Row>
        <Row gap={8}>
          <Rating value={s.rating_avg} count={s.rating_count} />
          <AppText variant="caption" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
            {[s.area, formatDistance(s.distance_km)].filter(Boolean).join(' · ')}
          </AppText>
        </Row>
      </View>
    </Card>
  );
}

/** Full-width shop card for the shops list and favourites. */
export function ShopListRow({ s }: { s: ShopCardT }) {
  return <ShopTile s={s} width="100%" coverHeight={132} />;
}

// ---------------------------------------------------------------------------
// "Available at these shops" row on the product page
// ---------------------------------------------------------------------------
export function OfferRow({ o, qty, onAdd, onQty, productId, badge }: { o: Offer; qty: number; onAdd: () => void; onQty: (q: number) => void; productId: string; badge?: 'best' | 'fastest' | null }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card
      onPress={() => router.push({ pathname: '/shop/[id]', params: { id: o.shop_id, highlight: o.shop_product_id, product: productId } })}
      testID={`offer-${o.shop_id}`}
      style={badge ? { borderWidth: 1.5, borderColor: colors.accent } : undefined}
    >
      {badge ? (
        <Row gap={4} style={{ position: 'absolute', top: -11, left: 14, backgroundColor: colors.accent, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Ionicons name={badge === 'best' ? 'pricetag' : 'flash'} size={11} color={colors.onAccent} />
          <AppText variant="caption" color="onAccent" weight="bold" style={{ fontSize: 11, lineHeight: 15 }}>{badge === 'best' ? t('product.bestPrice') : t('sort.fastest')}</AppText>
        </Row>
      ) : null}
      <Row align="flex-start" gap={12}>
        <ShopAvatar name={o.shop_name} path={o.logo_path} size={42} />
        <View style={{ flex: 1, gap: 3 }}>
          <Row gap={6}>
            <AppText variant="title" numberOfLines={1} style={{ flexShrink: 1 }}>{o.shop_name}</AppText>
            {o.verified ? <VerifiedBadge small /> : null}
          </Row>
          <AppText variant="caption" color="textMuted">{[o.area, formatDistance(o.distance_km)].filter(Boolean).join(' · ')}</AppText>
          <Row gap={8} wrap>
            <Rating value={o.rating_avg} count={o.rating_count} />
            {o.condition !== 'new' ? <Tag label={t(`condition.${o.condition}`)} tone="warning" /> : null}
            {!o.is_open_now ? <Tag label={t('common.closed')} tone="error" /> : null}
          </Row>
          {o.delivers ? (
            <AppText variant="caption" color="textMuted">
              {tDeliversIn(deliveryEtaMins(o.delivery_mins, o.distance_km))} · {o.delivery_charge > 0 ? t('product.deliveryCharge', { amount: formatINR(o.delivery_charge) }) : t('product.freeDelivery')}
            </AppText>
          ) : (
            <Row gap={4}>
              <Ionicons name="alert-circle-outline" size={13} color={colors.warning} />
              <AppText variant="caption" color="warning">{o.store_pickup ? `${t('product.doesNotDeliver')} · ${t('product.pickupOnly')}` : t('product.doesNotDeliver')}</AppText>
            </Row>
          )}
          <AppText variant="caption" color={o.in_stock ? 'success' : 'error'} weight="semibold">
            {!o.in_stock ? t('product.outOfStock') : o.stock_qty != null && o.stock_qty <= 3 ? t('product.onlyLeft', { count: o.stock_qty }) : t('product.inStock')}
          </AppText>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          <AppText variant="price" style={{ fontSize: 17 }}>{formatINR(o.price)}</AppText>
          {qty > 0 ? (
            <QtyStepper qty={qty} onChange={onQty} compact max={o.stock_qty ?? 99} />
          ) : (
            <AddButton label={t('common.add')} onPress={onAdd} disabled={!o.in_stock} compact />
          )}
        </View>
      </Row>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Orders list row
// ---------------------------------------------------------------------------
export function OrderRow({ o, onPress }: { o: OrderCard; onPress?: () => void }) {
  const { t } = useTranslation();
  return (
    <Card onPress={onPress ?? (() => router.push(`/order/${o.id}`))} testID={`order-${o.order_no}`}>
      <Row align="flex-start" gap={12}>
        <ShopAvatar name={o.shop_name} path={o.shop_logo} size={46} />
        <View style={{ flex: 1, gap: 4 }}>
          <Row justify="space-between" align="flex-start" gap={8}>
            <AppText variant="title" numberOfLines={1} style={{ flex: 1 }}>{o.shop_name}</AppText>
            <StatusChip status={o.status} />
          </Row>
          <AppText variant="bodySmall" color="textMuted" numberOfLines={1}>
            {o.first_item}
            {o.item_count > 1 ? ` +${o.item_count - 1}` : ''}
          </AppText>
          <Row justify="space-between">
            <AppText variant="caption" color="textSubtle">{o.order_no} · {tDateTime(o.requested_at)}</AppText>
            <AppText variant="price" style={{ fontSize: 15 }}>{formatINR(o.grand_total)}</AppText>
          </Row>
          {ACTIVE_STATUSES.includes(o.status) ? <View style={{ marginTop: 4 }}><OrderProgress status={o.status} /></View> : null}
          {o.status === 'DELIVERED' && !o.has_review ? (
            <AppText variant="caption" color="primary" weight="semibold">★ {t('order.rate')}</AppText>
          ) : null}
        </View>
      </Row>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------
export function ReviewItem({ r, onReply }: { r: Review; onReply?: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6, paddingVertical: 10 }}>
      <Row justify="space-between">
        <Row gap={8}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <AppText variant="label" color="primary">{(r.customer_name || 'C')[0]}</AppText>
          </View>
          <View>
            <AppText variant="label">{r.customer_name}</AppText>
            <AppText variant="caption" color="textSubtle">{formatDateIST(r.created_at)}</AppText>
          </View>
        </Row>
        <Rating value={r.rating} />
      </Row>
      {r.items ? <AppText variant="caption" color="textMuted" numberOfLines={1}>{r.items}</AppText> : null}
      {r.body ? <AppText variant="bodySmall">{r.body}</AppText> : null}
      {r.photos?.length ? (
        <Row gap={6}>
          {r.photos.slice(0, 4).map((p) => (
            <Image key={p} source={{ uri: thumbUrl('review-photos', p) ?? undefined }} style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: colors.surfaceAlt }} />
          ))}
        </Row>
      ) : null}
      {r.shop_reply ? (
        <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 10, gap: 2 }}>
          <AppText variant="caption" color="primary" weight="semibold">{t('shop.reply')}</AppText>
          <AppText variant="bodySmall">{r.shop_reply}</AppText>
        </View>
      ) : onReply ? (
        <Pressable onPress={onReply}>
          <AppText variant="label" color="primary">{t('p.reviews.reply')}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function VariantLine({ variant }: { variant: Record<string, string> | null | undefined }) {
  const v = variantText(variant);
  return v ? <AppText variant="caption" color="textMuted">{v}</AppText> : null;
}
