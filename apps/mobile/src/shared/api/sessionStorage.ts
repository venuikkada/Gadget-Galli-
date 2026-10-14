import * as SecureStore from 'expo-secure-store';

/**
 * Where the login session lives on Android and iOS: the encrypted system keychain (Android Keystore / iOS
 * Keychain) instead of plain app storage, so a copied or backed-up phone does not give the session away.
 * The keychain holds about 2 KB per entry, so the session is saved in chunks. The websites use
 * sessionStorage.web.ts.
 */
const CHUNK = 1800;
const count = (key: string) => `${key}.n`;
const part = (key: string, i: number) => `${key}.${i}`;

async function removeParts(key: string, from: number) {
  const n = Number((await SecureStore.getItemAsync(count(key))) ?? 0);
  for (let i = from; i < n; i++) await SecureStore.deleteItemAsync(part(key, i));
}

export const sessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const n = await SecureStore.getItemAsync(count(key));
    if (n == null) return null;
    const parts: string[] = [];
    for (let i = 0; i < Number(n); i++) {
      const p = await SecureStore.getItemAsync(part(key, i));
      if (p == null) return null;
      parts.push(p);
    }
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const n = Math.max(1, Math.ceil(value.length / CHUNK));
    await removeParts(key, n);
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(part(key, i), value.slice(i * CHUNK, (i + 1) * CHUNK));
    await SecureStore.setItemAsync(count(key), String(n));
  },
  async removeItem(key: string): Promise<void> {
    await removeParts(key, 0);
    await SecureStore.deleteItemAsync(count(key));
  },
};
