import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, View } from 'react-native';

import {
  DEFAULT_HOURS,
  isValidUpiId,
  normalizeIndianPhone,
  RADIUS_OPTIONS_KM,
  SHOP_TYPES,
  USUAL_DELIVERY_OPTIONS,
  type Area,
  type DeliveryChargeType,
  type DeliveryMode,
  type DocType,
  type ShopHours,
  type ShopType,
} from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { AreaList } from '@/shared/components/AreaList';
import { MapPicker } from '@/shared/components/MapPicker';
import { PhotoPicker } from '@/shared/components/PhotoPicker';
import { useProfile } from '@/shared/hooks/profile';
import { useAreas } from '@/shared/hooks/reference';
import { useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Card, Chip, Header, InfoBanner, Input, Loading, Row, Screen, Segmented, SwitchRow, Tag, toast } from '@/shared/ui';

import { addShopDocument, addShopPhoto, removeShopPhoto, setDeliveryAreas, shopUpsert, submitShop, useMyShop } from '../api';
import { DocUpload, HoursEditor, WizardProgress, ZonePicker } from '../components/registration';

const TYPE_ICON: Record<ShopType, React.ComponentProps<typeof Ionicons>['name']> = {
  mobiles: 'phone-portrait-outline',
  cctv_security: 'videocam-outline',
  computers_laptops: 'laptop-outline',
  components_peripherals: 'hardware-chip-outline',
};
const TYPE_LABEL_KEY: Record<ShopType, string> = {
  mobiles: 'Mobiles',
  cctv_security: 'CCTV & Security',
  computers_laptops: 'Laptops & Computers',
  components_peripherals: 'Components & Peripherals',
};

