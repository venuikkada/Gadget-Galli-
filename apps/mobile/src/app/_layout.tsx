import '@/shared/i18n';

import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isConfigured } from '@/shared/api/supabase';
import { useProfile } from '@/shared/hooks/profile';
import { startAuthListener, useSession } from '@/shared/hooks/session';
import { setLanguage, useTranslation } from '@/shared/i18n';
import { registerForPush, useNotificationRouting } from '@/shared/lib/notifications';
import { queryClient } from '@/shared/lib/queryClient';
import { ThemeProvider, useTheme } from '@/shared/theme/ThemeProvider';
import { fontAssets } from '@/shared/theme/tokens';
import { AppText, DialogHost, ToastHost } from '@/shared/ui';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
startAuthListener();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded, fontError]);
  if (!fontsLoaded && !fontError) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <AppShell />
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppShell() {
  const { colors, dark } = useTheme();
  const navTheme = useMemo(() => {
    const base = dark ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, primary: colors.primary, background: colors.background, card: colors.surface, text: colors.text, border: colors.border } };
  }, [dark, colors]);
  useNotificationRouting();
  return (
    <NavThemeProvider value={navTheme}>
      <SessionEffects />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {!isConfigured ? <NotConfigured /> : null}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }} />
      </View>
      <DialogHost />
      <ToastHost />
    </NavThemeProvider>
  );
}

/** After login: sync language from the profile and register for push notifications. */
function SessionEffects() {
  const session = useSession((s) => s.session);
  const { data: profile } = useProfile();
  const { i18n } = useTranslation();
  useEffect(() => {
    const lang = profile?.user.language;
    if (lang && lang !== i18n.language) setLanguage(lang);
  }, [profile?.user.language, i18n.language]);
  useEffect(() => {
    if (session && profile?.user.onboarded) {
      registerForPush(profile.user.role === 'shop_owner' ? 'partner' : 'customer');
    }
  }, [session, profile?.user.onboarded, profile?.user.role]);
  return null;
}

function NotConfigured() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.warningSoft, padding: 10, paddingTop: 44 }}>
      <AppText variant="caption" align="center">{t('error.notConfigured')}</AppText>
    </View>
  );
}
