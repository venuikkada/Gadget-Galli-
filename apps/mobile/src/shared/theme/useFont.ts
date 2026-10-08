import { useCallback } from 'react';

import { useTranslation } from '../i18n';
import { scriptFamily } from './tokens';

/** Returns a function that maps a Latin font family to the right one for the current language. */
export function useFont() {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return useCallback((family: string) => scriptFamily(family, lang), [lang]);
}
