import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorText } from '@/shared/api/rpc';
import { useRealtime } from '@/shared/hooks/realtime';
import { useUserId } from '@/shared/hooks/session';
import { useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, EmptyState, ErrorState, Segmented, SkeletonCard } from '@/shared/ui';

import { useMyOrders } from '../api';
import { OrderRow } from '../components/cards';

export default function OrdersScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [scope, setScope] = useState<'active' | 'past'>('active');
  const q = useMyOrders(scope);
  const userId = useUserId();
  useRealtime(`orders-${userId}`, 'orders', userId ? `customer_id=eq.${userId}` : null, () => q.refetch(), !!userId);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
        <AppText variant="h1">{t('orders.title')}</AppText>
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: 'active', label: t('orders.active') },
            { value: 'past', label: t('orders.past') },
          ]}
        />
      </View>
      {q.isError ? (
        <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <View style={{ padding: 16, gap: 12 }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={q.data}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => <OrderRow o={item} />}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}
          refreshing={q.isRefetching}
          onRefresh={() => q.refetch()}
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title={scope === 'active' ? t('orders.emptyActive') : t('orders.emptyPast')}
              body={t('orders.emptyBody')}
              action={t('cart.startShopping')}
              onAction={() => router.push('/search')}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
