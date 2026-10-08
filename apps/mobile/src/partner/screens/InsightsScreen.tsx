import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { formatDuration, formatINR, formatINRCompact, type ShopInsights } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Card, Divider, ErrorState, Header, Row, Screen, Segmented, Skeleton, Tag } from '@/shared/ui';

import { useDemand, useInsights, useMyShop } from '../api';

type Period = 'day' | 'week' | 'month';

function Kpi({ label, value, icon, tone }: { label: string; value: string; icon: React.ComponentProps<typeof Ionicons>['name']; tone: string }) {
  return (
    <Card style={{ width: '48%', gap: 6 }}>
      <Row gap={8}>
        <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: `${tone}1F`, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={16} color={tone} />
        </View>
        <AppText variant="caption" color="textMuted" style={{ flex: 1 }} numberOfLines={2}>{label}</AppText>
      </Row>
      <AppText variant="h2">{value || '—'}</AppText>
    </Card>
  );
}

/** Bar chart of sales per day / week / month, drawn with plain views (no chart library on mobile). */
function SalesChart({ series }: { series: ShopInsights['series'] }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const max = Math.max(1, ...series.map((s) => s.sales));
  const H = 140;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingTop: 18, alignItems: 'flex-end' }}>
      {series.map((s) => {
        const h = s.sales > 0 ? Math.max(6, (s.sales / max) * H) : 3;
        return (
          <View key={s.bucket} style={{ alignItems: 'center', width: 44, gap: 4 }} accessibilityLabel={`${s.label}: ${formatINR(s.sales)}, ${s.orders} ${t('p.ins.orders')}`}>
            <AppText variant="caption" color="textMuted" style={{ fontSize: 10 }}>{s.sales ? formatINRCompact(s.sales).replace('₹', '') : ''}</AppText>
            <View style={{ height: H, justifyContent: 'flex-end' }}>
              <View style={{ width: 26, height: h, borderRadius: 7, backgroundColor: s.sales ? colors.primary : colors.border }} />
            </View>
            <AppText variant="caption" color="textSubtle" style={{ fontSize: 10 }} numberOfLines={1}>{s.label.replace('Wk ', '')}</AppText>
            <AppText variant="caption" color="action" weight="semibold" style={{ fontSize: 10 }}>{s.orders || ''}</AppText>
          </View>
        );
      })}
    </ScrollView>
  );
}

export default function InsightsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: shop } = useMyShop();
  const [period, setPeriod] = useState<Period>('day');
  const q = useInsights(shop?.id, period);
  const demand = useDemand(shop?.id);
  const d = q.data;
  const conversion = d && d.totals.orders ? Math.round((d.totals.confirmed / d.totals.orders) * 100) : null;

  return (
    <Screen header={<Header title={t('p.ins.title')} back={false} />} refreshing={q.isRefetching} onRefresh={() => { q.refetch(); demand.refetch(); }}>
      <Segmented value={period} onChange={setPeriod} options={[{ value: 'day', label: t('p.ins.day') }, { value: 'week', label: t('p.ins.week') }, { value: 'month', label: t('p.ins.month') }]} />
      {q.isError ? <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} /> : null}

      {!d ? (
        <Row wrap gap={10} justify="space-between">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} width="48%" height={80} radius={16} />
          ))}
        </Row>
      ) : (
        <>
          <Card style={{ gap: 4 }}>
            <Row justify="space-between">
              <AppText variant="h3">{t('p.ins.salesChart')}</AppText>
              <AppText variant="priceLarge">{formatINR(d.totals.sales)}</AppText>
            </Row>
            {d.totals.orders ? <SalesChart series={d.series} /> : <AppText variant="bodySmall" color="textMuted" style={{ paddingVertical: 16 }}>{t('p.ins.noSales')}</AppText>}
          </Card>

          <Row wrap gap={10} justify="space-between">
            <Kpi label={t('p.ins.orders')} value={String(d.totals.orders)} icon="receipt" tone={colors.primary} />
            <Kpi label={t('p.ins.delivered')} value={String(d.totals.delivered)} icon="checkmark-done" tone={colors.success} />
            <Kpi label={t('p.ins.aov')} value={d.totals.avg_order_value ? formatINRCompact(d.totals.avg_order_value) : ''} icon="pricetag" tone="#0891B2" />
            <Kpi label={t('p.ins.conversion')} value={conversion != null ? `${conversion}%` : ''} icon="trending-up" tone={colors.action} />
            <Kpi label={t('p.ins.confirm')} value={formatDuration(d.totals.avg_confirm_mins)} icon="flash" tone={colors.warning} />
            <Kpi label={t('p.ins.dispatch')} value={formatDuration(d.totals.avg_dispatch_mins)} icon="bicycle" tone="#7C3AED" />
            <Kpi label={t('p.ins.avgDelivery')} value={formatDuration(d.avg_delivery_mins)} icon="time" tone={colors.primary} />
            <Kpi label={t('p.ins.rating')} value={d.rating.count ? `${d.rating.avg.toFixed(1)} ★ (${d.rating.count})` : ''} icon="star" tone={colors.warning} />
          </Row>

          <Card style={{ gap: 10 }}>
            <AppText variant="h3">{t('p.ins.top')}</AppText>
            {!d.top_products.length ? <AppText variant="bodySmall" color="textMuted">{t('p.ins.noSales')}</AppText> : null}
            {d.top_products.map((p, i) => (
              <View key={p.name} style={{ gap: 8 }}>
                {i > 0 ? <Divider /> : null}
                <Row gap={10}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <AppText variant="caption" weight="bold" color="primary">{i + 1}</AppText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodySmall" numberOfLines={2}>{p.name}</AppText>
                    <AppText variant="caption" color="textMuted">{t('p.ins.unitsSold', { count: p.qty })}</AppText>
                  </View>
                  <AppText variant="title">{formatINRCompact(p.sales)}</AppText>
                </Row>
              </View>
            ))}
          </Card>
        </>
      )}

      {/* Demand near you: what nearby customers searched for that this shop does not list */}
      <Card style={{ gap: 10, borderWidth: 1.5, borderColor: colors.action }} testID="demand-card">
        <Row gap={8}>
          <Ionicons name="flame" size={20} color={colors.action} />
          <AppText variant="h3">{t('p.ins.demand')}</AppText>
        </Row>
        <AppText variant="caption" color="textMuted">{t('p.ins.demandBody')}</AppText>
        {demand.isLoading ? <Skeleton height={60} /> : null}
        {demand.data && !demand.data.length ? <AppText variant="bodySmall" color="success">{t('p.ins.noDemand')}</AppText> : null}
        {demand.data?.map((item, i) => (
          <View key={item.normalized} style={{ gap: 8 }}>
            {i > 0 ? <Divider /> : null}
            <Row gap={10}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="title" numberOfLines={1}>{item.query}</AppText>
                <Row gap={6}>
                  <AppText variant="caption" color="textMuted">{t('p.ins.searches', { count: item.searches })}</AppText>
                  {item.zero_results ? <Tag tone="action" label={t('p.ins.zeroResults')} /> : null}
                </Row>
              </View>
              <AppText variant="label" color="primary" onPress={() => router.push({ pathname: '/partner/product/add', params: { q: item.query } })}>
                {t('p.ins.addIt')} →
              </AppText>
            </Row>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
