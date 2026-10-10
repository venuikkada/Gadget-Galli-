import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { teal } from '@gg/shared';

import { useTranslation } from '../i18n';
import { useTheme } from '../theme/ThemeProvider';
import { fonts, scriptFamily, shadow, webNoOutline, type ThemeColors } from '../theme/tokens';
import { useFont } from '../theme/useFont';

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------
export type IoniconName = ComponentProps<typeof Ionicons>['name'];
export type MciName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 20, color, set = 'ion' }: { name: string; size?: number; color?: string; set?: 'ion' | 'mci' }) {
  const { colors } = useTheme();
  if (set === 'mci') return <MaterialCommunityIcons name={name as MciName} size={size} color={color ?? colors.text} />;
  return <Ionicons name={name as IoniconName} size={size} color={color ?? colors.text} />;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------
type Variant = 'display' | 'h1' | 'h2' | 'h3' | 'title' | 'body' | 'bodySmall' | 'caption' | 'label' | 'price' | 'priceLarge' | 'overline';
type ColorKey = keyof ThemeColors;

const variantStyle: Record<Variant, TextStyle & { family: 'heading' | 'headingBold' | 'body' | 'bodyMedium' | 'bodySemi' | 'bodyBold' }> = {
  display: { fontSize: 30, lineHeight: 38, family: 'headingBold' },
  h1: { fontSize: 24, lineHeight: 32, family: 'headingBold' },
  h2: { fontSize: 20, lineHeight: 28, family: 'heading' },
  h3: { fontSize: 17, lineHeight: 24, family: 'heading' },
  title: { fontSize: 15, lineHeight: 21, family: 'bodySemi' },
  body: { fontSize: 15, lineHeight: 22, family: 'body' },
  bodySmall: { fontSize: 13, lineHeight: 19, family: 'body' },
  caption: { fontSize: 12, lineHeight: 16, family: 'body' },
  label: { fontSize: 13, lineHeight: 18, family: 'bodySemi' },
  price: { fontSize: 16, lineHeight: 22, family: 'bodyBold' },
  priceLarge: { fontSize: 22, lineHeight: 28, family: 'headingBold' },
  overline: { fontSize: 11, lineHeight: 14, family: 'bodySemi', letterSpacing: 0.8, textTransform: 'uppercase' },
};

export interface AppTextProps {
  children?: ReactNode;
  variant?: Variant;
  color?: ColorKey | (string & {});
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  align?: TextStyle['textAlign'];
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  strike?: boolean;
  selectable?: boolean;
  onPress?: () => void;
  testID?: string;
}

export function AppText({ children, variant = 'body', color = 'text', weight, align, numberOfLines, style, strike, selectable, onPress, testID }: AppTextProps) {
  const { colors } = useTheme();
  const { i18n } = useTranslation();
  const v = variantStyle[variant];
  let family: string = fonts[v.family];
  if (weight === 'regular') family = fonts.body;
  if (weight === 'medium') family = fonts.bodyMedium;
  if (weight === 'semibold') family = v.family.startsWith('heading') ? fonts.heading : fonts.bodySemi;
  if (weight === 'bold') family = v.family.startsWith('heading') ? fonts.headingBold : fonts.bodyBold;
  family = scriptFamily(family, i18n.language);
  const indic = i18n.language === 'te' || i18n.language === 'hi';
  const resolved = color in colors ? colors[color as ColorKey] : color;
  const { family: _f, ...rest } = v;
  // Telugu and Devanagari need taller lines; letter-spacing and uppercase break their shapes.
  const indicStyle: TextStyle | null = indic
    ? { lineHeight: Math.max((rest.lineHeight ?? 20) + 4, Math.round((rest.fontSize ?? 15) * 1.5)), letterSpacing: 0, textTransform: 'none' }
    : null;
  return (
    <Text
      testID={testID}
      onPress={onPress}
      selectable={selectable}
      numberOfLines={numberOfLines}
      style={[
        rest,
        { fontFamily: family, color: resolved, textAlign: align },
        indicStyle,
        strike ? { textDecorationLine: 'line-through' } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
/** `onBrand` is a white button for use on the teal gradients. */
type ButtonVariant = 'primary' | 'action' | 'secondary' | 'ghost' | 'danger' | 'whatsapp' | 'success' | 'outline' | 'onBrand';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: IoniconName;
  iconRight?: IoniconName;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  subtitle?: string;
  testID?: string;
}

export function Button({ title, onPress, variant = 'primary', size = 'md', icon, iconRight, loading, disabled, full, style, subtitle, testID }: ButtonProps) {
  const { colors, dark } = useTheme();
  const ff = useFont();
  // `pressed` is a colour where one exists; otherwise the button dims slightly while pressed.
  const palette: Record<ButtonVariant, { bg: string; fg: string; border?: string; pressed?: string }> = {
    primary: { bg: colors.primary, fg: colors.onPrimary, pressed: colors.primaryPressed },
    action: { bg: colors.action, fg: colors.onAction, pressed: colors.actionPressed },
    secondary: { bg: colors.primarySoft, fg: colors.primary },
    ghost: { bg: 'transparent', fg: colors.primary, pressed: colors.surfaceAlt },
    outline: { bg: colors.surface, fg: colors.text, border: colors.border, pressed: colors.surfaceAlt },
    danger: { bg: colors.errorSoft, fg: colors.error },
    whatsapp: { bg: colors.whatsapp, fg: colors.onWhatsapp },
    success: { bg: colors.success, fg: colors.onSuccess },
    onBrand: { bg: '#FFFFFF', fg: teal[700] },
  };
  const p = palette[variant];
  const heights = { sm: 36, md: 46, lg: 54, xl: 62 } as const;
  const fontSizes = { sm: 13, md: 15, lg: 16, xl: 17 } as const;
  const radii = { sm: 10, md: 12, lg: 12, xl: 14 } as const;
  const strong = size === 'lg' || size === 'xl';
  const isDisabled = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        {
          minHeight: heights[size],
          paddingHorizontal: size === 'sm' ? 12 : 18,
          paddingVertical: subtitle ? 8 : 0,
          borderRadius: radii[size],
          backgroundColor: pressed && p.pressed ? p.pressed : p.bg,
          borderWidth: p.border ? 1 : 0,
          borderColor: p.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: isDisabled ? 0.5 : pressed && !p.pressed ? 0.85 : 1,
          alignSelf: full ? 'stretch' : 'auto',
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        variant === 'action' || variant === 'primary' || variant === 'onBrand' ? shadow(strong ? 2 : 1, dark) : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={p.fg} /> : icon ? <Ionicons name={icon} size={fontSizes[size] + 4} color={p.fg} /> : null}
      <View style={{ alignItems: 'center', flexShrink: 1 }}>
        <Text style={{ color: p.fg, fontFamily: ff(strong ? fonts.bodyBold : fonts.bodySemi), fontSize: fontSizes[size], textAlign: 'center' }} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? <Text style={{ color: p.fg, opacity: 0.85, fontFamily: ff(fonts.body), fontSize: 12 }} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {iconRight && !loading ? <Ionicons name={iconRight} size={fontSizes[size] + 2} color={p.fg} /> : null}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, color, size = 22, bg, label, badge, testID, tone = 'default' }: { icon: IoniconName; onPress?: () => void; color?: string; size?: number; bg?: string; label?: string; badge?: number; testID?: string; tone?: 'default' | 'onBrand' }) {
  const { colors } = useTheme();
  const onBrand = tone === 'onBrand';
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: size + 18,
        height: size + 18,
        borderRadius: (size + 18) / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? (onBrand ? 'rgba(255,255,255,0.18)' : colors.surfaceAlt) : bg ?? 'transparent',
      })}
    >
      <Ionicons name={icon} size={size} color={color ?? (onBrand ? colors.onBrand : colors.text)} />
      {badge ? <Badge count={badge} style={{ position: 'absolute', top: 2, right: 2 }} /> : null}
    </Pressable>
  );
}

