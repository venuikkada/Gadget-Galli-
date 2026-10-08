import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { deliversInText, formatINR, percentOff, variantText } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { PhotoGallery } from '@/shared/components/PhotoViewer';
import { useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Card, Divider, ErrorState, Header, Loading, QtyStepper, Rating, Row, Screen, ShopAvatar, SwitchRow, Tag, VerifiedBadge } from '@/shared/ui';

import { cartUpdate, useShopProduct } from '../api';
import { useAddToCart, useCartQty } from '../components/cartBits';

/** Product detail inside a shop: photos (swipe, zoom), variant, condition, price, warranty, stock, installation. */
export default function ShopItemScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useShopProduct(id);
  const add = useAddToCart();
  const { qtyOf, setQty, cart } = useCartQty();
  const [withInstall, setWithInstall] = useState(false);
  const item = q.data;
  const qty = item ? qtyOf(item.id) : 0;
  const inCartInstall = cart?.items.find((i) => i.shop_product_id === item?.id)?.with_installation ?? false;

  if (q.isError) return <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} />;
  if (!item) return <Screen header={<Header />}>{q.isLoading ? <Loading /> : null}</Screen>;

  const off = percentOff(item.price, item.mrp);
  const addNow = async () => {
    const ok = await add(item.id);
    if (ok && withInstall && item.installation_available) await cartUpdate({ installation: { [item.id]: true } });
  };

  return (
    <Screen
      header={<Header title={item.shop.name} />}
      padded={false}
      footer={
        <Row gap={12}>
          <View style={{ flex: 1 }}>
            <AppText variant="priceLarge">{formatINR(item.price)}</AppText>
            {item.installation_available && (withInstall || inCartInstall) ? (
              <AppText variant="caption" color="textMuted">+ {t('product.installation', { amount: formatINR(item.installation_charge) })}</AppText>
            ) : null}
          </View>
          {qty > 0 ? (
            <Row gap={8}>
              <QtyStepper qty={qty} onChange={(n) => setQty(item.id, n)} max={item.stock_qty ?? 99} />
              <Button title={t('cart.view')} variant="primary" onPress={() => router.push('/cart')} />
            </Row>
          ) : (
            <Button testID="add-to-cart" title={t('product.addToCart')} icon="cart" variant="action" size="lg" disabled={!item.in_stock || !item.is_active} onPress={addNow} style={{ flex: 1.3 }} />
          )}
        </Row>
      }
    >
      <PhotoGallery photos={item.photos} categoryId={item.category.id} brand={item.brand} name={item.name} />
      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        <AppText variant="overline" color="primary">{item.brand} · {item.category.name}</AppText>
        <AppText variant="h2">{item.name}</AppText>
        <Row gap={8} wrap>
          {variantText(item.variant) ? <Tag label={variantText(item.variant)} tone="primary" /> : null}
          <Tag label={t(`condition.${item.condition}`)} tone={item.condition === 'new' ? 'success' : 'warning'} />
          <Tag label={item.warranty_months ? t('product.warranty', { months: item.warranty_months, type: t(item.warranty_type === 'shop' ? 'product.warrantyShop' : 'product.warrantyBrand') }) : t('product.noWarranty')} icon="shield-checkmark-outline" />
        </Row>
        <Row gap={8} align="flex-end">
          <AppText variant="priceLarge">{formatINR(item.price)}</AppText>
          {off > 0 ? (
            <>
              <AppText variant="bodySmall" color="textSubtle" strike>{t('product.mrp')} {formatINR(item.mrp)}</AppText>
              <AppText variant="label" color="success">{t('product.off', { pct: off })}</AppText>
            </>
          ) : null}
        </Row>
        <AppText variant="label" color={item.in_stock ? 'success' : 'error'}>
          {!item.in_stock ? t('product.outOfStock') : item.stock_qty != null && item.stock_qty <= 3 ? t('product.onlyLeft', { count: item.stock_qty }) : t('product.inStock')}
        </AppText>
        {item.installation_available ? (
          <Card>
            <SwitchRow
              label={t('product.addInstallation', { amount: formatINR(item.installation_charge) })}
              value={qty > 0 ? inCartInstall : withInstall}
              onValueChange={(v) => (qty > 0 ? cartUpdate({ installation: { [item.id]: v } }) : setWithInstall(v))}
            />
          </Card>
        ) : null}
        <Card onPress={() => router.push(`/shop/${item.shop.id}`)}>
          <Row gap={12}>
            <ShopAvatar name={item.shop.name} size={42} />
            <View style={{ flex: 1, gap: 2 }}>
              <Row gap={6}>
                <AppText variant="title">{item.shop.name}</AppText>
                {item.shop.verified ? <VerifiedBadge small /> : null}
              </Row>
              <Row gap={8}>
                <Rating value={item.shop.rating_avg} count={item.shop.rating_count} />
                <AppText variant="caption" color={item.shop.delivers_to_me ? 'textMuted' : 'warning'}>
                  {item.shop.delivers_to_me ? deliversInText(item.shop.delivery_mins) : t('product.doesNotDeliver')}
                </AppText>
              </Row>
            </View>
            <AppText variant="label" color="primary">{t('product.viewShop')}</AppText>
          </Row>
        </Card>
        {item.key_specs.length ? (
          <Row wrap gap={6}>
            {item.key_specs.map((k) => (
              <Tag key={k} label={k} />
            ))}
          </Row>
        ) : null}
        {Object.keys(item.specs).length ? (
          <Card>
            <AppText variant="h3" style={{ marginBottom: 6 }}>{t('product.specs')}</AppText>
            {[[t('product.model'), item.model], [t('product.modelNumber'), item.model_number], ...Object.entries(item.specs)]
              .filter(([, v]) => v)
              .map(([k, v], i) => (
                <View key={`${k}${i}`}>
                  {i > 0 ? <Divider /> : null}
                  <Row align="flex-start" gap={12} style={{ paddingVertical: 8 }}>
                    <AppText variant="bodySmall" color="textMuted" style={{ width: '38%' }}>{k}</AppText>
                    <AppText variant="bodySmall" style={{ flex: 1 }}>{v}</AppText>
                  </Row>
                </View>
              ))}
          </Card>
        ) : null}
        {item.in_the_box ? (
          <Card style={{ gap: 4 }}>
            <AppText variant="title">{t('product.inTheBox')}</AppText>
            <AppText variant="bodySmall" color="textMuted">{item.in_the_box}</AppText>
          </Card>
        ) : null}
        {item.description ? (
          <Card style={{ gap: 4 }}>
            <AppText variant="title">{t('product.description')}</AppText>
            <AppText variant="bodySmall" color="textMuted">{item.description}</AppText>
          </Card>
        ) : null}
        <View style={{ height: 12, backgroundColor: colors.background }} />
      </View>
    </Screen>
  );
}
