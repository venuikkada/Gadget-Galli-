import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { buildSpecPatch, missingRequired, modelHint, specTemplateFor, splitBrandModel, suggestProductName, type Category, type SpecRow } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { useBrands, useCategories } from '@/shared/hooks/reference';
import { localName, useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Card, Chip, Header, InfoBanner, Input, Row, Screen, toast } from '@/shared/ui';

import { productActions } from '../api';
import { CategoryArt, SpecFields, SpecRowsEditor } from '../components/SpecFields';

/**
 * Add a product that is not in the master catalog yet. It goes into the catalog as "pending":
 * the shop can list and sell it right away, and the admin team reviews it (or merges it with
 * an existing product) so names stay standard and searchable.
 * The shop first picks what kind of product it is; the form then asks exactly that category's
 * questions (packages/shared/src/specs.ts), marks the ones a product needs, and builds the name.
 */
export default function CustomProductScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ name?: string; category?: string }>();
  const { data: categories = [] } = useCategories();
  const brandsQ = useBrands();
  const brands = useMemo(() => brandsQ.data ?? [], [brandsQ.data]);
  const [categoryId, setCategoryId] = useState<number | null>(params.category ? Number(params.category) : null);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [modelNumber, setModelNumber] = useState('');
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<SpecRow[]>([]);
  const [features, setFeatures] = useState('');
  const [inBox, setInBox] = useState('');
  const [mrp, setMrp] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; fields?: Record<string, string> }>({});

  const category = categories.find((c) => c.id === categoryId);
  const parent = categories.find((c) => c.id === category?.parent_id);
  const template = specTemplateFor(category?.slug, parent?.slug);

  // What the shop searched for on the add screen ("samsung galaxy s24 fe") becomes the brand and the model.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !params.name || !brandsQ.isFetched) return;
    prefilled.current = true;
    const split = splitBrandModel(params.name, [...(template.brands ?? []), ...brands.map((b) => b.name)]);
    setBrand(split.brand);
    setModel(split.model);
  }, [params.name, brandsQ.isFetched, brands, template.brands]);

  const typed = brand.trim().toLowerCase();
  const brandSuggestions = useMemo(
    () => (typed ? brands.filter((b) => b.name.toLowerCase().startsWith(typed) && b.name.toLowerCase() !== typed).slice(0, 6).map((b) => b.name) : []),
    [typed, brands],
  );
  const suggestedName = suggestProductName({ brand, model, template, values });
  const finalName = (nameEdited ? name : suggestedName).trim();

  const setValue = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors.fields?.[key] && value.trim()) setErrors((e) => ({ ...e, fields: { ...e.fields, [key]: '' } }));
  };

  const save = async () => {
    const missing = missingRequired(template, values);
    if (!finalName || missing.length) {
      setErrors({
        name: finalName ? undefined : t('error.NAME_AND_CATEGORY_REQUIRED'),
        fields: Object.fromEntries(missing.map((k) => [k, t('p.custom.required')])),
      });
      toast(t('p.custom.fillRequired'), 'error');
      return;
    }
    setSaving(true);
    try {
      const created = await productActions.createCustom({
        name: finalName,
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

  // Step 1: what kind of product is it?
  if (!category) {
    return (
      <Screen header={<Header title={t('p.custom.title')} />}>
        <InfoBanner text={t('p.add.customHint')} />
        <AppText variant="h3" testID="custom-pick-category">{t('p.custom.pickType')}</AppText>
        {categories
          .filter((c) => c.parent_id == null)
          .map((main) => {
            const kids = categories.filter((c) => c.parent_id === main.id);
            return (
              <View key={main.id} style={{ gap: 8 }}>
                <AppText variant="label" color="textMuted">{localName(main)}</AppText>
                <Row wrap gap={10}>
                  {(kids.length ? kids : [main]).map((c) => (
                    <TypeTile key={c.id} category={c} onPress={() => setCategoryId(c.id)} />
                  ))}
                </Row>
              </View>
            );
          })}
      </Screen>
    );
  }

  // Step 2: the form for that kind of product
  return (
    <Screen header={<Header title={t('p.custom.title')} />} footer={<Button testID="custom-next" title={t('p.custom.next')} iconRight="arrow-forward" variant="action" size="lg" full loading={saving} onPress={save} />}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} testID="custom-type">
        <CategoryArt slug={category.slug} name={category.name} size={48} />
        <View style={{ flex: 1 }}>
          <AppText variant="caption" color="textMuted">{parent ? localName(parent) : t('p.custom.category')}</AppText>
          <AppText variant="title">{localName(category)}</AppText>
        </View>
        <Button testID="custom-change-type" title={t('p.custom.changeType')} variant="ghost" size="sm" onPress={() => setCategoryId(null)} />
      </Card>

      <View style={{ gap: 6 }}>
        <Input testID="custom-brand" label={t('p.custom.brand')} value={brand} onChangeText={setBrand} autoCapitalize="words" />
        <Row wrap gap={6}>
          {[...(template.brands ?? []), ...brandSuggestions.filter((b) => !template.brands?.includes(b))].map((b) => (
            <Chip key={b} testID={`custom-brand-${b}`} label={b} selected={brand === b} onPress={() => setBrand(brand === b ? '' : b)} />
          ))}
        </Row>
      </View>
      <Row gap={10}>
        <Input testID="custom-model" label={t('p.custom.model')} placeholder={modelHint(template)} value={model} onChangeText={setModel} style={{ flex: 1 }} />
        <Input label={t('p.custom.modelNumber')} value={modelNumber} onChangeText={setModelNumber} autoCapitalize="characters" style={{ flex: 1 }} />
      </Row>

      {template.variant.length ? (
        <Card style={{ gap: 12 }} testID="custom-variant">
          <AppText variant="h3">{t('p.custom.versionTitle')}</AppText>
          <SpecFields fields={template.variant} values={values} errors={errors.fields} onChange={setValue} />
        </Card>
      ) : null}

      <Card style={{ gap: 12 }} testID="custom-specs">
        <AppText variant="h3">{t('p.custom.specsTitle', { category: localName(category) })}</AppText>
        <SpecFields fields={template.specs} values={values} errors={errors.fields} onChange={setValue} />
        <AppText variant="label" color="textMuted">{t('p.custom.moreSpecs')}</AppText>
        <SpecRowsEditor rows={extra} onChange={setExtra} />
      </Card>

      <Input
        testID="custom-name"
        label={t('p.custom.name')}
        hint={nameEdited ? undefined : t('p.custom.nameAuto')}
        value={nameEdited ? name : suggestedName}
        onChangeText={(v) => {
          setName(v);
          setNameEdited(v.trim().length > 0);
        }}
        placeholder={template.nameExample ?? 'Samsung Galaxy S24 FE 5G (8GB, 128GB, Blue)'}
        error={errors.name}
      />
      <Input label={t('p.custom.mrp')} prefix="₹" keyboardType="number-pad" value={mrp} onChangeText={(v) => setMrp(v.replace(/[^\d]/g, ''))} />
      <Input label={t('p.custom.features')} hint={t('p.custom.featuresHint')} value={features} onChangeText={setFeatures} multiline />
      <Input label={t('p.edit.inBox')} value={inBox} onChangeText={setInBox} />
    </Screen>
  );
}

/** One kind of product in the "What are you adding?" grid, with its device drawing. */
function TypeTile({ category, onPress }: { category: Category; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={`custom-cat-${category.slug}`}
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        width: '31%',
        minWidth: 96,
        alignItems: 'center',
        gap: 6,
        paddingVertical: 12,
        paddingHorizontal: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.primarySoft : colors.surface,
      })}
    >
      <CategoryArt slug={category.slug} name={category.name} />
      <AppText variant="caption" weight="semibold" align="center" numberOfLines={2}>{localName(category)}</AppText>
    </Pressable>
  );
}
