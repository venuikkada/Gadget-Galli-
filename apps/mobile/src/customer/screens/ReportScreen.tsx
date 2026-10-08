import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ISSUE_TYPES, type IssueType } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { PhotoPicker } from '@/shared/components/PhotoPicker';
import { useTranslation } from '@/shared/i18n';
import { AppText, Button, Chip, Header, InfoBanner, Input, Row, Screen, toast } from '@/shared/ui';

import { reportIssue, useOrder } from '../api';

/** Wrong item, damaged, not received, paid but not sent, other — with photos — sent to admins. */
export default function ReportScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: order } = useOrder(id);
  const [type, setType] = useState<IssueType | null>(null);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!type) return;
    setSaving(true);
    try {
      await reportIssue(id, type, text, photos);
      toast(t('report.sent'), 'success');
      router.back();
    } catch (e) {
      toast(errorText(e, t), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen header={<Header title={t('report.title')} subtitle={order?.order_no} />} footer={<Button testID="submit-report" title={t('report.submit')} variant="action" size="lg" full disabled={!type} loading={saving} onPress={submit} />}>
      <InfoBanner text={t('report.window')} />
      <AppText variant="h3">{t('report.what')}</AppText>
      <Row wrap gap={8}>
        {ISSUE_TYPES.map((it) => (
          <Chip key={it} testID={`issue-${it}`} label={t(`issue.${it}`)} selected={type === it} onPress={() => setType(it)} />
        ))}
      </Row>
      <Input label={t('report.describe')} value={text} onChangeText={setText} multiline />
      <PhotoPicker bucket="order-media" folder={id} value={photos} onChange={setPhotos} max={6} label={t('report.photos')} />
    </Screen>
  );
}
