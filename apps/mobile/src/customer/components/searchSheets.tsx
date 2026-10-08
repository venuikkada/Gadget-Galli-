import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { CONDITIONS, SEARCH_SORTS, type Condition, type SearchFilters, type SearchSort } from '@gg/shared';

import { useBrands, useCategories } from '@/shared/hooks/reference';
import { localName, useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Chip, Input, Row, Sheet, SwitchRow } from '@/shared/ui';

export function countFilters(f: SearchFilters) {
  let n = 0;
  if (f.category_id) n++;
  if (f.brand_ids?.length) n++;
  if (f.price_min != null || f.price_max != null) n++;
  if (f.conditions?.length) n++;
  if (f.max_delivery_mins) n++;
  if (f.min_rating) n++;
  if (f.deliver_only === false) n++;
  return n;
}

export function FilterSheet({ visible, onClose, value, onApply, lockedCategory }: { visible: boolean; onClose: () => void; value: SearchFilters; onApply: (f: SearchFilters) => void; lockedCategory?: boolean }) {
  const { t } = useTranslation();
  const { data: categories = [] } = useCategories();
  const { data: brands = [] } = useBrands();
  const [f, setF] = useState<SearchFilters>(value);
  const [min, setMin] = useState(value.price_min ? String(value.price_min) : '');
  const [max, setMax] = useState(value.price_max ? String(value.price_max) : '');
  const [brandQuery, setBrandQuery] = useState('');

  useEffect(() => {
    if (visible) {
      setF(value);
      setMin(value.price_min ? String(value.price_min) : '');
      setMax(value.price_max ? String(value.price_max) : '');
    }
  }, [visible, value]);

  const top = categories.filter((c) => c.parent_id == null);
  const subOf = (id: number) => categories.filter((c) => c.parent_id === id);
  const selectedTop = f.category_id ? categories.find((c) => c.id === f.category_id)?.parent_id ?? f.category_id : null;
  const toggleCondition = (c: Condition) => {
    const list = f.conditions ?? [];
    setF({ ...f, conditions: list.includes(c) ? list.filter((x) => x !== c) : [...list, c] });
  };
  const toggleBrand = (id: number) => {
    const list = f.brand_ids ?? [];
    setF({ ...f, brand_ids: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] });
  };
  const visibleBrands = brands.filter((b) => !brandQuery || b.name.toLowerCase().includes(brandQuery.toLowerCase())).slice(0, brandQuery ? 30 : 18);
  const deliveryOptions = [
    { mins: null, label: t('filter.any') },
    { mins: 60, label: t('filter.within1h') },
    { mins: 120, label: t('filter.within2h') },
    { mins: 240, label: t('filter.within4h') },
    { mins: 480, label: t('filter.sameDay') },
  ];

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('search.filters')}
      footer={
        <Row gap={10}>
          <Button
            title={t('common.reset')}
            variant="outline"
            onPress={() => {
              const reset: SearchFilters = { deliver_only: true, category_id: lockedCategory ? value.category_id : null };
              setF(reset);
              setMin('');
              setMax('');
            }}
            style={{ flex: 1 }}
          />
          <Button
            title={t('filter.showResults')}
            variant="primary"
            testID="apply-filters"
            onPress={() => {
              onApply({ ...f, price_min: min ? Number(min) : null, price_max: max ? Number(max) : null });
              onClose();
            }}
            style={{ flex: 2 }}
          />
        </Row>
      }
    >
      <SwitchRow label={t('filter.deliversToMe')} value={f.deliver_only !== false} onValueChange={(v) => setF({ ...f, deliver_only: v })} />

      {!lockedCategory ? (
        <View style={{ gap: 8 }}>
          <AppText variant="label">{t('filter.category')}</AppText>
          <Row wrap gap={8}>
            <Chip label={t('filter.any')} selected={!f.category_id} onPress={() => setF({ ...f, category_id: null })} />
            {top.map((c) => (
              <Chip key={c.id} label={localName(c)} selected={selectedTop === c.id && f.category_id === c.id} onPress={() => setF({ ...f, category_id: c.id })} />
            ))}
          </Row>
          {selectedTop ? (
            <Row wrap gap={8}>
              {subOf(selectedTop).map((c) => (
                <Chip key={c.id} label={localName(c)} selected={f.category_id === c.id} onPress={() => setF({ ...f, category_id: c.id })} />
              ))}
            </Row>
          ) : null}
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <AppText variant="label">{t('filter.brand')}</AppText>
        <Input placeholder={t('common.search')} value={brandQuery} onChangeText={setBrandQuery} icon="search" />
        <Row wrap gap={8}>
          {visibleBrands.map((b) => (
            <Chip key={b.id} label={b.name} selected={f.brand_ids?.includes(b.id)} onPress={() => toggleBrand(b.id)} />
          ))}
        </Row>
      </View>

      <View style={{ gap: 8 }}>
        <AppText variant="label">{t('filter.price')}</AppText>
        <Row gap={10}>
          <Input placeholder={t('filter.min')} keyboardType="number-pad" value={min} onChangeText={(v) => setMin(v.replace(/\D/g, ''))} style={{ flex: 1 }} />
          <AppText color="textMuted">–</AppText>
          <Input placeholder={t('filter.max')} keyboardType="number-pad" value={max} onChangeText={(v) => setMax(v.replace(/\D/g, ''))} style={{ flex: 1 }} />
        </Row>
        <Row wrap gap={8}>
          {[
            [0, 10000],
            [10000, 30000],
            [30000, 60000],
            [60000, 0],
          ].map(([a, b]) => (
            <Chip
              key={`${a}-${b}`}
              label={b ? `₹${a / 1000}K – ₹${b / 1000}K` : `₹${a / 1000}K+`}
              selected={min === (a ? String(a) : '') && max === (b ? String(b) : '')}
              onPress={() => {
                setMin(a ? String(a) : '');
                setMax(b ? String(b) : '');
              }}
            />
          ))}
        </Row>
      </View>

      <View style={{ gap: 8 }}>
        <AppText variant="label">{t('filter.condition')}</AppText>
        <Row wrap gap={8}>
          {CONDITIONS.map((c) => (
            <Chip key={c} label={t(`condition.${c}`)} selected={f.conditions?.includes(c)} onPress={() => toggleCondition(c)} />
          ))}
        </Row>
      </View>

      <View style={{ gap: 8 }}>
        <AppText variant="label">{t('filter.delivery')}</AppText>
        <Row wrap gap={8}>
          {deliveryOptions.map((o) => (
            <Chip key={String(o.mins)} label={o.label} selected={(f.max_delivery_mins ?? null) === o.mins} onPress={() => setF({ ...f, max_delivery_mins: o.mins })} />
          ))}
        </Row>
      </View>

      <View style={{ gap: 8 }}>
        <AppText variant="label">{t('filter.rating')}</AppText>
        <Row wrap gap={8}>
          <Chip label={t('filter.any')} selected={!f.min_rating} onPress={() => setF({ ...f, min_rating: null })} />
          <Chip label={t('filter.rating35')} selected={f.min_rating === 3.5} onPress={() => setF({ ...f, min_rating: 3.5 })} />
          <Chip label={t('filter.rating4')} selected={f.min_rating === 4} onPress={() => setF({ ...f, min_rating: 4 })} />
        </Row>
      </View>
    </Sheet>
  );
}

export function SortSheet({ visible, onClose, value, onChange }: { visible: boolean; onClose: () => void; value: SearchSort; onChange: (s: SearchSort) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={t('search.sort')}>
      {SEARCH_SORTS.map((s) => (
        <Pressable
          key={s}
          testID={`sort-${s}`}
          onPress={() => {
            onChange(s);
            onClose();
          }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }}
        >
          <AppText variant="body" weight={value === s ? 'semibold' : 'regular'} color={value === s ? 'primary' : 'text'}>{t(`sort.${s}`)}</AppText>
          <Ionicons name={value === s ? 'radio-button-on' : 'radio-button-off'} size={20} color={value === s ? colors.primary : colors.textSubtle} />
        </Pressable>
      ))}
    </Sheet>
  );
}
