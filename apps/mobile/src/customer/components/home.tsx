import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Dimensions, Pressable, ScrollView, View } from 'react-native';

import { bannerStyle, familyFor, type Banner, type Category } from '@gg/shared';

import { publicUrl } from '@/shared/api/storage';
import { useLocationStore } from '@/shared/hooks/location';
import { localName, useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { shadow } from '@/shared/theme/tokens';
import { AppText, Icon, Row } from '@/shared/ui';

/** "Delivering to Home · Kukatpally" with a pin. `onBrand` for the teal hero (white text, marigold pin). */
export function LocationBar({ right, onBrand }: { right?: React.ReactNode; onBrand?: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const loc = useLocationStore((s) => s.location);
  return (
    <Row justify="space-between" style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
      <Pressable onPress={() => router.push('/location')} style={{ flex: 1 }} testID="location-bar">
        <Row gap={8}>
          <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: onBrand ? 'rgba(255,255,255,0.14)' : colors.accentSoft }}>
            <Ionicons name="location" size={19} color={onBrand ? colors.accent : colors.accentInk} />
          </View>
          <View style={{ flexShrink: 1 }}>
            <AppText variant="caption" color={onBrand ? 'onBrandMuted' : 'textMuted'}>{t('location.deliveringTo')}</AppText>
            <Row gap={2}>
              <AppText variant="title" weight="bold" color={onBrand ? 'onBrand' : 'text'} numberOfLines={1} style={{ flexShrink: 1 }}>
                {loc ? `${loc.label ? `${loc.label} · ` : ''}${loc.areaName}, ${loc.pincode}` : t('location.title')}
              </AppText>
              <Ionicons name="chevron-down" size={16} color={onBrand ? colors.onBrand : colors.text} />
            </Row>
          </View>
        </Row>
      </Pressable>
      {right}
    </Row>
  );
}

/** Things people search for, shown one after another in the search box. */
const HINTS = ['rtx 4060', 'iphone 15', 'cctv camera', 'gaming laptop', 'boat earbuds'];

/** The big search box on Home. Its placeholder rotates through example searches while the screen is visible. */
export function SearchBarButton({ onPress }: { onPress?: () => void }) {
  const { t } = useTranslation();
  const { colors, dark } = useTheme();
  const [hint, setHint] = useState(-1);
  const fade = useRef(new Animated.Value(1)).current;

  useFocusEffect(
    useCallback(() => {
      let timer: ReturnType<typeof setInterval> | undefined;
      let alive = true;
      AccessibilityInfo.isReduceMotionEnabled()
        .catch(() => false)
        .then((reduce) => {
          if (reduce || !alive) return;
          timer = setInterval(() => {
            Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
              setHint((h) => (h + 1) % HINTS.length);
              Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
            });
          }, 2800);
        });
      return () => {
        alive = false;
        if (timer) clearInterval(timer);
      };
    }, [fade]),
  );

  const placeholder = hint < 0 ? t('home.searchPlaceholder') : `${t('common.search')} “${HINTS[hint]}”`;
  return (
    <Pressable
      testID="search-bar"
      accessibilityRole="search"
      accessibilityLabel={t('home.searchPlaceholder')}
      onPress={onPress ?? (() => router.push('/search'))}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          height: 50,
          borderRadius: 14,
          paddingHorizontal: 14,
          backgroundColor: colors.surface,
          borderWidth: dark ? 1 : 0,
          borderColor: colors.border,
          opacity: pressed ? 0.92 : 1,
        },
        shadow(2, dark),
      ]}
    >
      <Ionicons name="search" size={20} color={colors.primary} />
      <Animated.View style={{ flex: 1, opacity: fade }}>
        <AppText variant="bodySmall" color="textMuted" numberOfLines={1}>{placeholder}</AppText>
      </Animated.View>
    </Pressable>
  );
}

