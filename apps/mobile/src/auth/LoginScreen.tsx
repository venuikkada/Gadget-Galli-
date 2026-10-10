import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { normalizeIndianPhone } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { supabase } from '@/shared/api/supabase';
import { config } from '@/shared/config';
import { LANGUAGES, setLanguage, useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { shadow } from '@/shared/theme/tokens';
import { AppText, BrandGradient, BrandMark, Button, Chip, Input, Row, TrustStrip } from '@/shared/ui';

const PARTNER = config.app === 'partner';

export default function LoginScreen() {
  const { t, i18n } = useTranslation();
  const { colors, dark } = useTheme();
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
      <StatusBar style="light" />
      <BrandGradient variant={PARTNER ? 'partner' : 'brand'} style={{ paddingBottom: 48 }}>
        <SafeAreaView edges={['top']}>
          <Row justify="flex-end" gap={6} style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            {LANGUAGES.map((l) => (
              <Chip key={l.code} tone="onBrand" label={l.native} selected={i18n.language === l.code} onPress={() => setLanguage(l.code)} />
            ))}
          </Row>
          <View style={{ paddingHorizontal: 24, paddingTop: 24, gap: 10 }}>
            <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
              <BrandMark size={58} />
            </View>
            <AppText variant="display" color="onBrand">{t(PARTNER ? 'auth.partnerWelcome' : 'auth.welcome')}</AppText>
            <AppText variant="body" color="onBrandMuted">{t(PARTNER ? 'auth.partnerSubtitle' : 'auth.subtitle')}</AppText>
          </View>
        </SafeAreaView>
      </BrandGradient>
      {/* The form scrolls over the bottom of the gradient, so the card's rounded top is not clipped. */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, marginTop: -48 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View style={[{ backgroundColor: colors.surface, borderRadius: 24, padding: 20, gap: 16 }, shadow(3, dark)]}>
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
          {config.demo ? (
            <View style={{ backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }} testID="demo-hint">
              <Ionicons name="key-outline" size={15} color={colors.primary} />
              <AppText variant="caption" color="primary" align="center" style={{ flexShrink: 1 }}>
                {config.app === 'all' ? t('auth.demoHint') : t('auth.demoLogin', { phone: PARTNER ? '+91 90000 10002' : '+91 90000 00001' })}
              </AppText>
            </View>
          ) : null}
          {PARTNER ? null : <TrustStrip />}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
