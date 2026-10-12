import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { buildSpecPatch, specTemplateFor, type SpecRow } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { useBrands, useCategories } from '@/shared/hooks/reference';
import { localName, useTranslation } from '@/shared/i18n';
import { AppText, Button, Card, Chip, Header, InfoBanner, Input, Row, Screen, toast } from '@/shared/ui';

import { productActions } from '../api';
import { SpecFields, SpecRowsEditor } from '../components/SpecFields';

/**
 * Add a product that is not in the master catalog yet. It goes into the catalog as "pending":
 * the shop can list and sell it right away, and the admin team reviews it (or merges it with
 * an existing product) so names stay standard and searchable. Each category has its own
 * specification form (packages/shared/src/specs.ts).
 */
export default function CustomProductScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ name?: string }>();
  const { data: categories = [] } = useCategories();
  const { data: brands = [] } = useBrands();
  const [name, setName] = useState(params.name ?? '');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [modelNumber, setModelNumber] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<SpecRow[]>([]);
  const [features, setFeatures] = useState('');
  const [inBox, setInBox] = useState('');
  const [mrp, setMrp] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; category?: string }>({});

  const parents = categories.filter((c) => c.parent_id == null);
  const [parentId, setParentId] = useState<number | null>(null);
  // Empty until a main category is picked: a null parent would match the main categories themselves.
  const children = parentId == null ? [] : categories.filter((c) => c.parent_id === parentId);
  const category = categories.find((c) => c.id === categoryId);
  const parent = categories.find((c) => c.id === (category?.parent_id ?? parentId));
  const template = specTemplateFor(category?.slug, parent?.slug);
  const brandSuggestions = useMemo(() => {
    const q = brand.trim().toLowerCase();
    if (q.length < 1) return [];
    return brands.filter((b) => b.name.toLowerCase().startsWith(q) && b.name.toLowerCase() !== q).slice(0, 6);
  }, [brand, brands]);

  const save = async () => {
    const e: typeof errors = {};
    if (!name.trim()) e.name = t('error.NAME_AND_CATEGORY_REQUIRED');
    if (!categoryId) e.category = t('error.NAME_AND_CATEGORY_REQUIRED');
    setErrors(e);
    if (e.name || e.category) return;
    setSaving(true);
    try {
      const created = await productActions.createCustom({
        name: name.trim(),
        brand: brand.trim() || null,
        model: model.trim() || null,
        model_number: modelNumber.trim() || null,
        category_id: categoryId,
        ...buildSpecPatch(template, values, extra),
        description: features.trim() || null,
        in_the_box: inBox.trim() || null,
        mrp: mrp ? Number(mrp) : null,
      });
      router.replace({ pathname: '/partner/product/edit', params: { catalog: created.id, q: created.name } });
    } catch (err) {
      toast(errorText(err, t), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen header={<Header title={t('p.custom.title')} />} footer={<Button testID="custom-next" title={t('p.custom.next')} iconRight="arrow-forward" variant="action" size="lg" full loading={saving} onPress={save} />}>
      <InfoBanner text={t('p.add.customHint')} />
      <Input testID="custom-name" label={t('p.custom.name')} value={name} onChangeText={setName} placeholder={template.nameExample ?? 'Samsung Galaxy S24 FE 5G (8GB, 128GB, Blue)'} error={errors.name} />
      <View style={{ gap: 6 }}>
        <Input label={t('p.custom.brand')} value={brand} onChangeText={setBrand} autoCapitalize="words" />
        {brandSuggestions.length ? (
          <Row wrap gap={6}>
            {brandSuggestions.map((b) => (
              <Chip key={b.id} label={b.name} onPress={() => setBrand(b.name)} />
            ))}
          </Row>
        ) : null}
      </View>
      <Row gap={10}>
        <Input label={t('p.custom.model')} value={model} onChangeText={setModel} style={{ flex: 1 }} />
        <Input label={t('p.custom.modelNumber')} value={modelNumber} onChangeText={setModelNumber} autoCapitalize="characters" style={{ flex: 1 }} />
      </Row>

      <View style={{ gap: 8 }}>
        <AppText variant="label" color={errors.category ? 'error' : 'textMuted'}>{t('p.custom.category')}</AppText>
        <Row wrap gap={8}>
          {parents.map((c) => (
            <Chip key={c.id} label={localName(c)} selected={parentId === c.id} onPress={() => { setParentId(c.id); setCategoryId(categories.some((x) => x.parent_id === c.id) ? null : c.id); }} />
          ))}
        </Row>
        {children.length ? (
          <Row wrap gap={8}>
            {children.map((c) => (
              <Chip key={c.id} testID={`custom-cat-${c.slug}`} label={localName(c)} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} icon={categoryId === c.id ? 'checkmark' : undefined} />
            ))}
          </Row>
        ) : null}
        {errors.category ? <AppText variant="caption" color="error">{errors.category}</AppText> : null}
      </View>

      {category ? (
        <Card style={{ gap: 12 }} testID="custom-specs">
          <AppText variant="h3">{t('p.custom.specsTitle', { category: localName(category) })}</AppText>
          <SpecFields template={template} values={values} onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))} />
          <AppText variant="label" color="textMuted">{t('p.custom.moreSpecs')}</AppText>
          <SpecRowsEditor rows={extra} onChange={setExtra} />
          <Input label={t('p.custom.features')} hint={t('p.custom.featuresHint')} value={features} onChangeText={setFeatures} multiline />
          <Input label={t('p.edit.inBox')} value={inBox} onChangeText={setInBox} />
        </Card>
      ) : (
        <AppText variant="caption" color="textMuted" testID="custom-pick-category">{t('p.custom.pickCategory')}</AppText>
      )}
      <Input label={t('p.custom.mrp')} prefix="₹" keyboardType="number-pad" value={mrp} onChangeText={(v) => setMrp(v.replace(/[^\d]/g, ''))} />
    </Screen>
  );
}
