import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatINR, hoursTable, type Listing } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { publicUrl } from '@/shared/api/storage';
import { useCategories } from '@/shared/hooks/reference';
import { useTranslation } from '@/shared/i18n';
import { tDuration, tOpening, tWeekday } from '@/shared/i18n/format';
import { callPhone, openMaps, openWhatsApp, shareText, shopShareUrl } from '@/shared/lib/linking';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { shadow } from '@/shared/theme/tokens';
import {
  AddButton,
  AppText,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  InfoBanner,
  Input,
  Loading,
  PriceText,
  ProductImage,
  QtyStepper,
  Rating,
  Row,
  Segmented,
  ShopAvatar,
  ShopCover,
  Skeleton,
  Tag,
  VerifiedBadge,
} from '@/shared/ui';

import { toggleFavourite, track, useShopCatalog, useShopPage, useShopReviews } from '../api';
import { ReviewItem } from '../components/cards';
import { StickyCartBar, useAddToCart, useCartQty } from '../components/cartBits';

/** Item row: details on the left, photo on the right with ADD sitting on its bottom edge. */
function ListingRow({ l, highlighted, qty, onAdd, onQty }: { l: Listing; highlighted?: boolean; qty: number; onAdd: () => void; onQty: (q: number) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card
      onPress={() => router.push(`/item/${l.id}`)}
      style={highlighted ? { borderWidth: 2, borderColor: colors.accent } : undefined}
      testID={`listing-${l.id}`}
    >
      <Row align="flex-start" gap={14}>
        <View style={{ flex: 1, gap: 5 }}>
          {highlighted ? <Tag label={t('product.availableAt')} tone="accent" icon="sparkles" /> : null}
          <AppText variant="title" numberOfLines={2}>{l.name}</AppText>
          <PriceText price={l.price} mrp={l.mrp} />
          {l.condition !== 'new' || l.warranty_months ? (
            <Row gap={6} wrap>
              {l.condition !== 'new' ? <Tag label={t(`condition.${l.condition}`)} tone="warning" /> : null}
              {l.warranty_months ? <Tag label={`${l.warranty_months}m ${t(l.warranty_type === 'shop' ? 'product.warrantyShop' : 'product.warrantyBrand')}`} icon="shield-checkmark-outline" /> : null}
            </Row>
          ) : null}
          <Row gap={4}>
            <Ionicons name={l.in_stock ? 'checkmark-circle' : 'close-circle'} size={13} color={l.in_stock ? colors.success : colors.error} />
            <AppText variant="caption" color={l.in_stock ? 'success' : 'error'} weight="semibold">
              {!l.in_stock ? t('product.outOfStock') : l.stock_qty != null && l.stock_qty <= 3 ? t('product.onlyLeft', { count: l.stock_qty }) : t('product.inStock')}
            </AppText>
          </Row>
        </View>
        <View style={{ width: 112, alignItems: 'center', paddingBottom: 18 }}>
          <ProductImage path={l.photo} categoryId={l.category_id} brand={l.brand} name={l.name} size={112} radius={14} />
          <View style={{ position: 'absolute', bottom: 0 }}>
            {qty > 0 ? (
              <QtyStepper qty={qty} onChange={onQty} compact max={l.stock_qty ?? 99} />
            ) : (
              <AddButton label={t('common.add')} onPress={onAdd} disabled={!l.in_stock} compact />
            )}
          </View>
        </View>
      </Row>
    </Card>
  );
}

/** White round button that stays readable on any cover photo. */
function RoundButton({ icon, onPress, label, color, testID }: { icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; label: string; color?: string; testID?: string }) {
  const { colors, dark } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.elevated, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 }, shadow(2, dark)]}
    >
      <Ionicons name={icon} size={21} color={color ?? colors.text} />
    </Pressable>
  );
}

