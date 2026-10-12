import { View } from 'react-native';

import type { SpecField, SpecRow, SpecTemplate } from '@gg/shared';

import { useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { Button, Chip, IconButton, Input, Row } from '@/shared/ui';

/** A category's specification form: one input per field, with its suggestions as chips that fill the value. */
export function SpecFields({ template, values, onChange }: { template: SpecTemplate; values: Record<string, string>; onChange: (key: string, value: string) => void }) {
  return (
    <View style={{ gap: 12 }}>
      {[...template.variant, ...template.specs].map((f) => (
        <SpecInput key={f.key} field={f} value={values[f.key] ?? ''} onChange={(v) => onChange(f.key, v)} />
      ))}
    </View>
  );
}

function SpecInput({ field, value, onChange }: { field: SpecField; value: string; onChange: (value: string) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Input testID={`spec-${field.key}`} label={field.label ?? field.key} placeholder={field.placeholder} value={value} onChangeText={onChange} />
      {field.options?.length ? (
        <Row wrap gap={6}>
          {field.options.map((o) => (
            <Chip key={o} testID={`spec-${field.key}-${o}`} label={o} selected={value === o} onPress={() => onChange(value === o ? '' : o)} />
          ))}
        </Row>
      ) : null}
    </View>
  );
}

/** Free name/value specification rows, for anything a form doesn't ask. */
export function SpecRowsEditor({ rows, onChange }: { rows: SpecRow[]; onChange: (rows: SpecRow[]) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {rows.map((s, i) => (
        <Row key={i} gap={8}>
          <Input placeholder={t('p.edit.specName')} value={s.k} onChangeText={(k) => onChange(rows.map((x, j) => (j === i ? { ...x, k } : x)))} style={{ flex: 1 }} />
          <Input placeholder={t('p.edit.specValue')} value={s.v} onChangeText={(v) => onChange(rows.map((x, j) => (j === i ? { ...x, v } : x)))} style={{ flex: 1.4 }} />
          <IconButton icon="close" color={colors.error} onPress={() => onChange(rows.filter((_, j) => j !== i))} />
        </Row>
      ))}
      <Button title={t('p.edit.addSpec')} icon="add" variant="ghost" size="sm" onPress={() => onChange([...rows, { k: '', v: '' }])} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}
