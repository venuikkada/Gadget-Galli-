import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { formatINR, upiPaymentUrl, type Order } from '@gg/shared';

import { publicUrl } from '@/shared/api/storage';
import { useTranslation } from '@/shared/i18n';
import { copyText, isDesktopWeb, openUpi } from '@/shared/lib/linking';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Card, Divider, InfoBanner, Input, Row, Segmented, toast, VerifiedBadge } from '@/shared/ui';

type Method = 'upi' | 'bank_transfer';

/**
 * How the customer pays once the shop accepts. Orders paid to the shop (docs/DECISIONS.md #57, #59): the shop's UPI ID
 * (button, QR with the exact amount, or the shop's own QR image) or its bank account, then the UPI reference or bank UTR,
 * which the shop checks. With `door`, the same details for an order paid on delivery (or at the shop, for a pickup),
 * shown from the moment the shop accepts, without a reference to enter: the shop records the payment at handover.
 * Older orders paid to Gadget Galli (#52) are paid the same way to Gadget Galli's UPI ID or bank account.
 */
export function PayCard({
  order,
  submitting = false,
  onSubmit,
  door = false,
}: {
  order: Order;
  submitting?: boolean;
  onSubmit?: (ref: string, method: Method) => Promise<boolean>;
  door?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const payTo = order.pay_to!;
  const toShop = payTo.payee === 'shop';
  const methods: Method[] = [...(payTo.upi_id ? (['upi'] as const) : []), ...(payTo.bank ? (['bank_transfer'] as const) : [])];
  const [method, setMethod] = useState<Method>(methods[0] ?? 'upi');
  const [ref, setRef] = useState('');
  const upiLink = useMemo(
    () => (payTo.upi_id ? upiPaymentUrl({ upiId: payTo.upi_id, payeeName: payTo.upi_name, amount: order.grand_total, orderNo: order.order_no }) : null),
    [payTo.upi_id, payTo.upi_name, order.grand_total, order.order_no],
  );
  const qrImage = publicUrl(toShop ? 'shop-media' : 'banners', payTo.qr_path);
  const amount = formatINR(order.grand_total);
  const shop = order.shop.name;
  // A computer has no UPI app: lead with the QR code to scan from a phone.
  const desktop = isDesktopWeb();
  const pickup = order.fulfilment === 'pickup';
  const title = door ? (pickup ? t('order.payAtShop') : t('order.payAtDoor')) : toShop ? t('order.payTitleShop', { shop }) : t('order.payTitle');
  const body = door
    ? pickup
      ? t('order.payAtShopBody', { amount, shop })
      : t('order.payAtDoorBody', { amount, shop })
    : toShop
      ? t('order.payBodyShop', { amount, shop })
      : methods.length > 1
        ? t('order.payBody', { amount })
        : methods[0] === 'bank_transfer'
          ? t('order.payBodyBank', { amount })
          : t('order.payBodyUpi', { amount });

  const copy = (value: string) => {
    copyText(value);
    toast(t('common.copied'), 'success');
  };
  const pay = async () => {
    if (upiLink && !(await openUpi(upiLink))) toast(t('order.noUpiApp'), 'error');
  };
  const submit = async () => {
    if (onSubmit && (await onSubmit(ref, method))) setRef('');
  };

  return (
    <Card
      style={{ gap: 12, backgroundColor: door ? colors.surface : colors.accentSoft, borderWidth: 1.5, borderColor: door ? colors.border : colors.accent }}
      level={2}
      testID={door ? 'pay-at-door' : 'pay-card'}
    >
      <Row gap={10}>
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="wallet" size={19} color={colors.onAccent} />
        </View>
        <AppText variant="h3" style={{ flex: 1 }}>{title}</AppText>
      </Row>
      <AppText variant="bodySmall" color="textMuted">{body}</AppText>
      {order.payment_rejected_reason && !door ? <InfoBanner tone="error" text={t('order.paymentRejected', { reason: order.payment_rejected_reason })} /> : null}

      {methods.length > 1 ? (
        <Segmented<Method>
          value={method}
          onChange={(m) => {
            setMethod(m);
            setRef('');
          }}
          options={[
            { value: 'upi', label: t('order.payByUpi') },
            { value: 'bank_transfer', label: t('order.payByBank') },
          ]}
        />
      ) : null}

      {method === 'upi' && upiLink ? (
        <>
          <Pressable onPress={() => copy(payTo.upi_id!)} accessibilityRole="button" accessibilityLabel={t('common.copy')}>
            <Row justify="space-between" style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 12 }}>
              <View style={{ flex: 1 }}>
                <AppText variant="caption" color="textMuted">{t('order.upiId')}</AppText>
                <Row gap={6}>
                  <AppText variant="title" selectable testID="pay-upi-id">{payTo.upi_id}</AppText>
                  {payTo.upi_verified !== false ? <VerifiedBadge small /> : null}
                </Row>
                <AppText variant="caption" color="textMuted">{payTo.upi_name}</AppText>
              </View>
              <Ionicons name="copy-outline" size={18} color={colors.primary} />
            </Row>
          </Pressable>
          {!desktop ? <Button testID="pay-upi" title={t('order.pay', { amount })} icon="flash" variant="action" size="xl" full onPress={pay} /> : null}
          <View style={{ alignItems: 'center', gap: 8, paddingTop: 4 }}>
            <AppText variant={desktop ? 'label' : 'caption'} color={desktop ? 'text' : 'textMuted'} align="center">{desktop ? t('order.scanOnPhone', { amount }) : t('order.scanQr')}</AppText>
            <View style={{ padding: 12, backgroundColor: '#FFFFFF', borderRadius: 12 }} testID="pay-qr">
              <QRCode value={upiLink} size={160} />
            </View>
          </View>
          {qrImage ? (
            <View style={{ alignItems: 'center', gap: 8 }}>
              <AppText variant="caption" color="textMuted" align="center">{toShop ? t('order.scanShopQr', { amount, shop }) : t('order.scanOurQr', { amount })}</AppText>
              <Image source={{ uri: qrImage }} style={{ width: 180, height: 180, borderRadius: 12, backgroundColor: '#FFFFFF' }} contentFit="contain" cachePolicy="memory-disk" testID="pay-qr-image" />
            </View>
          ) : null}
        </>
      ) : null}

      {method === 'bank_transfer' && payTo.bank ? (
        <View style={{ gap: 8 }} testID="pay-bank">
          <View style={{ backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 12 }}>
            {[
              { label: t('order.bankAmount'), value: String(order.grand_total), shown: amount, id: 'bank-amount' },
              { label: t('order.bankAccountName'), value: payTo.bank.account_name, id: 'bank-holder', checked: payTo.bank.verified !== false },
              { label: t('order.bankAccountNumber'), value: payTo.bank.account_number, id: 'bank-account' },
              { label: t('order.bankIfsc'), value: payTo.bank.ifsc, id: 'bank-ifsc' },
              { label: t('order.bankRemark'), value: order.order_no, id: 'bank-remark' },
            ].map((r, i) => (
              <Pressable key={r.id} onPress={() => copy(r.value)} accessibilityRole="button" accessibilityLabel={`${t('common.copy')} ${r.label}`}>
                <Row justify="space-between" style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="caption" color="textMuted">{r.label}</AppText>
                    <Row gap={6}>
                      <AppText variant="title" selectable testID={r.id} style={{ flexShrink: 1 }}>{r.shown ?? r.value}</AppText>
                      {r.checked ? <VerifiedBadge small /> : null}
                    </Row>
                  </View>
                  <Ionicons name="copy-outline" size={18} color={colors.primary} />
                </Row>
              </Pressable>
            ))}
          </View>
          {payTo.bank.bank_name ? <AppText variant="caption" color="textMuted">{payTo.bank.bank_name}</AppText> : null}
          <InfoBanner icon="flash-outline" text={t('order.bankImpsHint')} />
        </View>
      ) : null}

      {!door ? (
        <>
          <Divider />
          <AppText variant="title">{t('order.afterPaying')}</AppText>
          <Input
            testID="payment-ref"
            label={method === 'bank_transfer' ? t('order.bankUtrLabel') : t('order.utrLabel')}
            hint={method === 'bank_transfer' ? t('order.bankUtrHint') : t('order.utrHint')}
            value={ref}
            onChangeText={(v) => setRef(v.replace(/[^0-9A-Za-z]/g, '').slice(0, 30).toUpperCase())}
            autoCapitalize="characters"
            keyboardType="default"
          />
          <Button testID="payment-done" title={t('order.iPaid')} icon="checkmark-circle" variant="primary" full disabled={ref.length < 6} loading={submitting} onPress={submit} />
        </>
      ) : null}
      <Row gap={8} align="flex-start">
        <Ionicons name="shield-checkmark" size={16} color={colors.success} style={{ marginTop: 2 }} />
        <AppText variant="caption" color="textMuted" style={{ flex: 1 }}>{door ? t('order.payAtDoorTrust') : toShop ? t('order.payTrustShop') : t('order.payTrust')}</AppText>
      </Row>
    </Card>
  );
}
