import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { CONDITIONS, variantText, type CatalogLookupItem, type Condition } from '@gg/shared';

import { errorText, rpc } from '@/shared/api/rpc';
import { PhotoPicker } from '@/shared/components/PhotoPicker';
import { useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Card, Chip, Header, IconButton, InfoBanner, Input, Loading, ProductImage, Row, Screen, Segmented, SwitchRow, toast } from '@/shared/ui';

import { productActions, useListing, useMyShop } from '../api';

interface SpecRow {
  k: string;
  v: string;
}

/**
 * Price & stock form for a listing. Params:
 *   id        edit an existing listing
 *   catalog   new listing of a master-catalog product
 *   duplicate copy an existing listing to add another variant quickly
 *   q         product name, used to load the catalog summary for `catalog`
 */
export default function ProductEditScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { id, catalog, duplicate, q: nameHint } = useLocalSearchParams<{ id?: string; catalog?: string; duplicate?: string; q?: string }>();
  const { data: shop } = useMyShop();
  const source = useListing(id ?? duplicate);
  const [catalogId, setCatalogId] = useState<string | null>(catalog ?? null);
  const [catalogItem, setCatalogItem] = useState<CatalogLookupItem | null>(null);
  const [variants, setVariants] = useState<CatalogLookupItem[]>([]);

  const [condition, setCondition] = useState<Condition>('new');
  const [price, setPrice] = useState('');
  const [mrp, setMrp] = useState('');
  const [warranty, setWarranty] = useState('12');
  const [warrantyType, setWarrantyType] = useState<'brand' | 'shop' | 'none'>('brand');
  const [track, setTrack] = useState(false);
  const [qty, setQty] = useState('1');
  const [inStock, setInStock] = useState(true);
  const [photos, setPhotos] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [specs, setSpecs] = useState<SpecRow[]>([]);
  const [inBox, setInBox] = useState('');
  const [install, setInstall] = useState(false);
  const [installCharge, setInstallCharge] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  // Prefill from an existing listing (edit or duplicate)
  useEffect(() => {
    const s = source.data;
    if (!s) return;
    setCatalogId(s.catalog_product_id);
    setCondition(s.condition);
    setPrice(String(s.price));
    const own = s.own;
    setMrp(own?.mrp ? String(own.mrp) : '');
    setWarranty(String(s.warranty_months));
    setWarrantyType(s.warranty_type);
    setTrack(s.stock_qty != null);
    setQty(String(s.stock_qty ?? 1));
    setInStock(s.in_stock);
    setPhotos(id ? own?.photos ?? [] : []);
    setInstall(s.installation_available);
    setInstallCharge(s.installation_charge ? String(s.installation_charge) : '');
    setActive(s.is_active);
    setInBox(own?.in_the_box ?? '');
    setDescription(own?.description ?? '');
    setSpecs(Object.entries(own?.specs ?? {}).map(([k, v]) => ({ k, v: String(v) })));
  }, [source.data, id]);

  // Catalog product summary (+ other variants of the same model for "Duplicate")
  useEffect(() => {
    const base = source.data;
    const query = base?.model ?? base?.name ?? nameHint ?? '';
    const lookupId = catalog ?? base?.catalog_product_id;
    if (!query) return;
    let alive = true;
    rpc<CatalogLookupItem[]>('catalog_lookup', { p_query: query, p_category_id: null, p_limit: 30 })
      .then((items) => {
        if (!alive) return;
        const found = items.find((i) => i.id === lookupId);
        if (found) setCatalogItem(found);
        if (duplicate && base) {
          setVariants(items.filter((i) => i.category_id === base.category.id && (i.model === base.model || i.brand === base.brand)).slice(0, 12));
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [source.data, nameHint, catalog, duplicate]);

  const save = async () => {
    if (!(Number(price) >= 0) || price === '') {
      setPriceError(t('p.edit.priceRequired'));
      return;
    }
    if (!catalogId) {
      toast(t('p.add.searchCatalog'), 'error');
      return;
    }
    setSaving(true);
    try {
      await productActions.upsert({
        ...(id ? { id } : { catalog_product_id: catalogId, shop_id: shop?.id }),
        ...(id && catalogId !== source.data?.catalog_product_id ? { catalog_product_id: catalogId } : {}),
        condition,
        price: Number(price),
        mrp: mrp ? Number(mrp) : null,
        warranty_months: warrantyType === 'none' ? 0 : Number(warranty || 0),
        warranty_type: warrantyType,
        stock_qty: track ? Number(qty || 0) : null,
        in_stock: track ? Number(qty || 0) > 0 : inStock,
        photos,
        description: description || null,
        specs: Object.fromEntries(specs.filter((s) => s.k && s.v).map((s) => [s.k, s.v])),
        in_the_box: inBox || null,
        installation_available: install,
        installation_charge: install ? Number(installCharge || 0) : null,
        is_active: active,
      });
      toast(t('common.saved'), 'success');
      router.back();
    } catch (e) {
      toast(errorText(e, t), 'error');
    } finally {
      setSaving(false);
    }
  };

  if ((id || duplicate) && source.isLoading) return <Screen header={<Header />}><Loading /></Screen>;
  const displayName = catalogItem?.name ?? source.data?.name ?? '';
  const displayBrand = catalogItem?.brand ?? source.data?.brand ?? null;

  return (
    <Screen header={<Header title={t('p.edit.title')} />} footer={<Button testID="save-product" title={t('p.edit.save')} variant="action" size="lg" full loading={saving} onPress={save} />}>
      <Card>
        <Row gap={12}>
          <ProductImage path={catalogItem?.photo} categoryId={catalogItem?.category_id ?? source.data?.category.id} brand={displayBrand} name={displayName} size={64} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="title" numberOfLines={2}>{displayName || '…'}</AppText>
            <AppText variant="caption" color="textMuted">{[displayBrand, variantText(catalogItem?.variant ?? source.data?.variant)].filter(Boolean).join(' · ')}</AppText>
          </View>
        </Row>
      </Card>

      {duplicate ? (
        <View style={{ gap: 8 }}>
          <InfoBanner text={t('p.edit.variantHint')} />
          <Row wrap gap={8}>
            {variants.map((v) => (
              <Chip key={v.id} label={variantText(v.variant) || v.name} selected={catalogId === v.id} onPress={() => { setCatalogId(v.id); setCatalogItem(v); }} />
            ))}
          </Row>
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <AppText variant="label" color="textMuted">{t('p.edit.condition')}</AppText>
        <Row wrap gap={8}>
          {CONDITIONS.map((c) => (
            <Chip key={c} label={t(`condition.${c}`)} selected={condition === c} onPress={() => setCondition(c)} />
          ))}
        </Row>
      </View>
      <Row gap={10}>
        <Input testID="listing-price" label={t('p.edit.price')} prefix="₹" keyboardType="decimal-pad" value={price} onChangeText={(v) => { setPrice(v.replace(/[^\d.]/g, '')); setPriceError(null); }} error={priceError} style={{ flex: 1 }} />
        <Input label={t('p.edit.mrp')} prefix="₹" keyboardType="decimal-pad" value={mrp} onChangeText={(v) => setMrp(v.replace(/[^\d.]/g, ''))} style={{ flex: 1 }} placeholder={catalogItem?.mrp ? String(catalogItem.mrp) : ''} />
      </Row>
      <View style={{ gap: 8 }}>
        <AppText variant="label" color="textMuted">{t('p.edit.warrantyType')}</AppText>
        <Segmented value={warrantyType} onChange={setWarrantyType} options={[{ value: 'brand', label: t('product.warrantyBrand') }, { value: 'shop', label: t('product.warrantyShop') }, { value: 'none', label: t('common.none') }]} />
        {warrantyType !== 'none' ? <Input label={t('p.edit.warranty')} keyboardType="number-pad" value={warranty} onChangeText={setWarranty} /> : null}
      </View>
      <Card style={{ gap: 10 }}>
        <AppText variant="title">{t('p.edit.stockMode')}</AppText>
        <Segmented value={track ? 'qty' : 'switch'} onChange={(v) => setTrack(v === 'qty')} options={[{ value: 'switch', label: t('p.edit.simpleSwitch') }, { value: 'qty', label: t('p.edit.trackQty') }]} />
        {track ? <Input label={t('p.edit.qty')} keyboardType="number-pad" value={qty} onChangeText={setQty} /> : <SwitchRow label={t('p.edit.inStock')} value={inStock} onValueChange={setInStock} />}
      </Card>
      {shop ? (
        <View style={{ gap: 4 }}>
          <PhotoPicker bucket="product-photos" folder={shop.id} label={t('p.edit.photos')} value={photos} onChange={setPhotos} max={8} />
          <AppText variant="caption" color="textSubtle">{t('p.edit.photosHint')}</AppText>
        </View>
      ) : null}
      <Card style={{ gap: 10 }}>
        <SwitchRow label={t('p.edit.installation')} value={install} onValueChange={setInstall} />
        {install ? <Input label={t('p.edit.installationCharge')} prefix="₹" keyboardType="number-pad" value={installCharge} onChangeText={setInstallCharge} /> : null}
      </Card>
      <Input label={t('p.edit.description')} value={description} onChangeText={setDescription} multiline />
      <Input label={t('p.edit.inBox')} value={inBox} onChangeText={setInBox} />
      <View style={{ gap: 8 }}>
        <AppText variant="label" color="textMuted">{t('p.edit.specs')}</AppText>
        {specs.map((s, i) => (
          <Row key={i} gap={8}>
            <Input placeholder={t('p.edit.specName')} value={s.k} onChangeText={(v) => setSpecs(specs.map((x, j) => (j === i ? { ...x, k: v } : x)))} style={{ flex: 1 }} />
            <Input placeholder={t('p.edit.specValue')} value={s.v} onChangeText={(v) => setSpecs(specs.map((x, j) => (j === i ? { ...x, v } : x)))} style={{ flex: 1.4 }} />
            <IconButton icon="close" color={colors.error} onPress={() => setSpecs(specs.filter((_, j) => j !== i))} />
          </Row>
        ))}
        <Button title={t('p.edit.addSpec')} icon="add" variant="ghost" size="sm" onPress={() => setSpecs([...specs, { k: '', v: '' }])} style={{ alignSelf: 'flex-start' }} />
      </View>
      <SwitchRow label={t('p.edit.active')} value={active} onValueChange={setActive} />
    </Screen>
  );
}
