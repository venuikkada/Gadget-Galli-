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
  /** new = a customer's request; paid = Gadget Galli confirmed the payment, so pack and send */
  kind: 'new' | 'paid';
}

/** The browser's audio element behind expo-audio's web player (expo-audio drops the promise play() returns). */
function webMedia(p: AudioPlayer): HTMLMediaElement | null {
  return Platform.OS === 'web' ? ((p as unknown as { media?: HTMLMediaElement }).media ?? null) : null;
}

/** Starts the ring; resolves false when the browser blocks sound until the owner taps the page. */
function startSound(p: AudioPlayer): Promise<boolean> {
  const media = webMedia(p);
  if (media) {
    media.muted = false;
    return media.play().then(
      () => true,
      () => false,
    );
  }
  p.play();
  return Promise.resolve(true);
}

/**
 * Rings loudly with vibration when a new order arrives, or an order is paid, while the app is open.
 * In the background the push notification uses the loud "new-orders" channel instead.
 */
export function NewOrderAlert({ shopId }: { shopId: string | undefined }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [queue, setQueue] = useState<Incoming[]>([]);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const player = useRef<AudioPlayer | null>(null);
  // Each ring gets a number; silence() bumps it, so a ring still loading stops instead of starting late.
  const ringId = useRef(0);
  const playing = useRef<Promise<boolean> | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;
  const current = queue[0];

  const getPlayer = useCallback(() => {
    if (!player.current) player.current = createAudioPlayer(require('../../../assets/sounds/new_order.wav'));
    return player.current;
  }, []);

  const ring = useCallback(async () => {
    const id = ++ringId.current;
    if (Platform.OS !== 'web') {
      await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => undefined);
      if (id !== ringId.current) return;
      Vibration.vibrate([0, 700, 300, 700, 300, 700], true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    }
    try {
      const p = getPlayer();
      p.loop = true;
      p.volume = 1;
      await p.seekTo(0);
      if (id !== ringId.current) return;
      const started = startSound(p);
      playing.current = started;
      if (!(await started) && id === ringId.current) setSoundBlocked(true);
    } catch {
      /* sound is best-effort */
    }
  }, [getPlayer]);

  const silence = useCallback(() => {
    const id = ++ringId.current;
    setSoundBlocked(false);
    if (Platform.OS !== 'web') Vibration.cancel();
    const started = playing.current;
    playing.current = null;
    // Pausing while the browser is still starting the sound makes it throw ("play() interrupted by pause()").
    started?.then(() => {
      if (id !== ringId.current) return; // another order is ringing now
      try {
        player.current?.pause();
      } catch {
        /* ignore */
      }
    });
  }, []);

  // A tap is a user gesture, so the browser lets the sound play.
  const unblockSound = () => {
    setSoundBlocked(false);
    const p = getPlayer();
    p.loop = true;
    playing.current = startSound(p);
  };

  // Browsers only allow sound after the owner has used the page. On the first tap or key press, play the alarm
  // muted for a moment, so later rings can sound even if the owner is not looking (needed on iPhones).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const prime = () => {
      document.removeEventListener('pointerdown', prime, true);
      document.removeEventListener('keydown', prime, true);
      if (playing.current) return;
      const media = webMedia(getPlayer());
      if (!media) return;
      media.muted = true;
      media
        .play()
        .then(() => {
          if (!playing.current) media.pause();
        })
        .catch(() => undefined)
        .finally(() => {
          media.muted = false;
        });
    };
    document.addEventListener('pointerdown', prime, true);
    document.addEventListener('keydown', prime, true);
    return () => {
      document.removeEventListener('pointerdown', prime, true);
      document.removeEventListener('keydown', prime, true);
    };
  }, [getPlayer]);

  // Alerts already shown in this app session, per order and kind (so "Later" does not ring again every poll)
  const seen = useRef(new Set<string>());
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const push = useCallback(
    (o: Incoming) => {
      const key = `${o.kind}:${o.id}`;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      queryClient.invalidateQueries({ queryKey: ['partner'] });
      // No need to ring for an order the owner is already looking at
      if (pathRef.current === `/partner/order/${o.id}`) return;
      setQueue((q) => (q.some((x) => x.id === o.id && x.kind === o.kind) ? q : [...q, o]));
    },
    [],
  );

  // Fallback when realtime or push is not connected (or the app was just opened):
  // poll active orders and ring once for each new request or newly paid order not seen yet.
  const waiting = useQuery({
    queryKey: ['partner', 'alert-poll', shopId],
    queryFn: () => rpc<ShopOrdersResult>('shop_orders', { p_shop_id: shopId, p_filter: 'active', p_limit: 50, p_offset: 0 }),
    enabled: !!shopId,
    refetchInterval: 30_000,
  });
  useEffect(() => {
    for (const o of waiting.data?.items ?? []) {
      if (o.status === 'REQUESTED' || o.status === 'PAID') {
        push({ id: o.id, order_no: o.order_no, customer_name: o.customer_name, grand_total: o.grand_total, kind: o.status === 'PAID' ? 'paid' : 'new' });
      }
    }
  }, [waiting.data, push]);

  // Realtime changes on this shop's orders
  useRealtime(
    `new-orders-${shopId}`,
    'orders',
    shopId ? `shop_id=eq.${shopId}` : null,
    (payload) => {
      const row = payload.new;
      const order = row?.id
        ? { id: String(row.id), order_no: String(row.order_no ?? ''), customer_name: (row.customer_name as string) ?? null, grand_total: Number(row.grand_total ?? 0) }
        : null;
      if (order && payload.eventType === 'INSERT' && row.status === 'REQUESTED') push({ ...order, kind: 'new' });
      else if (order && payload.eventType === 'UPDATE' && row.status === 'PAID') push({ ...order, kind: 'paid' });
      else queryClient.invalidateQueries({ queryKey: ['partner'] });
    },
    !!shopId,
  );

  // Foreground push for a new or paid order (in case realtime is not connected)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const data = n.request.content.data as Record<string, unknown>;
      if ((data?.kind === 'new_order' || data?.kind === 'order_paid') && data.order_id) {
        push({ id: String(data.order_id), order_no: String(data.order_no ?? ''), customer_name: null, grand_total: 0, kind: data.kind === 'order_paid' ? 'paid' : 'new' });
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
      <View style={{ flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: 24, padding: 24, alignItems: 'center', gap: 14 }}>
          <View style={{ width: 128, height: 128, borderRadius: 64, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pulse }] }}>
              <Ionicons name="notifications" size={48} color={colors.onAccent} />
            </Animated.View>
          </View>
          <AppText variant="display" align="center">{current?.kind === 'paid' ? t('p.alert.paidTitle') : t('p.alert.title')}</AppText>
          <AppText variant="h3" align="center">{current?.order_no}</AppText>
          {current?.grand_total ? (
            <AppText variant="body" color="textMuted" align="center">
              {[current.customer_name, formatINR(current.grand_total)].filter(Boolean).join(' · ')}
            </AppText>
          ) : null}
          {queue.length > 1 ? <AppText variant="label" color="accentInk">+{queue.length - 1}</AppText> : null}
          {soundBlocked ? <Button title={t('p.alert.sound')} icon="volume-high" variant="secondary" size="sm" onPress={unblockSound} testID="alert-sound" /> : null}
          <Row gap={10}>
            <Button title={t('p.alert.later')} variant="outline" size="lg" onPress={() => dismiss(false)} />
            <Button testID="alert-view-order" title={t('p.alert.view')} variant="action" size="lg" icon="eye" onPress={() => dismiss(true)} />
          </Row>
        </View>
      </View>
    </Modal>
  );
}
