import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { SUPPORT } from '@gg/shared';

import { useTranslation } from '@/shared/i18n';
import { callPhone, openWhatsApp } from '@/shared/lib/linking';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Card, Divider, Header, Row, Screen } from '@/shared/ui';

const SUPPORT_PHONE = process.env.EXPO_PUBLIC_SUPPORT_PHONE || SUPPORT.phone;
const SUPPORT_WHATSAPP = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP || SUPPORT.whatsapp;

export default function HelpScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [open, setOpen] = useState<number | null>(0);
  const faqs = [1, 2, 3, 4].map((n) => ({ q: t(`help.q${n}`), a: t(`help.a${n}`) }));
  return (
    <Screen header={<Header title={t('help.title')} />}>
      <Card style={{ gap: 10 }}>
        <AppText variant="bodySmall" color="textMuted">{t('help.body')}</AppText>
        <Button title={t('help.whatsapp')} icon="logo-whatsapp" variant="whatsapp" size="lg" full onPress={() => openWhatsApp(SUPPORT_WHATSAPP, 'Hi Gadget Galli support')} />
        <Button title={t('help.call')} icon="call" variant="secondary" size="lg" full onPress={() => callPhone(SUPPORT_PHONE)} />
      </Card>
      <AppText variant="h3">{t('help.faq')}</AppText>
      <Card padded={false} style={{ paddingHorizontal: 14 }}>
        {faqs.map((f, i) => (
          <View key={f.q}>
            {i > 0 ? <Divider /> : null}
            <Pressable onPress={() => setOpen(open === i ? null : i)} style={{ paddingVertical: 14, gap: 6 }}>
              <Row justify="space-between">
                <AppText variant="title" style={{ flex: 1 }}>{f.q}</AppText>
                <Ionicons name={open === i ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSubtle} />
              </Row>
              {open === i ? <AppText variant="bodySmall" color="textMuted">{f.a}</AppText> : null}
            </Pressable>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
