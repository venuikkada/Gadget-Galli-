import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { buildWhatsAppOrderMessage, formatINR, variantText, type CartProblem, type ContactMethod } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { useProfile } from '@/shared/hooks/profile';
import { useCategories } from '@/shared/hooks/reference';
import { useTranslation } from '@/shared/i18n';
import { tDeliversIn } from '@/shared/i18n/format';
import { callPhone, openMaps, openWhatsApp } from '@/shared/lib/linking';
import { useTheme } from '@/shared/theme/ThemeProvider';
import {
  AppText,
  Button,
  Card,
  confirmDialog,
  Divider,
  EmptyState,
  Header,
  InfoBanner,
  Input,
  Loading,
  OpenDot,
  ProductImage,
  QtyStepper,
  Row,
  Screen,
  Segmented,
  Sheet,
  ShopAvatar,
  SwitchRow,
  Tag,
  toast,
} from '@/shared/ui';

import { cartClear, cartUpdate, placeOrder, useCart } from '../api';
import { useCartQty } from '../components/cartBits';

const BLOCKING: CartProblem[] = ['SHOP_CLOSED', 'AREA_NOT_SERVED', 'MIN_ORDER_NOT_MET', 'ITEM_UNAVAILABLE', 'ADDRESS_REQUIRED', 'PICKUP_NOT_AVAILABLE', 'SHOP_UNAVAILABLE'];

