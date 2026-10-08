import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import {
  buildWhatsAppOrderMessage,
  canReportIssue,
  customerCanCancel,
  effectiveStatus,
  formatDateTimeIST,
  formatINR,
  formatPhone,
  formatTimeIST,
  upiPaymentUrl,
  variantText,
} from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { publicUrl, signedUrl } from '@/shared/api/storage';
import { useRealtime } from '@/shared/hooks/realtime';
import { useTranslation } from '@/shared/i18n';
import { callPhone, copyText, openInBrowser, openMaps, openUpi, openWhatsApp } from '@/shared/lib/linking';
import { useTheme } from '@/shared/theme/ThemeProvider';
import {
  AppText,
  Button,
  Card,
  Celebration,
  confirmDialog,
  Divider,
  ErrorState,
  Header,
  InfoBanner,
  Loading,
  ProductImage,
  Rating,
  Row,
  Screen,
  StatusChip,
  Tag,
  toast,
  VerifiedBadge,
} from '@/shared/ui';

import { useOrder, useOrderActions } from '../api';
import { OrderTimeline } from '@/shared/components/OrderTimeline';

export default function OrderScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useOrder(id);
  const { cancel, received } = useOrderActions(id);
  const [celebrate, setCelebrate] = useState(false);
  const [packageUri, setPackageUri] = useState<string | null>(null);
  const prevStatus = useRef<string | null>(null);

  // Live updates: order row and its timeline
  useRealtime(`order-${id}`, 'orders', `id=eq.${id}`, () => q.refetch(), !!id);
  useRealtime(`order-events-${id}`, 'order_events', `order_id=eq.${id}`, () => q.refetch(), !!id);

  const o = q.data;
  useEffect(() => {
    if (!o) return;
    if (prevStatus.current && prevStatus.current !== 'DELIVERED' && o.status === 'DELIVERED') setCelebrate(true);
    prevStatus.current = o.status;
  }, [o]);
  useEffect(() => {
    const path = o?.dispatch?.package_photo_path ?? o?.pack_photo_path;
    if (path) signedUrl('order-media', path).then(setPackageUri);
  }, [o?.dispatch?.package_photo_path, o?.pack_photo_path]);

  if (q.isError) return <Screen header={<Header />}><ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} /></Screen>;
  if (!o) return <Screen header={<Header />}><Loading /></Screen>;

  const status = effectiveStatus(o.status, o.status_before_issue);
  const shop = o.shop;
  const upiLink = shop.upi_id ? upiPaymentUrl({ upiId: shop.upi_id, payeeName: shop.upi_name ?? shop.name, amount: o.grand_total, orderNo: o.order_no }) : null;
  const waText = buildWhatsAppOrderMessage({
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
  const openIssue = o.issues.find((i) => i.status !== 'resolved');
  const resolvedIssue = !openIssue ? o.issues.find((i) => i.status === 'resolved') : null;

  const pay = async () => {
    if (!upiLink) return;
    const ok = await openUpi(upiLink);
    if (!ok) toast(t('order.noUpiApp'), 'error');
  };

  const markReceived = async () => {
    const ok = await confirmDialog({ title: t('order.received'), message: t('order.receivedConfirm'), confirmText: t('order.receivedYes'), cancelText: t('common.cancel'), icon: 'checkmark-done' });
    if (!ok) return;
    try {
      await received.mutateAsync();
      setCelebrate(true);
    } catch (e) {
      toast(errorText(e, t), 'error');
    }
  };

  const cancelOrder = async () => {
    const ok = await confirmDialog({ title: t('order.cancelConfirm'), destructive: true, confirmText: t('order.cancel'), cancelText: t('common.no') });
    if (!ok) return;
    try {
      await cancel.mutateAsync(undefined);
    } catch (e) {
      toast(errorText(e, t), 'error');
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen header={<Header title={t('order.title', { no: o.order_no })} subtitle={formatDateTimeIST(o.requested_at)} />} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        {/* Status headline */}
        <Card style={{ gap: 10 }}>
          <Row justify="space-between">
            <StatusChip status={o.status} />
            <AppText variant="caption" color="textMuted">{t('order.placedVia', { method: o.contact_method === 'call' ? t('order.viaCall') : t('order.viaWhatsapp') })}</AppText>
          </Row>
          {o.status === 'REQUESTED' ? (
            <>
              <AppText variant="h3">{t('order.waitingShop')}</AppText>
              <AppText variant="bodySmall" color="textMuted">{t('order.waitingShopBody')}</AppText>
            </>
          ) : o.status === 'DELIVERED' ? (
            <>
              <AppText variant="h3">{t('order.delivered')}</AppText>
              {o.delivered_by === 'auto' ? <AppText variant="bodySmall" color="textMuted">{t('order.autoDelivered')}</AppText> : null}
            </>
          ) : o.status === 'REJECTED' ? (
            <AppText variant="h3" color="error">{t('order.rejected')}{o.reject_reason ? ` · ${t(`reject.${o.reject_reason}`)}` : ''}</AppText>
          ) : o.status === 'EXPIRED' ? (
            <AppText variant="h3" color="error">{t('order.expired')}</AppText>
          ) : o.status === 'CANCELLED' ? (
            <AppText variant="h3" color="error">{t('order.cancelled')}</AppText>
          ) : status === 'PAID' ? (
            <AppText variant="h3">{t('order.paidWaiting')}</AppText>
          ) : status === 'PACKED' ? (
            <AppText variant="h3">{t('order.packedWaiting')}</AppText>
          ) : null}
          {['REJECTED', 'EXPIRED', 'CANCELLED'].includes(o.status) && o.items[0]?.catalog_product_id ? (
            <Button title={t('order.findElsewhere')} variant="secondary" icon="search" onPress={() => router.push(`/product/${o.items[0]!.catalog_product_id}`)} />
          ) : null}
          <Row gap={8}>
            <Button title={t('order.callShop')} icon="call" variant="outline" size="sm" style={{ flex: 1 }} onPress={() => callPhone(shop.contact_phone)} />
            <Button title={t('order.whatsappShop')} icon="logo-whatsapp" variant="whatsapp" size="sm" style={{ flex: 1 }} onPress={() => openWhatsApp(shop.whatsapp_phone, o.status === 'REQUESTED' ? waText : `Hi, about my order ${o.order_no}`)} />
          </Row>
        </Card>

        {openIssue ? <InfoBanner tone="warning" icon="alert-circle" text={t('order.issueOpen')} /> : null}
        {resolvedIssue?.resolution ? <InfoBanner tone="success" text={t('order.issueResolved', { text: resolvedIssue.resolution })} /> : null}
        {o.updated_by_shop && status === 'CONFIRMED' ? <InfoBanner tone="warning" text={t('order.shopUpdated')} /> : null}

        {/* Pay by UPI */}
        {status === 'CONFIRMED' && upiLink ? (
          <Card style={{ gap: 12, borderWidth: 2, borderColor: colors.action }} level={2}>
            <AppText variant="h3">{t('order.payTitle')}</AppText>
            <AppText variant="bodySmall" color="textMuted">{t('order.payBody')}</AppText>
            <Pressable onPress={() => { copyText(shop.upi_id!); toast(t('common.copied'), 'success'); }}>
              <Row justify="space-between" style={{ backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 12 }}>
                <View style={{ flex: 1 }}>
                  <AppText variant="caption" color="textMuted">{t('order.upiId')}</AppText>
                  <Row gap={6}>
                    <AppText variant="title" selectable>{shop.upi_id}</AppText>
                    {shop.upi_verified ? <VerifiedBadge small /> : null}
                  </Row>
                  <AppText variant="caption" color="textMuted">{shop.upi_name}</AppText>
                </View>
                <Ionicons name="copy-outline" size={18} color={colors.primary} />
              </Row>
            </Pressable>
            {!shop.upi_verified ? <InfoBanner tone="warning" text={t('order.upiNotVerified')} /> : null}
            <Button testID="pay-upi" title={t('order.pay', { amount: formatINR(o.grand_total) })} icon="flash" variant="action" size="xl" full onPress={pay} />
            <View style={{ alignItems: 'center', gap: 8, paddingTop: 4 }}>
              <AppText variant="caption" color="textMuted">{t('order.scanQr')}</AppText>
              {shop.upi_qr_path ? (
                <Image source={{ uri: publicUrl('shop-media', shop.upi_qr_path) ?? undefined }} style={{ width: 180, height: 180, borderRadius: 12 }} contentFit="contain" />
              ) : (
                <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: 12 }}>
                  <QRCode value={upiLink} size={160} />
                </View>
              )}
            </View>
          </Card>
        ) : null}

        {/* Dispatch details */}
        {o.dispatch && ['DISPATCHED', 'DELIVERED'].includes(status) ? (
          <Card style={{ gap: 10 }}>
            <AppText variant="h3">{o.fulfilment === 'pickup' ? t('order.pickupReady') : t('order.delivery')}</AppText>
            {o.fulfilment === 'delivery' ? (
              <>
                <Row gap={10}>
                  <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.actionSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="bicycle" size={22} color={colors.action} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="title">{t(`service.${o.dispatch.service}`)}</AppText>
                    {o.dispatch.rider_name ? <AppText variant="bodySmall" color="textMuted">{t('order.rider')}: {o.dispatch.rider_name}</AppText> : null}
                    {o.dispatch.vehicle_no ? <AppText variant="caption" color="textMuted">{t('order.vehicle')}: {o.dispatch.vehicle_no}</AppText> : null}
                  </View>
                  {o.dispatch.rider_phone ? <Button title={t('common.call')} icon="call" size="sm" variant="secondary" onPress={() => callPhone(o.dispatch!.rider_phone)} /> : null}
                </Row>
                {o.dispatch.rider_phone ? <AppText variant="caption" color="textMuted">{formatPhone(o.dispatch.rider_phone)}</AppText> : null}
                {o.dispatch.eta && status === 'DISPATCHED' ? <Tag label={t('order.eta', { time: formatTimeIST(o.dispatch.eta) })} tone="primary" icon="time-outline" /> : null}
                {o.dispatch.delivery_otp && status === 'DISPATCHED' ? (
                  <View style={{ backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12, gap: 4 }}>
                    <AppText variant="caption" color="primary">{t('order.otp')}</AppText>
                    <AppText variant="display" color="primary" style={{ letterSpacing: 6 }}>{o.dispatch.delivery_otp}</AppText>
                    <AppText variant="caption" color="textMuted">{t('order.otpHint')}</AppText>
                  </View>
                ) : null}
                {o.dispatch.tracking_url ? <Button title={t('order.track')} icon="navigate" variant="primary" onPress={() => openInBrowser(o.dispatch!.tracking_url!)} /> : null}
              </>
            ) : (
              <Button title={t('shop.openInMaps')} icon="map" variant="secondary" onPress={() => openMaps(shop.lat, shop.lng, shop.name)} />
            )}
            {packageUri ? (
              <View style={{ gap: 6 }}>
                <AppText variant="caption" color="textMuted">{t('order.packagePhoto')}</AppText>
                <Image source={{ uri: packageUri }} style={{ width: '100%', height: 180, borderRadius: 12 }} contentFit="cover" />
              </View>
            ) : null}
          </Card>
        ) : null}

        {status === 'DISPATCHED' && o.status !== 'ISSUE_REPORTED' ? (
          <Button testID="received" title={t('order.received')} icon="checkmark-done" variant="success" size="xl" full loading={received.isPending} onPress={markReceived} />
        ) : null}

        {o.status === 'DELIVERED' && !o.review ? (
          <Card style={{ gap: 10, alignItems: 'center' }}>
            <AppText variant="title">{t('order.deliveredBody')}</AppText>
            <Button testID="rate-order" title={t('order.rate')} icon="star" variant="action" onPress={() => router.push(`/review/${o.id}`)} />
          </Card>
        ) : null}
        {o.review ? (
          <Card style={{ gap: 6 }}>
            <Row justify="space-between">
              <AppText variant="title">{t('order.yourReview')}</AppText>
              <Rating value={o.review.rating} size="md" />
            </Row>
            {o.review.body ? <AppText variant="bodySmall">{o.review.body}</AppText> : null}
            {o.review.shop_reply ? (
              <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 10 }}>
                <AppText variant="caption" color="primary" weight="semibold">{t('shop.reply')}</AppText>
                <AppText variant="bodySmall">{o.review.shop_reply}</AppText>
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Timeline */}
        <Card style={{ gap: 12 }}>
          <AppText variant="h3">{t('order.timeline')}</AppText>
          <OrderTimeline order={o} />
        </Card>

        {/* Items and bill */}
        <Card style={{ gap: 10 }}>
          <AppText variant="h3">{t('order.items')}</AppText>
          {o.items.map((i, idx) => (
            <View key={`${i.shop_product_id ?? i.name}-${idx}`} style={{ gap: 8 }}>
              {idx > 0 ? <Divider /> : null}
              <Row gap={12} align="flex-start">
                <ProductImage path={i.photo} name={i.name} brand={i.brand} size={48} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodySmall" weight="semibold">{i.name}</AppText>
                  {variantText(i.variant) ? <AppText variant="caption" color="textMuted">{variantText(i.variant)}</AppText> : null}
                  <AppText variant="caption" color="textMuted">
                    {i.qty} × {formatINR(i.price)}
                    {i.with_installation ? ` + ${t('cart.installation')} ${formatINR(i.installation_charge)}` : ''}
                  </AppText>
                </View>
                <AppText variant="label">{formatINR(i.line_total)}</AppText>
              </Row>
            </View>
          ))}
          <Divider />
          <Row justify="space-between">
            <AppText variant="bodySmall" color="textMuted">{t('cart.itemTotal')}</AppText>
            <AppText variant="bodySmall">{formatINR(o.item_total + o.installation_total)}</AppText>
          </Row>
          {o.fulfilment === 'delivery' ? (
            <Row justify="space-between">
              <AppText variant="bodySmall" color="textMuted">{t('cart.delivery')}</AppText>
              <AppText variant="bodySmall">{o.delivery_charge ? formatINR(o.delivery_charge) : t('common.free')}</AppText>
            </Row>
          ) : null}
          <Row justify="space-between">
            <AppText variant="title">{t('cart.grandTotal')}</AppText>
            <AppText variant="price">{formatINR(o.grand_total)}</AppText>
          </Row>
          {o.payments.map((p, i) => (
            <Tag key={i} tone="success" icon="checkmark-circle" label={t('order.paidVia', { method: t(`payment.${p.method}`) })} />
          ))}
        </Card>

        <Card style={{ gap: 6 }}>
          <AppText variant="title">{o.fulfilment === 'pickup' ? t('order.pickupAt') : t('order.address')}</AppText>
          <AppText variant="bodySmall" color="textMuted">
            {o.fulfilment === 'pickup'
              ? [shop.name, shop.address_line].filter(Boolean).join(', ')
              : [o.address?.house, o.address?.building, o.address?.street, o.address?.area, o.address?.pincode].filter(Boolean).join(', ')}
          </AppText>
          {o.note ? (
            <>
              <AppText variant="label" style={{ marginTop: 6 }}>{t('order.note')}</AppText>
              <AppText variant="bodySmall" color="textMuted">{o.note}</AppText>
            </>
          ) : null}
        </Card>

        <Row gap={10}>
          {customerCanCancel(o.status) ? <Button title={t('order.cancel')} variant="danger" icon="close-circle-outline" onPress={cancelOrder} loading={cancel.isPending} style={{ flex: 1 }} /> : null}
          {canReportIssue(status, o.delivered_at) && !openIssue ? (
            <Button title={t('order.report')} variant="outline" icon="alert-circle-outline" onPress={() => router.push(`/report/${o.id}`)} style={{ flex: 1 }} testID="report-problem" />
          ) : null}
        </Row>
        {Platform.OS === 'web' ? <View style={{ height: 40 }} /> : null}
      </Screen>
      <Celebration visible={celebrate} onDone={() => setCelebrate(false)} />
    </View>
  );
}
