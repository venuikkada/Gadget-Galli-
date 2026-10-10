import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { chartColors, formatINR, formatINRCompact } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { useProfile } from '@/shared/hooks/profile';
import { useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { shadow } from '@/shared/theme/tokens';
import { AppText, BrandGradient, Button, Card, ErrorState, IconButton, InfoBanner, Row, Screen, ShopAvatar, Skeleton, toast } from '@/shared/ui';

import { setShopOpen, useDashboard, useMyShop } from '../api';
import { PartnerOrderRow } from '../components/PartnerOrderRow';

function Stat({ label, value, icon, tone, highlight }: { label: string; value: string | number; icon: React.ComponentProps<typeof Ionicons>['name']; tone: string; highlight?: boolean }) {
  const { colors } = useTheme();
  return (
    <Card style={[{ width: '48%', gap: 8 }, highlight ? { backgroundColor: colors.accentSoft, borderWidth: 1.5, borderColor: colors.accent } : null]} padded>
      <Row gap={8}>
        <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: highlight ? colors.accent : `${tone}1F`, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={18} color={highlight ? colors.onAccent : tone} />
        </View>
        <AppText variant="caption" color="textMuted" style={{ flex: 1 }} numberOfLines={2}>{label}</AppText>
      </Row>
      <AppText variant="h1">{value}</AppText>
    </Card>
  );
}

export default function DashboardScreen() {
  const { t } = useTranslation();
  const { colors, dark, gradients } = useTheme();
  const insets = useSafeAreaInsets();
  const { data: profile } = useProfile();
  const { data: shop } = useMyShop();
  const dash = useDashboard(shop?.id);
  const d = dash.data;
  // Android can silence apps in the background; remind owners once to allow loud order alerts.
  const [showAlertTip, setShowAlertTip] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    AsyncStorage.getItem('gg.alertTipDone')
      .then((v) => setShowAlertTip(v !== '1'))
      .catch(() => setShowAlertTip(true));
  }, []);
  const doneAlertTip = () => {
    setShowAlertTip(false);
    AsyncStorage.setItem('gg.alertTipDone', '1').catch(() => undefined);
  };

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
      brand
      header={
        <BrandGradient variant="partner" style={{ paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 }}>
          <Row justify="space-between">
            <Row gap={12} style={{ flex: 1 }}>
              {shop ? (
                <View style={{ borderRadius: 17, borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' }}>
                  <ShopAvatar name={shop.name ?? 'Shop'} path={shop.logo_path} size={46} />
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <AppText variant="bodySmall" color="onBrandMuted">{t('p.dash.hello', { name: profile?.user.name?.split(' ')[0] ?? '' })}</AppText>
                <AppText variant="h2" color="onBrand" numberOfLines={1}>{shop?.name}</AppText>
              </View>
            </Row>
            <IconButton icon="notifications-outline" tone="onBrand" badge={profile?.unread} label={t('notifications.title')} onPress={() => router.push({ pathname: '/notifications', params: { app: 'partner' } })} />
          </Row>
        </BrandGradient>
      }
    >
      {dash.isError ? <ErrorState message={errorText(dash.error, t)} onRetry={() => dash.refetch()} /> : null}
      {shop && shop.status !== 'approved' ? (
        <Pressable onPress={() => router.push('/partner/status')}>
          <InfoBanner tone={shop.status === 'under_review' ? 'info' : 'warning'} text={`${t('p.dash.notLive')} · ${t(`p.status.${shop.status}`)}${shop.status_reason ? ` · ${shop.status_reason}` : ''}`} />
        </Pressable>
      ) : null}

      {showAlertTip ? (
        <Card style={{ gap: 10, backgroundColor: colors.warningSoft }} testID="alert-tip">
          <Row align="flex-start" gap={10}>
            <Ionicons name="notifications" size={20} color={colors.warning} />
            <AppText variant="bodySmall" style={{ flex: 1 }}>{t('p.dash.alertTip')}</AppText>
          </Row>
          <Row gap={10}>
            <Button title={t('p.dash.openSettings')} size="sm" variant="outline" icon="settings-outline" onPress={() => Linking.openSettings().catch(() => undefined)} />
            <Button title={t('p.dash.gotIt')} size="sm" variant="ghost" onPress={doneAlertTip} />
          </Row>
        </Card>
      ) : null}

      {/* Open / Closed switch: green when taking orders, red when closed (white text only on both) */}
      <View testID="open-switch-card" style={[{ borderRadius: 22, overflow: 'hidden' }, shadow(2, dark)]}>
        <LinearGradient colors={d?.shop.is_open ? gradients.open : gradients.closed} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 18, gap: 8 }}>
          <View pointerEvents="none" style={{ position: 'absolute', width: 200, height: 200, borderRadius: 100, right: -70, top: -100, backgroundColor: '#FFFFFF', opacity: 0.1 }} />
          <Row justify="space-between" gap={12}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={d?.shop.is_open ? 'storefront' : 'moon'} size={24} color={colors.onBrand} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="h2" color="onBrand">{d?.shop.is_open ? t('p.dash.open') : t('p.dash.closed')}</AppText>
              <AppText variant="bodySmall" color="onBrand">{d?.shop.is_open ? t('p.dash.openHint') : t('p.dash.closedHint')}</AppText>
            </View>
            <Switch
              testID="open-switch"
              value={!!d?.shop.is_open}
              onValueChange={toggleOpen}
              trackColor={{ true: 'rgba(255,255,255,0.45)', false: 'rgba(0,0,0,0.28)' }}
              thumbColor="#FFFFFF"
              style={{ transform: [{ scale: 1.3 }] }}
            />
          </Row>
          {d ? (
            <Row gap={6} style={{ marginTop: 2 }}>
              <Ionicons name="star" size={14} color={colors.star} />
              <AppText variant="label" color="onBrand">
                {[d.shop.rating_avg ? Number(d.shop.rating_avg).toFixed(1) : null, d.shop.rating_count ? `(${d.shop.rating_count})` : null, `${d.shop.orders_delivered} ${t('p.dash.delivered').toLowerCase()}`].filter(Boolean).join(' · ')}
              </AppText>
            </Row>
          ) : null}
        </LinearGradient>
      </View>

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
          <Stat label={t('p.dash.newRequests')} value={d.today.new_requests} icon="notifications" tone={colors.warning} highlight={d.today.new_requests > 0} />
          <Stat label={t('p.dash.active')} value={d.today.active_orders} icon="time" tone={colors.primary} />
          <Stat label={t('p.dash.delivered')} value={d.today.delivered} icon="checkmark-done" tone={colors.success} />
          <Stat label={t('p.dash.sales')} value={formatINRCompact(d.today.sales)} icon="wallet" tone={chartColors[2]} />
          <Stat label={t('p.dash.views')} value={d.today.views} icon="eye" tone={chartColors[4]} />
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
