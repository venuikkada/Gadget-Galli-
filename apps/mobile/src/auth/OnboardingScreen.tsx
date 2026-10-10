import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { UserRole } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { supabase } from '@/shared/api/supabase';
import { config } from '@/shared/config';
import { useProfile, useUpdateProfile } from '@/shared/hooks/profile';
import { currentLanguage, LANGUAGES, setLanguage, useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Input, Row, Screen, toast } from '@/shared/ui';

/** The customer and Shop Partner websites decide the role; the store app asks. */
const FIXED_ROLE: UserRole | null = config.app === 'customer' ? 'customer' : config.app === 'partner' ? 'shop_owner' : null;

/** First-run: language, name and "I want to buy" / "I own a shop". */
export default function OnboardingScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>(FIXED_ROLE ?? 'customer');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.user.name) setName(profile.user.name);
    if (profile?.user.role && !FIXED_ROLE) setRole(profile.user.role);
  }, [profile?.user.name, profile?.user.role]);

  const submit = async () => {
    if (name.trim().length < 2) {
      setError(t('error.NAME_REQUIRED'));
      return;
    }
    try {
      await update.mutateAsync({ name: name.trim(), role, language: currentLanguage(), onboarded: true });
      router.replace(role === 'shop_owner' ? '/partner' : '/location');
    } catch (e) {
      toast(errorText(e, t), 'error');
    }
  };

  const RoleCard = ({ value, icon, title, body }: { value: UserRole; icon: React.ComponentProps<typeof Ionicons>['name']; title: string; body: string }) => {
    const selected = role === value;
    return (
      <Pressable
        testID={`role-${value}`}
        onPress={() => setRole(value)}
        style={{ flex: 1, borderRadius: 18, borderWidth: 2, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primarySoft : colors.surface, padding: 16, gap: 10 }}
      >
        <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: selected ? colors.primary : colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={24} color={selected ? colors.onPrimary : colors.primary} />
        </View>
        <AppText variant="title">{title}</AppText>
        <AppText variant="caption" color="textMuted">{body}</AppText>
      </Pressable>
    );
  };

  return (
    <Screen
      footer={<Button testID="onboarding-continue" title={t('common.continue')} variant="action" size="lg" full loading={update.isPending} onPress={submit} />}
    >
      <View style={{ gap: 10, marginTop: 12 }}>
        <AppText variant="label" color="textMuted">{t('auth.languageTitle')}</AppText>
        <Row gap={8}>
          {LANGUAGES.map((l) => (
            <Pressable
              key={l.code}
              onPress={() => setLanguage(l.code)}
              style={{ flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: i18n.language === l.code ? colors.primary : colors.border, backgroundColor: i18n.language === l.code ? colors.primarySoft : colors.surface }}
            >
              <AppText variant="title" color={i18n.language === l.code ? 'primary' : 'text'}>{l.native}</AppText>
            </Pressable>
          ))}
        </Row>
      </View>
      <View style={{ gap: 10 }}>
        <AppText variant="h2">{t('auth.nameTitle')}</AppText>
        <Input testID="name-input" placeholder={t('auth.namePlaceholder')} value={name} onChangeText={setName} autoCapitalize="words" error={error} />
      </View>
      {FIXED_ROLE ? null : (
        <View style={{ gap: 10 }}>
          <AppText variant="h2">{t('auth.roleTitle')}</AppText>
          <Row gap={12} align="stretch">
            <RoleCard value="customer" icon="bag-handle" title={t('auth.roleBuy')} body={t('auth.roleBuyDesc')} />
            <RoleCard value="shop_owner" icon="storefront" title={t('auth.roleSell')} body={t('auth.roleSellDesc')} />
          </Row>
        </View>
      )}
      <AppText variant="caption" color="textSubtle" align="center" onPress={() => supabase.auth.signOut()}>
        {profile?.user.phone ?? ''}
      </AppText>
    </Screen>
  );
}
