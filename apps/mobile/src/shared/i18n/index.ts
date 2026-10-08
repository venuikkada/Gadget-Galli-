import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import type { Language } from '@gg/shared';

import { en } from './en';
import { hi } from './hi';
import { te } from './te';

const KEY = 'gg.lang';

function deviceLanguage(): Language {
  const code = getLocales()[0]?.languageCode;
  return code === 'te' || code === 'hi' ? code : 'en';
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, te: { translation: te }, hi: { translation: hi } },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

AsyncStorage.getItem(KEY)
  .then((saved) => {
    if (saved === 'en' || saved === 'te' || saved === 'hi') i18n.changeLanguage(saved);
  })
  .catch(() => undefined);

export async function setLanguage(lang: Language) {
  await i18n.changeLanguage(lang);
  await AsyncStorage.setItem(KEY, lang).catch(() => undefined);
}

export function currentLanguage(): Language {
  const l = i18n.language;
  return l === 'te' || l === 'hi' ? l : 'en';
}

export const LANGUAGES: { code: Language; label: string; native: string }[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
];

/** Category / DB names that carry translations (name, name_te, name_hi). */
export function localName(item: { name: string; name_te?: string | null; name_hi?: string | null }, lang = currentLanguage()) {
  if (lang === 'te' && item.name_te) return item.name_te;
  if (lang === 'hi' && item.name_hi) return item.name_hi;
  return item.name;
}

export { i18n, useTranslation };
