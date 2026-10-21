import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { formatINR } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { useTranslation } from '@/shared/i18n';
import { tDateTime } from '@/shared/i18n/format';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Card, EmptyState, ErrorState, Header, InfoBanner, Loading, Row, Screen, Tag } from '@/shared/ui';

import { useMyShop, usePayouts } from '../api';

/**
 * What Gadget Galli owes the shop and has paid it. Customers pay Gadget Galli; the shop is paid on its UPI ID
 * after each order is delivered (docs/DECISIONS.md #52).
 */
export default function PayoutsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: shop } = useMyShop();
  const q = usePayouts(shop?.id);

  if (q.isError) return <Screen header={<Header title={t('p.payout.title')} />}><ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} /></Screen>;
  if (!q.data) return <Screen header={<Header title={t('p.payout.title')} />}><Loading /></Screen>;
  const p = q.data;

  return (
    <Screen header={<Header title={t('p.payout.title')} />} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Row gap={10}>
        {[
          { label: t('p.payout.dueTotal'), value: p.due_total, color: colors.accent, testID: 'payout-due' },
          { label: t('p.payout.heldTotal'), value: p.held_total, color: colors.error },
          { label: t('p.payout.paid30'), value: p.paid_30d, color: colors.success },
        ].map((s) => (
          <Card key={s.label} style={{ flex: 1, gap: 4, borderTopWidth: 3, borderTopColor: s.color }}>
            <AppText variant="caption" color="textMuted">{s.label}</AppText>
            <AppText variant="h3" testID={s.testID}>{formatINR(s.value)}</AppText>
          </Card>
        ))}
      </Row>
      <InfoBanner icon="wallet-outline" text={p.upi_id ? t('p.payout.paysTo', { upi: p.upi_id }) : t('p.payout.noUpi')} tone={p.upi_id ? 'info' : 'warning'} />
      {p.awaiting_payment ? <AppText variant="caption" color="textMuted">{t('p.payout.inProgress', { count: p.awaiting_payment })}</AppText> : null}

      {!p.items.length ? (
        <EmptyState icon="wallet-outline" title={t('p.payout.empty')} />
      ) : (
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {p.items.map((i, idx) => (
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
                <AppText variant="title">{formatINR(i.payout_amount ?? i.grand_total)}</AppText>
              </Row>
              <Row justify="space-between">
                <AppText variant="caption" color="textMuted">
                  {i.payout_status === 'paid' && i.payout_at ? `${tDateTime(i.payout_at)} · ${i.payout_ref ?? ''}` : i.delivered_at ? tDateTime(i.delivered_at) : ''}
                </AppText>
                <Tag label={t(`p.payout.status_${i.payout_status}`)} tone={i.payout_status === 'paid' ? 'success' : i.payout_status === 'held' ? 'error' : 'warning'} />
              </Row>
            </Pressable>
          ))}
        </Card>
      )}
    </Screen>
  );
}
