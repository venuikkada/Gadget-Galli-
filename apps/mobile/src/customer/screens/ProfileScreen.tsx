import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { formatPhone } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { config } from '@/shared/config';
import { useProfile, useUpdateProfile } from '@/shared/hooks/profile';
import { LANGUAGES, useTranslation } from '@/shared/i18n';
import { deleteAccount, signOut } from '@/shared/lib/auth';
import { openUrl } from '@/shared/lib/linking';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, BrandGradient, Button, Card, confirmDialog, Divider, Header, Input, ListItem, Row, Screen, Sheet, toast } from '@/shared/ui';

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const { colors, preference } = useTheme();
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const [editName, setEditName] = useState(false);
  const [name, setName] = useState('');
  const user = profile?.user;

  const switchRole = async () => {
    try {
      await update.mutateAsync({ role: 'shop_owner' });
      router.replace('/partner');
    } catch (e) {
      toast(errorText(e, t), 'error');
    }
  };

  return (
    <Screen
      brand
      header={
        <Header variant="brand" title={t('profile.title')} back={false}>
          <Row gap={14}>
            <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.35)' }}>
              <AppText variant="h2" color="onAccent">{(user?.name ?? 'G')[0]}</AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="h3" color="onBrand">{user?.name}</AppText>
              <AppText variant="bodySmall" color="onBrandMuted">{formatPhone(user?.phone)}</AppText>
            </View>
            <Button
              title={t('common.edit')}
              variant="onBrand"
              size="sm"
              icon="create-outline"
              onPress={() => {
                setName(user?.name ?? '');
                setEditName(true);
              }}
            />
          </Row>
        </Header>
      }
    >
      <Card padded={false} style={{ paddingHorizontal: 10 }}>
        <ListItem icon="location-outline" title={t('profile.addresses')} onPress={() => router.push('/addresses')} />
        <Divider />
        <ListItem icon="heart-outline" title={t('profile.favourites')} onPress={() => router.push('/favourites')} />
        <Divider />
        <ListItem icon="star-outline" title={t('profile.reviews')} onPress={() => router.push('/my-reviews')} />
        <Divider />
        <ListItem icon="notifications-outline" title={t('profile.notifications')} onPress={() => router.push({ pathname: '/notifications', params: { app: 'customer' } })} />
        <Divider />
        <ListItem icon="gift-outline" title={t('profile.invite')} subtitle={user?.referral_code ?? undefined} onPress={() => router.push('/referral')} />
      </Card>

      <Card padded={false} style={{ paddingHorizontal: 10 }}>
        <ListItem icon="language-outline" title={t('profile.language')} subtitle={LANGUAGES.find((l) => l.code === i18n.language)?.native} onPress={() => router.push('/settings')} />
        <Divider />
        <ListItem icon="contrast-outline" title={t('profile.appearance')} subtitle={t(`appearance.${preference}`)} onPress={() => router.push('/settings')} />
        <Divider />
        <ListItem icon="help-buoy-outline" title={t('profile.help')} onPress={() => router.push('/help')} />
        <Divider />
        <ListItem icon="document-text-outline" title={t('profile.terms')} onPress={() => router.push({ pathname: '/legal', params: { doc: 'terms' } })} />
        <Divider />
        <ListItem icon="lock-closed-outline" title={t('profile.privacy')} onPress={() => router.push({ pathname: '/legal', params: { doc: 'privacy' } })} />
      </Card>

      {config.app === 'all' || config.partnerAppUrl ? (
        <BrandGradient style={{ borderRadius: 20, padding: 18, gap: 8 }}>
          <AppText variant="h3" color="onBrand">{t('profile.ownShop')}</AppText>
          <AppText variant="bodySmall" color="onBrandMuted">{t('profile.ownShopBody')}</AppText>
          <Button
            testID="switch-to-shop"
            title={t('profile.switchToShop')}
            icon="storefront"
            variant="onBrand"
            onPress={config.app === 'all' ? switchRole : () => openUrl(config.partnerAppUrl)}
            loading={update.isPending}
            style={{ alignSelf: 'flex-start', marginTop: 4 }}
          />
        </BrandGradient>
      ) : null}

      <Card padded={false} style={{ paddingHorizontal: 10 }}>
        <ListItem
          icon="log-out-outline"
          title={t('profile.logout')}
          onPress={async () => {
            if (await confirmDialog({ title: t('profile.logoutConfirm'), confirmText: t('profile.logout'), cancelText: t('common.cancel') })) signOut();
          }}
        />
        <Divider />
        <ListItem icon="trash-outline" title={t('profile.delete')} danger onPress={() => deleteAccount(t)} />
      </Card>
      <AppText variant="caption" color="textSubtle" align="center">{t('profile.version', { v: Constants.expoConfig?.version ?? '1.0.0' })}</AppText>

      <Sheet
        visible={editName}
        onClose={() => setEditName(false)}
        title={t('profile.editName')}
        footer={
          <Button
            title={t('common.save')}
            full
            loading={update.isPending}
            onPress={async () => {
              try {
                await update.mutateAsync({ name });
                setEditName(false);
              } catch (e) {
                toast(errorText(e, t), 'error');
              }
            }}
          />
        }
      >
        <Input value={name} onChangeText={setName} autoFocus autoCapitalize="words" />
      </Sheet>
    </Screen>
  );
}
