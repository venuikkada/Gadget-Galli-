import { useTranslation } from '@/shared/i18n';
import { EmptyState, Header, Loading, Screen } from '@/shared/ui';

import { useShopsNear } from '../api';
import { ShopListRow } from '../components/cards';

export default function ShopsScreen() {
  const { t } = useTranslation();
  // Every shop delivers all over Hyderabad (DECISIONS #54), nearest first
  const q = useShopsNear();
  return (
    <Screen header={<Header title={t('home.shopsNear')} />} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {q.isLoading ? <Loading /> : null}
      {q.data && !q.data.length ? <EmptyState icon="storefront-outline" title={t('home.noShopsTitle')} body={t('home.noShopsBody')} /> : null}
      {q.data?.map((s) => <ShopListRow key={s.id} s={s} />)}
    </Screen>
  );
}
