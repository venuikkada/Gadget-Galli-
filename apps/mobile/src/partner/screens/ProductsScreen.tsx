import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatINR, type Listing } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { useCategories } from '@/shared/hooks/reference';
import { useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { fonts, shadow, webNoOutline } from '@/shared/theme/tokens';
import { AppText, BrandGradient, Button, Card, Chip, confirmDialog, EmptyState, IconButton, Input, Loading, ProductImage, QtyStepper, Row, Tag, toast } from '@/shared/ui';

import { productActions, useMyListings, useMyShop } from '../api';

/** One row of the quick-edit list: price and stock change in one tap. */
function QuickRow({ l }: { l: Listing }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [price, setPrice] = useState(String(l.price));
  const [editing, setEditing] = useState(false);
  useEffect(() => setPrice(String(l.price)), [l.price]);

  const savePrice = async () => {
    setEditing(false);
    const n = Number(price);
    if (!Number.isFinite(n) || n === l.price) return setPrice(String(l.price));
    try {
      await productActions.quick(l.id, n, null, null);
      toast(t('common.saved'), 'success');
    } catch (e) {
      toast(errorText(e, t), 'error');
      setPrice(String(l.price));
    }
  };
  const setStock = async (inStock: boolean | null, qty: number | null) => {
    try {
      await productActions.quick(l.id, null, inStock, qty);
    } catch (e) {
      toast(errorText(e, t), 'error');
    }
  };

  return (
    <Card style={{ gap: 10, opacity: l.is_active ? 1 : 0.6 }} testID={`listing-${l.id}`}>
      <Row align="flex-start" gap={12}>
        <ProductImage path={l.photo} categoryId={l.category_id} brand={l.brand} name={l.name} size={60} />
        <View style={{ flex: 1, gap: 3 }}>
          <AppText variant="bodySmall" weight="semibold" numberOfLines={2}>{l.name}</AppText>
          <Row gap={6} wrap>
            {l.condition !== 'new' ? <Tag label={t(`condition.${l.condition}`)} tone="warning" /> : null}
            {l.catalog_status === 'pending' ? <Tag label={t('p.products.pending')} tone="primary" /> : null}
            {!l.is_active ? <Tag label={t('p.products.hidden')} /> : null}
          </Row>
        </View>
        <IconButton icon="ellipsis-vertical" onPress={() => router.push({ pathname: '/partner/product/edit', params: { id: l.id } })} label={t('common.edit')} />
      </Row>
      <Row justify="space-between" gap={10}>
        {editing ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.primary, borderRadius: 10, paddingHorizontal: 10, height: 40, minWidth: 130 }}>
            <AppText variant="title">₹</AppText>
            <TextInput autoFocus value={price} onChangeText={(v) => setPrice(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" onBlur={savePrice} onSubmitEditing={savePrice} style={[{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text, marginLeft: 4 }, webNoOutline]} />
          </View>
        ) : (
          <Pressable onPress={() => setEditing(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.surfaceAlt }}>
            <AppText variant="price">{formatINR(l.price)}</AppText>
            <Ionicons name="pencil" size={14} color={colors.primary} />
          </Pressable>
        )}
        {l.stock_qty != null ? (
          <Row gap={8}>
            <AppText variant="caption" color={l.stock_qty > 0 ? 'success' : 'error'} weight="semibold">{l.stock_qty > 0 ? t('p.products.inStock') : t('p.products.outOfStock')}</AppText>
            <QtyStepper qty={l.stock_qty} onChange={(q) => setStock(null, Math.max(0, q))} compact stock max={9999} />
          </Row>
        ) : (
          <Row gap={6}>
            <AppText variant="caption" color={l.in_stock ? 'success' : 'error'} weight="semibold">{l.in_stock ? t('p.products.inStock') : t('p.products.outOfStock')}</AppText>
            <Switch value={l.in_stock} onValueChange={(v) => setStock(v, null)} trackColor={{ true: colors.success, false: colors.border }} thumbColor="#fff" />
          </Row>
        )}
      </Row>
      <Row gap={14}>
        <AppText variant="label" color="primary" onPress={() => router.push({ pathname: '/partner/product/edit', params: { id: l.id } })}>{t('common.edit')}</AppText>
        <AppText variant="label" color="primary" onPress={() => router.push({ pathname: '/partner/product/edit', params: { duplicate: l.id } })}>{t('p.products.duplicate')}</AppText>
        <AppText
          variant="label"
          color="error"
          onPress={async () => {
            if (await confirmDialog({ title: t('p.products.deleteConfirm'), destructive: true, confirmText: t('common.remove'), cancelText: t('common.cancel') })) {
              productActions.remove(l.id).catch((e) => toast(errorText(e, t), 'error'));
            }
          }}
        >
          {t('common.remove')}
        </AppText>
      </Row>
    </Card>
  );
}

export default function ProductsScreen() {
  const { t } = useTranslation();
  const { colors, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const { data: shop } = useMyShop();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const q = useMyListings(shop?.id, debounced);
  useCategories();
  useEffect(() => {
    const h = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(h);
  }, [query]);

  const items = useMemo(() => {
    const all = q.data?.pages.flatMap((p) => p.items) ?? [];
    return filter === 'all' ? all : all.filter((l) => (filter === 'in' ? l.in_stock : !l.in_stock));
  }, [q.data, filter]);
  const total = q.data?.pages[0]?.total ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <BrandGradient variant="partner" style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 16, gap: 12, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 }}>
        <Row justify="space-between">
          <View>
            <AppText variant="h1" color="onBrand">{t('p.products.title')}</AppText>
            <AppText variant="caption" color="onBrandMuted">{t('p.products.count', { count: total })}</AppText>
          </View>
          <Button title={t('p.products.bulk')} icon="cloud-upload-outline" variant="onBrand" size="sm" onPress={() => router.push('/partner/product/bulk')} />
        </Row>
        <Input icon="search" placeholder={t('p.products.search')} value={query} onChangeText={setQuery} />
      </BrandGradient>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Row gap={8}>
          <Chip label={t('p.products.all')} selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label={t('p.products.inStock')} selected={filter === 'in'} onPress={() => setFilter('in')} />
          <Chip label={t('p.products.outOfStock')} selected={filter === 'out'} onPress={() => setFilter('out')} />
        </Row>
      </View>
      {q.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(l) => l.id}
          renderItem={({ item }) => <QuickRow l={item} />}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 110 }}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          refreshing={q.isRefetching}
          onRefresh={() => q.refetch()}
          ListEmptyComponent={<EmptyState icon="cube-outline" title={t('p.products.empty')} body={t('p.products.emptyBody')} action={t('p.products.add')} onAction={() => router.push('/partner/product/add')} />}
          ListFooterComponent={q.isFetchingNextPage ? <Loading /> : null}
        />
      )}
      <View style={[{ position: 'absolute', right: 16, bottom: 20, borderRadius: 999 }, shadow(3, dark)]}>
        <Button testID="add-product" title={t('p.products.add')} icon="add-circle" variant="action" size="lg" style={{ borderRadius: 999, paddingHorizontal: 22 }} onPress={() => router.push('/partner/product/add')} />
      </View>
    </View>
  );
}
