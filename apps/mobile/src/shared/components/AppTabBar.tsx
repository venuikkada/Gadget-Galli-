import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';
import { useFont } from '../theme/useFont';
import { Badge } from '../ui';

export interface TabItem {
  name: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconActive: React.ComponentProps<typeof Ionicons>['name'];
  badge?: number;
}

/** Bottom navigation with large touch targets, a badge and an optional element floating above it (cart bar). */
export function AppTabBar({ state, navigation, insets, items, above }: BottomTabBarProps & { items: TabItem[]; above?: ReactNode }) {
  const { colors, dark } = useTheme();
  const ff = useFont();
  return (
    <View>
      {above}
      <View
        style={[
          {
            flexDirection: 'row',
            backgroundColor: colors.surface,
            borderTopWidth: dark ? 1 : 0,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 8),
            paddingTop: 8,
          },
          dark ? null : { shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -3 }, elevation: 10 },
        ]}
      >
        {state.routes.map((route, index) => {
          const item = items.find((i) => i.name === route.name);
          if (!item) return null;
          const focused = state.index === index;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
          };
          return (
            <Pressable key={route.key} testID={`tab-${route.name}`} accessibilityRole="tab" accessibilityState={{ selected: focused }} onPress={onPress} style={{ flex: 1, alignItems: 'center', paddingVertical: 4, gap: 2 }}>
              {focused ? <View style={{ position: 'absolute', top: -8, width: 24, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: colors.primary }} /> : null}
              <View>
                <Ionicons name={focused ? item.iconActive : item.icon} size={24} color={focused ? colors.primary : colors.textSubtle} />
                {item.badge ? <Badge count={item.badge} style={{ position: 'absolute', top: -4, right: -10 }} /> : null}
              </View>
              <Text style={{ fontSize: 11, fontFamily: ff(focused ? fonts.bodyBold : fonts.bodyMedium), color: focused ? colors.primary : colors.textSubtle }}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
