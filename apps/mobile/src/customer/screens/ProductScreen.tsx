import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { formatINR, percentOff, type Offer } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { PhotoGallery } from '@/shared/components/PhotoViewer';
import { useRecent } from '@/shared/hooks/recent';
import { useCategories } from '@/shared/hooks/reference';
import { useTranslation } from '@/shared/i18n';
import { productShareUrl, shareText } from '@/shared/lib/linking';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Card, Chip, EmptyState, ErrorState, Header, IconButton, InfoBanner, Row, Screen, SkeletonCard, Tag, TrustStrip } from '@/shared/ui';

import { track, useProductPage } from '../api';
import { OfferRow } from '../components/cards';
import { StickyCartBar, useAddToCart, useCartQty } from '../components/cartBits';

/**
 * When there is a choice of shops that deliver here, the cheapest in-stock offer is tagged "Best price" and the
 * quickest open one "Fastest delivery" (if it is a different shop and actually quicker).
 */
function offerBadges(near: Offer[]) {
  const badges = new Map<string, 'best' | 'fastest'>();
  const pool = near.filter((o) => o.in_stock);
  if (pool.length < 2) return badges;
  const best = pool.reduce((a, b) => (b.price < a.price ? b : a));
  badges.set(best.shop_product_id, 'best');
  const open = pool.filter((o) => o.is_open_now && o.delivery_mins > 0);
  if (open.length) {
    const fastest = open.reduce((a, b) => (b.delivery_mins < a.delivery_mins ? b : a));
    if (fastest.shop_product_id !== best.shop_product_id && fastest.delivery_mins < best.delivery_mins) badges.set(fastest.shop_product_id, 'fastest');
  }
  return badges;
}