export function Badge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  if (!count) return null;
  return (
    <View style={[{ minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ color: colors.onAccent, fontSize: 11, fontFamily: fonts.bodyBold }}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Card / layout helpers
// ---------------------------------------------------------------------------
export function Card({ children, style, onPress, padded = true, level = 1, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; padded?: boolean; level?: 1 | 2 | 3; testID?: string }) {
  const { colors, dark } = useTheme();
  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: padded ? 14 : 0,
    borderWidth: dark ? 1 : 0,
    borderColor: colors.border,
  };
  if (onPress) {
    return (
      <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [base, shadow(level, dark), { transform: [{ scale: pressed ? 0.985 : 1 }] }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View testID={testID} style={[base, shadow(level, dark), style]}>{children}</View>;
}

export function Row({ children, gap = 8, align = 'center', justify, style, wrap }: { children: ReactNode; gap?: number; align?: ViewStyle['alignItems']; justify?: ViewStyle['justifyContent']; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: align, justifyContent: justify, gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ height: 1, backgroundColor: colors.divider }, style]} />;
}

export function SectionHeader({ title, subtitle, action, onAction, style }: { title: string; subtitle?: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <Row justify="space-between" align="flex-end" style={[{ marginBottom: 10 }, style]}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="h3">{title}</AppText>
        {subtitle ? <AppText variant="caption" color="textMuted">{subtitle}</AppText> : null}
      </View>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingBottom: 2 }}>
          <AppText variant="label" color="primary">{action}</AppText>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </Pressable>
      ) : null}
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------
export function Chip({ label, selected, onPress, icon, count, testID, tone = 'default' }: { label: string; selected?: boolean; onPress?: () => void; icon?: IoniconName; count?: number; testID?: string; tone?: 'default' | 'onBrand' }) {
  const { colors } = useTheme();
  const ff = useFont();
  const onBrand = tone === 'onBrand';
  const bg = onBrand ? (selected ? '#FFFFFF' : 'rgba(255,255,255,0.14)') : selected ? colors.primary : colors.surface;
  const fg = onBrand ? (selected ? teal[800] : colors.onBrand) : selected ? colors.onPrimary : colors.text;
  const border = onBrand ? (selected ? '#FFFFFF' : 'rgba(255,255,255,0.3)') : selected ? colors.primary : colors.border;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        height: 36,
        borderRadius: 18,
        backgroundColor: bg,
        opacity: pressed ? 0.85 : 1,
        borderWidth: 1,
        borderColor: border,
      })}
    >
      {icon ? <Ionicons name={icon} size={15} color={selected || onBrand ? fg : colors.textMuted} /> : null}
      <Text style={{ fontFamily: ff(fonts.bodySemi), fontSize: 13, color: fg }}>{label}</Text>
      {count != null ? (
        <View style={{ backgroundColor: colors.accent, borderRadius: 9, paddingHorizontal: 6, minWidth: 20, alignItems: 'center' }}>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: colors.onAccent }}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Tag({ label, tone = 'neutral', icon }: { label: string; tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'accent' | 'action'; icon?: IoniconName }) {
  const { colors } = useTheme();
  const ff = useFont();
  const map = {
    neutral: [colors.surfaceAlt, colors.textMuted],
    primary: [colors.primarySoft, colors.primary],
    success: [colors.successSoft, colors.success],
    warning: [colors.warningSoft, colors.warning],
    error: [colors.errorSoft, colors.error],
    accent: [colors.accentSoft, colors.accentInk],
    action: [colors.accentSoft, colors.accentInk],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' }}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text style={{ color: fg, fontFamily: ff(fonts.bodySemi), fontSize: 11.5 }}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string | null;
  hint?: string;
  icon?: IoniconName;
  prefix?: string;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Input({ label, error, hint, icon, prefix, right, style, multiline, onFocus, onBlur, ...rest }: InputProps) {
  const { colors } = useTheme();
  const ff = useFont();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <AppText variant="label" color="textMuted">{label}</AppText> : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: 8,
          backgroundColor: colors.surface,
          borderWidth: focused || error ? 1.5 : 1,
          borderColor: error ? colors.error : focused ? colors.primary : colors.border,
          borderRadius: 12,
          paddingHorizontal: focused || error ? 11.5 : 12,
          minHeight: multiline ? 92 : 50,
          paddingVertical: multiline ? 10 : 0,
        }}
      >
        {icon ? <Ionicons name={icon} size={18} color={colors.textSubtle} style={{ marginTop: multiline ? 2 : 0 }} /> : null}
        {prefix ? <Text style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>{prefix}</Text> : null}
        <TextInput
          placeholderTextColor={colors.textSubtle}
          multiline={multiline}
          style={[{ flex: 1, fontFamily: ff(fonts.body), fontSize: 15, color: colors.text, minHeight: multiline ? 72 : 48, textAlignVertical: multiline ? 'top' : 'center' }, webNoOutline]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {right}
      </View>
      {error ? <AppText variant="caption" color="error">{error}</AppText> : hint ? <AppText variant="caption" color="textSubtle">{hint}</AppText> : null}
    </View>
  );
}

