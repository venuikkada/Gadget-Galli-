import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';

import type { Language } from '@gg/shared';

import { useUpdateProfile } from '@/shared/hooks/profile';
import { useSession } from '@/shared/hooks/session';
import { LANGUAGES, setLanguage, useTranslation } from '@/shared/i18n';
import { useTheme, type ThemePreference } from '@/shared/theme/ThemeProvider';
import { AppText, Card, Divider, Header, Row, Screen } from '@/shared/ui';

/** Language (English, Telugu, Hindi) and light/dark appearance. */
export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { colors, preference, setPreference } = useTheme();
  const session = useSession((s) => s.session);
  const update = useUpdateProfile();

  const choose = async (lang: Language) => {
    await setLanguage(lang);
    if (session) update.mutate({ language: lang });
  };

  const Option = ({ selected, label, onPress, testID }: { selected: boolean; label: string; onPress: () => void; testID?: string }) => (
    <Pressable testID={testID} onPress={onPress} style={{ paddingVertical: 14 }}>
      <Row justify="space-between">
        <AppText variant="body" weight={selected ? 'semibold' : 'regular'}>{label}</AppText>
        <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.primary : colors.textSubtle} />
      </Row>
    </Pressable>
  );

  return (
    <Screen header={<Header title={`${t('profile.language')} & ${t('profile.appearance')}`} />}>
      <AppText variant="label" color="textMuted">{t('profile.language')}</AppText>
      <Card padded={false} style={{ paddingHorizontal: 14 }}>
        {LANGUAGES.map((l, i) => (
          <Pressable key={l.code}>
            {i > 0 ? <Divider /> : null}
            <Option testID={`lang-${l.code}`} selected={i18n.language === l.code} label={`${l.native}${l.code !== 'en' ? ` · ${l.label}` : ''}`} onPress={() => choose(l.code)} />
          </Pressable>
        ))}
      </Card>
      <AppText variant="label" color="textMuted">{t('profile.appearance')}</AppText>
      <Card padded={false} style={{ paddingHorizontal: 14 }}>
        {(['system', 'light', 'dark'] as ThemePreference[]).map((p, i) => (
          <Pressable key={p}>
            {i > 0 ? <Divider /> : null}
            <Option testID={`theme-${p}`} selected={preference === p} label={t(`appearance.${p}`)} onPress={() => setPreference(p)} />
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}
