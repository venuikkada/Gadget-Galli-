import { errorText } from '@/shared/api/rpc';
import { useTranslation } from '@/shared/i18n';
import { EmptyState, ErrorState, Header, Loading, Screen } from '@/shared/ui';

import { useFavouriteShops } from '../api';
import { ShopListRow } from '../components/cards';

export default function FavouritesScreen() {
  const { t } = useTranslation();
  const q = useFavouriteShops();
  return (
    <Screen header={<Header title={t('profile.favourites')} />} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {q.isLoading ? <Loading /> : null}
      {q.isError && !q.data ? <ErrorState message={errorText(q.error, t)} onRetry={() => q.refetch()} /> : null}
      {q.data && !q.data.length ? <EmptyState icon="heart-outline" title={t('favourites.empty')} /> : null}
      {q.data?.map((s) => <ShopListRow key={s.id} s={s} />)}
    </Screen>
  );
}
