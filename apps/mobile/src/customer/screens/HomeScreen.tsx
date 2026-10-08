import { router } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorText } from '@/shared/api/rpc';
import { useLocationStore } from '@/shared/hooks/location';
import { useProfile } from '@/shared/hooks/profile';
import { useRecent } from '@/shared/hooks/recent';
import { useCategories } from '@/shared/hooks/reference';
import { useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, EmptyState, ErrorState, IconButton, SectionHeader, Skeleton, Row } from '@/shared/ui';

import { useHomeFeed, useProductsByIds } from '../api';
import { ProductTile, ShopTile } from '../components/cards';
import { BannerCarousel, CategoryTiles, HowItWorks, LocationBar, SearchBarButton } from '../components/home';

export default function HomeScreen() {
  const { t } = useTranslation();
  const { colors, dark } = useTheme();
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

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <LocationBar right={<IconButton icon="notifications-outline" onPress={() => router.push({ pathname: '/notifications', params: { app: 'customer' } })} badge={profile?.unread} label={t('notifications.title')} />} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120, gap: 22 }}
        refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => feed.refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
        stickyHeaderIndices={[1]}
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          <AppText variant="h2">{firstName ? t('home.greeting', { name: firstName }) : t('home.greetingGuest')}</AppText>
          <AppText variant="bodySmall" color="textMuted">{t('app.tagline')}</AppText>
        </View>
        <View style={{ paddingHorizontal: 16, paddingVertical: 6, backgroundColor: colors.background }}>
          <SearchBarButton />
        </View>

        {feed.isError ? (
          <ErrorState message={errorText(feed.error, t)} onRetry={() => feed.refetch()} />
        ) : !data ? (
          <View style={{ paddingHorizontal: 16, gap: 16 }}>
            <Skeleton height={132} radius={18} />
            <Row gap={10}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} width={58} height={58} radius={18} />
              ))}
            </Row>
            <Skeleton height={190} radius={16} />
          </View>
        ) : (
          <>
            <View style={{ paddingHorizontal: 16 }}>
              <BannerCarousel banners={data.banners} />
            </View>

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
                  renderItem={({ item }) => <ShopTile s={item} />}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 6 }}
                  showsHorizontalScrollIndicator={false}
                />
              ) : (
                <EmptyState icon="storefront-outline" title={t('home.noShopsTitle')} body={t('home.noShopsBody')} compact action={t('location.chooseAnother')} onAction={() => router.push('/location')} />
              )}
            </View>

            {data.popular.length ? (
              <View>
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
                  renderItem={({ item }) => <ProductTile p={item} width={140} />}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 6 }}
                  showsHorizontalScrollIndicator={false}
                />
              </View>
            ) : null}

            <View style={{ paddingHorizontal: 16, gap: 16 }}>
              <HowItWorks />
              {profile?.user.role !== 'shop_owner' ? (
                <View style={{ backgroundColor: colors.actionSoft, borderRadius: 18, padding: 16, gap: 8 }}>
                  <AppText variant="title">{t('profile.ownShop')}</AppText>
                  <AppText variant="bodySmall" color="textMuted">{t('profile.ownShopBody')}</AppText>
                  <Button title={t('profile.registerShop')} variant="action" size="sm" icon="storefront" onPress={() => router.push('/profile')} style={{ alignSelf: 'flex-start' }} />
                </View>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
