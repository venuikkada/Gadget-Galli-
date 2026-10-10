import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Dimensions, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { chartColors } from '@gg/shared';

import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import { useFont } from '../theme/useFont';
import { AppText, Button, IconButton, Row } from './primitives';

// ---------------------------------------------------------------------------
// Bottom sheet
// ---------------------------------------------------------------------------
export function Sheet({ visible, onClose, title, children, footer, maxHeight = 0.88 }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode; footer?: ReactNode; maxHeight?: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const translate = useRef(new Animated.Value(600)).current;
  useEffect(() => {
    if (visible) {
      translate.setValue(600);
      Animated.spring(translate, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 16 }).start();
    }
  }, [visible, translate]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: Dimensions.get('window').height * maxHeight,
            paddingBottom: Math.max(insets.bottom, 12),
            transform: [{ translateY: translate }],
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: 8 }}>
            <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border }} />
          </View>
          {title ? (
            <Row justify="space-between" style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4 }}>
              <AppText variant="h3" style={{ flex: 1 }}>{title}</AppText>
              <IconButton icon="close" onPress={onClose} label="Close" />
            </Row>
          ) : null}
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12, gap: 14 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 10 }}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Confirm dialog (works the same on Android, iOS and web)
// ---------------------------------------------------------------------------
interface DialogRequest {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  resolve: (ok: boolean) => void;
}
const useDialogStore = create<{ current: DialogRequest | null }>(() => ({ current: null }));

export function confirmDialog(opts: Omit<DialogRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useDialogStore.setState({ current: { ...opts, resolve } }));
}

export function DialogHost() {
  const { colors } = useTheme();
  const current = useDialogStore((s) => s.current);
  const close = (ok: boolean) => {
    current?.resolve(ok);
    useDialogStore.setState({ current: null });
  };
  return (
    <Modal visible={!!current} transparent animationType="fade" onRequestClose={() => close(false)}>
      <View style={{ flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <View style={{ width: '100%', maxWidth: 400, backgroundColor: colors.surface, borderRadius: 20, padding: 22, gap: 12 }}>
          {current?.icon ? (
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: current.destructive ? colors.errorSoft : colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={current.icon} size={24} color={current.destructive ? colors.error : colors.primary} />
            </View>
          ) : null}
          <AppText variant="h3">{current?.title}</AppText>
          {current?.message ? <AppText variant="body" color="textMuted">{current.message}</AppText> : null}
          <Row gap={10} justify="flex-end" style={{ marginTop: 6 }}>
            <Button title={current?.cancelText ?? 'Cancel'} variant="ghost" onPress={() => close(false)} />
            <Button title={current?.confirmText ?? 'OK'} variant={current?.destructive ? 'danger' : 'primary'} onPress={() => close(true)} testID="dialog-confirm" />
          </Row>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
type ToastTone = 'info' | 'success' | 'error';
const useToastStore = create<{ toast: { id: number; text: string; tone: ToastTone } | null }>(() => ({ toast: null }));
let toastSeq = 0;

export function toast(text: string, tone: ToastTone = 'info') {
  toastSeq += 1;
  useToastStore.setState({ toast: { id: toastSeq, text, tone } });
}

export function ToastHost() {
  const { colors, dark } = useTheme();
  const ff = useFont();
  const insets = useSafeAreaInsets();
  const current = useToastStore((s) => s.toast);
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!current) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const id = current.id;
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
        if (useToastStore.getState().toast?.id === id) useToastStore.setState({ toast: null });
      });
    }, 2600);
    return () => clearTimeout(timer);
  }, [current, opacity]);
  if (!current) return null;
  const bg = current.tone === 'error' ? colors.error : current.tone === 'success' ? colors.success : colors.inverse;
  const fg = current.tone === 'error' ? colors.onError : current.tone === 'success' ? colors.onSuccess : colors.onInverse;
  const icon = current.tone === 'error' ? 'alert-circle' : current.tone === 'success' ? 'checkmark-circle' : 'information-circle';
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 90, opacity, alignItems: 'center' }}>
      <View style={{ backgroundColor: bg, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 480 }}>
        <Ionicons name={icon} size={18} color={current.tone === 'info' && !dark ? colors.accent : fg} />
        <Text style={{ color: fg, fontFamily: ff(fonts.bodyMedium), fontSize: 14, flexShrink: 1 }}>{current.text}</Text>
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Celebration (confetti) shown when an order is delivered
// ---------------------------------------------------------------------------
export function Celebration({ visible, onDone }: { visible: boolean; onDone?: () => void }) {
  const { width, height } = Dimensions.get('window');
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        x: Math.random() * width,
        delay: Math.random() * 400,
        size: 6 + Math.random() * 8,
        color: chartColors[i % chartColors.length]!,
        drift: (Math.random() - 0.5) * 120,
        anim: new Animated.Value(0),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible],
  );
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setShow(true);
    Animated.parallel(
      pieces.map((p) => Animated.timing(p.anim, { toValue: 1, duration: 2200, delay: p.delay, useNativeDriver: true })),
    ).start(() => {
      setShow(false);
      onDone?.();
    });
  }, [visible, pieces, onDone]);
  if (!show) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            top: -20,
            width: p.size,
            height: p.size * 1.6,
            borderRadius: 2,
            backgroundColor: p.color,
            transform: [
              { translateY: p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, height + 40] }) },
              { translateX: p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
              { rotate: p.anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 + i * 20}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}
