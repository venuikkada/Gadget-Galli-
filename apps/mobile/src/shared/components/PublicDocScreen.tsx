import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { config } from '@/shared/config';
import { currentLanguage, LANGUAGES, setLanguage, useTranslation } from '@/shared/i18n';
import { openUrl } from '@/shared/lib/linking';
import { AppText, Button, Card, Header, Row, Screen, Segmented } from '@/shared/ui';

export type PublicDoc = 'terms' | 'privacy' | 'deletion';

const ROUTES: Record<PublicDoc, '/terms' | '/privacy' | '/delete-account'> = { terms: '/terms', privacy: '/privacy', deletion: '/delete-account' };

/**
 * Terms of use, privacy policy and how to delete an account. These pages need no login, so the Play Store
 * listing can link to them (https://<customer website>/privacy, /terms, /delete-account); the app's Profile
 * and More screens open the same pages.
 */
export default function PublicDocScreen({ doc }: { doc: PublicDoc }) {
  const { t } = useTranslation();
  const email = config.support.email;
  const titles: Record<PublicDoc, string> = { terms: t('profile.terms'), privacy: t('profile.privacy'), deletion: t('legal.deletionTitle') };
  const body = doc === 'terms' ? t('legal.termsBody') : doc === 'privacy' ? t('legal.privacyBody', { email }) : t('legal.deletionBody', { email });
  return (
    <Screen header={<Header title={titles[doc]} />}>
      <Segmented options={LANGUAGES.map((l) => ({ value: l.code, label: l.native }))} value={currentLanguage()} onChange={setLanguage} />
      <Card style={{ gap: 12 }}>
        <AppText variant="body" selectable testID="public-doc-body">{body}</AppText>
        <AppText variant="caption" color="textMuted">{t('legal.updated')}</AppText>
      </Card>
      <Button title={t('legal.emailUs')} icon="mail-outline" variant="secondary" full onPress={() => openUrl(`mailto:${email}`)} />
      <Row gap={16} wrap style={{ justifyContent: 'center' }}>
        {(Object.keys(ROUTES) as PublicDoc[])
          .filter((d) => d !== doc)
          .map((d) => (
            <Pressable key={d} onPress={() => router.replace(ROUTES[d])} accessibilityRole="link" testID={`public-doc-${d}`}>
              <AppText variant="bodySmall" color="primary">{titles[d]}</AppText>
            </Pressable>
          ))}
      </Row>
    </Screen>
  );
}