export default function CartScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: cart, isLoading, refetch, isRefetching } = useCart();
  const { data: profile } = useProfile();
  const { setQty } = useCartQty();
  const [note, setNote] = useState('');
  const [addrOpen, setAddrOpen] = useState(false);
  const [placing, setPlacing] = useState<ContactMethod | null>(null);
  useCategories();

  useEffect(() => {
    setNote(cart?.cart.note ?? '');
  }, [cart?.cart.note]);

  if (isLoading) return <Screen header={<Header title={t('cart.title')} back={false} />}><Loading /></Screen>;

  if (!cart || !cart.items.length || !cart.shop) {
    return (
      <Screen header={<Header title={t('cart.title')} back={false} />}>
        <EmptyState icon="cart-outline" title={t('cart.emptyTitle')} body={t('cart.emptyBody')} action={t('cart.startShopping')} onAction={() => router.push('/search')} />
      </Screen>
    );
  }

  const shop = cart.shop;
  const pickup = cart.cart.fulfilment === 'pickup';
  const blocking = cart.problems.filter((p) => BLOCKING.includes(p));

  const order = async (method: ContactMethod) => {
    if (note !== (cart.cart.note ?? '')) await cartUpdate({ note }).catch(() => undefined);
    setPlacing(method);
    try {
      const o = await placeOrder(method);
      router.replace(`/order/${o.id}`);
      if (method === 'call') {
        callPhone(shop.contact_phone);
      } else {
        const message = buildWhatsAppOrderMessage({
          orderNo: o.order_no,
          shopName: shop.name,
          customerName: o.customer_name,
          items: o.items,
          itemTotal: o.item_total + o.installation_total,
          deliveryCharge: o.delivery_charge,
          grandTotal: o.grand_total,
          fulfilment: o.fulfilment,
          address: o.address,
          note: o.note,
        });
        openWhatsApp(shop.whatsapp_phone ?? shop.contact_phone, message);
      }
    } catch (e) {
      toast(errorText(e, t), 'error');
      refetch();
    } finally {
      setPlacing(null);
    }
  };

  return (
    <Screen
      header={
        <Header
          title={t('cart.title')}
          back={false}
          right={
            <Button
              title={t('common.clearAll')}
              variant="ghost"
              size="sm"
              onPress={async () => {
                if (await confirmDialog({ title: t('common.clearAll'), destructive: true, confirmText: t('common.remove'), cancelText: t('common.cancel') })) cartClear();
              }}
            />
          }
        />
      }
      refreshing={isRefetching}
      onRefresh={refetch}
      footer={
        <View style={{ gap: 10 }}>
          <Button
            testID="call-to-order"
            title={t('cart.callToOrder')}
            subtitle={formatINR(cart.totals.grand_total)}
            icon="call"
            variant="action"
            size="xl"
            full
            disabled={blocking.length > 0}
            loading={placing === 'call'}
            onPress={() => order('call')}
          />
          <Button
            testID="whatsapp-order"
            title={t('cart.whatsappOrder')}
            icon="logo-whatsapp"
            variant="whatsapp"
            size="lg"
            full
            disabled={blocking.length > 0}
            loading={placing === 'whatsapp'}
            onPress={() => order('whatsapp')}
          />
          <Row gap={6} align="flex-start">
            <Ionicons name="shield-checkmark" size={15} color={colors.success} style={{ marginTop: 1 }} />
            <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>{t('cart.safety')}</AppText>
          </Row>
        </View>
      }
    >
      {/* Shop */}
      <Card onPress={() => router.push(`/shop/${shop.id}`)}>
        <Row gap={12}>
          <ShopAvatar name={shop.name} path={shop.logo_path} size={46} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="title">{shop.name}</AppText>
            <AppText variant="caption" color="textMuted">{[shop.area, tDeliversIn(shop.delivery_mins)].filter(Boolean).join(' · ')}</AppText>
            <OpenDot open={shop.is_open_now} />
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
        </Row>
      </Card>

      {/* Items */}
      <Card style={{ gap: 12 }}>
        {cart.items.map((i, idx) => (
          <View key={i.shop_product_id} style={{ gap: 8 }}>
            {idx > 0 ? <Divider /> : null}
            <Row align="flex-start" gap={12}>
              <ProductImage path={i.photo} categoryId={i.category_id} brand={i.brand} name={i.name} size={60} />
              <View style={{ flex: 1, gap: 3 }}>
                <AppText variant="bodySmall" weight="semibold" numberOfLines={2}>{i.name}</AppText>
                <Row gap={6} wrap>
                  {variantText(i.variant) ? <AppText variant="caption" color="textMuted">{variantText(i.variant)}</AppText> : null}
                  {i.condition !== 'new' ? <Tag label={t(`condition.${i.condition}`)} tone="warning" /> : null}
                  {!i.in_stock ? <Tag label={t('product.outOfStock')} tone="error" /> : null}
                </Row>
                <Row justify="space-between">
                  <AppText variant="price">{formatINR(i.price * i.qty)}</AppText>
                  <QtyStepper qty={i.qty} onChange={(q) => setQty(i.shop_product_id, q)} compact max={i.stock_qty ?? 99} />
                </Row>
              </View>
            </Row>
            {i.installation_available ? (
              <SwitchRow
                label={`${t('cart.withInstallation')} (+${formatINR((i.installation_charge ?? 0) * i.qty)})`}
                value={i.with_installation}
                onValueChange={(v) => cartUpdate({ installation: { [i.shop_product_id]: v } })}
              />
            ) : null}
          </View>
        ))}
      </Card>

      {/* Delivery or pickup */}
      <Card style={{ gap: 12 }}>
        <Segmented
          value={cart.cart.fulfilment}
          onChange={(v) => cartUpdate({ fulfilment: v })}
          options={[
            { value: 'delivery', label: t('cart.homeDelivery') },
            ...(shop.store_pickup ? [{ value: 'pickup' as const, label: t('cart.pickup') }] : []),
          ]}
        />
        {pickup ? (
          <Pressable onPress={() => openMaps(shop.lat, shop.lng, shop.name)}>
            <Row gap={10} align="flex-start">
              <Ionicons name="storefront-outline" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <AppText variant="label" color="textMuted">{t('cart.pickupFrom')}</AppText>
                <AppText variant="bodySmall">{shop.address_line}</AppText>
                <AppText variant="label" color="primary">{t('shop.openInMaps')}</AppText>
              </View>
            </Row>
          </Pressable>
        ) : cart.address ? (
          <Row gap={10} align="flex-start">
            <Ionicons name="location" size={20} color={colors.action} />
            <View style={{ flex: 1 }}>
              <AppText variant="label" color="textMuted">{t('cart.deliverTo')}</AppText>
              <AppText variant="bodySmall">{[cart.address.house, cart.address.building, cart.address.street, cart.address.area_name, cart.address.pincode].filter(Boolean).join(', ')}</AppText>
              {cart.address.landmark ? <AppText variant="caption" color="textMuted">{cart.address.landmark}</AppText> : null}
            </View>
            <AppText variant="label" color="primary" onPress={() => setAddrOpen(true)}>{t('common.change')}</AppText>
          </Row>
        ) : (
          <Button title={t('cart.addAddress')} icon="add" variant="secondary" onPress={() => router.push({ pathname: '/address', params: { forCart: '1' } })} />
        )}
      </Card>

      {cart.problems.map((p) => (
        <InfoBanner key={p} tone={p === 'SHOP_CLOSED' ? 'warning' : 'error'} text={t(`cart.problem.${p}`, { amount: formatINR(cart.totals.min_order_gap) })} />
      ))}

      <Input label={t('cart.noteLabel')} placeholder={t('cart.notePlaceholder')} value={note} onChangeText={setNote} onBlur={() => note !== (cart.cart.note ?? '') && cartUpdate({ note })} multiline />

      {/* Bill */}
      <Card style={{ gap: 8 }}>
        <AppText variant="title">{t('cart.billDetails')}</AppText>
        <Row justify="space-between">
          <AppText variant="bodySmall" color="textMuted">{t('cart.itemTotal')}</AppText>
          <AppText variant="bodySmall">{formatINR(cart.totals.item_total)}</AppText>
        </Row>
        {cart.totals.installation_total > 0 ? (
          <Row justify="space-between">
            <AppText variant="bodySmall" color="textMuted">{t('cart.installation')}</AppText>
            <AppText variant="bodySmall">{formatINR(cart.totals.installation_total)}</AppText>
          </Row>
        ) : null}
        {!pickup ? (
          <Row justify="space-between">
            <AppText variant="bodySmall" color="textMuted">{t('cart.delivery')}</AppText>
            <AppText variant="bodySmall" color={cart.totals.delivery_charge === 0 ? 'success' : 'text'}>
              {cart.totals.delivery_charge === 0 ? t('common.free') : formatINR(cart.totals.delivery_charge)}
            </AppText>
          </Row>
        ) : null}
        <Divider />
        <Row justify="space-between">
          <AppText variant="title">{t('cart.grandTotal')}</AppText>
          <AppText variant="priceLarge" testID="grand-total">{formatINR(cart.totals.grand_total)}</AppText>
        </Row>
      </Card>
      <AppText variant="caption" color="textMuted" align="center">{t('cart.orderHint')}</AppText>

      <Sheet visible={addrOpen} onClose={() => setAddrOpen(false)} title={t('cart.deliverTo')}>
        {profile?.addresses.map((a) => (
          <Card
            key={a.id}
            onPress={async () => {
              setAddrOpen(false);
              await cartUpdate({ address_id: a.id });
            }}
            style={a.id === cart.cart.address_id ? { borderWidth: 2, borderColor: colors.primary } : undefined}
          >
            <AppText variant="title">{a.label === 'other' ? a.label_custom || t('address.other') : t(`address.${a.label}`)}</AppText>
            <AppText variant="caption" color="textMuted">{[a.house, a.building, a.street, a.area_name, a.pincode].filter(Boolean).join(', ')}</AppText>
          </Card>
        ))}
        <Button
          title={t('address.addNew')}
          icon="add"
          variant="secondary"
          onPress={() => {
            setAddrOpen(false);
            router.push({ pathname: '/address', params: { forCart: '1' } });
          }}
        />
      </Sheet>

      <Modal visible={!!placing} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 24, alignItems: 'center', gap: 12, width: 280 }}>
            <Loading />
            <AppText variant="title" align="center">{t('cart.placing')}</AppText>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
