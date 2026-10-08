import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Switch, View } from 'react-native';

import { formatINR, formatINRCompact } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { useProfile } from '@/shared/hooks/profile';
import { useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Card, ErrorState, IconButton, InfoBanner, Rating, Row, Screen, ShopAvatar, Skeleton, toast } from '@/shared/ui';

import { setShopOpen, useDashboard, useMyShop } from '../api';
import { PartnerOrderRow } from '../components/PartnerOrderRow';

function Stat({ label, value, icon, tone }: { label: string; value: string | number; icon: React.ComponentProps<typeof Ionicons>['name']; tone: string }) {
  const { colors } = useTheme();
  return (
    <Card style={{ width: '48%', gap: 6 }} padded>
      <Row gap={8}>
        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${tone}1F`, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={17} color={tone} />
        </View>
        <AppText variant="caption" color="textMuted" style={{ flex: 1 }} numberOfLines={2}>{label}</AppText>
      </Row>
      <AppText variant="h2" style={{ color: colors.text }}>{value}</AppText>
    </Card>
  );
}

export default function DashboardScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: profile } = useProfile();
  const { data: shop } = useMyShop();
  const dash = useDashboard(shop?.id);
  const d = dash.data;

  const toggleOpen = async (v: boolean) => {
    if (!shop) return;
    try {
      await setShopOpen(shop.id, v);
    } catch (e) {
      toast(errorText(e, t), 'error');
    }
  };

  return (
    <Screen
      refreshing={dash.isRefetching}
      onRefresh={() => dash.refetch()}
      header={
        <Row style={{ paddingHorizontal: 16, paddingTop: 8 }} justify="space-between">
          <Row gap={10} style={{ flex: 1 }}>
            {shop ? <ShopAvatar name={shop.name ?? 'Shop'} path={shop.logo_path} size={42} /> : null}
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color="textMuted">{t('p.dash.hello', { name: profile?.user.name?.split(' ')[0] ?? '' })}</AppText>
              <AppText variant="h3" numberOfLines={1}>{shop?.name}</AppText>
            </View>
          </Row>
          <IconButton icon="notifications-outline" badge={profile?.unread} onPress={() => router.push({ pathname: '/notifications', params: { app: 'partner' } })} />
        </Row>
      }
    >
      {dash.isError ? <ErrorState message={errorText(dash.error, t)} onRetry={() => dash.refetch()} /> : null}
      {shop && shop.status !== 'approved' ? (
        <Pressable onPress={() => router.push('/partner/status')}>
          <InfoBanner tone={shop.status === 'under_review' ? 'info' : 'warning'} text={`${t('p.dash.notLive')} · ${t(`p.status.${shop.status}`)}${shop.status_reason ? ` · ${shop.status_reason}` : ''}`} />
        </Pressable>
      ) : null}

      {/* Open / Closed switch */}
      <Card style={{ backgroundColor: d?.shop.is_open ? colors.success : colors.error, gap: 4 }} testID="open-switch-card">
        <Row justify="space-between">
          <View style={{ flex: 1 }}>
            <AppText variant="h2" color="#FFFFFF">{d?.shop.is_open ? t('p.dash.open') : t('p.dash.closed')}</AppText>
            <AppText variant="bodySmall" color="#FFFFFFDD">{d?.shop.is_open ? t('p.dash.openHint') : t('p.dash.closedHint')}</AppText>
          </View>
          <Switch testID="open-switch" value={!!d?.shop.is_open} onValueChange={toggleOpen} trackColor={{ true: '#86EFAC', false: '#FCA5A5' }} thumbColor="#fff" style={{ transform: [{ scale: 1.25 }] }} />
        </Row>
        {d ? (
          <Row gap={10} style={{ marginTop: 6 }}>
            <Rating value={d.shop.rating_avg} />
            {d.shop.rating_count ? <AppText variant="caption" color="#FFFFFFDD">({d.shop.rating_count})</AppText> : null}
            <AppText variant="caption" color="#FFFFFFDD">{d.shop.orders_delivered} {t('p.dash.delivered').toLowerCase()}</AppText>
          </Row>
        ) : null}
      </Card>

      {/* Today */}
      <AppText variant="h3">{t('p.dash.today')}</AppText>
      {!d ? (
        <Row wrap gap={10}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} width="48%" height={86} radius={16} />
          ))}
        </Row>
      ) : (
        <Row wrap gap={10} justify="space-between">
          <Stat label={t('p.dash.newRequests')} value={d.today.new_requests} icon="notifications" tone={colors.action} />
          <Stat label={t('p.dash.active')} value={d.today.active_orders} icon="time" tone={colors.primary} />
          <Stat label={t('p.dash.delivered')} value={d.today.delivered} icon="checkmark-done" tone={colors.success} />
          <Stat label={t('p.dash.sales')} value={formatINRCompact(d.today.sales)} icon="wallet" tone="#0891B2" />
          <Stat label={t('p.dash.views')} value={d.today.views} icon="eye" tone="#7C3AED" />
          <Stat label={`${t('p.dash.calls')} / ${t('p.dash.whatsapp')}`} value={`${d.today.call_taps} / ${d.today.whatsapp_taps}`} icon="call" tone={colors.whatsapp} />
        </Row>
      )}

      {/* Needs attention */}
      <AppText variant="h3">{t('p.dash.needsAttention')}</AppText>
      {d && !d.attention.length ? (
        <Card style={{ alignItems: 'center', gap: 6 }}>
          <Ionicons name="checkmark-circle" size={32} color={colors.success} />
          <AppText variant="bodySmall" color="textMuted" align="center">{t('p.dash.allClear')}</AppText>
        </Card>
      ) : null}
      {d?.attention.map((o) => <PartnerOrderRow key={o.id} o={o} />)}

      {d?.low_stock ? (
        <Pressable onPress={() => router.push('/partner/products')}>
          <InfoBanner tone="warning" icon="cube" text={t('p.dash.lowStock', { count: d.low_stock })} />
        </Pressable>
      ) : null}
      {d?.unread_reviews ? (
        <Pressable onPress={() => router.push('/partner/reviews')}>
          <InfoBanner icon="chatbubbles" text={t('p.dash.unreplied', { count: d.unread_reviews })} />
        </Pressable>
      ) : null}

      <Row gap={10}>
        <Button title={t('p.products.add')} icon="add-circle" variant="secondary" style={{ flex: 1 }} onPress={() => router.push('/partner/product/add')} />
        <Button title={t('p.dash.shareShop')} icon="qr-code" variant="outline" style={{ flex: 1 }} onPress={() => router.push('/partner/qr')} />
      </Row>
      <AppText variant="caption" color="textSubtle" align="center">{d ? `${formatINR(d.today.sales)} · ${d.today.orders_today} ${t('p.ins.orders').toLowerCase()}` : ''}</AppText>
    </Screen>
  );
}
