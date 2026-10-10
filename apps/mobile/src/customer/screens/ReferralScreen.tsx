import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { errorText, rpc } from '@/shared/api/rpc';
import { config } from '@/shared/config';
import { refreshProfile, useProfile } from '@/shared/hooks/profile';
import { useTranslation } from '@/shared/i18n';
import { copyText, shareOnWhatsApp } from '@/shared/lib/linking';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, BrandGradient, Button, Card, Header, Input, Row, Screen, toast } from '@/shared/ui';

import { useMyReferrals } from '../api';

export default function ReferralScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: profile } = useProfile();
  const q = useMyReferrals();
  const [code, setCode] = useState('');
  const [applying, setApplying] = useState(false);
  const mine = q.data?.code ?? profile?.user.referral_code ?? '';
  // Friends join on the customer website when there is one, otherwise from the Play Store.
  const text = t('referral.shareText', { code: mine, link: config.customerAppUrl || config.playStoreUrl });

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
      <BrandGradient style={{ borderRadius: 22, padding: 18, gap: 12 }}>
        <Row gap={10}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="gift" size={22} color={colors.onAccent} />
          </View>
          <AppText variant="h2" color="onBrand" style={{ flex: 1 }}>{t('referral.title')}</AppText>
        </Row>
        <AppText variant="bodySmall" color="onBrandMuted">{t('referral.body')}</AppText>
        <Pressable
          onPress={() => { copyText(mine); toast(t('common.copied'), 'success'); }}
          style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.5)', padding: 14, alignItems: 'center', gap: 4 }}
        >
          <AppText variant="caption" color="onBrandMuted">{t('referral.code')}</AppText>
          <AppText variant="display" color="onBrand" selectable style={{ letterSpacing: 3 }}>{mine}</AppText>
          <Row gap={4}>
            <Ionicons name="copy-outline" size={13} color={colors.onBrand} />
            <AppText variant="caption" color="onBrand" weight="semibold">{t('common.copy')}</AppText>
          </Row>
        </Pressable>
        <Button title={t('referral.share')} icon="logo-whatsapp" variant="whatsapp" size="lg" full onPress={() => shareOnWhatsApp(text)} />
      </BrandGradient>
      <Row gap={12}>
        <Card style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <Ionicons name="people" size={22} color={colors.primary} />
          <AppText variant="h1">{q.data?.joined ?? 0}</AppText>
          <AppText variant="caption" color="textMuted">{t('referral.joined')}</AppText>
        </Card>
        <Card style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <Ionicons name="bag-check" size={22} color={colors.success} />
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
