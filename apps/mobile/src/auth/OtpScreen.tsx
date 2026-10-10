import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

import { formatPhone } from '@gg/shared';

import { supabase } from '@/shared/api/supabase';
import { refreshProfile } from '@/shared/hooks/profile';
import { useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { fonts, webNoOutline } from '@/shared/theme/tokens';
import { AppText, Button, Header, Row, Screen } from '@/shared/ui';

export default function OtpScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(30);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  const verify = async (value = code) => {
    if (value.length !== 6 || !phone) return;
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ phone, token: value, type: 'sms' });
    setLoading(false);
    if (err) {
      setError(t('auth.wrongOtp'));
      setCode('');
      return;
    }
    await refreshProfile();
    router.replace('/');
  };

  const resend = async () => {
    if (!phone) return;
    setSeconds(30);
    await supabase.auth.signInWithOtp({ phone });
  };

  return (
    <Screen header={<Header />}>
      <View style={{ gap: 8 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
          <Ionicons name="chatbubble-ellipses" size={26} color={colors.primary} />
        </View>
        <AppText variant="h1">{t('auth.otpTitle')}</AppText>
        <AppText variant="body" color="textMuted">{t('auth.otpSent', { phone: formatPhone(phone) })}</AppText>
      </View>
      <View>
        <Row gap={10} justify="center" style={{ marginVertical: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View
              key={i}
              onTouchEnd={() => input.current?.focus()}
              style={{
                width: 48,
                height: 58,
                borderRadius: 14,
                borderWidth: code.length === i ? 2 : 1.5,
                borderColor: error ? colors.error : code.length === i || code[i] ? colors.primary : colors.border,
                backgroundColor: code[i] ? colors.primarySoft : colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText variant="h2" style={{ fontFamily: fonts.headingBold }}>{code[i] ?? ''}</AppText>
            </View>
          ))}
        </Row>
        <TextInput
          testID="otp-input"
          ref={input}
          value={code}
          onChangeText={(v) => {
            const digits = v.replace(/\D/g, '').slice(0, 6);
            setCode(digits);
            if (digits.length === 6) verify(digits);
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoFocus
          maxLength={6}
          style={[{ position: 'absolute', opacity: 0.01, height: 58, width: '100%' }, webNoOutline]}
        />
      </View>
      {error ? <AppText variant="bodySmall" color="error" align="center">{error}</AppText> : null}
      <Button testID="verify-otp" title={t('auth.verify')} variant="action" size="lg" full loading={loading} disabled={code.length !== 6} onPress={() => verify()} />
      <Row justify="space-between">
        <AppText variant="label" color="primary" onPress={() => router.back()}>{t('auth.changeNumber')}</AppText>
        {seconds > 0 ? (
          <AppText variant="caption" color="textMuted">{t('auth.resendIn', { seconds })}</AppText>
        ) : (
          <AppText variant="label" color="primary" onPress={resend}>{t('auth.resend')}</AppText>
        )}
      </Row>
    </Screen>
  );
}
