import { Tabs } from 'expo-router/js-tabs';

import { useCart } from '@/customer/api';
import { StickyCartBar } from '@/customer/components/cartBits';
import { AppTabBar } from '@/shared/components/AppTabBar';
import { useTranslation } from '@/shared/i18n';

export default function CustomerTabs() {
  const { t } = useTranslation();
  const { data: cart } = useCart();
  const count = cart?.totals.item_count ?? 0;
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <AppTabBar
          {...props}
          above={<StickyCartBar inline />}
          items={[
            { name: 'home', label: t('tabs.home'), icon: 'home-outline', iconActive: 'home' },
            { name: 'search', label: t('tabs.search'), icon: 'search-outline', iconActive: 'search' },
            { name: 'cart', label: t('tabs.cart'), icon: 'cart-outline', iconActive: 'cart', badge: count },
            { name: 'orders', label: t('tabs.orders'), icon: 'receipt-outline', iconActive: 'receipt' },
            { name: 'profile', label: t('tabs.profile'), icon: 'person-outline', iconActive: 'person' },
          ]}
        />
      )}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="cart" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
