import { useState } from 'react';
import { View } from 'react-native';

import { errorText, rpc } from '@/shared/api/rpc';
import { refreshProfile, useProfile } from '@/shared/hooks/profile';
import { useTranslation } from '@/shared/i18n';
import { copyText, SHARE_BASE, shareOnWhatsApp } from '@/shared/lib/linking';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Card, Header, Input, Row, Screen, toast } from '@/shared/ui';

import { useMyReferrals } from '../api';

export default function ReferralScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: profile } = useProfile();
  const q = useMyReferrals();
  const [code, setCode] = useState('');
  const [applying, setApplying] = useState(false);
  const mine = q.data?.code ?? profile?.user.referral_code ?? '';
  const text = t('referral.shareText', { code: mine, link: SHARE_BASE });

  const apply = async () => {
    setApplying(true);
    try {
      await rpc('apply_referral', { p_code: code });
      toast(t('referral.applied'), 'success');
      refreshProfile();
    } catch (e) {
      toast(errorText(e, t), 'error');
    } finally {
      setApplying(false);
    }
  };

  return (
    <Screen header={<Header title={t('referral.title')} />} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Card style={{ gap: 12, backgroundColor: colors.primary }}>
        <AppText variant="h2" color="#FFFFFF">{t('referral.title')} 🎁</AppText>
        <AppText variant="bodySmall" color="#E0E7FF">{t('referral.body')}</AppText>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: 14, alignItems: 'center', gap: 4 }}>
          <AppText variant="caption" color="#E0E7FF">{t('referral.code')}</AppText>
          <AppText variant="display" color="#FFFFFF" selectable onPress={() => { copyText(mine); toast(t('common.copied'), 'success'); }}>{mine}</AppText>
        </View>
        <Button title={t('referral.share')} icon="logo-whatsapp" variant="whatsapp" size="lg" full onPress={() => shareOnWhatsApp(text)} />
      </Card>
      <Row gap={12}>
        <Card style={{ flex: 1, alignItems: 'center' }}>
          <AppText variant="h1">{q.data?.joined ?? 0}</AppText>
          <AppText variant="caption" color="textMuted">{t('referral.joined')}</AppText>
        </Card>
        <Card style={{ flex: 1, alignItems: 'center' }}>
          <AppText variant="h1">{q.data?.ordered ?? 0}</AppText>
          <AppText variant="caption" color="textMuted">{t('referral.ordered')}</AppText>
        </Card>
      </Row>
      {!profile?.user.referred ? (
        <Card style={{ gap: 10 }}>
          <AppText variant="title">{t('referral.haveCode')}</AppText>
          <Row gap={8}>
            <Input placeholder={t('referral.codePlaceholder')} value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" style={{ flex: 1 }} />
            <Button title={t('referral.apply')} onPress={apply} loading={applying} disabled={code.length < 4} />
          </Row>
        </Card>
      ) : null}
    </Screen>
  );
}
