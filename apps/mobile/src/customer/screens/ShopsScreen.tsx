import { useState } from 'react';

import { useTranslation } from '@/shared/i18n';
import { EmptyState, Header, Loading, Screen, SwitchRow } from '@/shared/ui';

import { useShopsNear } from '../api';
import { ShopListRow } from '../components/cards';

export default function ShopsScreen() {
  const { t } = useTranslation();
  const [onlyDelivering, setOnlyDelivering] = useState(true);
  const q = useShopsNear(onlyDelivering);
  return (
    <Screen header={<Header title={t('home.shopsNear')} />} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <SwitchRow label={t('filter.deliversToMe')} value={onlyDelivering} onValueChange={setOnlyDelivering} />
      {q.isLoading ? <Loading /> : null}
      {q.data && !q.data.length ? <EmptyState icon="storefront-outline" title={t('home.noShopsTitle')} body={t('home.noShopsBody')} /> : null}
      {q.data?.map((s) => <ShopListRow key={s.id} s={s} />)}
    </Screen>
  );
}
