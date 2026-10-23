import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { View } from 'react-native';

import { config } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { openWhatsApp } from '@/shared/lib/linking';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { errorText } from '@/shared/api/rpc';
import { AppText, Button, Card, ErrorState, Header, Loading, Screen } from '@/shared/ui';

import { useMyShop } from '../api';

/** "Under review" / "Rejected" (with reason) / "Changes requested" / "Live" status for the shop. */
export default function StatusScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: shop, isPending, isError, error, refetch, isRefetching } = useMyShop();
  if (isError) return <Screen><ErrorState message={errorText(error, t)} onRetry={() => refetch()} /></Screen>;
  if (isPending) return <Screen><Loading /></Screen>;
  if (!shop) return <Redirect href="/partner/register" />;
  const s = shop.status;
  const tone = s === 'approved' ? colors.success : s === 'under_review' ? colors.primary : s === 'draft' ? colors.warning : colors.error;
  const icon = s === 'approved' ? 'checkmark-circle' : s === 'under_review' ? 'hourglass' : s === 'draft' ? 'create' : 'alert-circle';
  return (
    <Screen header={<Header title={t('p.more.status')} onBack={() => router.replace('/partner/dashboard')} />} refreshing={isRefetching} onRefresh={refetch}>
      <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 28 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: `${tone}22`, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={38} color={tone} />
        </View>
        <AppText variant="h2" align="center" testID="shop-status">{t(`p.status.${s}`)}</AppText>
        {s === 'under_review' ? <AppText variant="bodySmall" color="textMuted" align="center">{t('p.status.under_reviewBody')}</AppText> : null}
        {shop.status_reason ? <AppText variant="bodySmall" color="error" align="center">{t('p.status.reason', { reason: shop.status_reason })}</AppText> : null}
        <AppText variant="title">{shop.name}</AppText>
      </Card>
      {s === 'draft' ? <Button title={t('p.status.continueReg')} variant="action" size="lg" full onPress={() => router.replace('/partner/register')} /> : null}
      {s === 'rejected' || s === 'changes_requested' ? (
        <Button title={t('p.status.editDetails')} variant="action" size="lg" full onPress={() => router.push({ pathname: '/partner/register', params: { step: '1' } })} />
      ) : null}
      {s !== 'draft' ? <Button title={t('p.status.addProducts')} icon="add-circle-outline" variant="secondary" size="lg" full onPress={() => router.replace('/partner/products')} /> : null}
      {s === 'approved' ? <Button title={t('p.tabs.dashboard')} variant="primary" size="lg" full onPress={() => router.replace('/partner/dashboard')} /> : null}
      <Button title={t('p.status.contact')} icon="logo-whatsapp" variant="outline" full onPress={() => openWhatsApp(config.support.whatsapp, `Hi, about my shop ${shop.name}`)} />
    </Screen>
  );
}
