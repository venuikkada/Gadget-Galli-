import { darkTokens, lightTokens, type ThemeTokens } from '@gg/shared';

/**
 * Design tokens. Colours come from the shared palette ("Peacock Teal + Marigold", packages/shared/src/palette.ts),
 * which the admin panel uses too; dark mode keeps the hues, with bright fills and dark text on them.
 */
export type ThemeColors = ThemeTokens;

export const lightColors: ThemeColors = lightTokens;
export const darkColors: ThemeColors = darkTokens;

export const radius = { xs: 6, sm: 10, md: 12, lg: 16, xl: 20, xxl: 24, pill: 999 } as const;
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

/** RN-web draws the browser focus ring inside our rounded inputs; turn it off (the field border shows focus). */
export const webNoOutline = { outlineStyle: 'none', outlineWidth: 0 } as unknown as object;

export const fonts = {
  heading: 'Poppins_600SemiBold',
  headingBold: 'Poppins_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
  telugu: 'NotoSansTelugu_400Regular',
  teluguBold: 'NotoSansTelugu_600SemiBold',
  devanagari: 'NotoSansDevanagari_400Regular',
  devanagariBold: 'NotoSansDevanagari_600SemiBold',
} as const;

/**
 * Poppins and Inter have no Telugu or Devanagari letters. In Telugu or Hindi, swap to Noto Sans
 * Telugu / Devanagari (regular or semi-bold to match the weight). Digits and Latin text fall back
 * to the system font, which renders them correctly.
 */
export function scriptFamily(family: string, lang: string): string {
  if (lang !== 'te' && lang !== 'hi') return family;
  const bold = /Bold|Semi/.test(family);
  if (lang === 'te') return bold ? fonts.teluguBold : fonts.telugu;
  return bold ? fonts.devanagariBold : fonts.devanagari;
}

export const fontAssets = {
  Poppins_600SemiBold: require('@expo-google-fonts/poppins/600SemiBold/Poppins_600SemiBold.ttf'),
  Poppins_700Bold: require('@expo-google-fonts/poppins/700Bold/Poppins_700Bold.ttf'),
  Inter_400Regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
  Inter_500Medium: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
  Inter_600SemiBold: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
  Inter_700Bold: require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
  NotoSansTelugu_400Regular: require('@expo-google-fonts/noto-sans-telugu/400Regular/NotoSansTelugu_400Regular.ttf'),
  NotoSansTelugu_600SemiBold: require('@expo-google-fonts/noto-sans-telugu/600SemiBold/NotoSansTelugu_600SemiBold.ttf'),
  NotoSansDevanagari_400Regular: require('@expo-google-fonts/noto-sans-devanagari/400Regular/NotoSansDevanagari_400Regular.ttf'),
  NotoSansDevanagari_600SemiBold: require('@expo-google-fonts/noto-sans-devanagari/600SemiBold/NotoSansDevanagari_600SemiBold.ttf'),
};

/** Soft, teal-tinted elevation. Dark mode has no shadows; surfaces use a border instead. */
export function shadow(level: 1 | 2 | 3, dark: boolean) {
  if (dark) return { borderWidth: 0 } as const;
  const map = {
    1: { shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
    2: { shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
    3: { shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  } as const;
  return { shadowColor: lightTokens.shadow, ...map[level] };
}
