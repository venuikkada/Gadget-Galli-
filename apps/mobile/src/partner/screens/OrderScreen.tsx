import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { formatINR, formatPhone, mapsUrl, nextShopStep, variantText } from '@gg/shared';
import { directionsUrl } from '@gg/shared/map';

import { OrderTimeline } from '@/shared/components/OrderTimeline';
import { RouteFacts, RouteMap } from '@/shared/components/RouteMap';
import { errorText } from '@/shared/api/rpc';
import { signedUrl } from '@/shared/api/storage';
import { useOrder } from '@/shared/hooks/order';
import { useRealtime } from '@/shared/hooks/realtime';
import { useTranslation } from '@/shared/i18n';
import { tAgo } from '@/shared/i18n/format';
import { callPhone, openMaps, openUrl, openWhatsApp, shareOnWhatsApp } from '@/shared/lib/linking';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Card, Divider, ErrorState, Header, InfoBanner, Loading, ProductImage, Row, Screen, StatusChip, Tag } from '@/shared/ui';

import { ConfirmSheet, DispatchSheet, PackSheet, PaySheet, RejectSheet } from '../components/orderSheets';

type SheetName = 'confirm' | 'reject' | 'pay' | 'pack' | 'dispatch' | 'update' | null;

/** Shop's order screen: one big button per step. */
export default function PartnerOrderScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useOrder(id);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [media, setMedia] = useState<{ label: string; uri: string }[]>([]);
  useRealtime(`porder-${id}`, 'orders', `id=eq.${id}`, () => q.refetch(), !!id);

  const o = q.data;
  useEffect(() => {
    if (!o) return;
    const list: [string, string | null | undefined][] = [
      [t('p.order.paymentProof'), o.payments[0]?.proof_path],
      [t('p.pack.packagePhoto'), o.pack_photo_path],
      [t('p.pack.billPhoto'), o.bill_photo_path],
    ];
    Promise.all(list.filter(([, p]) => p).map(async ([label, p]) => ({ label, uri: (await signedUrl('order-media', p)) ?? '' }))).then((r) => setMedia(r.filter((m) => m.uri)));
  }, [o, t]);

  if (q.isError) return <Screen header={<Header />}><ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} /></Screen>;
  if (!o) return <Screen header={<Header />}><Loading /></Screen>;

  const status = o.status === 'ISSUE_REPORTED' && o.status_before_issue ? o.status_before_issue : o.status;
  const step = nextShopStep(status);
  const issue = o.issues.find((i) => i.status !== 'resolved');
  const addressText = [o.address?.house, o.address?.building, o.address?.street, o.address?.area, o.address?.pincode].filter(Boolean).join(', ');
  // Everything a rider needs in one WhatsApp message, with a map link to the customer's exact pin.
  const sendToRider = () =>
    shareOnWhatsApp(
      t('map.riderMessage', {
        order: o.order_no,
        name: o.customer_name ?? '',
        phone: o.customer_phone ? formatPhone(o.customer_phone) : '',
        address: [addressText, o.address?.landmark].filter(Boolean).join(', '),
        link: mapsUrl(o.address?.lat, o.address?.lng),
      }),
    );

  return (
    <Screen
      header={<Header title={o.order_no} subtitle={t('p.order.requestedAgo', { time: tAgo(o.requested_at) })} right={<View style={{ paddingRight: 8 }}><StatusChip status={o.status} /></View>} />}
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
      footer={
        step === 'confirm' ? (
          <View style={{ gap: 10 }}>
            <Button testID="step-accept" title={t('p.step.accept')} icon="checkmark-circle" variant="success" size="xl" full onPress={() => setSheet('confirm')} />
            <Button title={t('p.step.reject')} icon="close-circle-outline" variant="danger" full onPress={() => setSheet('reject')} />
          </View>
        ) : step === 'payment' ? (
          <View style={{ gap: 10 }}>
            <Button testID="step-paid" title={t('p.step.paymentReceived')} subtitle={formatINR(o.grand_total)} icon="wallet" variant="success" size="xl" full onPress={() => setSheet('pay')} />
            <Button title={t('p.step.reject')} variant="ghost" size="sm" onPress={() => setSheet('reject')} />
          </View>
        ) : step === 'pack' ? (
          <Button testID="step-packed" title={t('p.step.packed')} icon="cube" variant="primary" size="xl" full onPress={() => setSheet('pack')} />
        ) : step === 'dispatch' ? (
          <Button testID="step-send" title={o.fulfilment === 'pickup' ? t('p.step.readyPickup') : t('p.step.send')} icon="bicycle" variant="action" size="xl" full onPress={() => setSheet('dispatch')} />
        ) : step === 'await_customer' ? (
          <View style={{ gap: 10 }}>
            <InfoBanner tone="info" icon="time" text={t('p.step.waiting')} />
            {o.fulfilment === 'delivery' ? <Button title={t('p.order.updateRider')} icon="create-outline" variant="outline" full onPress={() => setSheet('update')} /> : null}
          </View>
        ) : undefined
      }
    >
      {issue ? <InfoBanner tone="error" text={t('p.order.issue', { type: t(`issue.${issue.type}`) }) + (issue.description ? ` — ${issue.description}` : '')} /> : null}

      {/* Customer */}
      <Card style={{ gap: 10 }}>
        <AppText variant="label" color="textMuted">{t('p.order.customer')}</AppText>
        <Row justify="space-between">
          <View style={{ flex: 1 }}>
            <AppText variant="h3">{o.customer_name}</AppText>
            {o.customer_phone ? <AppText variant="bodySmall" color="textMuted">{formatPhone(o.customer_phone)}</AppText> : <AppText variant="caption" color="textSubtle">{t('p.order.phoneHidden')}</AppText>}
          </View>
          {o.customer_phone ? (
            <Row gap={8}>
              <Button title="" icon="call" variant="secondary" size="sm" onPress={() => callPhone(o.customer_phone)} testID="call-customer" />
              <Button title="" icon="logo-whatsapp" variant="whatsapp" size="sm" onPress={() => openWhatsApp(o.customer_phone, `Hi ${o.customer_name ?? ''}, this is ${o.shop.name} about your Gadget Galli order ${o.order_no}.`)} />
            </Row>
          ) : null}
        </Row>
        <Divider />
        {o.fulfilment === 'pickup' ? (
          <Tag label={t('p.order.pickupOrder')} tone="primary" icon="storefront-outline" />
        ) : (
          <View style={{ gap: 10 }}>
            <Row align="flex-start" gap={10}>
              <Ionicons name="location" size={18} color={colors.action} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodySmall">{addressText}</AppText>
                {o.address?.landmark ? <AppText variant="caption" color="textMuted">{o.address.landmark}</AppText> : null}
              </View>
            </Row>
            {/* The customer's exact pin from their saved address, with the distance and ride time from the shop */}
            <RouteMap shop={o.shop} home={o.address} homeLabel="customer" testID="customer-map" />
            <RouteFacts km={o.distance_km} />
            {o.address?.lat != null && o.address?.lng != null ? (
              <View style={{ gap: 8 }}>
                <Button testID="navigate-customer" title={t('map.directions')} icon="navigate" variant="secondary" size="sm" full onPress={() => openUrl(directionsUrl(o.address!.lat!, o.address!.lng!))} />
                <Button testID="send-to-rider" title={t('map.sendToRider')} icon="logo-whatsapp" variant="whatsapp" size="sm" full onPress={sendToRider} />
              </View>
            ) : (
              <Button title={t('p.order.openMap')} icon="map" variant="ghost" size="sm" onPress={() => openMaps(o.address?.lat, o.address?.lng, o.address?.area ?? undefined)} />
            )}
          </View>
        )}
        {o.note ? (
          <View style={{ backgroundColor: colors.warningSoft, borderRadius: 10, padding: 10 }}>
            <AppText variant="caption" weight="semibold">{t('p.order.customerNote')}</AppText>
            <AppText variant="bodySmall">{o.note}</AppText>
          </View>
        ) : null}
      </Card>

      {/* Items */}
      <Card style={{ gap: 10 }}>
        <AppText variant="h3">{t('order.items')}</AppText>
        {o.items.map((i, idx) => (
          <View key={`${i.shop_product_id ?? i.name}-${idx}`} style={{ gap: 8 }}>
            {idx > 0 ? <Divider /> : null}
            <Row gap={12} align="flex-start">
              <ProductImage path={i.photo} name={i.name} brand={i.brand} size={52} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodySmall" weight="semibold">{i.name}</AppText>
                {variantText(i.variant) ? <AppText variant="caption" color="textMuted">{variantText(i.variant)}</AppText> : null}
                <Row gap={6} wrap>
                  {i.condition !== 'new' ? <Tag label={t(`condition.${i.condition}`)} tone="warning" /> : null}
                  {i.with_installation ? <Tag label={`${t('cart.installation')} ${formatINR(i.installation_charge)}`} tone="primary" /> : null}
                </Row>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <AppText variant="title">× {i.qty}</AppText>
                <AppText variant="caption" color="textMuted">{formatINR(i.price)}</AppText>
              </View>
            </Row>
          </View>
        ))}
        <Divider />
        <Row justify="space-between">
          <AppText variant="bodySmall" color="textMuted">{t('cart.delivery')}</AppText>
          <AppText variant="bodySmall">{o.delivery_charge ? formatINR(o.delivery_charge) : t('common.free')}</AppText>
        </Row>
        <Row justify="space-between">
          <AppText variant="title">{t('cart.grandTotal')}</AppText>
          <AppText variant="priceLarge">{formatINR(o.grand_total)}</AppText>
        </Row>
        {o.payments.map((p, i) => (
          <Tag key={i} tone="success" icon="checkmark-circle" label={`${t('order.paidVia', { method: t(`payment.${p.method}`) })}${p.upi_txn_id ? ` · ${p.upi_txn_id}` : ''}`} />
        ))}
      </Card>

      {media.length ? (
        <Card style={{ gap: 8 }}>
          {media.map((m) => (
            <View key={m.label} style={{ gap: 4 }}>
              <AppText variant="caption" color="textMuted">{m.label}</AppText>
              <Image source={{ uri: m.uri }} style={{ width: '100%', height: 160, borderRadius: 12 }} contentFit="cover" />
            </View>
          ))}
        </Card>
      ) : null}

      {o.dispatch && o.fulfilment === 'delivery' ? (
        <Card style={{ gap: 4 }}>
          <AppText variant="title">{t(`service.${o.dispatch.service}`)}</AppText>
          <AppText variant="bodySmall" color="textMuted">{[o.dispatch.rider_name, o.dispatch.rider_phone ? formatPhone(o.dispatch.rider_phone) : null, o.dispatch.vehicle_no].filter(Boolean).join(' · ')}</AppText>
          {o.dispatch.delivery_otp ? <AppText variant="caption" color="textMuted">OTP {o.dispatch.delivery_otp}</AppText> : null}
        </Card>
      ) : null}

      <Card style={{ gap: 12 }}>
        <AppText variant="h3">{t('order.timeline')}</AppText>
        <OrderTimeline order={o} />
      </Card>

      <ConfirmSheet order={o} visible={sheet === 'confirm'} onClose={() => setSheet(null)} />
      <RejectSheet order={o} visible={sheet === 'reject'} onClose={() => setSheet(null)} />
      <PaySheet order={o} visible={sheet === 'pay'} onClose={() => setSheet(null)} />
      <PackSheet order={o} visible={sheet === 'pack'} onClose={() => setSheet(null)} />
      <DispatchSheet order={o} visible={sheet === 'dispatch'} onClose={() => setSheet(null)} />
      <DispatchSheet order={o} visible={sheet === 'update'} onClose={() => setSheet(null)} update />
    </Screen>
  );
}
