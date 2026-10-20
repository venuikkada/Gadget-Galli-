import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { formatHHMM, WEEKDAYS, type DocType, type ShopHours, type Weekday } from '@gg/shared';

import { uploadDocument } from '@/shared/api/storage';
import { useTranslation } from '@/shared/i18n';
import { tWeekday } from '@/shared/i18n/format';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Chip, Input, Row, Sheet, Tag, toast } from '@/shared/ui';

export function WizardProgress({ step, total, title }: { step: number; total: number; title: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
      <Row justify="space-between">
        <AppText variant="caption" color="textMuted">{t('p.reg.step', { n: step })}</AppText>
        <AppText variant="caption" color="primary" weight="semibold">{title}</AppText>
      </Row>
      <Row gap={4}>
        {Array.from({ length: total }).map((_, i) => (
          <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < step - 1 ? colors.primary : i === step - 1 ? colors.accent : colors.border }} />
        ))}
      </Row>
    </View>
  );
}

const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const { colors } = useTheme();
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={{ height: 38, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', backgroundColor: colors.surface }}>
        <AppText variant="label">{formatHHMM(value)}</AppText>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <Row wrap gap={8}>
          {TIMES.map((tm) => (
            <Chip
              key={tm}
              label={formatHHMM(tm)}
              selected={tm === value}
              onPress={() => {
                onChange(tm);
                setOpen(false);
              }}
            />
          ))}
        </Row>
      </Sheet>
    </>
  );
}

const ORDER: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Opening hours for each day, a weekly holiday and 24-hour days. */
export function HoursEditor({ hours, holiday, onChange }: { hours: ShopHours; holiday: string | null; onChange: (h: ShopHours, holiday: string | null) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const set = (d: Weekday, patch: Partial<{ open: string; close: string; closed: boolean }>) => {
    const cur = hours[d] ?? { open: '10:00', close: '21:00' };
    onChange({ ...hours, [d]: { ...cur, ...patch } }, holiday);
  };
  const copyMonday = () => {
    const mon = hours.mon ?? { open: '10:00', close: '21:00' };
    const next: ShopHours = {};
    ORDER.forEach((d) => {
      next[d] = { open: mon.open, close: mon.close, closed: holiday === d ? true : hours[d]?.closed && d !== 'mon' ? hours[d]?.closed : false };
    });
    onChange(next, holiday);
  };
  return (
    <View style={{ gap: 10 }}>
      {ORDER.map((d) => {
        const h = hours[d] ?? { open: '10:00', close: '21:00' };
        const allDay = h.open === h.close;
        return (
          <View key={d} style={{ gap: 6, paddingBottom: 8, borderBottomWidth: d === 'sun' ? 0 : 1, borderBottomColor: colors.divider }}>
            <Row justify="space-between" gap={8}>
              <AppText variant="label" style={{ flex: 1 }}>{tWeekday(d)}</AppText>
              <Chip label={t('p.reg.allDay')} selected={allDay && !h.closed} onPress={() => set(d, allDay ? { open: '10:00', close: '21:00', closed: false } : { open: '00:00', close: '00:00', closed: false })} />
              <Pressable onPress={() => set(d, { closed: !h.closed })} hitSlop={6} accessibilityLabel={h.closed ? t('p.reg.closedDay') : t('common.open')}>
                <Ionicons name={h.closed ? 'close-circle' : 'checkmark-circle'} size={26} color={h.closed ? colors.error : colors.success} />
              </Pressable>
            </Row>
            {h.closed ? (
              <AppText variant="bodySmall" color="error">{t('p.reg.closedDay')}</AppText>
            ) : allDay ? (
              <AppText variant="bodySmall" color="success">{t('time.allDay')}</AppText>
            ) : (
              <Row gap={8}>
                <TimeSelect value={h.open} onChange={(v) => set(d, { open: v })} />
                <AppText color="textMuted">–</AppText>
                <TimeSelect value={h.close} onChange={(v) => set(d, { close: v })} />
              </Row>
            )}
          </View>
        );
      })}
      <Button title={t('p.reg.copyToAll')} icon="copy-outline" variant="ghost" size="sm" onPress={copyMonday} style={{ alignSelf: 'flex-start' }} />
      <AppText variant="label" color="textMuted">{t('p.reg.holiday')}</AppText>
      <Row wrap gap={8}>
        <Chip label={t('p.reg.noHoliday')} selected={!holiday} onPress={() => onChange(hours, null)} />
        {WEEKDAYS.map((d) => (
          <Chip
            key={d}
            label={tWeekday(d, true)}
            selected={holiday === d}
            onPress={() => {
              const next = { ...hours };
              if (holiday && next[holiday as Weekday]) next[holiday as Weekday] = { ...next[holiday as Weekday]!, closed: false };
              next[d] = { ...(next[d] ?? { open: '10:00', close: '21:00' }), closed: true };
              onChange(next, d);
            }}
          />
        ))}
      </Row>
    </View>
  );
}

/** Picks an image or PDF and uploads it to the private documents bucket. */
export function DocUpload({ shopId, label, uploaded, onUploaded, docTypes, testID }: { shopId: string; label: string; uploaded?: { doc_type: DocType; doc_number: string | null; status: string } | null; onUploaded: (type: DocType, path: string, number: string) => Promise<void>; docTypes: DocType[]; testID?: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [type, setType] = useState<DocType>(uploaded?.doc_type ?? docTypes[0]!);
  const [number, setNumber] = useState(uploaded?.doc_number ?? '');
  const [busy, setBusy] = useState(false);
  const typeLabel: Record<DocType, string> = {
    trade_licence: 'Trade licence',
    udyam_certificate: 'Udyam certificate',
    gst_certificate: 'GST certificate',
    owner_id_proof: 'ID proof',
    other: 'Other',
  };
  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    setBusy(true);
    try {
      const a = res.assets[0];
      const path = await uploadDocument('shop-documents', shopId, a.uri, a.mimeType ?? (a.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'));
      await onUploaded(type, path, number);
    } catch (e) {
      toast((e as Error).message ?? t('error.generic'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 8, borderWidth: 1, borderColor: uploaded ? colors.success : colors.border, borderRadius: 14, padding: 12 }}>
      <Row justify="space-between">
        <AppText variant="title" style={{ flex: 1 }}>{label}</AppText>
        {uploaded ? <Tag label={uploaded.status === 'accepted' ? t('common.verified') : t('common.saved')} tone="success" icon="checkmark-circle" /> : null}
      </Row>
      {docTypes.length > 1 ? (
        <Row wrap gap={8}>
          {docTypes.map((d) => (
            <Chip key={d} label={typeLabel[d]} selected={type === d} onPress={() => setType(d)} />
          ))}
        </Row>
      ) : null}
      <Input placeholder={t('p.reg.docNumber')} value={number} onChangeText={setNumber} />
      <Button testID={testID} title={uploaded ? t('common.change') : t('common.upload')} icon="cloud-upload-outline" variant="secondary" loading={busy} onPress={pick} />
    </View>
  );
}
