import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { View } from 'react-native';

import { errorText } from '@/shared/api/rpc';
import { useProfile } from '@/shared/hooks/profile';
import { useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Card, confirmDialog, EmptyState, Header, IconButton, Row, Screen, Tag, toast } from '@/shared/ui';

import { deleteAddress } from '../api';

export default function AddressesScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: profile, refetch, isRefetching } = useProfile();
  const addresses = profile?.addresses ?? [];

  return (
    <Screen
      header={<Header title={t('profile.addresses')} />}
      refreshing={isRefetching}
      onRefresh={refetch}
      footer={<Button title={t('address.addNew')} icon="add" variant="primary" size="lg" full onPress={() => router.push('/address')} />}
    >
      {!addresses.length ? <EmptyState icon="home-outline" title={t('address.none')} /> : null}
      {addresses.map((a) => (
        <Card key={a.id}>
          <Row align="flex-start" gap={12}>
            <Ionicons name={a.label === 'office' ? 'briefcase-outline' : a.label === 'home' ? 'home-outline' : 'location-outline'} size={22} color={colors.primary} />
            <View style={{ flex: 1, gap: 3 }}>
              <Row gap={6}>
                <AppText variant="title">{a.label === 'other' ? a.label_custom || t('address.other') : t(`address.${a.label}`)}</AppText>
                {a.is_default ? <Tag label={t('address.default')} tone="primary" /> : null}
              </Row>
              <AppText variant="bodySmall" color="textMuted">{[a.house, a.building, a.street, a.landmark, a.area_name, a.pincode].filter(Boolean).join(', ')}</AppText>
              {a.lat ? <Tag label={t('address.pinSet')} icon="pin" tone="success" /> : null}
            </View>
            <IconButton icon="create-outline" onPress={() => router.push({ pathname: '/address', params: { id: a.id } })} label={t('common.edit')} />
            <IconButton
              icon="trash-outline"
              color={colors.error}
              label={t('common.delete')}
              onPress={async () => {
                if (!(await confirmDialog({ title: t('address.deleteConfirm'), destructive: true, confirmText: t('common.delete'), cancelText: t('common.cancel') }))) return;
                try {
                  await deleteAddress(a.id);
                } catch (e) {
                  toast(errorText(e, t), 'error');
                }
              }}
            />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
