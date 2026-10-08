import { useLocalSearchParams } from 'expo-router';

import { useTranslation } from '@/shared/i18n';
import { AppText, Card, Header, Screen } from '@/shared/ui';

export default function LegalScreen() {
  const { t } = useTranslation();
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const privacy = doc === 'privacy';
  return (
    <Screen header={<Header title={privacy ? t('profile.privacy') : t('profile.terms')} />}>
      <Card>
        <AppText variant="body">{privacy ? t('legal.privacyBody') : t('legal.termsBody')}</AppText>
      </Card>
    </Screen>
  );
}
