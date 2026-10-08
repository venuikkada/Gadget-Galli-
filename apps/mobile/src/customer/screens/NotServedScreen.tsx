import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { errorText, rpc } from '@/shared/api/rpc';
import { useTranslation } from '@/shared/i18n';
import { Button, EmptyState, Header, Screen, toast } from '@/shared/ui';

/** Shown when the customer's location is outside Hyderabad. */
export default function NotServedScreen() {
  const { t } = useTranslation();
  const { lat, lng, place } = useLocalSearchParams<{ lat?: string; lng?: string; place?: string }>();
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const notify = async () => {
    setLoading(true);
    try {
      await rpc('notify_me_outside', { p_place: place || 'Outside Hyderabad', p_lat: lat ? Number(lat) : null, p_lng: lng ? Number(lng) : null });
      setSent(true);
      toast(t('location.notifyDone'), 'success');
    } catch (e) {
      toast(errorText(e, t), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen header={<Header />}>
      <EmptyState icon="map-outline" title={t('location.notServedTitle')} body={sent ? t('location.notifyDone') : t('location.notServedBody')} />
      {!sent ? <Button testID="notify-me" title={t('location.notifyMe')} icon="notifications" variant="action" size="lg" full loading={loading} onPress={notify} /> : null}
      <Button title={t('location.chooseAnother')} variant="outline" size="lg" full onPress={() => router.replace('/location')} />
    </Screen>
  );
}