/** Top-level categories as round tiles in their category colours (scrolls sideways when they don't fit). */
export function CategoryTiles({ categories, onPress }: { categories: Category[]; onPress?: (c: Category) => void }) {
  const { dark, colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingRight: 8 }} style={{ marginHorizontal: -4 }}>
      {categories.map((c) => {
        const fam = familyFor(c.slug, c.name)[dark ? 'dark' : 'light'];
        return (
          <Pressable
            key={c.id}
            testID={`category-${c.slug}`}
            onPress={() => (onPress ? onPress(c) : router.push({ pathname: '/search', params: { category: String(c.id), title: localName(c) } }))}
            style={({ pressed }) => ({ width: 80, alignItems: 'center', gap: 7, opacity: pressed ? 0.75 : 1 })}
          >
            <LinearGradient colors={[fam.tint, fam.tint2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: dark ? colors.border : 'rgba(255,255,255,0.9)' }}>
              <Icon name={c.icon} set="mci" size={30} color={fam.icon} />
            </LinearGradient>
            <AppText variant="caption" weight="semibold" align="center" numberOfLines={2} color={colors.text} style={{ fontSize: 11.5 }}>
              {localName(c)}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
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

const BANNER_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  search: 'flash',
  category: 'pricetags',
  shop: 'storefront',
  product: 'pricetag',
  url: 'gift',
  none: 'sparkles',
};

/** Auto-advancing offer banners set by admins; the next card peeks in from the right. */
export function BannerCarousel({ banners }: { banners: Banner[] }) {
  const { colors } = useTheme();
  const width = Math.min(Dimensions.get('window').width, 720) - 32 - 28;
  const step = width + 12;
  const ref = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (banners.length < 2) return;
    const timer = setInterval(() => {
      setIndex((i) => {
        const next = (i + 1) % banners.length;
        ref.current?.scrollTo({ x: next * step, animated: true });
        return next;
      });
    }, 4500);
    return () => clearInterval(timer);
  }, [banners.length, step]);
  if (!banners.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <ScrollView
        ref={ref}
        horizontal
        snapToInterval={step}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / step))}
        contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}
      >
        {banners.map((b) => {
          const img = publicUrl('banners', b.image_path);
          const style = bannerStyle(b.bg_color);
          const muted = style.text === '#FFFFFF' ? 'rgba(255,255,255,0.88)' : 'rgba(14,27,29,0.78)';
          return (
            <Pressable key={b.id} onPress={() => bannerPress(b)} style={{ width, height: 148, borderRadius: 20, overflow: 'hidden' }}>
              {img ? (
                <Image source={{ uri: img }} style={{ width, height: 148 }} contentFit="cover" />
              ) : (
                <LinearGradient colors={style.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, padding: 18, justifyContent: 'center' }}>
                  <View style={{ position: 'absolute', width: 170, height: 170, borderRadius: 85, right: -46, top: -54, backgroundColor: style.text === '#FFFFFF' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.35)' }} />
                  <Ionicons name={BANNER_ICON[b.link_type] ?? 'sparkles'} size={76} color={style.text === '#FFFFFF' ? 'rgba(255,255,255,0.16)' : 'rgba(14,27,29,0.12)'} style={{ position: 'absolute', right: 14, bottom: 10 }} />
                  <AppText variant="h3" weight="bold" color={style.text} numberOfLines={2} style={{ maxWidth: '78%' }}>{b.title}</AppText>
                  {b.subtitle ? <AppText variant="bodySmall" color={muted} numberOfLines={2} style={{ marginTop: 4, maxWidth: '80%' }}>{b.subtitle}</AppText> : null}
                  {b.link_type !== 'none' ? (
                    <View style={{ marginTop: 10, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: style.text === '#FFFFFF' ? '#FFFFFF' : style.text }}>
                      <Ionicons name="arrow-forward" size={16} color={style.text === '#FFFFFF' ? style.gradient[0] : '#FFFFFF'} />
                    </View>
                  ) : null}
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

/** Four steps from search to delivery, numbered with marigold dots. */
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
    <View style={{ backgroundColor: colors.primarySoft, borderRadius: 20, padding: 16, gap: 14 }}>
      <AppText variant="title" color="primary" weight="bold">{t('home.howItWorks')}</AppText>
      <Row justify="space-between" align="flex-start">
        {steps.map((s, i) => (
          <View key={s.icon} style={{ width: '24%', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={s.icon} size={20} color={colors.primary} />
              <View style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                <AppText variant="caption" color="onAccent" weight="bold" style={{ fontSize: 10.5, lineHeight: 13 }}>{i + 1}</AppText>
              </View>
            </View>
            <AppText variant="caption" align="center" numberOfLines={3}>{s.text}</AppText>
          </View>
        ))}
      </Row>
    </View>
  );
}
