import { useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ShopOrderFilter } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Chip, EmptyState, ErrorState, SkeletonCard } from '@/shared/ui';

import { useMyShop, useShopOrders } from '../api';
import { PartnerOrderRow } from '../components/PartnerOrderRow';

const FILTERS: Exclude<ShopOrderFilter, 'all'>[] = ['active', 'new', 'confirmed', 'paid', 'dispatched', 'delivered', 'cancelled', 'issues'];

export default function PartnerOrdersScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: shop } = useMyShop();
  const [filter, setFilter] = useState<ShopOrderFilter>('active');
  const q = useShopOrders(shop?.id, filter);
  const counts = q.data?.counts;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 10 }}>
        <AppText variant="h1">{t('p.orders.title')}</AppText>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }} style={{ flexGrow: 0 }}>
        {FILTERS.map((f) => (
          <Chip
            key={f}
            testID={`filter-${f}`}
            label={f === 'active' ? t('orders.active') : t(`p.orders.${f}`)}
            count={counts ? counts[f] : undefined}
            selected={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </ScrollView>
      {q.isError ? (
        <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <View style={{ padding: 16, gap: 12 }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={q.data.items}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => <PartnerOrderRow o={item} />}
          contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12, paddingBottom: 40 }}
          refreshing={q.isRefetching}
          onRefresh={() => q.refetch()}
          ListEmptyComponent={<EmptyState icon="receipt-outline" title={t('p.orders.empty')} />}
        />
      )}
    </SafeAreaView>
  );
}
