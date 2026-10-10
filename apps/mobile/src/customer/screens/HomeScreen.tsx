import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deliveryEtaMins } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { useLocationStore } from '@/shared/hooks/location';
import { useProfile } from '@/shared/hooks/profile';
import { useRecent } from '@/shared/hooks/recent';
import { useCategories } from '@/shared/hooks/reference';
import { useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, BrandGradient, Button, EmptyState, ErrorState, IconButton, SectionHeader, Skeleton, Row } from '@/shared/ui';

import { useHomeFeed, useProductsByIds } from '../api';
import { ProductTile, ShopTile } from '../components/cards';
import { BannerCarousel, CategoryTiles, HowItWorks, LocationBar, SearchBarButton } from '../components/home';

export default function HomeScreen() {
  const { t } = useTranslation();
  const { colors, gradients } = useTheme();
  const insets = useSafeAreaInsets();
  const location = useLocationStore((s) => s.location);
  const { data: profile } = useProfile();
  const feed = useHomeFeed();
  useCategories(); // warms the category icon map used by product placeholders
  const recentIds = useRecent((s) => s.products);
  const recent = useProductsByIds(recentIds);

  useEffect(() => {
    if (!location) router.replace('/location');
  }, [location]);

  const firstName = profile?.user.name?.split(' ')[0];
  const data = feed.data;
  // The open shop that should reach this customer first gets a "Fastest delivery" tag.
  const fastestId = useMemo(() => {
    const eta = (s: { delivery_mins: number; distance_km: number | null }) => deliveryEtaMins(s.delivery_mins, s.distance_km) ?? Infinity;
    const open = (data?.shops_near ?? []).filter((s) => s.is_open_now && s.delivery_mins > 0);
    return open.length > 1 ? open.reduce((a, b) => (eta(b) < eta(a) ? b : a)).id : null;
  }, [data?.shops_near]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      {/* The status-bar area stays teal while the hero scrolls away under the sticky search band. */}
      <View style={{ height: insets.top, backgroundColor: gradients.header[0] }} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => feed.refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
        stickyHeaderIndices={[1]}
      >
        <BrandGradient vertical style={{ paddingBottom: 6 }}>
          <LocationBar
            onBrand
            right={<IconButton icon="notifications-outline" tone="onBrand" onPress={() => router.push({ pathname: '/notifications', params: { app: 'customer' } })} badge={profile?.unread} label={t('notifications.title')} />}
          />
          <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
            <AppText variant="h2" color="onBrand">{firstName ? t('home.greeting', { name: firstName }) : t('home.greetingGuest')}</AppText>
            <AppText variant="bodySmall" color="onBrandMuted">{t('app.tagline')}</AppText>
          </View>
        </BrandGradient>
        <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 14, backgroundColor: gradients.header[1], borderBottomLeftRadius: 22, borderBottomRightRadius: 22 }}>
          <SearchBarButton />
        </View>

        <View style={{ gap: 22, paddingTop: 18 }}>
          {feed.isError ? (
            <ErrorState message={errorText(feed.error, t)} onRetry={() => feed.refetch()} />
          ) : !data ? (
            <View style={{ paddingHorizontal: 16, gap: 16 }}>
              <Skeleton height={148} radius={20} />
              <Row gap={10}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} width={64} height={64} radius={32} />
                ))}
              </Row>
              <Skeleton height={200} radius={16} />
            </View>
          ) : (
            <>
              <BannerCarousel banners={data.banners} />

              <View style={{ paddingHorizontal: 16 }}>
                <SectionHeader title={t('home.categories')} />
                <CategoryTiles categories={data.categories} />
              </View>

              <View>
                <SectionHeader title={t('home.shopsNear')} action={data.shops_near.length ? t('common.seeAll') : undefined} onAction={() => router.push('/shops')} style={{ paddingHorizontal: 16 }} />
                {data.shops_near.length ? (
                  <FlatList
                    horizontal
                    data={data.shops_near}
                    keyExtractor={(s) => s.id}
                    renderItem={({ item }) => <ShopTile s={item} fastest={item.id === fastestId} />}
                    contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 8, paddingTop: 2 }}
                    showsHorizontalScrollIndicator={false}
                  />
                ) : (
                  <EmptyState icon="storefront-outline" title={t('home.noShopsTitle')} body={t('home.noShopsBody')} compact action={t('location.chooseAnother')} onAction={() => router.push('/location')} />
                )}
              </View>

              {data.popular.length ? (
                <View style={{ backgroundColor: colors.accentSoft, paddingVertical: 16 }}>
                  <SectionHeader title={t('home.popular')} style={{ paddingHorizontal: 16 }} />
                  <FlatList
                    horizontal
                    data={data.popular}
                    keyExtractor={(p) => p.product_id}
                    renderItem={({ item }) => <ProductTile p={item} />}
                    contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 6 }}
                    showsHorizontalScrollIndicator={false}
                  />
                </View>
              ) : null}

              {recent.data?.length ? (
                <View>
                  <SectionHeader title={t('home.recent')} style={{ paddingHorizontal: 16 }} />
                  <FlatList
                    horizontal
                    data={recent.data}
                    keyExtractor={(p) => p.product_id}
                    renderItem={({ item }) => <ProductTile p={item} width={144} />}
                    contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 6 }}
                    showsHorizontalScrollIndicator={false}
                  />
                </View>
              ) : null}

              <View style={{ paddingHorizontal: 16, gap: 16 }}>
                <HowItWorks />
                {profile?.user.role !== 'shop_owner' ? (
                  <BrandGradient style={{ borderRadius: 20, padding: 18, gap: 8 }}>
                    <AppText variant="h3" color="onBrand">{t('profile.ownShop')}</AppText>
                    <AppText variant="bodySmall" color="onBrandMuted">{t('profile.ownShopBody')}</AppText>
                    <Button title={t('profile.registerShop')} variant="onBrand" size="sm" icon="storefront" onPress={() => router.push('/profile')} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
                  </BrandGradient>
                ) : null}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