export function SwitchRow({ label, value, onValueChange, hint }: { label: string; value: boolean; onValueChange: (v: boolean) => void; hint?: string }) {
  const { colors } = useTheme();
  return (
    <Row justify="space-between" style={{ paddingVertical: 6 }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <AppText variant="title">{label}</AppText>
        {hint ? <AppText variant="caption" color="textMuted">{hint}</AppText> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: colors.primary, false: colors.border }} thumbColor="#fff" />
    </Row>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { colors, dark } = useTheme();
  const ff = useFont();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 4 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[
              { flex: 1, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? colors.surface : 'transparent' },
              active ? shadow(1, dark) : null,
            ]}
          >
            <Text style={{ fontFamily: ff(active ? fonts.bodyBold : fonts.bodySemi), fontSize: 14, color: active ? colors.primary : colors.textMuted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ListItem({ icon, title, subtitle, onPress, right, danger, iconSet = 'ion', testID }: { icon?: string; title: string; subtitle?: string; onPress?: () => void; right?: ReactNode; danger?: boolean; iconSet?: 'ion' | 'mci'; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4, backgroundColor: pressed ? colors.surfaceAlt : 'transparent', borderRadius: 12 })}>
      {icon ? (
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: danger ? colors.errorSoft : colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} set={iconSet} size={19} color={danger ? colors.error : colors.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <AppText variant="title" color={danger ? 'error' : 'text'}>{title}</AppText>
        {subtitle ? <AppText variant="caption" color="textMuted">{subtitle}</AppText> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} /> : null)}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Loading states
// ---------------------------------------------------------------------------
export function Skeleton({ width, height = 14, radius = 8, style }: { width?: ViewStyle['width']; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ width: width ?? '100%', height, borderRadius: radius, backgroundColor: colors.skeleton, opacity }, style]} />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card style={{ gap: 10 }}>
      <Row gap={12}>
        <Skeleton width={64} height={64} radius={12} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="80%" />
          <Skeleton width="55%" />
          {lines > 2 ? <Skeleton width="35%" /> : null}
        </View>
      </Row>
    </Card>
  );
}

