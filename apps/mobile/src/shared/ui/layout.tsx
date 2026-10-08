import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';
import { AppText, IconButton, Row } from './primitives';

/** Top bar with back button, title and optional right-side actions. */
export function Header({ title, subtitle, onBack, right, transparent, back = true }: { title?: string; subtitle?: string; onBack?: () => void; right?: ReactNode; transparent?: boolean; back?: boolean }) {
  const { colors } = useTheme();
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <Row
      style={{
        paddingHorizontal: 8,
        minHeight: 56,
        backgroundColor: transparent ? 'transparent' : colors.background,
      }}
      gap={4}
    >
      {back ? <IconButton icon="arrow-back" onPress={goBack} label="Back" testID="header-back" /> : <View style={{ width: 12 }} />}
      <View style={{ flex: 1 }}>
        {title ? <AppText variant="h3" numberOfLines={1}>{title}</AppText> : null}
        {subtitle ? <AppText variant="caption" color="textMuted" numberOfLines={1}>{subtitle}</AppText> : null}
      </View>
      {right}
    </Row>
  );
}

/** Screen container: safe area + themed background + optional scroll with pull-to-refresh. */
export function Screen({
  children,
  header,
  scroll = true,
  refreshing,
  onRefresh,
  footer,
  contentStyle,
  edges = ['top'],
  padded = true,
}: {
  children: ReactNode;
  header?: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  padded?: boolean;
}) {
  const { colors, dark } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {header}
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[{ padding: padded ? 16 : 0, paddingBottom: (footer ? 16 : insets.bottom + 24), gap: 16 }, contentStyle]}
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      )}
      {footer ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12), backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, gap: 10 }}>
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export function InfoBanner({ text, tone = 'info', icon }: { text: string; tone?: 'info' | 'warning' | 'error' | 'success'; icon?: React.ComponentProps<typeof Ionicons>['name'] }) {
  const { colors } = useTheme();
  const map = {
    info: [colors.primarySoft, colors.primary, 'information-circle'],
    warning: [colors.warningSoft, colors.warning, 'warning'],
    error: [colors.errorSoft, colors.error, 'alert-circle'],
    success: [colors.successSoft, colors.success, 'checkmark-circle'],
  } as const;
  const [bg, fg, defIcon] = map[tone];
  return (
    <Row align="flex-start" gap={10} style={{ backgroundColor: bg, borderRadius: 12, padding: 12 }}>
      <Ionicons name={icon ?? defIcon} size={18} color={fg} style={{ marginTop: 1 }} />
      <AppText variant="bodySmall" style={{ flex: 1 }}>{text}</AppText>
    </Row>
  );
}
