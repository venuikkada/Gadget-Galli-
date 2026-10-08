import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { formatINR, variantText } from '@gg/shared';

import { useCategories } from '@/shared/hooks/reference';
import { localName, useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Card, Chip, EmptyState, Header, Input, Loading, ProductImage, Row, Screen, Tag } from '@/shared/ui';

import { useCatalogLookup, useMyListings, useMyShop } from '../api';

/** Add product, step 1: pick from the master catalog so names stay standard and searchable. */
export default function ProductAddScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ q?: string }>();
  const [query, setQuery] = useState(params.q ?? '');
  const [debounced, setDebounced] = useState(params.q ?? '');
  const [category, setCategory] = useState<number | null>(null);
  const { data: categories = [] } = useCategories();
  const { data: shop } = useMyShop();
  const mine = useMyListings(shop?.id, '');
  const results = useCatalogLookup(debounced, category);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(h);
  }, [query]);
  const listed = useMemo(() => new Set((mine.data?.pages.flatMap((p) => p.items) ?? []).map((l) => l.catalog_product_id)), [mine.data]);
  const leafCategories = categories.filter((c) => c.parent_id != null);

  return (
    <Screen header={<Header title={t('p.add.title')} />}>
      <Input testID="catalog-search" icon="search" placeholder={t('p.add.searchCatalog')} value={query} onChangeText={setQuery} autoFocus />
      <View style={{ gap: 6 }}>
        <AppText variant="caption" color="textMuted">{t('p.add.browse')}</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {leafCategories.map((c) => (
            <Chip key={c.id} label={localName(c)} selected={category === c.id} onPress={() => setCategory(category === c.id ? null : c.id)} />
          ))}
        </ScrollView>
      </View>
      {results.isFetching && !results.data ? <Loading /> : null}
      {results.data?.map((p) => {
        const isListed = listed.has(p.id);
        return (
          <Card key={p.id} onPress={() => router.push({ pathname: '/partner/product/edit', params: { catalog: p.id, q: p.name } })} testID={`catalog-${p.id}`}>
            <Row gap={12} align="flex-start">
              <ProductImage path={p.photo} categoryId={p.category_id} brand={p.brand} name={p.name} size={56} />
              <View style={{ flex: 1, gap: 3 }}>
                <AppText variant="bodySmall" weight="semibold" numberOfLines={2}>{p.name}</AppText>
                <AppText variant="caption" color="textMuted">{[p.brand, p.category, variantText(p.variant)].filter(Boolean).join(' · ')}</AppText>
                <Row gap={6}>
                  {p.mrp ? <AppText variant="caption" color="textSubtle">MRP {formatINR(p.mrp)}</AppText> : null}
                  {isListed ? <Tag label={t('p.add.listed')} tone="success" icon="checkmark" /> : null}
                  {p.status === 'pending' ? <Tag label={t('p.products.pending')} tone="primary" /> : null}
                </Row>
              </View>
            </Row>
          </Card>
        );
      })}
      {results.data && !results.data.length ? <EmptyState icon="search" title={t('search.noResultsTitle', { q: query })} compact /> : null}
      <Card style={{ gap: 8, backgroundColor: colors.primarySoft }}>
        <AppText variant="title">{t('p.add.notFound')}</AppText>
        <AppText variant="caption" color="textMuted">{t('p.add.customHint')}</AppText>
        <Button title={t('p.add.custom')} icon="create-outline" variant="primary" onPress={() => router.push({ pathname: '/partner/product/custom', params: { name: query } })} />
      </Card>
    </Screen>
  );
}