/** 8-step shop registration (also used to edit shop details later). Each step is saved, so owners can continue later. */
export default function RegisterScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ step?: string; edit?: string }>();
  const { data: shop, isLoading } = useMyShop();
  const { data: profile } = useProfile();
  const { data: areas = [] } = useAreas();
  const editing = params.edit === '1';

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Step 1
  const [name, setName] = useState('');
  const [types, setTypes] = useState<ShopType[]>([]);
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState<ShopHours>(DEFAULT_HOURS);
  const [holiday, setHoliday] = useState<string | null>('sun');
  // Step 2
  const [ownerName, setOwnerName] = useState('');
  const [contact, setContact] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [sameWa, setSameWa] = useState(true);
  const [email, setEmail] = useState('');
  // Step 3
  const [address, setAddress] = useState('');
  const [area, setArea] = useState<Area | null>(null);
  const [pincode, setPincode] = useState('');
  const [landmark, setLandmark] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [areaOpen, setAreaOpen] = useState(false);
  const [areaQuery, setAreaQuery] = useState('');
  // Step 4
  const [mode, setMode] = useState<DeliveryMode>('areas');
  const [zoneIds, setZoneIds] = useState<number[]>([]);
  const [areaIds, setAreaIds] = useState<number[]>([]);
  const [radius, setRadius] = useState('10');
  const [chargeType, setChargeType] = useState<DeliveryChargeType>('flat');
  const [charge, setCharge] = useState('49');
  const [freeAbove, setFreeAbove] = useState('');
  const [minOrder, setMinOrder] = useState('0');
  const [usual, setUsual] = useState(120);
  const [pickup, setPickup] = useState(true);
  // Step 6
  const [upi, setUpi] = useState('');
  const [upiName, setUpiName] = useState('');
  const [upiQr, setUpiQr] = useState<string[]>([]);
  // Step 7
  const [gst, setGst] = useState('');

  // Load saved values once
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (loaded || isLoading) return;
    setLoaded(true);
    if (!shop) {
      setOwnerName(profile?.user.name ?? '');
      setContact(profile?.user.phone ?? '');
      return;
    }
    setName(shop.name ?? '');
    setTypes(shop.shop_types ?? []);
    setDescription(shop.description ?? '');
    if (shop.hours && Object.keys(shop.hours).length) setHours(shop.hours);
    setHoliday(shop.weekly_holiday);
    setOwnerName(shop.owner_name ?? profile?.user.name ?? '');
    setContact(shop.contact_phone ?? '');
    setWhatsapp(shop.whatsapp_phone ?? '');
    setSameWa(!shop.whatsapp_phone || shop.whatsapp_phone === shop.contact_phone);
    setEmail(shop.email ?? '');
    setAddress(shop.address_line ?? '');
    setPincode(shop.pincode ?? '');
    setLandmark(shop.landmark ?? '');
    setLat(shop.lat);
    setLng(shop.lng);
    setMode(shop.delivery_mode);
    setZoneIds(shop.delivery_zone_ids ?? []);
    setAreaIds(shop.delivery_area_ids ?? []);
    setRadius(String(shop.delivery_radius_km ?? 10));
    setChargeType(shop.delivery_charge_type);
    setCharge(String(shop.delivery_charge ?? 0));
    setFreeAbove(shop.free_delivery_above ? String(shop.free_delivery_above) : '');
    setMinOrder(String(shop.min_order ?? 0));
    setUsual(shop.usual_delivery_mins ?? 120);
    setPickup(shop.store_pickup);
    setUpi(shop.upi_id ?? '');
    setUpiName(shop.upi_name ?? '');
    setUpiQr(shop.upi_qr_path ? [shop.upi_qr_path] : []);
    setGst(shop.gst_number ?? '');
    const s = params.step ? Number(params.step) : editing ? 1 : Math.min(Math.max(shop.registration_step, 1), 8);
    setStep(s);
  }, [shop, isLoading, loaded, profile, params.step, editing]);

  useEffect(() => {
    if (!area && shop?.area_id && areas.length) setArea(areas.find((a) => a.id === shop.area_id) ?? null);
  }, [areas, shop?.area_id, area]);

  const titles = [t('p.reg.s1'), t('p.reg.s2'), t('p.reg.s3'), t('p.reg.s4'), t('p.reg.s5'), t('p.reg.s6'), t('p.reg.s7'), t('p.reg.s8')];
  const photos = shop?.photos ?? [];
  const front = photos.filter((p) => p.kind === 'front');
  const inside = photos.filter((p) => p.kind === 'inside');
  const logo = photos.filter((p) => p.kind === 'logo');
  const docs = shop?.documents ?? [];
  const licenceDoc = docs.find((d) => ['trade_licence', 'udyam_certificate', 'gst_certificate'].includes(d.doc_type));
  const idDoc = docs.find((d) => d.doc_type === 'owner_id_proof');

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (step === 1) {
      if (name.trim().length < 3) e.name = t('common.required');
      if (!types.length) e.types = t('common.required');
    }
    if (step === 2) {
      if (!ownerName.trim()) e.ownerName = t('common.required');
      if (!normalizeIndianPhone(contact)) e.contact = t('error.INVALID_PHONE');
      if (!sameWa && whatsapp && !normalizeIndianPhone(whatsapp)) e.whatsapp = t('error.INVALID_PHONE');
    }
    if (step === 3) {
      if (!address.trim()) e.address = t('common.required');
      if (!area) e.area = t('address.areaRequired');
    }
    if (step === 4) {
      if (mode === 'areas' && !zoneIds.length && !areaIds.length) e.areas = t('common.required');
      if (mode === 'radius' && !(Number(radius) > 0)) e.radius = t('common.required');
    }
    if (step === 5 && !front.length) e.front = t('common.required');
    if (step === 6 && !isValidUpiId(upi)) e.upi = t('error.INVALID_UPI_ID');
    return e;
  };

  const saveStep = async (nextStep: number) => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return false;
    setSaving(true);
    try {
      const base = { registration_step: nextStep };
      if (step === 1) await shopUpsert({ ...base, name, shop_types: types, description, hours, weekly_holiday: holiday });
      if (step === 2) await shopUpsert({ ...base, owner_name: ownerName, contact_phone: contact, whatsapp_phone: sameWa ? contact : whatsapp, email });
      if (step === 3)
        await shopUpsert({ ...base, address_line: address, area_id: area?.id, pincode: pincode || area?.pincode, landmark, lat: lat ?? area?.lat, lng: lng ?? area?.lng });
      if (step === 4) {
        const s = await shopUpsert({
          ...base,
          delivery_mode: mode,
          delivery_radius_km: mode === 'radius' ? Number(radius) : null,
          delivery_charge_type: chargeType,
          delivery_charge: chargeType === 'free' ? 0 : Number(charge || 0),
          free_delivery_above: freeAbove ? Number(freeAbove) : null,
          min_order: Number(minOrder || 0),
          usual_delivery_mins: usual,
          store_pickup: pickup,
        });
        if (mode === 'areas') await setDeliveryAreas(s.id, zoneIds, areaIds);
      }
      if (step === 5 || step === 7) await shopUpsert({ ...base, ...(step === 7 ? { gst_number: gst } : {}) });
      if (step === 6) await shopUpsert({ ...base, upi_id: upi, upi_name: upiName || name, upi_qr_path: upiQr[0] ?? null });
      return true;
    } catch (err) {
      toast(errorText(err, t), 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    if (await saveStep(Math.min(step + 1, 8))) {
      if (editing && shop?.status === 'approved') {
        toast(t('common.saved'), 'success');
        router.back();
        return;
      }
      setStep((s) => Math.min(s + 1, 8));
    }
  };

  const submit = async () => {
    if (!shop) return;
    setSaving(true);
    try {
      const res = await submitShop(shop.id);
      if (!res.ok) {
        toast(t('p.reg.missing', { fields: res.missing.map((m) => t(`p.field.${m}`)).join(', ') }), 'error');
        return;
      }
      router.replace('/partner/status');
    } catch (err) {
      toast(errorText(err, t), 'error');
    } finally {
      setSaving(false);
    }
  };

  const missing = useMemo(() => {
    if (!shop) return [];
    const m: string[] = [];
    if (!shop.name) m.push('name');
    if (!shop.shop_types?.length) m.push('shop_types');
    if (!shop.contact_phone) m.push('contact_phone');
    if (!shop.address_line || !shop.area_id) m.push('address');
    if (shop.delivery_mode === 'areas' && !shop.delivery_zone_ids.length && !shop.delivery_area_ids.length) m.push('delivery_areas');
    if (!front.length) m.push('front_photo');
    if (!shop.upi_id) m.push('upi_id');
    if (!idDoc) m.push('owner_id_proof');
    if (!licenceDoc) m.push('shop_licence');
    return m;
  }, [shop, front.length, idDoc, licenceDoc]);

  if (isLoading || !loaded) return <Screen><Loading /></Screen>;
  const needsShop = step >= 5 && !shop;

  return (
    <Screen
      header={
        <View style={{ backgroundColor: colors.background }}>
          <Header title={editing ? t('p.more.shopProfile') : t('p.reg.title')} onBack={() => (step > 1 && !editing ? setStep(step - 1) : router.canGoBack() ? router.back() : router.replace('/partner'))} />
          <WizardProgress step={step} total={8} title={titles[step - 1]!} />
        </View>
      }
      footer={
        <View style={{ gap: 8 }}>
          {step < 8 ? (
            <Button testID="wizard-next" title={editing && shop?.status === 'approved' ? t('common.save') : t('common.next')} variant="primary" size="lg" full loading={saving} onPress={next} iconRight="arrow-forward" />
          ) : (
            <Button testID="wizard-submit" title={shop?.status === 'approved' ? t('common.save') : t('p.reg.submit')} variant="action" size="lg" full loading={saving} onPress={shop?.status === 'approved' ? () => router.back() : submit} />
          )}
          {!editing && step < 8 ? (
            <Button
              title={t('p.reg.saveLater')}
              variant="ghost"
              size="sm"
              onPress={async () => {
                if (await saveStep(step)) router.replace('/partner/status');
              }}
            />
          ) : null}
        </View>
      }
    >
      {needsShop ? <InfoBanner tone="warning" text={t('common.somethingWrong')} /> : null}

      {step === 1 ? (
        <>
          <Input testID="shop-name" label={t('p.reg.shopName')} value={name} onChangeText={setName} error={errors.name} />
          <View style={{ gap: 8 }}>
            <AppText variant="label" color="textMuted">{t('p.reg.shopTypes')}</AppText>
            <Row wrap gap={8}>
              {SHOP_TYPES.map((st) => (
                <Chip key={st} testID={`type-${st}`} icon={TYPE_ICON[st]} label={TYPE_LABEL_KEY[st]} selected={types.includes(st)} onPress={() => setTypes(types.includes(st) ? types.filter((x) => x !== st) : [...types, st])} />
              ))}
            </Row>
            {errors.types ? <AppText variant="caption" color="error">{errors.types}</AppText> : null}
          </View>
          <Input label={t('p.reg.description')} placeholder={t('p.reg.descriptionPh')} value={description} onChangeText={setDescription} multiline />
          <Card style={{ gap: 10 }}>
            <AppText variant="title">{t('p.reg.hours')}</AppText>
            <HoursEditor hours={hours} holiday={holiday} onChange={(h, hol) => { setHours(h); setHoliday(hol); }} />
          </Card>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Input testID="owner-name" label={t('p.reg.ownerName')} value={ownerName} onChangeText={setOwnerName} error={errors.ownerName} />
          <Input label={t('p.reg.ownerMobile')} value={profile?.user.phone ?? ''} editable={false} right={<Tag label={t('common.verified')} tone="success" icon="checkmark-circle" />} />
          <Input testID="contact-phone" label={t('p.reg.contactPhone')} prefix="+91" keyboardType="phone-pad" value={contact.replace(/^\+91/, '')} onChangeText={setContact} error={errors.contact} />
          <SwitchRow label={t('p.reg.sameAsContact')} value={sameWa} onValueChange={setSameWa} />
          {!sameWa ? <Input label={t('p.reg.whatsapp')} prefix="+91" keyboardType="phone-pad" value={whatsapp.replace(/^\+91/, '')} onChangeText={setWhatsapp} error={errors.whatsapp} /> : null}
          <Input label={t('p.reg.email')} keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Input testID="shop-address" label={t('p.reg.address')} placeholder={t('p.reg.addressPh')} value={address} onChangeText={setAddress} error={errors.address} multiline />
          <View style={{ gap: 6 }}>
            <AppText variant="label" color="textMuted">{t('p.reg.area')}</AppText>
            <Button testID="shop-area" title={area ? `${area.name} · ${area.pincode}` : t('address.areaRequired')} variant="outline" icon="location-outline" onPress={() => setAreaOpen(true)} />
            {errors.area ? <AppText variant="caption" color="error">{errors.area}</AppText> : null}
          </View>
          <Row gap={10}>
            <Input label={t('p.reg.pincode')} value={pincode} onChangeText={(v) => setPincode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" style={{ flex: 1 }} />
            <Input label={t('p.reg.landmark')} value={landmark} onChangeText={setLandmark} style={{ flex: 2 }} />
          </Row>
          <AppText variant="label" color="textMuted">{t('p.reg.pin')}</AppText>
          <MapPicker lat={lat ?? area?.lat} lng={lng ?? area?.lng} onChange={(a, b) => { setLat(a); setLng(b); }} height={240} />
          <AppText variant="caption" color="textMuted">{t('p.reg.pinHint')}</AppText>
          <Modal visible={areaOpen} animationType="slide" onRequestClose={() => setAreaOpen(false)}>
            <Screen header={<Header title={t('p.reg.area')} onBack={() => setAreaOpen(false)} />}>
              <Input icon="search" value={areaQuery} onChangeText={setAreaQuery} placeholder={t('location.searchArea')} autoFocus />
              <AreaList
                query={areaQuery}
                selectedId={area?.id}
                onPick={(a) => {
                  setArea(a);
                  setPincode(a.pincode);
                  if (lat == null) {
                    setLat(a.lat);
                    setLng(a.lng);
                  }
                  setAreaOpen(false);
                }}
              />
            </Screen>
          </Modal>
        </>
      ) : null}

      {step === 4 ? (
        <>
          <AppText variant="h3">{t('p.reg.deliveryHow')}</AppText>
          <Segmented value={mode} onChange={setMode} options={[{ value: 'areas', label: t('p.reg.byAreas') }, { value: 'radius', label: t('p.reg.byRadius') }]} />
          {mode === 'areas' ? (
            <ZonePicker zoneIds={zoneIds} areaIds={areaIds} onChange={(z, a) => { setZoneIds(z); setAreaIds(a); }} />
          ) : (
            <View style={{ gap: 8 }}>
              <Row wrap gap={8}>
                {RADIUS_OPTIONS_KM.map((km) => (
                  <Chip key={km} label={`${km} km`} selected={radius === String(km)} onPress={() => setRadius(String(km))} />
                ))}
              </Row>
              <Input label={t('p.reg.custom')} keyboardType="decimal-pad" value={radius} onChangeText={setRadius} right={<AppText color="textMuted">km</AppText>} />
            </View>
          )}
          {errors.areas || errors.radius ? <AppText variant="caption" color="error">{errors.areas ?? errors.radius}</AppText> : null}
          <Card style={{ gap: 10 }}>
            <AppText variant="title">{t('p.reg.chargeType')}</AppText>
            <Segmented
              value={chargeType}
              onChange={setChargeType}
              options={[
                { value: 'free', label: t('p.reg.chargeFree') },
                { value: 'flat', label: t('p.reg.chargeFlat') },
                { value: 'per_km', label: t('p.reg.chargePerKm') },
              ]}
            />
            {chargeType !== 'free' ? <Input label={t('p.reg.chargeAmount')} prefix="₹" keyboardType="number-pad" value={charge} onChangeText={setCharge} /> : null}
            <Input label={t('p.reg.freeAbove')} prefix="₹" keyboardType="number-pad" value={freeAbove} onChangeText={setFreeAbove} placeholder={t('common.optional')} />
            <Input label={t('p.reg.minOrder')} prefix="₹" keyboardType="number-pad" value={minOrder} onChangeText={setMinOrder} />
          </Card>
          <View style={{ gap: 8 }}>
            <AppText variant="label" color="textMuted">{t('p.reg.usualTime')}</AppText>
            <Row wrap gap={8}>
              {USUAL_DELIVERY_OPTIONS.map((o) => (
                <Chip key={o.mins} label={o.label} selected={usual === o.mins} onPress={() => setUsual(o.mins)} />
              ))}
            </Row>
          </View>
          <SwitchRow label={t('p.reg.pickup')} value={pickup} onValueChange={setPickup} />
        </>
      ) : null}

      {step === 5 && shop ? (
        <>
          <PhotoPicker
            bucket="shop-media"
            folder={shop.id}
            label={`${t('p.reg.frontPhoto')} *`}
            value={front.map((p) => p.path)}
            max={1}
            size={110}
            onChange={async (paths) => {
              const added = paths.find((p) => !front.some((f) => f.path === p));
              if (added) await addShopPhoto(shop.id, 'front', added);
              for (const f of front) if (!paths.includes(f.path)) await removeShopPhoto(f.id);
            }}
          />
          {errors.front ? <AppText variant="caption" color="error">{errors.front}</AppText> : null}
          <PhotoPicker
            bucket="shop-media"
            folder={shop.id}
            label={t('p.reg.insidePhotos')}
            value={inside.map((p) => p.path)}
            max={10}
            onChange={async (paths) => {
              const added = paths.filter((p) => !inside.some((f) => f.path === p));
              for (const a of added) await addShopPhoto(shop.id, 'inside', a);
              for (const f of inside) if (!paths.includes(f.path)) await removeShopPhoto(f.id);
            }}
          />
          <PhotoPicker
            bucket="shop-media"
            folder={shop.id}
            label={t('p.reg.logo')}
            value={logo.map((p) => p.path)}
            max={1}
            square
            onChange={async (paths) => {
              const added = paths.find((p) => !logo.some((f) => f.path === p));
              if (added) await addShopPhoto(shop.id, 'logo', added);
              for (const f of logo) if (!paths.includes(f.path)) await removeShopPhoto(f.id);
            }}
          />
        </>
      ) : null}

      {step === 6 && shop ? (
        <>
          <InfoBanner text={t('p.reg.upiHint')} />
          <Input testID="upi-id" label={t('p.reg.upiId')} placeholder="shopname@okhdfcbank" autoCapitalize="none" value={upi} onChangeText={setUpi} error={errors.upi} />
          <Input label={t('p.reg.upiName')} value={upiName} onChangeText={setUpiName} placeholder={name} />
          <PhotoPicker bucket="shop-media" folder={shop.id} label={t('p.reg.upiQr')} value={upiQr} onChange={setUpiQr} max={1} size={120} />
        </>
      ) : null}

      {step === 7 && shop ? (
        <>
          <InfoBanner tone="success" icon="lock-closed" text={t('p.reg.docsPrivate')} />
          <Input label={t('p.reg.gst')} autoCapitalize="characters" value={gst} onChangeText={setGst} placeholder={t('common.optional')} />
          <DocUpload
            testID="upload-licence"
            shopId={shop.id}
            label={t('p.reg.licence')}
            uploaded={licenceDoc}
            docTypes={['trade_licence', 'udyam_certificate', 'gst_certificate'] as DocType[]}
            onUploaded={(type, path, num) => addShopDocument(shop.id, type, path, num)}
          />
          <DocUpload
            testID="upload-id"
            shopId={shop.id}
            label={t('p.reg.idProof')}
            uploaded={idDoc}
            docTypes={['owner_id_proof'] as DocType[]}
            onUploaded={(type, path, num) => addShopDocument(shop.id, type, path, num)}
          />
        </>
      ) : null}

      {step === 8 && shop ? (
        <>
          <AppText variant="h2">{t('p.reg.reviewTitle')}</AppText>
          <AppText variant="bodySmall" color="textMuted">{t('p.reg.reviewBody')}</AppText>
          <Card style={{ gap: 10 }}>
            {['name', 'shop_types', 'contact_phone', 'address', 'delivery_areas', 'front_photo', 'upi_id', 'owner_id_proof', 'shop_licence'].map((f) => {
              const ok = !missing.includes(f);
              return (
                <Row key={f} gap={10}>
                  <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={ok ? colors.success : colors.textSubtle} />
                  <AppText variant="body" color={ok ? 'text' : 'textMuted'}>{t(`p.field.${f}`)}</AppText>
                </Row>
              );
            })}
          </Card>
          {shop.status_reason ? <InfoBanner tone="warning" text={t('p.status.reason', { reason: shop.status_reason })} /> : null}
        </>
      ) : null}
    </Screen>
  );
}
