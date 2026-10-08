import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';



import { rpc } from '@/shared/api/rpc';
import { refreshProfile } from '@/shared/hooks/profile';
import { useTranslation } from '@/shared/i18n';
import { tDateTime } from '@/shared/i18n/format';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Card, EmptyState, Header, Loading, Row, Screen } from '@/shared/ui';

import { useNotifications } from '../api';

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { app } = useLocalSearchParams<{ app?: 'customer' | 'partner' }>();
  const which = app === 'partner' ? 'partner' : 'customer';
  const q = useNotifications(which);

  useEffect(() => {
    rpc('mark_notifications_read', { p_app: which }).then(refreshProfile).catch(() => undefined);
  }, [which]);

  return (
    <Screen header={<Header title={t('notifications.title')} />} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {q.isLoading ? <Loading /> : null}
      {q.data && !q.data.length ? <EmptyState icon="notifications-off-outline" title={t('notifications.empty')} /> : null}
      {q.data?.map((n) => (
        <Card key={n.id} onPress={n.data?.url ? () => router.push(n.data.url as never) : undefined} style={!n.read_at ? { borderLeftWidth: 4, borderLeftColor: colors.action } : undefined}>
          <Row align="flex-start" gap={12}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={n.kind.includes('order') ? 'receipt-outline' : n.kind.includes('review') ? 'star-outline' : 'notifications-outline'} size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="title">{n.title}</AppText>
              <AppText variant="bodySmall" color="textMuted">{n.body}</AppText>
              <AppText variant="caption" color="textSubtle">{tDateTime(n.created_at)}</AppText>
            </View>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
