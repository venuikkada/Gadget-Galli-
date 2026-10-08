import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDuration, formatINR, hoursTable, openingHint, type Listing } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { publicUrl } from '@/shared/api/storage';
import { useCategories } from '@/shared/hooks/reference';
import { useTranslation } from '@/shared/i18n';
import { callPhone, openMaps, openWhatsApp, shareText, shopShareUrl } from '@/shared/lib/linking';
import { useTheme } from '@/shared/theme/ThemeProvider';
import {
  AddButton,
  AppText,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
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

function ListingRow({ l, highlighted, qty, onAdd, onQty }: { l: Listing; highlighted?: boolean; qty: number; onAdd: () => void; onQty: (q: number) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card
      onPress={() => router.push(`/item/${l.id}`)}
      style={highlighted ? { borderWidth: 2, borderColor: colors.action } : undefined}
      testID={`listing-${l.id}`}
    >
      <Row align="flex-start" gap={12}>
        <ProductImage path={l.photo} categoryId={l.category_id} brand={l.brand} name={l.name} size={84} />
        <View style={{ flex: 1, gap: 4 }}>
          {highlighted ? <Tag label={t('product.availableAt')} tone="action" icon="sparkles" /> : null}
          <AppText variant="title" numberOfLines={2}>{l.name}</AppText>
          <Row gap={6} wrap>
            {l.condition !== 'new' ? <Tag label={t(`condition.${l.condition}`)} tone="warning" /> : null}
            {l.warranty_months ? <Tag label={`${l.warranty_months}m ${t(l.warranty_type === 'shop' ? 'product.warrantyShop' : 'product.warrantyBrand')}`} /> : null}
          </Row>
          <PriceText price={l.price} mrp={l.mrp} />
          <Row justify="space-between">
            <AppText variant="caption" color={l.in_stock ? 'success' : 'error'} weight="semibold">
              {!l.in_stock ? t('product.outOfStock') : l.stock_qty != null && l.stock_qty <= 3 ? t('product.onlyLeft', { count: l.stock_qty }) : t('product.inStock')}
            </AppText>
            {qty > 0 ? (
              <QtyStepper qty={qty} onChange={onQty} compact max={l.stock_qty ?? 99} />
            ) : (
              <AddButton label={t('common.add')} onPress={onAdd} disabled={!l.in_stock} compact />
            )}
          </Row>
        </View>
      </Row>
    </Card>
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
      <ShopCover name={s.name} path={coverPhoto} height={190 + insets.top}>
        <Row justify="space-between" style={{ position: 'absolute', left: 8, right: 8, top: insets.top + 4 }}>
          <IconButton icon="arrow-back" bg="rgba(15,23,42,0.45)" color="#fff" onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} label={t('common.back')} />
          <Row gap={6}>
            <IconButton icon={s.is_favourite ? 'heart' : 'heart-outline'} bg="rgba(15,23,42,0.45)" color={s.is_favourite ? '#FF6B35' : '#fff'} onPress={() => toggleFavourite(s.id)} label={t('shop.favourite')} testID="favourite-shop" />
            <IconButton icon="share-social-outline" bg="rgba(15,23,42,0.45)" color="#fff" onPress={share} label={t('common.share')} />
          </Row>
        </Row>
      </ShopCover>
      <View style={{ paddingHorizontal: 16, marginTop: -36, gap: 12 }}>
        <Card style={{ gap: 10 }} level={2}>
          <Row align="flex-start" gap={12}>
            <ShopAvatar name={s.name} path={s.logo_path} size={56} />
            <View style={{ flex: 1, gap: 4 }}>
              <Row gap={6}>
                <AppText variant="h3" numberOfLines={2} style={{ flexShrink: 1 }} testID="shop-name">{s.name}</AppText>
                {s.verified ? <VerifiedBadge /> : null}
              </Row>
              <AppText variant="caption" color="textMuted">{[s.area?.name, d.distance_km != null ? `${d.distance_km} km` : null].filter(Boolean).join(' · ')}</AppText>
              <Row gap={10} wrap>
                <Rating value={s.rating_avg} count={s.rating_count} size="md" />
                <AppText variant="caption" color={s.is_open_now ? 'success' : 'error'} weight="semibold">{openingHint(s.hours, s.is_open)}</AppText>
              </Row>
            </View>
          </Row>
          <Divider />
          <Row justify="space-between" align="flex-start">
            <View style={{ flex: 1, gap: 2 }}>
              <Row gap={4}>
                <Ionicons name="bicycle" size={16} color={colors.action} />
                <AppText variant="label">{t('shop.usuallyDelivers', { time: formatDuration(d.delivery_mins) })}</AppText>
              </Row>
              {d.avg_mins && d.orders_delivered ? <AppText variant="caption" color="textMuted">{t('shop.basedOn', { count: d.orders_delivered })}</AppText> : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <AppText variant="caption" color="textMuted">
                {d.charge_type === 'free' ? t('product.freeDelivery') : d.charge_type === 'per_km' ? t('shop.perKm', { amount: formatINR(d.charge) }) : t('shop.flat', { amount: formatINR(d.charge) })}
              </AppText>
              {d.free_above ? <AppText variant="caption" color="success">{t('shop.freeAbove', { amount: formatINR(d.free_above) })}</AppText> : null}
              <AppText variant="caption" color="textMuted">{d.min_order ? t('shop.minOrder', { amount: formatINR(d.min_order) }) : t('shop.noMinOrder')}</AppText>
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
                    <AppText variant="bodySmall" color="textMuted">{h.label}</AppText>
                    <AppText variant="bodySmall" color={h.text === 'Closed' ? 'error' : 'text'}>{h.text}</AppText>
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
