import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatINR, highlightParts, type SearchFilters, type SearchSort } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { useRecent } from '@/shared/hooks/recent';
import { useCategories } from '@/shared/hooks/reference';
import { localName, useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { fonts, shadow, webNoOutline } from '@/shared/theme/tokens';
import { useFont } from '@/shared/theme/useFont';
import { AppText, BrandGradient, Button, Chip, EmptyState, ErrorState, IconButton, Loading, ProductImage, Row, ShopAvatar, SkeletonCard } from '@/shared/ui';

import { useSearch, useSuggest } from '../api';
import { ProductRow } from '../components/cards';
import { CategoryTiles } from '../components/home';
import { countFilters, FilterSheet, SortSheet } from '../components/searchSheets';

const TRENDING = ['rtx 4060', 'iphone 15', 'hikvision 4 channel cctv kit', 'galaxy s25', 'ryzen 5 7600', 'macbook air m4', 'redmi note 14 pro', 'wifi router'];

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const { colors } = useTheme();
  const ff = useFont();
  return (
    <Text numberOfLines={1} style={{ fontFamily: ff(fonts.body), fontSize: 15, color: colors.text }}>
      {highlightParts(text, query).map((p, i) => (
        <Text key={i} style={p.match ? { fontFamily: ff(fonts.bodyBold) } : undefined}>{p.text}</Text>
      ))}
    </Text>
  );
}

