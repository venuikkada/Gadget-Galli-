import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { errorText } from '@/shared/api/rpc';
import { PhotoPicker } from '@/shared/components/PhotoPicker';
import { useUserId } from '@/shared/hooks/session';
import { useTranslation } from '@/shared/i18n';
import { AppText, Button, Card, Header, Input, Screen, StarInput, toast } from '@/shared/ui';

import { submitReview, useOrder } from '../api';

/** 1–5 stars, a short review and optional photos after "I received my order". */
export default function ReviewScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order } = useOrder(id);
  const userId = useUserId();
  const [rating, setRating] = useState(order?.review?.rating ?? 0);
  const [body, setBody] = useState(order?.review?.body ?? '');
  const [photos, setPhotos] = useState<string[]>(order?.review?.photos ?? []);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!rating) return toast(t('review.pickRating'), 'error');
    setSaving(true);
    try {
      await submitReview(id, rating, body, photos);
      toast(t('review.thanks'), 'success');
      router.back();
    } catch (e) {
      toast(errorText(e, t), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen header={<Header title={t('review.title', { shop: order?.shop.name ?? '' })} />} footer={<Button testID="submit-review" title={t('review.submit')} variant="action" size="lg" full loading={saving} onPress={submit} />}>
      <Card style={{ gap: 14, alignItems: 'center', paddingVertical: 22 }}>
        <AppText variant="bodySmall" color="textMuted" align="center">{t('review.subtitle')}</AppText>
        <StarInput value={rating} onChange={setRating} />
        <AppText variant="title" color="primary">{rating ? t(`review.s${rating}`) : t('review.pickRating')}</AppText>
      </Card>
      <Input testID="review-body" placeholder={t('review.placeholder')} value={body} onChangeText={setBody} multiline />
      {userId ? <PhotoPicker bucket="review-photos" folder={userId} value={photos} onChange={setPhotos} max={5} label={t('review.addPhotos')} /> : null}
    </Screen>
  );
}
