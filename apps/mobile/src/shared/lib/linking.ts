import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Platform, Share } from 'react-native';

import { DELIVERY_APPS, mapsUrl, telUrl, whatsappUrl } from '@gg/shared';

export async function openUrl(url: string) {
  // On the web, Linking.openURL replaces the current page. Open web links (wa.me, maps,
  // tracking) in a new tab so the app stays open; tel:/upi: hand off to the phone as usual.
  if (Platform.OS === 'web' && /^https?:/i.test(url) && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener');
    return;
  }
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Could not open', url);
  }
}

export function callPhone(phone: string | null | undefined) {
  if (!phone) return;
  openUrl(telUrl(phone));
}

export function openWhatsApp(phone: string | null | undefined, text?: string) {
  if (!phone) return;
  openUrl(whatsappUrl(phone, text));
}

/** "Share on WhatsApp" without a fixed recipient. */
export function shareOnWhatsApp(text: string) {
  openUrl(`https://wa.me/?text=${encodeURIComponent(text)}`);
}

export async function shareText(message: string) {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      await (navigator as Navigator & { share: (d: { text: string }) => Promise<void> }).share({ text: message });
      return;
    } catch {
      /* fall through */
    }
  }
  await Share.share({ message }).catch(() => undefined);
}

export function openMaps(lat: number | null | undefined, lng: number | null | undefined, label?: string) {
  openUrl(mapsUrl(lat, lng, label));
}

export async function openInBrowser(url: string) {
  await WebBrowser.openBrowserAsync(url).catch(() => openUrl(url));
}

export async function copyText(text: string) {
  await Clipboard.setStringAsync(text);
}

/**
 * Opens the customer's UPI app with amount and note filled in. Android shows the UPI app chooser
 * for upi:// links; on iOS we try GPay, PhonePe and Paytm schemes in turn.
 * Returns false when no UPI app could be opened.
 */
export async function openUpi(upiLink: string): Promise<boolean> {
  const query = upiLink.split('?')[1] ?? '';
  const candidates =
    Platform.OS === 'ios'
      ? [`tez://upi/pay?${query}`, `phonepe://pay?${query}`, `paytmmp://upi/pay?${query}`, upiLink]
      : [upiLink];
  for (const url of candidates) {
    try {
      if (Platform.OS === 'android' || (await Linking.canOpenURL(url))) {
        await Linking.openURL(url);
        return true;
      }
    } catch {
      /* try next */
    }
  }
  return false;
}

export async function openDeliveryApp(key: keyof typeof DELIVERY_APPS) {
  const app = DELIVERY_APPS[key];
  try {
    if (await Linking.canOpenURL(app.scheme)) {
      await Linking.openURL(app.scheme);
      return;
    }
  } catch {
    /* not installed */
  }
  await openUrl(Platform.OS === 'android' ? app.android : Platform.OS === 'ios' ? app.ios : app.web);
}

export const SHARE_BASE = (process.env.EXPO_PUBLIC_SHARE_BASE_URL ?? 'https://gadgetgalli.in').replace(/\/$/, '');
export const productShareUrl = (id: string) => `${SHARE_BASE}/s/product/${id}`;
export const shopShareUrl = (id: string) => `${SHARE_BASE}/s/shop/${id}`;
export const appDeepLink = (path: string) => Linking.createURL(path);
