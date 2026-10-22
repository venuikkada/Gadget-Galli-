import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { formatINR, type Order } from '@gg/shared';

import { useTranslation } from '@/shared/i18n';
import { tDateTime } from '@/shared/i18n/format';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Card, Row } from '@/shared/ui';

/**
 * How Gadget Galli protects a customer who pays the shop directly (docs/DECISIONS.md #57): the delivery code that
 * confirms a handover, the pay-on-delivery promise, help when a paid order is late, and the refund record.
 */

/** The 4-digit code the customer gives the rider or shop once the product is in their hands. */
export function DeliveryCodeCard({ code }: { code: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card style={{ gap: 6, backgroundColor: colors.primarySoft, borderWidth: 1.5, borderColor: colors.primary }} level={2} testID="delivery-code-card">
      <Row gap={8}>
        <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
        <AppText variant="title" color="primary">{t('order.codeTitle')}</AppText>
      </Row>
      <AppText variant="display" style={{ letterSpacing: 12 }} selectable testID="delivery-code">{code}</AppText>
      <AppText variant="caption" color="textMuted">{t('order.codeHint')}</AppText>
    </Card>
  );
}

/** Orders paid on delivery: what to pay, to whom, and when. */
export function PayOnDeliveryCard({ order }: { order: Order }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const amount = formatINR(order.grand_total);
  return (
    <Card style={{ gap: 6, borderWidth: 1.5, borderColor: colors.success }} level={2} testID="pay-on-delivery">
      <Row gap={8}>
        <Ionicons name="cash-outline" size={20} color={colors.success} />
        <AppText variant="h3" style={{ flex: 1 }}>{t('order.codTitle')}</AppText>
      </Row>
      <AppText variant="bodySmall" color="textMuted">
        {order.fulfilment === 'pickup' ? t('order.codBodyPickup', { amount, shop: order.shop.name }) : t('order.codBody', { amount, shop: order.shop.name })}
      </AppText>
    </Card>
  );
}

/** A paid order that is late: what happened and what the customer can do now. */
export function OverdueCard({ order, onReport, onSupport }: { order: Order; onReport?: () => void; onSupport: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reason = order.overdue_reason ?? 'not_sent';
  const time = order.dispatch_due_at ? tDateTime(order.dispatch_due_at) : '';
  return (
    <Card style={{ gap: 10, backgroundColor: colors.warningSoft, borderWidth: 1.5, borderColor: colors.warning }} level={2} testID="overdue-help">
      <Row gap={10} align="flex-start">
        <Ionicons name="alert-circle" size={22} color={colors.warning} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="h3">{t(`order.overdueTitle_${reason}`)}</AppText>
          <AppText variant="bodySmall" color="textMuted">{t(`order.overdueBody_${reason}`, { shop: order.shop.name, time })}</AppText>
        </View>
      </Row>
      <Row gap={8} wrap>
        {onReport ? <Button title={t('order.report')} icon="alert-circle-outline" variant="danger" size="sm" onPress={onReport} testID="overdue-report" /> : null}
        <Button title={t('help.whatsapp')} icon="logo-whatsapp" variant="whatsapp" size="sm" onPress={onSupport} />
      </Row>
    </Card>
  );
}

/** The shop could not deliver and refunded the customer (or cancelled an unpaid order). */
export function RefundCard({ order, onSupport }: { order: Order; onSupport: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card style={{ gap: 8, borderWidth: 1.5, borderColor: colors.success }} level={2} testID="refund-card">
      <Row gap={8}>
        <Ionicons name="return-down-back" size={20} color={colors.success} />
        <AppText variant="h3" style={{ flex: 1 }}>
          {t('order.refunded', { shop: order.shop.name, amount: formatINR(order.refund_amount ?? order.grand_total), ref: order.refund_ref ?? '' })}
        </AppText>
      </Row>
      <AppText variant="caption" color="textMuted">{t('order.refundHelp')}</AppText>
      <Button title={t('help.whatsapp')} icon="logo-whatsapp" variant="whatsapp" size="sm" onPress={onSupport} style={{ alignSelf: 'flex-start' }} />
    </Card>
  );
}
