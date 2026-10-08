import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { View } from 'react-native';

import { formatDistance, formatINR, timeAgo, type OrderCard } from '@gg/shared';

import { useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Card, ProductImage, Row, StatusChip, Tag } from '@/shared/ui';

/** Order card for the shop: number, customer, area & distance, items, total, time since request. */
export function PartnerOrderRow({ o }: { o: OrderCard }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const isNew = o.status === 'REQUESTED';
  return (
    <Card onPress={() => router.push(`/partner/order/${o.id}`)} style={isNew ? { borderWidth: 2, borderColor: colors.action } : undefined} testID={`porder-${o.order_no}`}>
      <Row align="flex-start" gap={12}>
        <ProductImage path={o.first_photo} name={o.first_item ?? ''} size={50} />
        <View style={{ flex: 1, gap: 4 }}>
          <Row justify="space-between" gap={6}>
            <AppText variant="title">{o.order_no}</AppText>
            <StatusChip status={o.status} />
          </Row>
          <AppText variant="bodySmall" numberOfLines={1}>
            {o.first_item}
            {o.item_count > 1 ? ` +${o.item_count - 1}` : ''}
          </AppText>
          <Row gap={6} wrap>
            <Ionicons name="person-outline" size={13} color={colors.textMuted} />
            <AppText variant="caption" color="textMuted">{o.customer_name}</AppText>
            {o.fulfilment === 'pickup' ? (
              <Tag label={t('cart.pickup')} tone="primary" />
            ) : (
              <AppText variant="caption" color="textMuted">· {[o.area, formatDistance(o.distance_km)].filter(Boolean).join(' · ')}</AppText>
            )}
          </Row>
          <Row justify="space-between">
            <AppText variant="caption" color={isNew ? 'action' : 'textSubtle'} weight={isNew ? 'semibold' : 'regular'}>
              {t('p.order.requestedAgo', { time: timeAgo(o.requested_at) })}
            </AppText>
            <AppText variant="price" style={{ fontSize: 15 }}>{formatINR(o.grand_total)}</AppText>
          </Row>
          {o.note ? <AppText variant="caption" color="textMuted" numberOfLines={1}>📝 {o.note}</AppText> : null}
        </View>
      </Row>
    </Card>
  );
}
