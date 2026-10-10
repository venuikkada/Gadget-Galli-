import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { families, gradients, type CategoryFamily, type FamilyKey, type Gradients } from '@gg/shared';

import { darkColors, lightColors, radius, space, type ThemeColors } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface AppTheme {
  dark: boolean;
  colors: ThemeColors;
  /** Brand gradients for this mode (header, partner header, cart bar, open/closed). */
  gradients: Gradients;
  families: Record<FamilyKey, CategoryFamily>;
  radius: typeof radius;
  space: typeof space;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

const KEY = 'gg.theme';
const ThemeContext = createContext<AppTheme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'light' || v === 'dark' || v === 'system') setPref(v);
      })
      .catch(() => undefined);
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPref(p);
    AsyncStorage.setItem(KEY, p).catch(() => undefined);
  }, []);

  const value = useMemo<AppTheme>(() => {
    const dark = preference === 'system' ? system === 'dark' : preference === 'dark';
    return { dark, colors: dark ? darkColors : lightColors, gradients: gradients[dark ? 'dark' : 'light'], families, radius, space, preference, setPreference };
  }, [preference, system, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): AppTheme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
