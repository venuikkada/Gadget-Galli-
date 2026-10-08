import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import Papa from 'papaparse';
import { useState } from 'react';
import { View } from 'react-native';

import { CONDITIONS, formatINR, type Condition } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { useCategories } from '@/shared/hooks/reference';
import { useTranslation } from '@/shared/i18n';
import { readPickedText, shareTextFile } from '@/shared/lib/files';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Card, Divider, Header, InfoBanner, Row, Screen, Tag, toast } from '@/shared/ui';

import { productActions, useMyShop } from '../api';

const COLUMNS = ['name', 'brand', 'model_number', 'category', 'condition', 'price', 'mrp', 'stock_qty', 'warranty_months'] as const;
const MAX_ROWS = 500;

const TEMPLATE = [
  COLUMNS.join(','),
  '"Apple iPhone 15 (128 GB, Black)",Apple,MTP03HN/A,smartphones,new,69900,79900,4,12',
  'MSI GeForce RTX 4060 Ventus 2X Black OC 8GB,MSI,RTX 4060 VENTUS 2X BLACK 8G OC,graphics-cards,new,29500,34999,2,36',
  'Hikvision 2MP HD Dome Camera DS-2CE76D0T-ITPFS,Hikvision,DS-2CE76D0T-ITPFS,cctv-cameras,new,1150,,,12',
].join('\n');

interface ParsedRow {
  n: number;
  payload: Record<string, unknown>;
  name: string;
  price: number | null;
  condition: Condition;
  error: string | null;
}

type Result = Awaited<ReturnType<typeof productActions.bulk>>;

