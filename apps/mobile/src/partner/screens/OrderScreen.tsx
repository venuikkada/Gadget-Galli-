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
import { tAgo, tDateTime } from '@/shared/i18n/format';
import { callPhone, openMaps, openUrl, openWhatsApp, shareOnWhatsApp } from '@/shared/lib/linking';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Card, confirmDialog, Divider, ErrorState, Header, InfoBanner, Loading, ProductImage, Row, Screen, StatusChip, Tag, toast } from '@/shared/ui';

import { CancelSheet, CheckPaymentSheet, ConfirmSheet, DispatchSheet, HandoverSheet, PackSheet, RejectSheet } from '../components/orderSheets';
import { orderActions } from '../api';

type SheetName = 'confirm' | 'reject' | 'notReceived' | 'pack' | 'dispatch' | 'update' | 'handover' | 'cancel' | null;

/** Shop's order screen: one big button per step. */
export default function PartnerOrderScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useOrder(id);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [confirming, setConfirming] = useState(false);
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
  const step = nextShopStep(o);
  // Customers pay the shop (docs/DECISIONS.md #57); older orders were paid to Gadget Galli (#52)
  const toShop = o.payee === 'shop';
  const amount = formatINR(o.grand_total);
  const canCancel = toShop && ['PAID', 'PACKED', 'DISPATCHED'].includes(status);
  const paymentReceived = async () => {
    const ok = await confirmDialog({
      title: t('p.step.paymentReceived'),
      message: t('p.check.confirmBody', { amount, ref: o.payment_ref ?? '-' }),
      confirmText: t('p.check.yesReceived'),
      cancelText: t('common.cancel'),
      icon: 'checkmark-circle',
    });
    if (!ok) return;
    setConfirming(true);
    try {
      await orderActions.confirmPayment(o.id, o.payment_ref);
    } catch (e) {
      toast(errorText(e, t), 'error');
    } finally {
      setConfirming(false);
    }
  };
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
        ) : step === 'await_payment' && !toShop ? (
          // Older orders: the customer pays Gadget Galli, which confirms the money arrived.
          <View style={{ gap: 10 }}>
            <InfoBanner
              testID="awaiting-payment"
              tone={o.payment_claimed_at ? 'info' : 'warning'}
              icon={o.payment_claimed_at ? 'hourglass-outline' : 'time-outline'}
              text={
                o.payment_claimed_at
                  ? t(o.payment_method === 'bank_transfer' ? 'p.order.paymentClaimedBank' : 'p.order.paymentClaimed', { ref: o.payment_ref ?? '' })
                  : t('p.order.awaitingPayment', { amount })
              }
            />
            {/* Once the customer says they paid, only Gadget Galli support can cancel (and refund) the order */}
            {o.payment_claimed_at ? (
              <AppText variant="caption" color="textMuted" align="center">{t('p.order.paidNoReject')}</AppText>
            ) : (
              <Button title={t('p.step.reject')} variant="ghost" size="sm" onPress={() => setSheet('reject')} />
            )}
          </View>
        ) : step === 'await_payment' ? (
          // Paid in advance to the shop's UPI ID: wait for the customer's "I've paid"
          <View style={{ gap: 10 }}>
            <InfoBanner testID="awaiting-payment" tone="warning" icon="time-outline" text={t('p.order.awaitingShopPayment', { amount, upi: o.shop.upi_id ?? '' })} />
            <Row gap={10}>
              <Button title={t('p.step.reject')} variant="ghost" size="sm" style={{ flex: 1 }} onPress={() => setSheet('reject')} />
              <Button testID="payment-received-anyway" title={t('p.check.alreadyPaid')} icon="checkmark-circle-outline" variant="outline" size="sm" style={{ flex: 1 }} loading={confirming} onPress={paymentReceived} />
            </Row>
          </View>
        ) : step === 'check_payment' ? (
          // The customer says they paid: check the UPI app, then confirm (or say it is not there)
          <View style={{ gap: 10 }}>
            <InfoBanner testID="payment-claimed" tone={o.overdue ? 'error' : 'info'} icon="wallet-outline" text={t('p.order.claimedShop', { amount, ref: o.payment_ref ?? '' })} />
            <Button testID="step-payment-received" title={t('p.step.paymentReceived')} icon="checkmark-circle" variant="success" size="xl" full loading={confirming} onPress={paymentReceived} />
            <Button testID="step-not-received" title={t('p.check.notReceived')} icon="close-circle-outline" variant="outline" full onPress={() => setSheet('notReceived')} />
          </View>
        ) : step === 'pack' ? (
          <View style={{ gap: 10 }}>
            {status === 'CONFIRMED' ? <InfoBanner testID="cod-pack" tone="info" icon="cash-outline" text={t('p.order.codPack', { amount })} /> : null}
            <Button testID="step-packed" title={t('p.step.packed')} icon="cube" variant="primary" size="xl" full onPress={() => setSheet('pack')} />
            {status === 'CONFIRMED' ? <Button title={t('p.step.reject')} variant="ghost" size="sm" onPress={() => setSheet('reject')} /> : null}
          </View>
        ) : step === 'dispatch' ? (
          <Button testID="step-send" title={o.fulfilment === 'pickup' ? t('p.step.readyPickup') : t('p.step.send')} icon="bicycle" variant="action" size="xl" full onPress={() => setSheet('dispatch')} />
        ) : step === 'handover' ? (
          // Handover with the customer's delivery code, or the customer taps "I received my order"
          <View style={{ gap: 10 }}>
            {o.status !== 'ISSUE_REPORTED' ? (
              <Button testID="step-handover" title={t('p.step.handover')} icon="key" variant="success" size="xl" full onPress={() => setSheet('handover')} />
            ) : null}
            <AppText variant="caption" color="textMuted" align="center">{t('p.step.waiting')}</AppText>
            {o.fulfilment === 'delivery' ? <Button title={t('p.order.updateRider')} icon="create-outline" variant="outline" full onPress={() => setSheet('update')} /> : null}
          </View>
        ) : undefined
      }
    >
      {status === 'PAID' && !toShop ? <InfoBanner tone="success" icon="checkmark-circle" text={t('p.order.paidToGG')} testID="paid-to-gg" /> : null}
      {/* Paid in advance: the send-by time, or an overdue warning (advance payments pause until it is sent) */}
      {o.overdue ? (
        <InfoBanner tone="error" icon="alarm" text={t(`p.order.overdue_${o.overdue_reason ?? 'not_sent'}`)} testID="overdue" />
      ) : toShop && ['PAID', 'PACKED'].includes(status) && o.dispatch_due_at ? (
        <InfoBanner tone="success" icon="time-outline" text={t('p.order.sendBy', { time: tDateTime(o.dispatch_due_at) })} testID="send-by" />
      ) : null}
      {o.status === 'CANCELLED' && o.refund_ref ? (
        <InfoBanner tone="info" icon="return-down-back" text={t('p.order.refunded', { amount: formatINR(o.refund_amount ?? o.grand_total), ref: o.refund_ref })} />
      ) : null}
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
        {toShop && o.payment_mode && !o.payments.length ? (
          <Tag tone={o.payment_mode === 'on_delivery' ? 'primary' : 'accent'} icon={o.payment_mode === 'on_delivery' ? 'cash-outline' : 'phone-portrait-outline'} label={o.payment_mode === 'on_delivery' ? t('p.order.modeCod') : t('p.order.modeAdvance')} testID="payment-mode-tag" />
        ) : null}
      </Card>

      {/* Gadget Galli's commission on this order, once it is delivered */}
      {toShop && o.commission_status && o.commission_status !== 'none' ? (
        <Card style={{ gap: 6, borderWidth: 1.5, borderColor: o.commission_status === 'paid' ? colors.success : o.commission_status === 'held' ? colors.error : colors.accent }} testID="order-commission">
          <Row justify="space-between">
            <AppText variant="h3">{t('p.commission.thisOrder')}</AppText>
            <Tag label={t(`p.commission.status_${o.commission_status}`)} tone={o.commission_status === 'paid' ? 'success' : o.commission_status === 'held' ? 'error' : 'warning'} />
          </Row>
          <AppText variant="bodySmall">{t('p.commission.orderLine', { amount: formatINR(o.commission_amount ?? 0) })}</AppText>
        </Card>
      ) : null}

      {/* Older orders: what Gadget Galli pays the shop for this order, once it is delivered */}
      {!toShop && o.payout_status && o.payout_status !== 'not_due' ? (
        <Card style={{ gap: 6, borderWidth: 1.5, borderColor: o.payout_status === 'paid' ? colors.success : o.payout_status === 'held' ? colors.error : colors.accent }} testID="order-payout">
          <Row justify="space-between">
            <AppText variant="h3">{t('p.payout.yourPayout')}</AppText>
            <Tag label={t(`p.payout.status_${o.payout_status}`)} tone={o.payout_status === 'paid' ? 'success' : o.payout_status === 'held' ? 'error' : 'warning'} />
          </Row>
          <AppText variant="bodySmall">
            {o.payout_status === 'paid'
              ? t('p.payout.paid', { amount: formatINR(o.payout_amount ?? o.grand_total), date: o.payout_at ? tDateTime(o.payout_at) : '', ref: o.payout_ref ?? '' })
              : o.payout_status === 'held'
                ? t('p.payout.held')
                : t('p.payout.due', { amount: formatINR(o.payout_amount ?? o.grand_total) })}
          </AppText>
          {o.commission_amount ? <AppText variant="caption" color="textMuted">{t('p.payout.commission', { amount: formatINR(o.commission_amount) })}</AppText> : null}
        </Card>
      ) : null}

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

      {/* Cannot deliver: refund a paid order, or cancel one paid on delivery */}
      {canCancel ? (
        <Card style={{ gap: 8 }}>
          <AppText variant="title">{t('p.cancel.cantDeliver')}</AppText>
          <AppText variant="caption" color="textMuted">{o.paid_at ? t('p.cancel.cantDeliverPaid') : t('p.cancel.cantDeliverCod')}</AppText>
          <Button testID="open-cancel" title={o.paid_at ? t('p.cancel.refundTitle') : t('p.cancel.title')} icon="return-down-back" variant="outline" size="sm" onPress={() => setSheet('cancel')} style={{ alignSelf: 'flex-start' }} />
        </Card>
      ) : null}

      <CheckPaymentSheet order={o} visible={sheet === 'notReceived'} onClose={() => setSheet(null)} />
      <HandoverSheet order={o} visible={sheet === 'handover'} onClose={() => setSheet(null)} />
      <CancelSheet order={o} visible={sheet === 'cancel'} onClose={() => setSheet(null)} />
      <ConfirmSheet order={o} visible={sheet === 'confirm'} onClose={() => setSheet(null)} />
      <RejectSheet order={o} visible={sheet === 'reject'} onClose={() => setSheet(null)} />
      <PackSheet order={o} visible={sheet === 'pack'} onClose={() => setSheet(null)} />
      <DispatchSheet order={o} visible={sheet === 'dispatch'} onClose={() => setSheet(null)} />
      <DispatchSheet order={o} visible={sheet === 'update'} onClose={() => setSheet(null)} update />
    </Screen>
  );
}
