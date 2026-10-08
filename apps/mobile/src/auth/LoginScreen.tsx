import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { normalizeIndianPhone } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { supabase } from '@/shared/api/supabase';
import { LANGUAGES, setLanguage, useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Chip, Input, Row } from '@/shared/ui';

export default function LoginScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const send = async () => {
    const e164 = normalizeIndianPhone(phone);
    if (!e164) {
      setError(t('auth.invalidPhone'));
      return;
    }
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithOtp({ phone: e164 });
    setLoading(false);
    if (err) {
      setError(errorText(err, t));
      return;
    }
    router.push({ pathname: '/otp', params: { phone: e164 } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient colors={['#4F46E5', '#3730A3']} style={{ paddingBottom: 36 }}>
        <SafeAreaView edges={['top']}>
          <Row justify="flex-end" gap={6} style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            {LANGUAGES.map((l) => (
              <Chip key={l.code} label={l.native} selected={i18n.language === l.code} onPress={() => setLanguage(l.code)} />
            ))}
          </Row>
          <View style={{ paddingHorizontal: 24, paddingTop: 28, gap: 10 }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="flash" size={34} color="#FF8A5C" />
            </View>
            <AppText variant="display" color="#FFFFFF">{t('auth.welcome')}</AppText>
            <AppText variant="body" color="#E0E7FF">{t('auth.subtitle')}</AppText>
          </View>
        </SafeAreaView>
      </LinearGradient>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 18, marginTop: -20 }} keyboardShouldPersistTaps="handled">
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 20, gap: 16 }}>
            <Input
              testID="phone-input"
              label={t('auth.phoneLabel')}
              prefix="+91"
              placeholder={t('auth.phonePlaceholder')}
              keyboardType="phone-pad"
              maxLength={14}
              value={phone}
              onChangeText={setPhone}
              error={error}
              autoFocus
              onSubmitEditing={send}
            />
            <Button testID="send-otp" title={t('auth.sendOtp')} variant="action" size="lg" loading={loading} onPress={send} full />
            <AppText variant="caption" color="textMuted" align="center">{t('auth.terms')}</AppText>
          </View>
          <View style={{ backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12 }}>
            <AppText variant="caption" color="primary" align="center">{t('auth.demoHint')}</AppText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
