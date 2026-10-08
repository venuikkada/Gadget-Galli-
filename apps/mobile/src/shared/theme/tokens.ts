/** Design tokens. Brand colours from the product brief; dark mode keeps the same hues, tuned for contrast. */
export const brand = {
  primary: '#4F46E5',
  action: '#FF6B35',
  success: '#16A34A',
  warning: '#F59E0B',
  error: '#DC2626',
  background: '#F8FAFC',
  text: '#0F172A',
} as const;

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  elevated: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  border: string;
  divider: string;
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  onPrimary: string;
  action: string;
  actionPressed: string;
  actionSoft: string;
  onAction: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  error: string;
  errorSoft: string;
  whatsapp: string;
  skeleton: string;
  overlay: string;
  star: string;
}

export const lightColors: ThemeColors = {
  background: brand.background,
  surface: '#FFFFFF',
  surfaceAlt: '#F1F5F9',
  elevated: '#FFFFFF',
  text: brand.text,
  textMuted: '#475569',
  textSubtle: '#94A3B8',
  border: '#E2E8F0',
  divider: '#EEF2F7',
  primary: brand.primary,
  primaryPressed: '#4338CA',
  primarySoft: '#EEF2FF',
  onPrimary: '#FFFFFF',
  action: brand.action,
  actionPressed: '#F05A22',
  actionSoft: '#FFF1EA',
  onAction: '#FFFFFF',
  success: brand.success,
  successSoft: '#DCFCE7',
  warning: brand.warning,
  warningSoft: '#FEF3C7',
  error: brand.error,
  errorSoft: '#FEE2E2',
  whatsapp: '#25D366',
  skeleton: '#E9EEF5',
  overlay: 'rgba(15, 23, 42, 0.45)',
  star: '#F59E0B',
};

export const darkColors: ThemeColors = {
  background: '#0B1120',
  surface: '#111A2E',
  surfaceAlt: '#1A2540',
  elevated: '#16213A',
  text: '#F1F5F9',
  textMuted: '#CBD5E1',
  textSubtle: '#7C8BA5',
  border: '#24314D',
  divider: '#1C2742',
  primary: '#6366F1',
  primaryPressed: '#5558E8',
  primarySoft: '#1E1B4B',
  onPrimary: '#FFFFFF',
  action: '#FF7A45',
  actionPressed: '#FF6B35',
  actionSoft: '#3A1E12',
  onAction: '#FFFFFF',
  success: '#22C55E',
  successSoft: '#0F2E1C',
  warning: '#FBBF24',
  warningSoft: '#3A2A08',
  error: '#F87171',
  errorSoft: '#3B1414',
  whatsapp: '#25D366',
  skeleton: '#1C2742',
  overlay: 'rgba(0, 0, 0, 0.6)',
  star: '#FBBF24',
};

export const radius = { xs: 6, sm: 10, md: 12, lg: 16, xl: 20, pill: 999 } as const;
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const fonts = {
  heading: 'Poppins_600SemiBold',
  headingBold: 'Poppins_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
  telugu: 'NotoSansTelugu_400Regular',
  teluguBold: 'NotoSansTelugu_600SemiBold',
} as const;

export const fontAssets = {
  Poppins_600SemiBold: require('@expo-google-fonts/poppins/600SemiBold/Poppins_600SemiBold.ttf'),
  Poppins_700Bold: require('@expo-google-fonts/poppins/700Bold/Poppins_700Bold.ttf'),
  Inter_400Regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
  Inter_500Medium: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
  Inter_600SemiBold: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
  Inter_700Bold: require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
  NotoSansTelugu_400Regular: require('@expo-google-fonts/noto-sans-telugu/400Regular/NotoSansTelugu_400Regular.ttf'),
  NotoSansTelugu_600SemiBold: require('@expo-google-fonts/noto-sans-telugu/600SemiBold/NotoSansTelugu_600SemiBold.ttf'),
};

export function shadow(level: 1 | 2 | 3, dark: boolean) {
  if (dark) return { borderWidth: 0 } as const;
  const map = {
    1: { shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
    2: { shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
    3: { shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  } as const;
  return { shadowColor: '#0F172A', ...map[level] };
}
