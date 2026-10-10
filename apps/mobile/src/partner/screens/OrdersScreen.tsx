import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ShopOrderFilter } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, BrandGradient, Chip, EmptyState, ErrorState, SkeletonCard } from '@/shared/ui';

import { useMyShop, useShopOrders } from '../api';
import { PartnerOrderRow } from '../components/PartnerOrderRow';

const FILTERS: Exclude<ShopOrderFilter, 'all'>[] = ['active', 'new', 'confirmed', 'paid', 'dispatched', 'delivered', 'cancelled', 'issues'];

export default function PartnerOrdersScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { data: shop } = useMyShop();
  const [filter, setFilter] = useState<ShopOrderFilter>('active');
  const q = useShopOrders(shop?.id, filter);
  const counts = q.data?.counts;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <BrandGradient variant="partner" style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 }}>
        <AppText variant="h1" color="onBrand">{t('p.orders.title')}</AppText>
      </BrandGradient>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }} style={{ flexGrow: 0 }}>
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
    </View>
  );
}
