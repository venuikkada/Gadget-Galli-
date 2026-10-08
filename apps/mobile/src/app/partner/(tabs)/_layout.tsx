import { Tabs } from 'expo-router/js-tabs';

import { useDashboard, useMyShop } from '@/partner/api';
import { AppTabBar } from '@/shared/components/AppTabBar';
import { useTranslation } from '@/shared/i18n';

export default function PartnerTabs() {
  const { t } = useTranslation();
  const { data: shop } = useMyShop();
  const { data: dash } = useDashboard(shop?.id);
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <AppTabBar
          {...props}
          items={[
            { name: 'dashboard', label: t('p.tabs.dashboard'), icon: 'grid-outline', iconActive: 'grid' },
            { name: 'orders', label: t('p.tabs.orders'), icon: 'receipt-outline', iconActive: 'receipt', badge: dash?.today.new_requests },
            { name: 'products', label: t('p.tabs.products'), icon: 'cube-outline', iconActive: 'cube' },
            { name: 'insights', label: t('p.tabs.insights'), icon: 'stats-chart-outline', iconActive: 'stats-chart' },
            { name: 'more', label: t('p.tabs.more'), icon: 'menu-outline', iconActive: 'menu' },
          ]}
        />
      )}
    >
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="products" />
      <Tabs.Screen name="insights" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
