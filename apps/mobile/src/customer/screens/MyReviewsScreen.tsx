import { router } from 'expo-router';

import { useTranslation } from '@/shared/i18n';
import { AppText, Card, EmptyState, Header, Loading, Screen } from '@/shared/ui';

import { useMyReviews } from '../api';
import { ReviewItem } from '../components/cards';

export default function MyReviewsScreen() {
  const { t } = useTranslation();
  const q = useMyReviews();
  return (
    <Screen header={<Header title={t('profile.reviews')} />} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {q.isLoading ? <Loading /> : null}
      {q.data && !q.data.length ? <EmptyState icon="star-outline" title={t('myReviews.empty')} /> : null}
      {q.data?.map((r) => (
        <Card key={r.id} onPress={() => router.push(`/order/${r.order_id}`)}>
          <AppText variant="title">{r.shop_name}</AppText>
          <ReviewItem r={{ ...r, customer_name: t('actor.customer'), shop_replied_at: null }} />
        </Card>
      ))}
    </Screen>
  );
}
