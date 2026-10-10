import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { buildWhatsAppOrderMessage, canReportIssue, customerCanCancel, effectiveStatus, formatINR, formatPhone, formatTimeIST, rideMins, upiPaymentUrl, variantText } from '@gg/shared';
import { directionsUrl } from '@gg/shared/map';

import { errorText } from '@/shared/api/rpc';
import { publicUrl, signedUrl } from '@/shared/api/storage';
import { useRealtime } from '@/shared/hooks/realtime';
import { useTranslation } from '@/shared/i18n';
import { tDateTime } from '@/shared/i18n/format';
import { callPhone, copyText, openInBrowser, openMaps, openUpi, openUrl, openWhatsApp } from '@/shared/lib/linking';
import { useTheme } from '@/shared/theme/ThemeProvider';
import {
  AppText,
  BillDetails,
  Button,
  Card,
  Celebration,
  confirmDialog,
  Divider,
  ErrorState,
  Header,
  InfoBanner,
  Loading,
  OrderProgress,
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
import { RouteFacts, RouteMap } from '@/shared/components/RouteMap';

export default function OrderScreen() {
  const { t } = useTranslation();
  const { colors, gradients } = useTheme();
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
  const ended = ['REJECTED', 'EXPIRED', 'CANCELLED'].includes(o.status);
  const heroTone = ended ? 'closed' : o.status === 'DELIVERED' ? 'open' : 'header';
  // 85% white only passes contrast on the teal gradient; the green and red ones keep full white.
  const heroMuted = heroTone === 'header' ? 'onBrandMuted' : 'onBrand';
  const showProgress = !ended;
  const [headline, headlineBody] =
    o.status === 'REQUESTED'
      ? [t('order.waitingShop'), t('order.waitingShopBody')]
      : o.status === 'DELIVERED'
        ? [t('order.delivered'), o.delivered_by === 'auto' ? t('order.autoDelivered') : null]
        : o.status === 'REJECTED'
          ? [`${t('order.rejected')}${o.reject_reason ? ` · ${t(`reject.${o.reject_reason}`)}` : ''}`, null]
          : o.status === 'EXPIRED'
            ? [t('order.expired'), null]
            : o.status === 'CANCELLED'
              ? [t('order.cancelled'), null]
              : status === 'PAID'
                ? [t('order.paidWaiting'), null]
                : status === 'PACKED'
                  ? [t('order.packedWaiting'), null]
                  : [null, null];
  // After dispatch: the shop's ETA if it gave one, otherwise the dispatch time plus the ride and a few minutes' handover.
  const arrival =
    status === 'DISPATCHED' && o.fulfilment === 'delivery'
      ? o.dispatch?.eta
        ? t('order.eta', { time: formatTimeIST(o.dispatch.eta) })
        : o.dispatched_at && o.distance_km != null
          ? t('map.arrivingBy', { time: formatTimeIST(new Date(new Date(o.dispatched_at).getTime() + (rideMins(o.distance_km) + 5) * 60_000)) })
          : null
      : null;
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
      <Screen header={<Header title={t('order.title', { no: o.order_no })} subtitle={tDateTime(o.requested_at)} />} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        {/* Tracking hero: teal while the order is moving, green when delivered, red when it ended without delivery */}
        <LinearGradient colors={gradients[heroTone]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 22, padding: 16, gap: 12, overflow: 'hidden' }}>
          <View pointerEvents="none" style={{ position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -80, top: -110, backgroundColor: '#FFFFFF', opacity: 0.08 }} />
          <Row justify="space-between">
            <StatusChip status={o.status} onBrand />
            <AppText variant="caption" color={heroMuted}>{t('order.placedVia', { method: o.contact_method === 'call' ? t('order.viaCall') : t('order.viaWhatsapp') })}</AppText>
          </Row>
          {headline ? (
            <View style={{ gap: 4 }}>
              <AppText variant="h2" color="onBrand">{headline}</AppText>
              {headlineBody ? <AppText variant="bodySmall" color={heroMuted}>{headlineBody}</AppText> : null}
            </View>
          ) : null}
          {showProgress ? <OrderProgress status={status} onBrand /> : null}
          {arrival ? (
            <Row gap={6}>
              <Ionicons name="time-outline" size={16} color={colors.onBrand} />
              <AppText variant="label" color="onBrand" testID="arrival">{arrival}</AppText>
            </Row>
          ) : null}
          {['REJECTED', 'EXPIRED', 'CANCELLED'].includes(o.status) && o.items[0]?.catalog_product_id ? (
            <Button title={t('order.findElsewhere')} variant="onBrand" icon="search" onPress={() => router.push(`/product/${o.items[0]!.catalog_product_id}`)} />
          ) : null}
          <Row gap={8}>
            <Button title={t('order.callShop')} icon="call" variant="onBrand" size="sm" style={{ flex: 1 }} onPress={() => callPhone(shop.contact_phone)} />
            <Button title={t('order.whatsappShop')} icon="logo-whatsapp" variant="whatsapp" size="sm" style={{ flex: 1 }} onPress={() => openWhatsApp(shop.whatsapp_phone, o.status === 'REQUESTED' ? waText : `Hi, about my order ${o.order_no}`)} />
          </Row>
        </LinearGradient>

        {openIssue ? <InfoBanner tone="warning" icon="alert-circle" text={t('order.issueOpen')} /> : null}
        {resolvedIssue?.resolution ? <InfoBanner tone="success" text={t('order.issueResolved', { text: resolvedIssue.resolution })} /> : null}
        {o.updated_by_shop && status === 'CONFIRMED' ? <InfoBanner tone="warning" text={t('order.shopUpdated')} /> : null}

        {/* Pay by UPI */}
        {status === 'CONFIRMED' && upiLink ? (
          <Card style={{ gap: 12, backgroundColor: colors.accentSoft, borderWidth: 1.5, borderColor: colors.accent }} level={2}>
            <Row gap={10}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="wallet" size={19} color={colors.onAccent} />
              </View>
              <AppText variant="h3" style={{ flex: 1 }}>{t('order.payTitle')}</AppText>
            </Row>
            <AppText variant="bodySmall" color="textMuted">{t('order.payBody')}</AppText>
            <Pressable onPress={() => { copyText(shop.upi_id!); toast(t('common.copied'), 'success'); }}>
              <Row justify="space-between" style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 12 }}>
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
                <View style={{ padding: 12, backgroundColor: '#FFFFFF', borderRadius: 12 }}>
                  <QRCode value={upiLink} size={160} />
                </View>
              )}
            </View>
          </Card>
        ) : null}

        {/* Where the shop and the delivery address are, how far and how long the ride is */}
        {!ended ? (
          <Card style={{ gap: 10 }} level={2}>
            <RouteMap shop={shop} home={o.fulfilment === 'delivery' ? o.address : null} testID="order-map" />
            {o.fulfilment === 'delivery' ? <RouteFacts km={o.distance_km} /> : null}
            {o.fulfilment === 'pickup' && shop.lat != null && shop.lng != null ? (
              <Button title={t('map.directions')} icon="navigate" variant="secondary" size="sm" onPress={() => openUrl(directionsUrl(shop.lat!, shop.lng!))} style={{ alignSelf: 'flex-start' }} />
            ) : null}
          </Card>
        ) : null}

        {/* Dispatch details */}
        {o.dispatch && ['DISPATCHED', 'DELIVERED'].includes(status) ? (
          <Card style={{ gap: 10 }} level={2}>
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
                {o.dispatch.delivery_otp && status === 'DISPATCHED' ? (
                  <View style={{ backgroundColor: colors.accentSoft, borderRadius: 14, padding: 12, gap: 4, borderWidth: 1, borderColor: colors.accent }}>
                    <Row gap={6}>
                      <Ionicons name="key" size={14} color={colors.accentInk} />
                      <AppText variant="caption" color="accentInk" weight="bold">{t('order.otp')}</AppText>
                    </Row>
                    <AppText variant="display" color="accentInk" style={{ letterSpacing: 8 }}>{o.dispatch.delivery_otp}</AppText>
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
          <Card style={{ gap: 12, alignItems: 'center', paddingVertical: 18 }} level={2}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="star" size={26} color={colors.star} />
            </View>
            <AppText variant="title" align="center">{t('order.deliveredBody')}</AppText>
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
          <BillDetails
            rows={[
              { label: t('cart.itemTotal'), value: formatINR(o.item_total + o.installation_total) },
              ...(o.fulfilment === 'delivery'
                ? [{ label: t('cart.delivery'), value: o.delivery_charge ? formatINR(o.delivery_charge) : t('common.free'), tone: o.delivery_charge ? undefined : ('offer' as const) }]
                : []),
              { label: t('cart.grandTotal'), value: formatINR(o.grand_total) },
            ]}
          />
          {o.payments.map((p, i) => (
            <Tag key={i} tone="success" icon="checkmark-circle" label={t('order.paidVia', { method: t(`payment.${p.method}`) })} />
          ))}
        </Card>

        <Card style={{ gap: 6 }}>
          <Row gap={8}>
            <Ionicons name={o.fulfilment === 'pickup' ? 'storefront-outline' : 'location-outline'} size={18} color={colors.primary} />
            <AppText variant="title">{o.fulfilment === 'pickup' ? t('order.pickupAt') : t('order.address')}</AppText>
          </Row>
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
