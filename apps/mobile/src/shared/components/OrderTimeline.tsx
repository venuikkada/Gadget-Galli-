import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';

import { effectiveStatus, flowIndex, ORDER_FLOW, type Order, type OrderStatus } from '@gg/shared';

import { useTranslation } from '@/shared/i18n';
import { tDateTime } from '@/shared/i18n/format';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Row } from '@/shared/ui';

const ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  REQUESTED: 'paper-plane',
  CONFIRMED: 'checkmark-done',
  PAID: 'wallet',
  PACKED: 'cube',
  DISPATCHED: 'bicycle',
  DELIVERED: 'home',
};

const AT: Record<string, keyof Order> = {
  REQUESTED: 'requested_at',
  CONFIRMED: 'confirmed_at',
  PAID: 'paid_at',
  PACKED: 'packed_at',
  DISPATCHED: 'dispatched_at',
  DELIVERED: 'delivered_at',
};

/** Live timeline: Requested → Confirmed → Paid → Packed → Dispatched → Delivered, each with its time. */
export function OrderTimeline({ order }: { order: Order }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const status = effectiveStatus(order.status, order.status_before_issue);
  const stopped = ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(order.status);
  const lastIdx = stopped
    ? Math.max(...ORDER_FLOW.map((s, i) => (order[AT[s]!] ? i : -1)))
    : flowIndex(status as OrderStatus);

  const pulse = useRef(new Animated.Value(1)).current;
  const fill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fill, { toValue: Math.max(0, lastIdx), duration: 700, useNativeDriver: false }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.25, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [lastIdx, fill, pulse]);

  const ROW = 56;
  return (
    <View style={{ paddingLeft: 4 }}>
      <View style={{ position: 'absolute', left: 21, top: 18, width: 3, height: ROW * (ORDER_FLOW.length - 1), backgroundColor: colors.border, borderRadius: 2 }} />
      <Animated.View
        style={{
          position: 'absolute',
          left: 21,
          top: 18,
          width: 3,
          borderRadius: 2,
          backgroundColor: colors.success,
          height: fill.interpolate({ inputRange: [0, ORDER_FLOW.length - 1], outputRange: [0, ROW * (ORDER_FLOW.length - 1)] }),
        }}
      />
      {ORDER_FLOW.map((s, i) => {
        const at = order[AT[s]!] as string | null;
        const done = i <= lastIdx && !!at;
        const current = i === lastIdx && !stopped && s !== 'DELIVERED';
        const label = order.fulfilment === 'pickup' && s === 'DISPATCHED' ? t('p.step.readyPickup') : t(`status.${s}`);
        return (
          <Row key={s} gap={14} style={{ height: ROW }} align="flex-start">
            <Animated.View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: done ? (current ? colors.primary : colors.success) : colors.surfaceAlt,
                borderWidth: done ? 0 : 1.5,
                borderColor: colors.border,
                transform: [{ scale: current ? pulse : 1 }],
              }}
            >
              <Ionicons name={done && !current ? 'checkmark' : ICONS[s]!} size={17} color={done ? colors.onPrimary : colors.textSubtle} />
            </Animated.View>
            <View style={{ flex: 1, paddingTop: 2 }}>
              <AppText variant="title" color={done ? 'text' : 'textSubtle'}>{label}</AppText>
              {at ? <AppText variant="caption" color="textMuted">{tDateTime(at)}</AppText> : null}
            </View>
          </Row>
        );
      })}
      {stopped ? (
        <Row gap={14}>
          <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.errorSoft }}>
            <Ionicons name="close" size={18} color={colors.error} />
          </View>
          <View>
            <AppText variant="title" color="error">{t(`status.${order.status}`)}</AppText>
            <AppText variant="caption" color="textMuted">
              {tDateTime((order.rejected_at ?? order.cancelled_at ?? order.expired_at ?? order.updated_at) as string)}
            </AppText>
          </View>
        </Row>
      ) : null}
    </View>
  );
}
