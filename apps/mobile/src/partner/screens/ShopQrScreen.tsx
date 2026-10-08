import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { formatPhone, type MyShop } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { i18n, useTranslation } from '@/shared/i18n';
import { shareHtmlAsPdf } from '@/shared/lib/files';
import { copyText, shareOnWhatsApp, shareText, shopShareUrl } from '@/shared/lib/linking';
import { qrSvg } from '@/shared/lib/qr';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { lightColors } from '@/shared/theme/tokens';
import { AppText, Button, Card, Header, InfoBanner, Loading, Row, Screen, ShopAvatar, toast } from '@/shared/ui';

import { useMyShop } from '../api';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A4 counter poster: shop name, big QR and the same message in English, Telugu and Hindi. */
function posterHtml(shop: MyShop, link: string) {
  const c = lightColors;
  const lines = (['en', 'te', 'hi'] as const).map((lng) => {
    const t = i18n.getFixedT(lng);
    return { title: t('p.qr.posterTitle'), body: t('p.qr.posterBody') };
  });
  const unique = lines.filter((l, i) => lines.findIndex((x) => x.title === l.title) === i);
  const phone = shop.whatsapp_phone ?? shop.contact_phone;
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700&family=Inter:wght@400;600&family=Noto+Sans+Telugu:wght@400;600&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Inter, 'Noto Sans Telugu', 'Noto Sans Devanagari', sans-serif; color: ${c.text}; background: #fff; }
  .page { width: 210mm; height: 297mm; padding: 16mm 14mm; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .brand { display: flex; align-items: center; gap: 10px; font-family: Poppins, sans-serif; font-weight: 700; font-size: 22px; color: ${c.primary}; }
  .dot { width: 34px; height: 34px; border-radius: 10px; background: ${c.action}; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 20px; }
  h1 { font-family: Poppins, sans-serif; font-size: 40px; line-height: 1.15; margin: 14mm 0 4mm; }
  .area { font-size: 18px; color: ${c.textMuted}; margin: 0; }
  .qr { margin: 10mm 0 6mm; padding: 6mm; border: 3px solid ${c.primary}; border-radius: 18px; }
  .scan { font-family: Poppins, sans-serif; font-size: 26px; font-weight: 700; color: ${c.action}; margin: 0 0 4mm; }
  .line { margin: 2mm 0; }
  .line b { display: block; font-size: 20px; }
  .line span { font-size: 15px; color: ${c.textMuted}; }
  .tag { margin-top: auto; font-size: 16px; color: ${c.text}; }
  .link { margin-top: 3mm; font-size: 14px; color: ${c.primary}; word-break: break-all; }
  .footer { margin-top: 4mm; font-size: 12px; color: ${c.textSubtle}; }
</style></head><body><div class="page">
  <div class="brand"><div class="dot">⚡</div>Gadget Galli</div>
  <h1>${esc(shop.name ?? '')}</h1>
  <p class="area">${esc([shop.area?.name, phone ? formatPhone(phone) : null].filter(Boolean).join(' · '))}</p>
  <div class="qr">${qrSvg(link, 330, c.text)}</div>
  <p class="scan">📱 Scan · స్కాన్ చేయండి · स्कैन करें</p>
  ${unique.map((l) => `<div class="line"><b>${esc(l.title)}</b><span>${esc(l.body)}</span></div>`).join('')}
  <div class="tag">${esc(i18n.getFixedT('en')('p.qr.posterLine'))}</div>
  <div class="link">${esc(link)}</div>
  <div class="footer">Pay the shop directly by UPI · Delivered by Porter, Rapido, Uber or the shop's own rider</div>
</div></body></html>`;
}

export default function ShopQrScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: shop } = useMyShop();
  const [printing, setPrinting] = useState(false);

  if (!shop) return <Screen header={<Header title={t('p.qr.title')} />}><Loading /></Screen>;
  const link = shopShareUrl(shop.id);
  const message = t('p.qr.shareText', { name: shop.name, link });

  const print = async () => {
    setPrinting(true);
    try {
      await shareHtmlAsPdf(posterHtml(shop, link), `${shop.name ?? 'shop'}-gadget-galli-poster.pdf`);
    } catch (e) {
      toast(errorText(e, t), 'error');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Screen header={<Header title={t('p.qr.title')} />}>
      {shop.status !== 'approved' ? <InfoBanner tone="warning" text={t('p.qr.notLive')} /> : null}
      <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
        <Row gap={10}>
          <ShopAvatar name={shop.name ?? 'Shop'} path={shop.logo_path} size={40} />
          <View>
            <AppText variant="h3">{shop.name}</AppText>
            {shop.area ? <AppText variant="caption" color="textMuted">{shop.area.name}</AppText> : null}
          </View>
        </Row>
        <View style={{ padding: 14, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 3, borderColor: colors.primary }} testID="shop-qr">
          <QRCode value={link} size={210} color={lightColors.text} backgroundColor="#FFFFFF" />
        </View>
        <AppText variant="bodySmall" color="textMuted" align="center">{t('p.qr.body')}</AppText>
        <AppText variant="caption" color="primary" selectable align="center">{link}</AppText>
      </Card>

      <Button testID="qr-whatsapp" title={t('p.qr.share')} icon="logo-whatsapp" variant="whatsapp" size="lg" full onPress={() => shareOnWhatsApp(message)} />
      <Button testID="qr-print" title={t('p.qr.print')} icon="print-outline" variant="action" size="lg" full loading={printing} onPress={print} />
      <Row gap={10}>
        <Button
          title={t('p.qr.copy')}
          icon="copy-outline"
          variant="outline"
          style={{ flex: 1 }}
          onPress={async () => {
            await copyText(link);
            toast(t('common.copied'), 'success');
          }}
        />
        <Button title={t('common.share')} icon="share-social-outline" variant="outline" style={{ flex: 1 }} onPress={() => shareText(message)} />
      </Row>

      <Card style={{ gap: 10 }}>
        <AppText variant="title">{t('p.qr.tips')}</AppText>
        {[t('p.qr.tip1'), t('p.qr.tip2'), t('p.qr.tip3')].map((tip) => (
          <Row key={tip} gap={10} align="flex-start">
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <AppText variant="bodySmall" style={{ flex: 1 }}>{tip}</AppText>
          </Row>
        ))}
      </Card>
    </Screen>
  );
}
