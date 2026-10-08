import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Dimensions, Pressable, ScrollView, View } from 'react-native';

import type { Banner, Category } from '@gg/shared';

import { publicUrl } from '@/shared/api/storage';
import { useLocationStore } from '@/shared/hooks/location';
import { localName, useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { fonts, shadow } from '@/shared/theme/tokens';
import { AppText, Icon, Row } from '@/shared/ui';

export function LocationBar({ right }: { right?: React.ReactNode }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const loc = useLocationStore((s) => s.location);
  return (
    <Row justify="space-between" style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
      <Pressable onPress={() => router.push('/location')} style={{ flex: 1 }} testID="location-bar">
        <Row gap={6}>
          <Ionicons name="location" size={20} color={colors.action} />
          <View style={{ flexShrink: 1 }}>
            <AppText variant="caption" color="textMuted">{t('location.deliveringTo')}</AppText>
            <Row gap={2}>
              <AppText variant="title" numberOfLines={1} style={{ flexShrink: 1 }}>
                {loc ? `${loc.label ? `${loc.label} · ` : ''}${loc.areaName}, ${loc.pincode}` : t('location.title')}
              </AppText>
              <Ionicons name="chevron-down" size={16} color={colors.text} />
            </Row>
          </View>
        </Row>
      </Pressable>
      {right}
    </Row>
  );
}

export function SearchBarButton({ onPress }: { onPress?: () => void }) {
  const { t } = useTranslation();
  const { colors, dark } = useTheme();
  return (
    <Pressable
      testID="search-bar"
      onPress={onPress ?? (() => router.push('/search'))}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          height: 52,
          borderRadius: 14,
          paddingHorizontal: 14,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: pressed ? colors.primary : colors.border,
        },
        shadow(1, dark),
      ]}
    >
      <Ionicons name="search" size={20} color={colors.primary} />
      <AppText variant="bodySmall" color="textSubtle" numberOfLines={1} style={{ flex: 1 }}>{t('home.searchPlaceholder')}</AppText>
      <Ionicons name="mic-outline" size={18} color={colors.textSubtle} />
    </Pressable>
  );
}

const TILE_COLORS = ['#EEF2FF', '#FFF1EA', '#ECFEFF', '#F5F3FF', '#F0FDF4'];
const TILE_DARK = ['#1E1B4B', '#3A1E12', '#0C2A33', '#2A1F4A', '#0F2E1C'];
const TILE_FG = ['#4F46E5', '#FF6B35', '#0891B2', '#7C3AED', '#16A34A'];

export function CategoryTiles({ categories, onPress }: { categories: Category[]; onPress?: (c: Category) => void }) {
  const { dark, colors } = useTheme();
  return (
    <Row wrap gap={10} justify="space-between">
      {categories.map((c, i) => (
        <Pressable
          key={c.id}
          testID={`category-${c.slug}`}
          onPress={() => (onPress ? onPress(c) : router.push({ pathname: '/search', params: { category: String(c.id), title: localName(c) } }))}
          style={({ pressed }) => ({ width: '18%', minWidth: 62, alignItems: 'center', gap: 6, opacity: pressed ? 0.75 : 1 })}
        >
          <View style={{ width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: (dark ? TILE_DARK : TILE_COLORS)[i % 5] }}>
            <Icon name={c.icon} set="mci" size={28} color={dark ? '#E0E7FF' : TILE_FG[i % 5]} />
          </View>
          <AppText variant="caption" weight="semibold" align="center" numberOfLines={2} color={colors.text}>{localName(c)}</AppText>
        </Pressable>
      ))}
    </Row>
  );
}

function bannerPress(b: Banner) {
  switch (b.link_type) {
    case 'search':
      router.push({ pathname: '/search', params: { q: b.link_value ?? '' } });
      break;
    case 'category':
      router.push({ pathname: '/search', params: { category: b.link_value ?? '' } });
      break;
    case 'shop':
      if (b.link_value) router.push(`/shop/${b.link_value}`);
      break;
    case 'product':
      if (b.link_value) router.push(`/product/${b.link_value}`);
      break;
    case 'url':
      if (b.link_value?.startsWith('/')) router.push(b.link_value as never);
      break;
    default:
      break;
  }
}

/** Auto-advancing offer banners set by admins. */
export function BannerCarousel({ banners }: { banners: Banner[] }) {
  const { colors } = useTheme();
  const width = Math.min(Dimensions.get('window').width, 720) - 32;
  const ref = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (banners.length < 2) return;
    const timer = setInterval(() => {
      setIndex((i) => {
        const next = (i + 1) % banners.length;
        ref.current?.scrollTo({ x: next * (width + 12), animated: true });
        return next;
      });
    }, 4500);
    return () => clearInterval(timer);
  }, [banners.length, width]);
  if (!banners.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled={false}
        snapToInterval={width + 12}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / (width + 12)))}
        contentContainerStyle={{ gap: 12 }}
      >
        {banners.map((b) => {
          const img = publicUrl('banners', b.image_path);
          return (
            <Pressable key={b.id} onPress={() => bannerPress(b)} style={{ width, height: 132, borderRadius: 18, overflow: 'hidden' }}>
              {img ? (
                <Image source={{ uri: img }} style={{ width, height: 132 }} contentFit="cover" />
              ) : (
                <LinearGradient colors={[b.bg_color, shade(b.bg_color)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, padding: 18, justifyContent: 'center' }}>
                  <Ionicons name="sparkles" size={84} color="rgba(255,255,255,0.12)" style={{ position: 'absolute', right: 12, bottom: -6 }} />
                  <AppText variant="h3" color="#FFFFFF" numberOfLines={2} style={{ maxWidth: '80%', fontFamily: fonts.headingBold }}>{b.title}</AppText>
                  {b.subtitle ? <AppText variant="bodySmall" color="#FFFFFFDD" numberOfLines={2} style={{ marginTop: 4, maxWidth: '85%' }}>{b.subtitle}</AppText> : null}
                </LinearGradient>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      {banners.length > 1 ? (
        <Row gap={5} justify="center">
          {banners.map((b, i) => (
            <View key={b.id} style={{ width: i === index ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? colors.primary : colors.border }} />
          ))}
        </Row>
      ) : null}
    </View>
  );
}

function shade(hex: string) {
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m) return hex;
  const [r, g, b] = m.map((x) => Math.max(0, Math.round(parseInt(x, 16) * 0.72)));
  return `#${[r, g, b].map((x) => x!.toString(16).padStart(2, '0')).join('')}`;
}

export function HowItWorks() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const steps = [
    { icon: 'search', text: t('home.step1') },
    { icon: 'call', text: t('home.step2') },
    { icon: 'qr-code', text: t('home.step3') },
    { icon: 'bicycle', text: t('home.step4') },
  ] as const;
  return (
    <View style={{ backgroundColor: colors.primarySoft, borderRadius: 18, padding: 16, gap: 12 }}>
      <AppText variant="title" color="primary">{t('home.howItWorks')}</AppText>
      <Row justify="space-between" align="flex-start">
        {steps.map((s, i) => (
          <View key={s.icon} style={{ width: '24%', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={s.icon} size={19} color={i === 3 ? colors.action : colors.primary} />
            </View>
            <AppText variant="caption" align="center" numberOfLines={3}>{s.text}</AppText>
          </View>
        ))}
      </Row>
    </View>
  );
}
