import { router } from 'expo-router';

import { useTranslation } from '@/shared/i18n';
import { EmptyState, Screen } from '@/shared/ui';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <Screen>
      <EmptyState icon="compass-outline" title={t('common.somethingWrong')} action={t('tabs.home')} onAction={() => router.replace('/')} />
    </Screen>
  );
}
