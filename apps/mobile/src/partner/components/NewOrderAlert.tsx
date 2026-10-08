import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { router, usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, Vibration, View } from 'react-native';

import { formatINR, type ShopOrdersResult } from '@gg/shared';

import { rpc } from '@/shared/api/rpc';
import { useRealtime } from '@/shared/hooks/realtime';
import { useTranslation } from '@/shared/i18n';
import { queryClient } from '@/shared/lib/queryClient';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Row } from '@/shared/ui';

interface Incoming {
  id: string;
  order_no: string;
  customer_name: string | null;
  grand_total: number;
}

/**
 * Rings loudly with vibration when a new order arrives while the app is open.
 * In the background the push notification uses the loud "new-orders" channel instead.
 */
export function NewOrderAlert({ shopId }: { shopId: string | undefined }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [queue, setQueue] = useState<Incoming[]>([]);
  const player = useRef<AudioPlayer | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;
  const current = queue[0];

  const ring = useCallback(async () => {
    try {
      await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' });
      if (!player.current) player.current = createAudioPlayer(require('../../../assets/sounds/new_order.wav'));
      player.current.loop = true;
      player.current.volume = 1;
      await player.current.seekTo(0);
      player.current.play();
    } catch {
      /* sound is best-effort */
    }
    if (Platform.OS !== 'web') {
      Vibration.vibrate([0, 700, 300, 700, 300, 700], true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    }
  }, []);

  const silence = useCallback(() => {
    try {
      player.current?.pause();
    } catch {
      /* ignore */
    }
    if (Platform.OS !== 'web') Vibration.cancel();
  }, []);

  // Orders already rung for in this app session (so "Later" does not ring again every poll)
  const seen = useRef(new Set<string>());
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const push = useCallback(
    (o: Incoming) => {
      seen.current.add(o.id);
      queryClient.invalidateQueries({ queryKey: ['partner'] });
      // No need to ring for an order the owner is already looking at
      if (pathRef.current === `/partner/order/${o.id}`) return;
      setQueue((q) => (q.some((x) => x.id === o.id) ? q : [...q, o]));
    },
    [],
  );

  // Fallback when realtime or push is not connected (or the app was just opened):
  // poll waiting requests and ring once for each one not seen yet.
  const waiting = useQuery({
    queryKey: ['partner', 'alert-poll', shopId],
    queryFn: () => rpc<ShopOrdersResult>('shop_orders', { p_shop_id: shopId, p_filter: 'new', p_limit: 20, p_offset: 0 }),
    enabled: !!shopId,
    refetchInterval: 30_000,
  });
  useEffect(() => {
    for (const o of waiting.data?.items ?? []) {
      if (o.status === 'REQUESTED' && !seen.current.has(o.id)) {
        push({ id: o.id, order_no: o.order_no, customer_name: o.customer_name, grand_total: o.grand_total });
      }
    }
  }, [waiting.data, push]);

  // Realtime insert on this shop's orders
  useRealtime(
    `new-orders-${shopId}`,
    'orders',
    shopId ? `shop_id=eq.${shopId}` : null,
    (payload) => {
      if (payload.eventType === 'INSERT' && payload.new?.status === 'REQUESTED') {
        push({
          id: String(payload.new.id),
          order_no: String(payload.new.order_no),
          customer_name: (payload.new.customer_name as string) ?? null,
          grand_total: Number(payload.new.grand_total ?? 0),
        });
      } else {
        queryClient.invalidateQueries({ queryKey: ['partner'] });
      }
    },
    !!shopId,
  );

  // Foreground push for a new order (in case realtime is not connected)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const data = n.request.content.data as Record<string, unknown>;
      if (data?.kind === 'new_order' && data.order_id) {
        push({ id: String(data.order_id), order_no: String(data.order_no ?? ''), customer_name: null, grand_total: 0 });
      }
    });
    return () => sub.remove();
  }, [push]);

  useEffect(() => {
    if (current) {
      ring();
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.15, duration: 450, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 450, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    silence();
    return undefined;
  }, [current, ring, silence, pulse]);

  useEffect(() => () => {
    silence();
    player.current?.remove();
  }, [silence]);

  const dismiss = (open: boolean) => {
    if (!current) return;
    silence();
    setQueue((q) => q.slice(1));
    if (open) router.push(`/partner/order/${current.id}`);
  };

  return (
    <Modal visible={!!current} transparent animationType="fade" onRequestClose={() => dismiss(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: 24, padding: 24, alignItems: 'center', gap: 14 }}>
          <Animated.View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.action, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pulse }] }}>
            <Ionicons name="notifications" size={48} color="#fff" />
          </Animated.View>
          <AppText variant="display" align="center">{t('p.alert.title')}</AppText>
          <AppText variant="h3" align="center">{current?.order_no}</AppText>
          {current?.grand_total ? (
            <AppText variant="body" color="textMuted" align="center">
              {[current.customer_name, formatINR(current.grand_total)].filter(Boolean).join(' · ')}
            </AppText>
          ) : null}
          {queue.length > 1 ? <AppText variant="caption" color="action">+{queue.length - 1}</AppText> : null}
          <Row gap={10}>
            <Button title={t('p.alert.later')} variant="outline" size="lg" onPress={() => dismiss(false)} />
            <Button testID="alert-view-order" title={t('p.alert.view')} variant="action" size="lg" icon="eye" onPress={() => dismiss(true)} />
          </Row>
        </View>
      </View>
    </Modal>
  );
}
