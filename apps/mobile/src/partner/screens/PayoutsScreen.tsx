import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { formatINR, upiPaymentUrl, type ShopCommission } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { useTranslation } from '@/shared/i18n';
import { tDateTime } from '@/shared/i18n/format';
import { copyText, isDesktopWeb, openUpi } from '@/shared/lib/linking';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Card, Divider, EmptyState, ErrorState, Header, InfoBanner, Input, Loading, Row, Screen, Tag, toast } from '@/shared/ui';

import { payCommission, useCommission, useMyShop, usePayouts } from '../api';

/**
 * Commission and payments. Customers pay the shop directly (docs/DECISIONS.md #57); Gadget Galli's commission on each
 * delivered order builds up here and the shop pays it by UPI, entering the reference for Gadget Galli to confirm.
 * Older orders paid to Gadget Galli (#52) still show their payouts to the shop.
 */
export default function PayoutsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: shop } = useMyShop();
  const q = useCommission(shop?.id);
  const c = q.data;
  const legacy = usePayouts(c && c.legacy_payouts_due > 0 ? shop?.id : undefined);

  if (q.isError) return <Screen header={<Header title={t('p.commission.title')} />}><ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} /></Screen>;
  if (!c) return <Screen header={<Header title={t('p.commission.title')} />}><Loading /></Screen>;

  return (
    <Screen header={<Header title={t('p.commission.title')} />} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Row gap={10}>
        {[
          { label: t('p.commission.due'), value: c.due_total, color: colors.accent, testID: 'commission-due' },
          { label: t('p.commission.held'), value: c.held_total, color: colors.error },
          { label: t('p.commission.paid30'), value: c.paid_30d, color: colors.success },
        ].map((s) => (
          <Card key={s.label} style={{ flex: 1, gap: 4, borderTopWidth: 3, borderTopColor: s.color }}>
            <AppText variant="caption" color="textMuted">{s.label}</AppText>
            <AppText variant="h3" testID={s.testID}>{formatINR(s.value)}</AppText>
          </Card>
        ))}
      </Row>
      <InfoBanner icon="information-circle-outline" text={t('p.commission.explain', { pct: c.commission_pct })} />

      {c.pending ? (
        <Card style={{ gap: 6, backgroundColor: colors.primarySoft, borderWidth: 1.5, borderColor: colors.primary }} testID="commission-pending">
          <Row gap={8}>
            <Ionicons name="hourglass-outline" size={20} color={colors.primary} />
            <AppText variant="h3" style={{ flex: 1 }}>{t('p.commission.pendingTitle', { amount: formatINR(c.pending.amount) })}</AppText>
          </Row>
          <AppText variant="bodySmall" color="textMuted">{t('p.commission.pendingBody', { ref: c.pending.ref })}</AppText>
        </Card>
      ) : c.due_total > 0 ? (
        <PayGadgetGalli commission={c} />
      ) : null}

      {c.payments.length ? (
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <AppText variant="title" style={{ padding: 14, paddingBottom: 6 }}>{t('p.commission.history')}</AppText>
          {c.payments.map((p, idx) => (
            <View key={p.id} style={{ paddingHorizontal: 14, paddingVertical: 10, gap: 2, borderTopWidth: idx ? 1 : 0, borderTopColor: colors.border }}>
              <Row justify="space-between">
                <AppText variant="title">{formatINR(p.amount)}</AppText>
                <Tag label={t(`p.commission.pay_${p.status}`)} tone={p.status === 'confirmed' ? 'success' : p.status === 'rejected' ? 'error' : 'warning'} />
              </Row>
              <AppText variant="caption" color="textMuted">{[tDateTime(p.submitted_at), p.ref, t('p.commission.orders', { count: p.order_count })].filter(Boolean).join(' · ')}</AppText>
              {p.reject_reason ? <AppText variant="caption" color="error">{p.reject_reason}</AppText> : null}
            </View>
          ))}
        </Card>
      ) : null}

      {!c.items.length ? (
        <EmptyState icon="wallet-outline" title={t('p.commission.empty')} />
      ) : (
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {c.items.map((i, idx) => (
            <Pressable
              key={i.id}
              onPress={() => router.push(`/partner/order/${i.id}`)}
              accessibilityRole="button"
              style={({ pressed }) => ({ padding: 14, gap: 4, borderTopWidth: idx ? 1 : 0, borderTopColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : undefined })}
            >
              <Row justify="space-between">
                <Row gap={8}>
                  <Ionicons name="receipt-outline" size={16} color={colors.textMuted} />
                  <AppText variant="title">{i.order_no}</AppText>
                </Row>
                <AppText variant="title">{formatINR(i.commission_amount ?? 0)}</AppText>
              </Row>
              <Row justify="space-between">
                <AppText variant="caption" color="textMuted">{[t('p.commission.ofOrder', { amount: formatINR(i.grand_total) }), i.delivered_at ? tDateTime(i.delivered_at) : null].filter(Boolean).join(' · ')}</AppText>
                <Tag label={i.in_payment && i.commission_status === 'due' ? t('p.commission.pay_submitted') : t(`p.commission.status_${i.commission_status}`)} tone={i.commission_status === 'paid' ? 'success' : i.commission_status === 'held' ? 'error' : 'warning'} />
              </Row>
            </Pressable>
          ))}
        </Card>
      )}

      {/* Older orders paid to Gadget Galli: Gadget Galli still pays the shop for these */}
      {legacy.data && legacy.data.due_total > 0 ? (
        <Card style={{ gap: 6 }} testID="legacy-payouts">
          <AppText variant="title">{t('p.payout.title')}</AppText>
          <AppText variant="bodySmall" color="textMuted">{t('p.payout.legacyDue', { amount: formatINR(legacy.data.due_total) })}</AppText>
          {legacy.data.items.filter((i) => i.payout_status === 'due').map((i) => (
            <Row key={i.id} justify="space-between">
              <AppText variant="caption">{i.order_no}</AppText>
              <AppText variant="caption">{formatINR(i.payout_amount ?? i.grand_total)}</AppText>
            </Row>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

/** Pay the commission due to Gadget Galli's UPI ID (button, QR with the exact amount), then enter the reference. */
function PayGadgetGalli({ commission }: { commission: ShopCommission }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const payTo = commission.pay_to;
  const amount = formatINR(commission.due_total);
  const link = useMemo(
    () => (payTo.upi_id ? upiPaymentUrl({ upiId: payTo.upi_id, payeeName: payTo.upi_name, amount: commission.due_total, orderNo: 'commission' }) : null),
    [payTo.upi_id, payTo.upi_name, commission.due_total],
  );
  const desktop = isDesktopWeb();

  const submit = async () => {
    setBusy(true);
    try {
      await payCommission(ref, 'upi');
      toast(t('p.commission.sent'), 'success');
      setRef('');
    } catch (e) {
      toast(errorText(e, t), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!payTo.upi_id) return <InfoBanner tone="warning" text={t('p.commission.noUpi')} />;
  return (
    <Card style={{ gap: 12, backgroundColor: colors.accentSoft, borderWidth: 1.5, borderColor: colors.accent }} level={2} testID="pay-commission">
      <AppText variant="h3">{t('p.commission.payTitle', { amount })}</AppText>
      <AppText variant="bodySmall" color="textMuted">{t('p.commission.payBody', { count: commission.due_count })}</AppText>
      <Pressable
        onPress={() => {
          copyText(payTo.upi_id!);
          toast(t('common.copied'), 'success');
        }}
        accessibilityRole="button"
        accessibilityLabel={t('common.copy')}
      >
        <Row justify="space-between" style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 12 }}>
          <View style={{ flex: 1 }}>
            <AppText variant="caption" color="textMuted">{t('order.upiId')}</AppText>
            <AppText variant="title" selectable testID="commission-upi-id">{payTo.upi_id}</AppText>
            <AppText variant="caption" color="textMuted">{payTo.upi_name}</AppText>
          </View>
          <Ionicons name="copy-outline" size={18} color={colors.primary} />
        </Row>
      </Pressable>
      {!desktop && link ? (
        <Button title={t('order.pay', { amount })} icon="flash" variant="action" size="lg" full onPress={async () => { if (!(await openUpi(link))) toast(t('order.noUpiApp'), 'error'); }} />
      ) : null}
      {link ? (
        <View style={{ alignItems: 'center', gap: 6 }}>
          <AppText variant="caption" color="textMuted">{desktop ? t('order.scanOnPhone', { amount }) : t('order.scanQr')}</AppText>
          <View style={{ padding: 12, backgroundColor: '#FFFFFF', borderRadius: 12 }}>
            <QRCode value={link} size={150} />
          </View>
        </View>
      ) : null}
      <Divider />
      <Input
        testID="commission-ref"
        label={t('order.utrLabel')}
        hint={t('order.utrHint')}
        value={ref}
        onChangeText={(v) => setRef(v.replace(/[^0-9A-Za-z]/g, '').slice(0, 30).toUpperCase())}
        autoCapitalize="characters"
      />
      <Button testID="commission-paid" title={t('order.iPaid')} icon="checkmark-circle" variant="primary" full disabled={ref.length < 6} loading={busy} onPress={submit} />
    </Card>
  );
}
