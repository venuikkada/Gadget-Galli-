import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { formatINR, percentOff } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { PhotoGallery } from '@/shared/components/PhotoViewer';
import { useRecent } from '@/shared/hooks/recent';
import { useCategories } from '@/shared/hooks/reference';
import { useTranslation } from '@/shared/i18n';
import { productShareUrl, shareText } from '@/shared/lib/linking';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Card, Chip, Divider, EmptyState, ErrorState, Header, IconButton, InfoBanner, Row, Screen, SkeletonCard, Tag } from '@/shared/ui';

import { track, useProductPage } from '../api';
import { OfferRow } from '../components/cards';
import { StickyCartBar, useAddToCart, useCartQty } from '../components/cartBits';

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

  const share = () => {
    if (!p) return;
    shareText(t('share.product', { name: p.name, price: formatINR(lowest ?? offers[0]?.price ?? p.mrp), link: productShareUrl(p.id) }));
  };

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
            <View style={{ paddingHorizontal: 16, gap: 10 }}>
              <AppText variant="overline" color="primary">{p!.category.parent_name ? `${p!.category.parent_name} · ${p!.category.name}` : p!.category.name}</AppText>
              <AppText variant="h2" testID="product-title">{p!.name}</AppText>
              {p!.model_number ? <AppText variant="caption" color="textMuted">{t('product.modelNumber')}: {p!.model_number}</AppText> : null}
              {lowest != null ? (
                <View style={{ gap: 2 }}>
                  <AppText variant="caption" color="textMuted">{t('product.lowest')}</AppText>
                  <Row gap={8} align="flex-end">
                    <AppText variant="priceLarge">{formatINR(lowest)}</AppText>
                    {p!.mrp && percentOff(lowest, p!.mrp) > 0 ? (
                      <>
                        <AppText variant="bodySmall" color="textSubtle" strike>{formatINR(p!.mrp)}</AppText>
                        <AppText variant="label" color="success">{t('product.off', { pct: percentOff(lowest, p!.mrp) })}</AppText>
                      </>
                    ) : null}
                  </Row>
                </View>
              ) : null}
              {page.data.variants.length ? (
                <View style={{ gap: 6 }}>
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
                <Row wrap gap={6}>
                  {p!.key_specs.map((k) => (
                    <Tag key={k} label={k} tone="primary" />
                  ))}
                </Row>
              ) : null}
            </View>

            <View style={{ paddingHorizontal: 16, gap: 12 }}>
              <AppText variant="h3">{t('product.availableAt')}</AppText>
              <AppText variant="caption" color="textMuted">{t('product.compareHint')}</AppText>
              {!offers.length ? <EmptyState icon="storefront-outline" title={t('product.noOffers')} compact /> : null}
              {offers.length && !near.length ? <InfoBanner tone="warning" text={t('search.notNearTitle')} /> : null}
              {near.map((o) => (
                <OfferRow
                  key={o.shop_product_id}
                  o={o}
                  productId={p!.id}
                  qty={qtyOf(o.shop_product_id)}
                  onAdd={() => add(o.shop_product_id)}
                  onQty={(q) => setQty(o.shop_product_id, q)}
                />
              ))}
              {elsewhere.length ? (
                <>
                  <AppText variant="label" color="textMuted" style={{ marginTop: 6 }}>{t('product.otherShops')}</AppText>
                  {elsewhere.map((o) => (
                    <OfferRow
                      key={o.shop_product_id}
                      o={o}
                      productId={p!.id}
                      qty={qtyOf(o.shop_product_id)}
                      onAdd={() => add(o.shop_product_id)}
                      onQty={(q) => setQty(o.shop_product_id, q)}
                    />
                  ))}
                </>
              ) : null}
            </View>

            {Object.keys(p!.specs).length ? (
              <View style={{ paddingHorizontal: 16 }}>
                <Card style={{ gap: 0 }}>
                  <AppText variant="h3" style={{ marginBottom: 8 }}>{t('product.specs')}</AppText>
                  {[
                    [t('product.brand'), p!.brand],
                    [t('product.model'), p!.model],
                    ...Object.entries(p!.specs),
                  ]
                    .filter(([, v]) => v)
                    .map(([k, v], i) => (
                      <View key={`${k}-${i}`}>
                        {i > 0 ? <Divider /> : null}
                        <Row align="flex-start" style={{ paddingVertical: 9 }} gap={12}>
                          <AppText variant="bodySmall" color="textMuted" style={{ width: '38%' }}>{k}</AppText>
                          <AppText variant="bodySmall" style={{ flex: 1 }}>{v}</AppText>
                        </Row>
                      </View>
                    ))}
                </Card>
              </View>
            ) : null}
            {p!.in_the_box || p!.description ? (
              <View style={{ paddingHorizontal: 16 }}>
                <Card style={{ gap: 8 }}>
                  {p!.in_the_box ? (
                    <>
                      <AppText variant="title">{t('product.inTheBox')}</AppText>
                      <AppText variant="bodySmall" color="textMuted">{p!.in_the_box}</AppText>
                    </>
                  ) : null}
                  {p!.description ? (
                    <>
                      <AppText variant="title">{t('product.description')}</AppText>
                      <AppText variant="bodySmall" color="textMuted">{p!.description}</AppText>
                    </>
                  ) : null}
                </Card>
              </View>
            ) : null}
            <View style={{ height: 8, backgroundColor: colors.background }} />
          </>
        )}
      </Screen>
      <StickyCartBar />
    </View>
  );
}