/** CSV import: shops fill a template in Excel/Sheets, save as CSV and upload up to 500 rows at once. */
export default function BulkUploadScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: shop } = useMyShop();
  const { data: categories = [] } = useCategories();
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  // Rows with mistakes are not uploaded; keep showing them after the upload so they can be fixed.
  const [skipped, setSkipped] = useState<ParsedRow[]>([]);
  const [showCodes, setShowCodes] = useState(false);

  const num = (v: string | undefined) => {
    const s = (v ?? '').replace(/[₹,\s]/g, '');
    if (!s) return { value: null, bad: false };
    const n = Number(s);
    return Number.isFinite(n) ? { value: n, bad: false } : { value: null, bad: true };
  };

  const toRows = (records: Record<string, string>[]): ParsedRow[] =>
    records.map((r, i) => {
      const name = (r.name ?? '').trim();
      const modelNumber = (r.model_number ?? '').trim();
      const rawCondition = (r.condition ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
      const condition = (rawCondition || 'new') as Condition;
      const price = num(r.price);
      const mrp = num(r.mrp);
      const qty = num(r.stock_qty);
      const warranty = num(r.warranty_months);
      let error: string | null = null;
      if (!name && !modelNumber) error = t('p.bulk.errName');
      else if (price.value == null || price.value < 0) error = t('p.bulk.errPrice');
      else if (!CONDITIONS.includes(condition)) error = t('p.bulk.errCondition', { value: r.condition });
      else if (mrp.bad) error = t('p.bulk.errNumber', { field: 'mrp' });
      else if (qty.bad) error = t('p.bulk.errNumber', { field: 'stock_qty' });
      else if (warranty.bad) error = t('p.bulk.errNumber', { field: 'warranty_months' });
      const payload: Record<string, unknown> = {
        name: name || null,
        brand: (r.brand ?? '').trim() || null,
        model_number: modelNumber || null,
        category: (r.category ?? '').trim() || null,
        condition,
        price: price.value,
      };
      if (mrp.value != null) payload.mrp = mrp.value;
      if (qty.value != null) {
        payload.stock_qty = Math.max(0, Math.round(qty.value));
        payload.in_stock = qty.value > 0;
      }
      if (warranty.value != null) payload.warranty_months = Math.round(warranty.value);
      // Row numbers match the spreadsheet: row 1 is the header.
      return { n: i + 2, payload, name: name || modelNumber, price: price.value, condition, error };
    });

  const pick = async () => {
    setResult(null);
    setSkipped([]);
    setParseError(null);
    const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'text/plain', 'application/vnd.ms-excel'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    try {
      const text = (await readPickedText(asset)).replace(/^﻿/, '');
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: (h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'),
      });
      const parsedRows = toRows(parsed.data);
      setFileName(asset.name);
      if (!parsedRows.length) {
        setRows([]);
        setParseError(t('p.bulk.errEmpty'));
      } else if (parsedRows.length > MAX_ROWS) {
        setRows([]);
        setParseError(t('p.bulk.errTooMany'));
      } else {
        setRows(parsedRows);
      }
    } catch (e) {
      setParseError(errorText(e, t));
    }
  };

  const valid = rows.filter((r) => !r.error);
  const invalid = rows.filter((r) => r.error);

  const upload = async () => {
    if (!shop || !valid.length) return;
    setUploading(true);
    try {
      const res = await productActions.bulk(shop.id, valid.map((r) => r.payload));
      // Server results are numbered by position in the uploaded list; map back to sheet rows.
      setResult({ ...res, results: res.results.map((x) => ({ ...x, row: valid[x.row - 1]?.n ?? x.row })) });
      setSkipped(invalid);
      setRows([]);
      toast(t('p.bulk.result', { created: res.created, updated: res.updated, errors: res.errors }), res.errors ? 'info' : 'success');
    } catch (e) {
      toast(errorText(e, t), 'error');
    } finally {
      setUploading(false);
    }
  };

  const serverErrors = result?.results.filter((r) => r.status === 'error') ?? [];
  const leafCategories = categories.filter((c) => c.parent_id != null);

  return (
    <Screen
      header={<Header title={t('p.bulk.title')} />}
      footer={
        valid.length ? (
          <Button testID="bulk-upload" title={t('p.bulk.upload', { count: valid.length })} icon="cloud-upload" variant="action" size="lg" full loading={uploading} onPress={upload} />
        ) : result ? (
          <Button title={t('p.bulk.viewProducts')} icon="cube" variant="primary" size="lg" full onPress={() => router.replace('/partner/products')} />
        ) : undefined
      }
    >
      <Card style={{ gap: 10 }}>
        <AppText variant="title">{t('p.bulk.step1')}</AppText>
        <AppText variant="caption" color="textMuted">{t('p.bulk.columns')}</AppText>
        <Button title={t('p.bulk.download')} icon="document-text-outline" variant="secondary" onPress={() => shareTextFile('gadget-galli-products.csv', TEMPLATE).catch((e) => toast(errorText(e, t), 'error'))} />
      </Card>

      <Card style={{ gap: 8 }}>
        <AppText variant="title">{t('p.bulk.step2')}</AppText>
        <AppText variant="caption" color="textMuted">{t('p.bulk.hint')}</AppText>
        <AppText variant="caption" color="textMuted">{t('p.bulk.conditionCodes')}</AppText>
        <AppText variant="label" color="primary" onPress={() => setShowCodes(!showCodes)}>
          {t('p.bulk.categoryCodes')} {showCodes ? '▲' : '▼'}
        </AppText>
        {showCodes ? (
          <Row wrap gap={6}>
            {leafCategories.map((c) => (
              <Tag key={c.id} label={c.slug} />
            ))}
          </Row>
        ) : null}
      </Card>

      <Card style={{ gap: 10 }}>
        <AppText variant="title">{t('p.bulk.step3')}</AppText>
        <Button testID="bulk-pick" title={fileName ? t('p.bulk.chooseAnother') : t('p.bulk.pick')} icon="folder-open-outline" variant={fileName ? 'outline' : 'primary'} onPress={pick} />
        {fileName ? <AppText variant="caption" color="textMuted">{fileName}</AppText> : null}
        {parseError ? <InfoBanner tone="error" text={parseError} /> : null}
      </Card>

      {rows.length ? (
        <Card style={{ gap: 10 }}>
          <Row justify="space-between">
            <AppText variant="h3">{t('p.bulk.preview', { count: valid.length })}</AppText>
            {invalid.length ? <Tag tone="error" icon="alert-circle" label={`${invalid.length}`} /> : null}
          </Row>
          {invalid.map((r) => (
            <View key={`e${r.n}`} style={{ backgroundColor: colors.errorSoft, borderRadius: 10, padding: 10 }}>
              <AppText variant="caption" weight="semibold" color="error">{t('p.bulk.row', { n: r.n })} · {r.name || '—'}</AppText>
              <AppText variant="caption">{r.error}</AppText>
            </View>
          ))}
          {valid.slice(0, 30).map((r, i) => (
            <View key={`v${r.n}`} style={{ gap: 6 }}>
              {i > 0 ? <Divider /> : null}
              <Row justify="space-between" gap={10}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodySmall" numberOfLines={1}>{r.name}</AppText>
                  <AppText variant="caption" color="textSubtle">{t('p.bulk.row', { n: r.n })} · {t(`condition.${r.condition}`)}</AppText>
                </View>
                <AppText variant="price">{r.price != null ? formatINR(r.price) : ''}</AppText>
              </Row>
            </View>
          ))}
          {valid.length > 30 ? <AppText variant="caption" color="textMuted">{t('p.bulk.moreRows', { count: valid.length - 30 })}</AppText> : null}
        </Card>
      ) : null}

      {result ? (
        <Card style={{ gap: 10 }} testID="bulk-result">
          <AppText variant="h3">{t('p.bulk.done')}</AppText>
          <InfoBanner tone={result.errors ? 'warning' : 'success'} text={t('p.bulk.result', { created: result.created, updated: result.updated, errors: result.errors })} />
          {skipped.length ? <InfoBanner tone="warning" text={t('p.bulk.skipped', { count: skipped.length })} /> : null}
          {skipped.map((r) => (
            <View key={`k${r.n}`} style={{ backgroundColor: colors.warningSoft, borderRadius: 10, padding: 10 }}>
              <AppText variant="caption" weight="semibold">{t('p.bulk.row', { n: r.n })} · {r.name || '—'}</AppText>
              <AppText variant="caption">{r.error}</AppText>
            </View>
          ))}
          {serverErrors.map((r) => (
            <View key={`s${r.row}`} style={{ backgroundColor: colors.errorSoft, borderRadius: 10, padding: 10 }}>
              <AppText variant="caption" weight="semibold" color="error">{t('p.bulk.row', { n: r.row })} · {r.name || '—'}</AppText>
              <AppText variant="caption">{r.message}</AppText>
            </View>
          ))}
          {result.results.some((r) => r.status === 'custom_created') ? <InfoBanner text={t('p.add.customHint')} /> : null}
        </Card>
      ) : null}
    </Screen>
  );
}
