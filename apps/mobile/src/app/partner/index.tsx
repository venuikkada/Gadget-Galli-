import { Redirect } from 'expo-router';

import { useMyShop } from '@/partner/api';
import { errorText } from '@/shared/api/rpc';
import { useTranslation } from '@/shared/i18n';
import { ErrorState, Loading, Screen } from '@/shared/ui';

/** Registration first; otherwise the dashboard. */
export default function PartnerIndex() {
  const { t } = useTranslation();
  // isPending, not isLoading: until the saved sign-in is restored the query is disabled, which is not "no shop".
  const { data: shop, isPending, isError, error, refetch } = useMyShop();
  if (isError) return <Screen><ErrorState message={errorText(error, t)} onRetry={() => refetch()} /></Screen>;
  if (isPending) return <Screen><Loading /></Screen>;
  if (!shop || shop.status === 'draft') return <Redirect href="/partner/register" />;
  return <Redirect href="/partner/dashboard" />;
}
