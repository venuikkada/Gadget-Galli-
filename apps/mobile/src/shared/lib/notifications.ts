import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { rpc } from '../api/rpc';
import { queryClient } from './queryClient';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Android channels: normal order updates, and a loud channel for new orders (shop app). */
export async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('order-updates', {
    name: 'Order updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync('new-orders', {
    name: 'New orders (loud alert)',
    description: 'Rings loudly when a customer sends your shop a new order.',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'new_order.wav',
    vibrationPattern: [0, 700, 300, 700, 300, 700],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  });
}

/** Asks permission, gets the Expo push token and stores it for this user. Returns null on web/simulators. */
export async function registerForPush(app: 'customer' | 'partner'): Promise<string | null> {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) return null;
    await ensureChannels();
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return null;
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await rpc('register_push_token', { p_token: token, p_platform: Platform.OS, p_app: app });
    return token;
  } catch {
    return null;
  }
}

/** Opens the right screen when a notification is tapped, and refreshes order data when one arrives. */
export function useNotificationRouting() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (data: Record<string, unknown> | undefined) => {
      const url = typeof data?.url === 'string' ? data.url : null;
      if (url) router.push(url as never);
    };
    const received = Notifications.addNotificationReceivedListener(() => {
      queryClient.invalidateQueries({ queryKey: ['order'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['partner'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    });
    const tapped = Notifications.addNotificationResponseReceivedListener((resp) => open(resp.notification.request.content.data as Record<string, unknown>));
    Notifications.getLastNotificationResponseAsync()
      .then((resp) => resp && open(resp.notification.request.content.data as Record<string, unknown>))
      .catch(() => undefined);
    return () => {
      received.remove();
      tapped.remove();
    };
  }, []);
}