export default function ProductScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const page = useProductPage(id);
  const addRecent = useRecent((s) => s.addProduct);
  const add = useAddToCart();
  const { qtyOf, setQty } = useCartQty();
  useCategories();

  useEffect(() => {
    if (id) {
      addRecent(id);
      track.productView(id);
    }
  }, [id, addRecent]);

  const p = page.data?.product;
  const offers = page.data?.offers ?? [];
  const near = offers.filter((o) => o.delivers);
  const elsewhere = offers.filter((o) => !o.delivers);
  const lowest = near.filter((o) => o.in_stock).reduce<number | null>((m, o) => (m == null || o.price < m ? o.price : m), null);
  const off = lowest != null && p?.mrp ? percentOff(lowest, p.mrp) : 0;
  const badges = offerBadges(near);

  const share = () => {
    if (!p) return;
    shareText(t('share.product', { name: p.name, price: formatINR(lowest ?? offers[0]?.price ?? p.mrp), link: productShareUrl(p.id) }));
  };

  const offerRow = (o: Offer) => (
    <OfferRow
      key={o.shop_product_id}
      o={o}
      productId={p!.id}
      qty={qtyOf(o.shop_product_id)}
      onAdd={() => add(o.shop_product_id)}
      onQty={(q) => setQty(o.shop_product_id, q)}
      badge={badges.get(o.shop_product_id)}
    />
  );

  const specRows = p
    ? ([[t('product.brand'), p.brand], [t('product.model'), p.model], ...Object.entries(p.specs)] as [string, string | null | undefined][]).filter(([, v]) => v)
    : [];

  return (
    <View style={{ flex: 1 }}>
      <Screen
        header={<Header title={p?.brand ?? ''} right={<IconButton icon="share-social-outline" onPress={share} label={t('common.share')} testID="share-product" />} />}
        refreshing={page.isRefetching}
        onRefresh={() => page.refetch()}
        padded={false}
        contentStyle={{ paddingBottom: 120 }}
      >
        {page.isError ? (
          <ErrorState message={errorText(page.error, t)} onRetry={() => page.refetch()} />
        ) : !page.data ? (
          page.isLoading ? (
            <View style={{ padding: 16, gap: 12 }}>
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : (
            <EmptyState icon="cube-outline" title={t('product.noOffers')} />
          )
        ) : (
          <>
            <PhotoGallery photos={p!.photos} categoryId={p!.category.id} brand={p!.brand} name={p!.name} />

            <Card level={2} style={{ marginHorizontal: 16, padding: 16, gap: 10, borderRadius: 20 }}>
              <AppText variant="overline" color="primary">{p!.category.parent_name ? `${p!.category.parent_name} · ${p!.category.name}` : p!.category.name}</AppText>
              <AppText variant="h2" testID="product-title">{p!.name}</AppText>
              {p!.model_number ? <AppText variant="caption" color="textMuted">{t('product.modelNumber')}: {p!.model_number}</AppText> : null}
              {lowest != null ? (
                <View style={{ gap: 6, marginTop: 2 }}>
                  <Row gap={5} style={{ alignSelf: 'flex-start', backgroundColor: colors.accentSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                    <Ionicons name="pricetag" size={12} color={colors.accentInk} />
                    <AppText variant="caption" color="accentInk" weight="bold">{t('product.lowest')}</AppText>
                  </Row>
                  <Row gap={8} align="flex-end" wrap>
                    <AppText variant="priceLarge" style={{ fontSize: 28, lineHeight: 34 }}>{formatINR(lowest)}</AppText>
                    {off > 0 ? (
                      <>
                        <AppText variant="body" color="textSubtle" strike style={{ marginBottom: 4 }}>{formatINR(p!.mrp)}</AppText>
                        <AppText variant="title" color="offer" weight="bold" style={{ marginBottom: 4 }}>{t('product.off', { pct: off })}</AppText>
                      </>
                    ) : null}
                  </Row>
                  {off > 0 ? <AppText variant="caption" color="offer" weight="semibold">{t('cart.savings', { amount: formatINR(p!.mrp! - lowest) })}</AppText> : null}
                </View>
              ) : null}
              {page.data.variants.length ? (
                <View style={{ gap: 6, marginTop: 4 }}>
                  <AppText variant="label" color="textMuted">{t('product.variants')}</AppText>
                  <Row wrap gap={8}>
                    <Chip label={Object.values(p!.variant).join(' · ') || p!.name} selected />
                    {page.data.variants.map((v) => (
                      <Chip key={v.id} label={Object.values(v.variant).join(' · ') || v.name} onPress={() => router.replace(`/product/${v.id}`)} />
                    ))}
                  </Row>
                </View>
              ) : null}
              {p!.key_specs.length ? (
                <Row wrap gap={6} style={{ marginTop: 2 }}>
                  {p!.key_specs.map((k) => (
                    <Tag key={k} label={k} tone="primary" />
                  ))}
                </Row>
              ) : null}
            </Card>

            <TrustStrip style={{ marginHorizontal: 16 }} />

            <View style={{ paddingHorizontal: 16, gap: 4 }}>
              <AppText variant="h3">{t('product.availableAt')}</AppText>
              <AppText variant="caption" color="textMuted">{t('product.compareHint')}</AppText>
            </View>
            {/* Extra room above each row for the "Best price" / "Fastest delivery" tab that sits on its top edge. */}
            <View style={{ paddingHorizontal: 16, gap: 18, paddingTop: badges.size ? 6 : 0, marginTop: -4 }}>
              {!offers.length ? <EmptyState icon="storefront-outline" title={t('product.noOffers')} compact /> : null}
              {offers.length && !near.length ? <InfoBanner tone="warning" text={t('search.notNearTitle')} /> : null}
              {near.map(offerRow)}
              {elsewhere.length ? (
                <>
                  <AppText variant="label" color="textMuted" style={{ marginBottom: -6 }}>{t('product.otherShops')}</AppText>
                  {elsewhere.map(offerRow)}
                </>
              ) : null}
            </View>

            {Object.keys(p!.specs).length ? (
              <View style={{ paddingHorizontal: 16 }}>
                <Card padded={false} style={{ overflow: 'hidden' }}>
                  <Row gap={8} style={{ padding: 14, paddingBottom: 10 }}>
                    <Ionicons name="list" size={18} color={colors.primary} />
                    <AppText variant="h3">{t('product.specs')}</AppText>
                  </Row>
                  {specRows.map(([k, v], i) => (
                    <Row key={`${k}-${i}`} align="flex-start" gap={12} style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: i % 2 === 0 ? colors.surfaceAlt : 'transparent' }}>
                      <AppText variant="bodySmall" color="textMuted" style={{ width: '38%' }}>{k}</AppText>
                      <AppText variant="bodySmall" weight="medium" style={{ flex: 1 }}>{v}</AppText>
                    </Row>
                  ))}
                </Card>
              </View>
            ) : null}
            {p!.in_the_box || p!.description ? (
              <View style={{ paddingHorizontal: 16 }}>
                <Card style={{ gap: 8 }}>
                  {p!.in_the_box ? (
                    <>
                      <Row gap={8}>
                        <Ionicons name="cube-outline" size={18} color={colors.primary} />
                        <AppText variant="title">{t('product.inTheBox')}</AppText>
                      </Row>
                      <AppText variant="bodySmall" color="textMuted">{p!.in_the_box}</AppText>
                    </>
                  ) : null}
                  {p!.description ? (
                    <>
                      <Row gap={8} style={p!.in_the_box ? { marginTop: 6 } : undefined}>
                        <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                        <AppText variant="title">{t('product.description')}</AppText>
                      </Row>
                      <AppText variant="bodySmall" color="textMuted">{p!.description}</AppText>
                    </>
                  ) : null}
                </Card>
              </View>
            ) : null}
          </>
        )}
      </Screen>
      <StickyCartBar />
    </View>
  );
}