export default function ShopScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id, highlight } = useLocalSearchParams<{ id: string; highlight?: string }>();
  const shop = useShopPage(id);
  const [tab, setTab] = useState<'products' | 'reviews' | 'about'>('products');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState<number | null>(null);
  const catalog = useShopCatalog(id, debounced, category);
  const reviews = useShopReviews(tab === 'reviews' ? id : undefined, 30);
  const add = useAddToCart();
  const { qtyOf, setQty } = useCartQty();
  useCategories();

  useEffect(() => {
    const h = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(h);
  }, [query]);
  useEffect(() => {
    if (id) track.shop(id, 'view');
  }, [id]);

  const s = shop.data;
  const listings = useMemo(() => {
    const all = catalog.data?.pages.flatMap((p) => p.items) ?? [];
    if (!highlight) return all;
    const h = all.find((l) => l.id === highlight);
    return h ? [h, ...all.filter((l) => l.id !== highlight)] : all;
  }, [catalog.data, highlight]);

  if (shop.isError) return <ErrorState message={errorText(shop.error, t)} onRetry={() => shop.refetch()} />;
  if (!s) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {shop.isLoading ? (
          <View style={{ gap: 12 }}>
            <Skeleton height={190} radius={0} />
            <View style={{ padding: 16, gap: 12 }}>
              <Skeleton width="60%" height={22} />
              <Skeleton width="40%" />
            </View>
          </View>
        ) : (
          <EmptyState icon="storefront-outline" title={t('common.somethingWrong')} action={t('common.back')} onAction={() => router.back()} />
        )}
      </View>
    );
  }

  const d = s.delivery;
  const share = () => {
    track.shop(s.id, 'share');
    shareText(t('share.shop', { name: s.name, link: shopShareUrl(s.id) }));
  };
  const coverPhoto = s.photos.find((p) => p.kind === 'front' || p.kind === 'cover')?.path ?? s.cover_path;
  const inside = s.photos.filter((p) => p.kind === 'inside');

  const header = (
    <View>
      <ShopCover name={s.name} path={coverPhoto} type={s.shop_types?.[0]} height={200 + insets.top}>
        <LinearGradient colors={['rgba(0,0,0,0.38)', 'rgba(0,0,0,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: insets.top + 70 }} />
        <Row justify="space-between" style={{ position: 'absolute', left: 12, right: 12, top: insets.top + 8 }}>
          <RoundButton icon="arrow-back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} label={t('common.back')} />
          <Row gap={10}>
            <RoundButton icon={s.is_favourite ? 'heart' : 'heart-outline'} color={s.is_favourite ? colors.error : undefined} onPress={() => toggleFavourite(s.id)} label={t('shop.favourite')} testID="favourite-shop" />
            <RoundButton icon="share-social-outline" onPress={share} label={t('common.share')} />
          </Row>
        </Row>
      </ShopCover>
      <View style={{ paddingHorizontal: 16, marginTop: -44, gap: 14 }}>
        <Card style={{ gap: 12, borderRadius: 20, padding: 16 }} level={3}>
          <Row align="flex-start" gap={12}>
            <View style={{ borderRadius: 20, borderWidth: 3, borderColor: colors.surface, marginTop: -40, backgroundColor: colors.surface }}>
              <ShopAvatar name={s.name} path={s.logo_path} size={64} />
            </View>
            <View style={{ flex: 1 }} />
            <Row gap={4} style={{ backgroundColor: s.is_open_now ? colors.successSoft : colors.errorSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: s.is_open_now ? colors.success : colors.error }} />
              <AppText variant="caption" color={s.is_open_now ? 'success' : 'error'} weight="bold">{tOpening(s.hours, s.is_open)}</AppText>
            </Row>
          </Row>
          <View style={{ gap: 4 }}>
            <Row gap={6}>
              <AppText variant="h2" numberOfLines={2} style={{ flexShrink: 1 }} testID="shop-name">{s.name}</AppText>
              {s.verified ? <VerifiedBadge /> : null}
            </Row>
            <Row gap={10} wrap>
              <Rating value={s.rating_avg} count={s.rating_count} size="md" />
              <Row gap={3}>
                <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                <AppText variant="bodySmall" color="textMuted">{[s.area?.name, d.distance_km != null ? `${d.distance_km} km` : null].filter(Boolean).join(' · ')}</AppText>
              </Row>
            </Row>
          </View>
          <Row align="flex-start" gap={10} style={{ backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12 }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="bicycle" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="label">{t('shop.usuallyDelivers', { time: tDuration(d.delivery_mins) })}</AppText>
              {d.avg_mins && d.orders_delivered ? <AppText variant="caption" color="textMuted">{t('shop.basedOn', { count: d.orders_delivered })}</AppText> : null}
              <AppText variant="caption" color="textMuted">
                {d.charge_type === 'free' ? t('product.freeDelivery') : d.charge_type === 'per_km' ? t('shop.perKm', { amount: formatINR(d.charge) }) : t('shop.flat', { amount: formatINR(d.charge) })}
                {' · '}
                {d.min_order ? t('shop.minOrder', { amount: formatINR(d.min_order) }) : t('shop.noMinOrder')}
              </AppText>
              {d.free_above ? <AppText variant="caption" color="offer" weight="semibold">{t('shop.freeAbove', { amount: formatINR(d.free_above) })}</AppText> : null}
            </View>
          </Row>
          <Row gap={8}>
            <Button title={t('shop.call')} icon="call" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => { track.shop(s.id, 'call'); callPhone(s.contact_phone); }} />
            <Button title={t('common.whatsapp')} icon="logo-whatsapp" variant="whatsapp" size="sm" style={{ flex: 1 }} onPress={() => { track.shop(s.id, 'whatsapp'); openWhatsApp(s.whatsapp_phone); }} />
            <Button title="" icon="navigate" variant="outline" size="sm" onPress={() => openMaps(s.lat, s.lng, `${s.name} ${s.area?.name ?? ''}`)} />
          </Row>
        </Card>
        {!d.delivers_to_me ? <InfoBanner tone="warning" text={t('shop.notDeliverHere')} /> : null}
        {inside.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {inside.map((ph) => (
              <Image key={ph.id} source={{ uri: publicUrl('shop-media', ph.path) ?? undefined }} style={{ width: 120, height: 86, borderRadius: 12, backgroundColor: colors.surfaceAlt }} contentFit="cover" />
            ))}
          </ScrollView>
        ) : null}
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'products', label: t('shop.products') },
            { value: 'reviews', label: `${t('shop.reviews')} (${s.rating_count})` },
            { value: 'about', label: t('shop.about') },
          ]}
        />
        {tab === 'products' ? (
          <View style={{ gap: 10 }}>
            <Input icon="search" placeholder={t('shop.searchIn')} value={query} onChangeText={setQuery} testID="shop-search" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip label={t('shop.all')} selected={category == null} onPress={() => setCategory(null)} />
              {s.tabs.map((tb) => (
                <Chip key={tb.category_id} label={tb.name} count={tb.count} selected={category === tb.category_id} onPress={() => setCategory(tb.category_id)} />
              ))}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </View>
  );

  const reviewSummary = reviews.data?.summary;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={tab === 'products' ? listings : []}
        keyExtractor={(l) => l.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 16 }}>
            <ListingRow l={item} highlighted={item.id === highlight} qty={qtyOf(item.id)} onAdd={() => add(item.id)} onQty={(q) => setQty(item.id, q)} />
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110, gap: 0 }}
        onEndReached={() => tab === 'products' && catalog.hasNextPage && !catalog.isFetchingNextPage && catalog.fetchNextPage()}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          tab === 'products' ? (
            catalog.isLoading ? <Loading /> : <EmptyState icon="cube-outline" title={t('shop.noProducts')} compact />
          ) : tab === 'reviews' ? (
            <View style={{ padding: 16, gap: 8 }}>
              {reviews.isLoading ? <Loading /> : null}
              {reviewSummary && reviewSummary.count ? (
                <Card style={{ gap: 6 }}>
                  <Row gap={16}>
                    <View style={{ alignItems: 'center' }}>
                      <AppText variant="display">{reviewSummary.avg}</AppText>
                      <AppText variant="caption" color="textMuted">{t('shop.ratings', { count: reviewSummary.count })}</AppText>
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      {(['5', '4', '3', '2', '1'] as const).map((k) => (
                        <Row key={k} gap={6}>
                          <AppText variant="caption" style={{ width: 14 }}>{k}</AppText>
                          <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt }}>
                            <View style={{ width: `${(reviewSummary.dist[k] / reviewSummary.count) * 100}%`, height: 6, borderRadius: 3, backgroundColor: Number(k) >= 4 ? colors.success : Number(k) === 3 ? colors.warning : colors.error }} />
                          </View>
                        </Row>
                      ))}
                    </View>
                  </Row>
                </Card>
              ) : null}
              {reviews.data && !reviews.data.items.length ? <EmptyState icon="chatbubble-ellipses-outline" title={t('shop.noReviews')} compact /> : null}
              {reviews.data?.items.map((r) => (
                <Card key={r.id}>
                  <ReviewItem r={r} />
                </Card>
              ))}
            </View>
          ) : (
            <View style={{ padding: 16, gap: 12 }}>
              {s.description ? (
                <Card style={{ gap: 6 }}>
                  <AppText variant="title">{t('shop.about')}</AppText>
                  <AppText variant="bodySmall" color="textMuted">{s.description}</AppText>
                </Card>
              ) : null}
              <Card style={{ gap: 6 }}>
                <AppText variant="title">{t('shop.hours')}</AppText>
                {hoursTable(s.hours).map((h) => (
                  <Row key={h.day} justify="space-between">
                    <AppText variant="bodySmall" color="textMuted">{tWeekday(h.day)}</AppText>
                    <AppText variant="bodySmall" color={h.closed ? 'error' : 'text'}>{h.closed ? t('time.closed') : h.allDay ? t('time.allDay') : h.range}</AppText>
                  </Row>
                ))}
              </Card>
              <Card style={{ gap: 6 }}>
                <AppText variant="title">{t('shop.deliveryAreas')}</AppText>
                {d.mode === 'radius' ? (
                  <AppText variant="bodySmall" color="textMuted">{t('shop.within', { km: d.radius_km })}</AppText>
                ) : (
                  <Row wrap gap={6}>
                    {[...d.zones, ...d.areas].map((z) => (
                      <Tag key={z} label={z} tone="primary" />
                    ))}
                  </Row>
                )}
                <AppText variant="bodySmall" color="textMuted">{d.store_pickup ? t('shop.pickupYes') : t('shop.pickupNo')}</AppText>
              </Card>
              <Card style={{ gap: 8 }}>
                <AppText variant="title">{t('address.title')}</AppText>
                <AppText variant="bodySmall" color="textMuted">{[s.address_line, s.landmark, s.area?.name, s.pincode].filter(Boolean).join(', ')}</AppText>
                <Pressable onPress={() => openMaps(s.lat, s.lng, s.name)}>
                  <Row gap={6}>
                    <Ionicons name="map" size={16} color={colors.primary} />
                    <AppText variant="label" color="primary">{t('shop.openInMaps')}</AppText>
                  </Row>
                </Pressable>
              </Card>
            </View>
          )
        }
        ListFooterComponent={catalog.isFetchingNextPage ? <Loading /> : null}
      />
      <StickyCartBar />
    </View>
  );
}
