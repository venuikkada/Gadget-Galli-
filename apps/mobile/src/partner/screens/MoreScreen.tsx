import Constants from 'expo-constants';
import { router } from 'expo-router';
import { View } from 'react-native';

import { formatPhone } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { config } from '@/shared/config';
import { useProfile, useUpdateProfile } from '@/shared/hooks/profile';
import { LANGUAGES, useTranslation } from '@/shared/i18n';
import { deleteAccount, signOut } from '@/shared/lib/auth';
import { openUrl } from '@/shared/lib/linking';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Card, confirmDialog, Divider, Header, ListItem, Row, Screen, ShopAvatar, Tag, toast, VerifiedBadge } from '@/shared/ui';

import { useMyShop } from '../api';

const STATUS_TONE = { approved: 'success', under_review: 'primary', changes_requested: 'warning', rejected: 'error', suspended: 'error', draft: 'neutral' } as const;

export default function MoreScreen() {
  const { t, i18n } = useTranslation();
  const { colors, preference } = useTheme();
  const { data: profile } = useProfile();
  const { data: shop } = useMyShop();
  const update = useUpdateProfile();

  const switchToBuying = async () => {
    try {
      await update.mutateAsync({ role: 'customer' });
      router.replace('/');
    } catch (e) {
      toast(errorText(e, t), 'error');
    }
  };

  return (
    <Screen header={<Header title={t('p.more.title')} back={false} />}>
      {shop ? (
        <Card onPress={() => router.push({ pathname: '/partner/register', params: { edit: '1' } })}>
          <Row gap={12}>
            <ShopAvatar name={shop.name ?? 'Shop'} path={shop.logo_path} size={52} />
            <View style={{ flex: 1, gap: 4 }}>
              <Row gap={6}>
                <AppText variant="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{shop.name}</AppText>
                {shop.verified ? <VerifiedBadge /> : null}
              </Row>
              <AppText variant="caption" color="textMuted">{[profile?.user.name, formatPhone(profile?.user.phone)].filter(Boolean).join(' · ')}</AppText>
              <Tag label={t(`p.status.${shop.status}`)} tone={STATUS_TONE[shop.status] ?? 'neutral'} />
            </View>
          </Row>
        </Card>
      ) : null}

      <Card padded={false} style={{ paddingHorizontal: 10 }}>
        <ListItem icon="storefront-outline" title={t('p.more.shopProfile')} onPress={() => router.push({ pathname: '/partner/register', params: { edit: '1' } })} testID="more-shop" />
        <Divider />
        <ListItem icon="shield-checkmark-outline" title={t('p.more.status')} subtitle={shop ? t(`p.status.${shop.status}`) : undefined} onPress={() => router.push('/partner/status')} />
        <Divider />
        <ListItem icon="star-outline" title={t('p.more.reviews')} subtitle={shop?.rating_count ? `${Number(shop.rating_avg).toFixed(1)} ★ · ${shop.rating_count}` : undefined} onPress={() => router.push('/partner/reviews')} testID="more-reviews" />
        <Divider />
        <ListItem icon="qr-code-outline" title={t('p.more.qr')} onPress={() => router.push('/partner/qr')} testID="more-qr" />
        <Divider />
        <ListItem icon="cloud-upload-outline" title={t('p.products.bulk')} onPress={() => router.push('/partner/product/bulk')} />
        <Divider />
        <ListItem icon="notifications-outline" title={t('p.more.notifications')} onPress={() => router.push({ pathname: '/notifications', params: { app: 'partner' } })} />
      </Card>

      <Card padded={false} style={{ paddingHorizontal: 10 }}>
        <ListItem icon="language-outline" title={t('p.more.language')} subtitle={LANGUAGES.find((l) => l.code === i18n.language)?.native} onPress={() => router.push('/settings')} />
        <Divider />
        <ListItem icon="contrast-outline" title={t('p.more.appearance')} subtitle={t(`appearance.${preference}`)} onPress={() => router.push('/settings')} />
        <Divider />
        <ListItem icon="help-buoy-outline" title={t('p.more.help')} onPress={() => router.push('/help')} />
        <Divider />
        <ListItem icon="document-text-outline" title={t('profile.terms')} onPress={() => router.push({ pathname: '/legal', params: { doc: 'terms' } })} />
        <Divider />
        <ListItem icon="lock-closed-outline" title={t('profile.privacy')} onPress={() => router.push({ pathname: '/legal', params: { doc: 'privacy' } })} />
      </Card>

      <Card padded={false} style={{ paddingHorizontal: 10, backgroundColor: colors.primarySoft }}>
        {config.app === 'all' || config.customerAppUrl ? (
          <ListItem icon="bag-handle-outline" title={t('p.more.switch')} onPress={config.app === 'all' ? switchToBuying : () => openUrl(config.customerAppUrl)} testID="switch-to-buying" />
        ) : null}
      </Card>

      <Card padded={false} style={{ paddingHorizontal: 10 }}>
        <ListItem
          icon="log-out-outline"
          title={t('p.more.logout')}
          testID="partner-logout"
          onPress={async () => {
            if (await confirmDialog({ title: t('profile.logoutConfirm'), confirmText: t('profile.logout'), cancelText: t('common.cancel') })) signOut();
          }}
        />
        <Divider />
        <ListItem icon="trash-outline" title={t('profile.delete')} danger onPress={() => deleteAccount(t)} />
      </Card>
      <AppText variant="caption" color="textSubtle" align="center">{t('profile.version', { v: Constants.expoConfig?.version ?? '1.0.0' })}</AppText>
    </Screen>
  );
}