export function Loading({ label }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ padding: 32, alignItems: 'center', gap: 10 }}>
      <ActivityIndicator color={colors.primary} />
      {label ? <AppText variant="bodySmall" color="textMuted">{label}</AppText> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty states with a small illustration
// ---------------------------------------------------------------------------
export function EmptyState({ icon = 'search', title, body, action, onAction, iconSet = 'ion', compact }: { icon?: string; title: string; body?: string; action?: string; onAction?: () => void; iconSet?: 'ion' | 'mci'; compact?: boolean }) {
  const { colors, dark } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: compact ? 20 : 40, paddingHorizontal: 24, gap: 10 }}>
      <View style={{ width: 132, height: 110, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', width: 110, height: 110, borderRadius: 55, backgroundColor: colors.primarySoft }} />
        <View style={{ position: 'absolute', right: 4, top: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accentSoft }} />
        <View style={{ position: 'absolute', left: 8, bottom: 10, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.successSoft }} />
        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: dark ? 1 : 0, borderColor: colors.border, ...shadow(2, dark) }}>
          <Icon name={icon} set={iconSet} size={32} color={colors.primary} />
        </View>
      </View>
      <AppText variant="h3" align="center">{title}</AppText>
      {body ? <AppText variant="bodySmall" color="textMuted" align="center">{body}</AppText> : null}
      {action ? <Button title={action} onPress={onAction} style={{ marginTop: 6 }} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return <EmptyState icon="cloud-offline-outline" title={t('common.somethingWrong')} body={message} action={onRetry ? t('common.retry') : undefined} onAction={onRetry} />;
}