export default function SearchScreen() {
  const { t } = useTranslation();
  const { colors, dark } = useTheme();
  const ff = useFont();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string; category?: string; title?: string; brand?: string }>();
  const { data: categories = [] } = useCategories();
  const recent = useRecent();
  const inputRef = useRef<TextInput>(null);

  const [text, setText] = useState(params.q ?? '');
  const [query, setQuery] = useState(params.q ?? '');
  const [focused, setFocused] = useState(!params.q && !params.category);
  const [filters, setFilters] = useState<SearchFilters>({
    deliver_only: true,
    category_id: params.category ? Number(params.category) : null,
    brand_ids: params.brand ? [Number(params.brand)] : [],
  });
  const [sort, setSort] = useState<SearchSort>('relevance');
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  // Navigating here again with new params (banner, category tile, brand chip) starts a new search
  useEffect(() => {
    if (params.q !== undefined) {
      setText(params.q);
      setQuery(params.q);
      setFocused(false);
    }
    if (params.category !== undefined || params.brand !== undefined) {
      setFilters((f) => ({
        ...f,
        category_id: params.category ? Number(params.category) : null,
        brand_ids: params.brand ? [Number(params.brand)] : [],
      }));
      setFocused(false);
    }
  }, [params.q, params.category, params.brand]);

  const debounced = useDebounced(text);
  const suggest = useSuggest(focused ? debounced : '');
  const browsing = !!filters.category_id || !!filters.brand_ids?.length;
  const active = query.trim().length > 0 || browsing;
  const results = useSearch(query, filters, sort, active && !focused);
  const items = useMemo(() => results.data?.pages.flatMap((p) => p.items) ?? [], [results.data]);
  const first = results.data?.pages[0];
  const nFilters = countFilters(filters);
  const categoryName = filters.category_id ? categories.find((c) => c.id === filters.category_id) : null;

  const submit = (q: string) => {
    const value = q.trim();
    setText(value);
    setQuery(value);
    setFocused(false);
    Keyboard.dismiss();
    if (value) recent.addSearch(value);
  };

  const showSuggestions = focused && text.trim().length >= 2;
  const showLanding = focused ? text.trim().length < 2 : !active;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      {/* Search band: white field on the brand gradient, with filter and sort chips under it */}
      <BrandGradient glow={false} style={{ paddingTop: insets.top + 8, paddingBottom: 12, gap: 12, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 }}>
        <View style={{ paddingHorizontal: 16 }}>
          <View style={[{ flexDirection: 'row', alignItems: 'center', height: 50, borderRadius: 14, borderWidth: 2, borderColor: focused ? colors.accent : 'transparent', backgroundColor: colors.surface, paddingHorizontal: 12, gap: 8 }, shadow(2, dark)]}>
            <Ionicons name="search" size={20} color={colors.primary} />
            <TextInput
              testID="search-input"
              ref={inputRef}
              value={text}
              onChangeText={setText}
              onFocus={() => setFocused(true)}
              onSubmitEditing={() => submit(text)}
              returnKeyType="search"
              autoFocus={!params.q && !params.category}
              placeholder={t('home.searchPlaceholder')}
              placeholderTextColor={colors.textSubtle}
              autoCorrect={false}
              autoCapitalize="none"
              style={[{ flex: 1, fontFamily: ff(fonts.body), fontSize: 15, color: colors.text, height: 46 }, webNoOutline]}
            />
            {text ? (
              <IconButton
                icon="close-circle"
                size={18}
                color={colors.textSubtle}
                label={t('common.clearAll')}
                onPress={() => {
                  setText('');
                  setFocused(true);
                  inputRef.current?.focus();
                }}
              />
            ) : null}
          </View>
        </View>
        {active && !focused ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            <Chip tone="onBrand" testID="open-filters" icon="options-outline" label={t('search.filters')} selected={nFilters > 0} count={nFilters || undefined} onPress={() => setFilterOpen(true)} />
            <Chip tone="onBrand" testID="open-sort" icon="swap-vertical" label={t(`sort.${sort}`)} selected={sort !== 'relevance'} onPress={() => setSortOpen(true)} />
            <Chip
              tone="onBrand"
              label={t('filter.deliversToMe')}
              icon={filters.deliver_only !== false ? 'checkmark-circle' : 'location-outline'}
              selected={filters.deliver_only !== false}
              onPress={() => setFilters({ ...filters, deliver_only: filters.deliver_only === false })}
            />
          </ScrollView>
        ) : null}
      </BrandGradient>

      {showSuggestions ? (
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={[0]}
          keyExtractor={() => 'sugg'}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100, gap: 4 }}
          renderItem={() => (
            <View style={{ gap: 14 }}>
              <Pressable onPress={() => submit(text)} testID="search-submit" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                <Ionicons name="search" size={18} color={colors.primary} />
                <AppText variant="title" color="primary">“{text.trim()}”</AppText>
              </Pressable>
              {suggest.data?.products.length ? (
                <View style={{ gap: 2 }}>
                  <AppText variant="overline" color="textSubtle">{t('search.products')}</AppText>
                  {suggest.data.products.map((p) => (
                    <Pressable key={p.id} testID={`suggest-${p.id}`} onPress={() => { recent.addSearch(text); router.push(`/product/${p.id}`); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                      <ProductImage path={p.photo} categoryId={p.category_id} name={p.name} size={40} radius={10} />
                      <View style={{ flex: 1 }}>
                        <Highlight text={p.name} query={text} />
                        {p.min_price ? <AppText variant="caption" color="textMuted">{t('search.from')} {formatINR(p.min_price)}</AppText> : null}
                      </View>
                      <Ionicons name="arrow-forward" size={16} color={colors.textSubtle} />
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {suggest.data?.categories.length ? (
                <View style={{ gap: 8 }}>
                  <AppText variant="overline" color="textSubtle">{t('search.categories')}</AppText>
                  <Row wrap gap={8}>
                    {suggest.data.categories.map((c) => (
                      <Chip key={c.id} label={localName(categories.find((x) => x.id === c.id) ?? c)} onPress={() => { setFilters({ ...filters, category_id: c.id }); setText(''); setQuery(''); setFocused(false); Keyboard.dismiss(); }} />
                    ))}
                  </Row>
                </View>
              ) : null}
              {suggest.data?.brands.length ? (
                <View style={{ gap: 8 }}>
                  <AppText variant="overline" color="textSubtle">{t('search.brands')}</AppText>
                  <Row wrap gap={8}>
                    {suggest.data.brands.map((b) => (
                      <Chip key={b.id} label={b.name} onPress={() => { setFilters({ ...filters, brand_ids: [b.id] }); setText(''); setQuery(''); setFocused(false); Keyboard.dismiss(); }} />
                    ))}
                  </Row>
                </View>
              ) : null}
              {suggest.data?.shops.length ? (
                <View style={{ gap: 2 }}>
                  <AppText variant="overline" color="textSubtle">{t('search.shops')}</AppText>
                  {suggest.data.shops.map((s) => (
                    <Pressable key={s.id} onPress={() => router.push(`/shop/${s.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                      <ShopAvatar name={s.name} path={s.logo_path} size={40} />
                      <View style={{ flex: 1 }}>
                        <Highlight text={s.name} query={text} />
                        <AppText variant="caption" color="textMuted">{s.area}</AppText>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {suggest.isFetching && !suggest.data ? <Loading /> : null}
            </View>
          )}
        />
      ) : showLanding ? (
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={[0]}
          keyExtractor={() => 'landing'}
          contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 22 }}
          renderItem={() => (
            <View style={{ gap: 22 }}>
              {recent.searches.length ? (
                <View style={{ gap: 10 }}>
                  <Row justify="space-between">
                    <Row gap={6}>
                      <Ionicons name="time" size={18} color={colors.primary} />
                      <AppText variant="h3">{t('search.recent')}</AppText>
                    </Row>
                    <AppText variant="label" color="primary" onPress={recent.clearSearches}>{t('search.clearRecent')}</AppText>
                  </Row>
                  <Row wrap gap={8}>
                    {recent.searches.map((q) => (
                      <Chip key={q} label={q} icon="time-outline" onPress={() => submit(q)} />
                    ))}
                  </Row>
                </View>
              ) : null}
              <View style={{ gap: 10 }}>
                <Row gap={6}>
                  <Ionicons name="flame" size={18} color={colors.warning} />
                  <AppText variant="h3">{t('search.trending')}</AppText>
                </Row>
                <Row wrap gap={8}>
                  {TRENDING.map((q) => (
                    <Chip key={q} label={q} icon="trending-up" onPress={() => submit(q)} />
                  ))}
                </Row>
              </View>
              <View style={{ gap: 12 }}>
                <AppText variant="h3">{t('home.categories')}</AppText>
                <CategoryTiles
                  categories={categories.filter((c) => c.parent_id == null)}
                  onPress={(c) => {
                    setFilters({ ...filters, category_id: c.id });
                    setFocused(false);
                    Keyboard.dismiss();
                  }}
                />
              </View>
            </View>
          )}
        />
      ) : results.isError ? (
        <ErrorState message={errorText(results.error, t)} onRetry={() => results.refetch()} />
      ) : !first ? (
        <View style={{ padding: 16, gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.product_id}
          renderItem={({ item }) => <ProductRow p={item} nearOnly={filters.deliver_only !== false} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 140, gap: 12 }}
          onEndReached={() => results.hasNextPage && !results.isFetchingNextPage && results.fetchNextPage()}
          onEndReachedThreshold={0.4}
          refreshing={results.isRefetching && !results.isFetchingNextPage}
          onRefresh={() => results.refetch()}
          ListHeaderComponent={
            <AppText variant="label" color="textMuted">
              {categoryName && !query ? `${t('search.browse', { name: localName(categoryName) })} · ` : ''}
              {t('search.results', { count: first.total })}
            </AppText>
          }
          ListFooterComponent={results.isFetchingNextPage ? <Loading /> : null}
          ListEmptyComponent={
            first.elsewhere_count ? (
              <EmptyState
                icon="storefront-outline"
                title={t('search.notNearTitle')}
                body={t('search.notNearBody', { count: first.elsewhere_count })}
                action={t('search.showAll')}
                onAction={() => setFilters({ ...filters, deliver_only: false })}
              />
            ) : (
              <EmptyState icon="search" title={t('search.noResultsTitle', { q: query || localName(categoryName ?? { name: '' }) })} body={t('search.noResultsBody')} />
            )
          }
        />
      )}

      {focused && !showSuggestions && active ? (
        <View style={{ position: 'absolute', bottom: 24, alignSelf: 'center' }}>
          <Button title={t('common.close')} variant="outline" size="sm" onPress={() => { setFocused(false); Keyboard.dismiss(); }} />
        </View>
      ) : null}

      <FilterSheet visible={filterOpen} onClose={() => setFilterOpen(false)} value={filters} onApply={setFilters} />
      <SortSheet visible={sortOpen} onClose={() => setSortOpen(false)} value={sort} onChange={setSort} />
    </View>
  );
}
