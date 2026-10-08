import { Redirect } from 'expo-router';

import { useMyShop } from '@/partner/api';
import { Loading, Screen } from '@/shared/ui';

/** Registration first; otherwise the dashboard. */
export default function PartnerIndex() {
  const { data: shop, isLoading } = useMyShop();
  if (isLoading) return <Screen><Loading /></Screen>;
  if (!shop || shop.status === 'draft') return <Redirect href="/partner/register" />;
  return <Redirect href="/partner/dashboard" />;
}
