import { useTranslation } from '@/shared/i18n';
import { EmptyState, Header, Loading, Screen } from '@/shared/ui';

import { useFavouriteShops } from '../api';
import { ShopListRow } from '../components/cards';

export default function FavouritesScreen() {
  const { t } = useTranslation();
  const q = useFavouriteShops();
  return (
    <Screen header={<Header title={t('profile.favourites')} />} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {q.isLoading ? <Loading /> : null}
      {q.data && !q.data.length ? <EmptyState icon="heart-outline" title={t('favourites.empty')} /> : null}
      {q.data?.map((s) => <ShopListRow key={s.id} s={s} />)}
    </Screen>
  );
}
