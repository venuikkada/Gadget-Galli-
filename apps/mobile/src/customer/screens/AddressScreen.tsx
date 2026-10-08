import * as ExpoLocation from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, View } from 'react-native';

import type { Address, Area } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { AreaList } from '@/shared/components/AreaList';
import { MapPicker } from '@/shared/components/MapPicker';
import { useLocationStore } from '@/shared/hooks/location';
import { useProfile } from '@/shared/hooks/profile';
import { useAreas } from '@/shared/hooks/reference';
import { useTranslation } from '@/shared/i18n';
import { AppText, Button, Chip, Header, Input, Row, Screen, Tag, toast } from '@/shared/ui';

import { cartUpdate, resolveLocation, saveAddress } from '../api';

/** Add or edit a saved address: house/flat, building, street, landmark, area, pincode and map pin. */
export default function AddressScreen() {
  const { t } = useTranslation();
  const { id, forCart } = useLocalSearchParams<{ id?: string; forCart?: string }>();
  const { data: profile } = useProfile();
  const { data: areas = [] } = useAreas();
  const setLocation = useLocationStore((s) => s.setLocation);
  const location = useLocationStore((s) => s.location);
  const existing = useMemo(() => profile?.addresses.find((a) => a.id === id), [profile, id]);

  const [label, setLabel] = useState<Address['label']>('home');
  const [labelCustom, setLabelCustom] = useState('');
  const [contactName, setContactName] = useState('');
  const [house, setHouse] = useState('');
  const [building, setBuilding] = useState('');
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [area, setArea] = useState<Area | null>(null);
  const [pincode, setPincode] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [isDefault, setIsDefault] = useState(false);
  const [areaPicker, setAreaPicker] = useState(false);
  const [areaQuery, setAreaQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (existing) {
      setLabel(existing.label);
      setLabelCustom(existing.label_custom ?? '');
      setContactName(existing.contact_name ?? '');
      setHouse(existing.house ?? '');
      setBuilding(existing.building ?? '');
      setStreet(existing.street ?? '');
      setLandmark(existing.landmark ?? '');
      setPincode(existing.pincode ?? '');
      setLat(existing.lat);
      setLng(existing.lng);
      setIsDefault(existing.is_default);
    } else {
      setContactName(profile?.user.name ?? '');
      if (location) {
        setLat(location.lat);
        setLng(location.lng);
      }
    }
  }, [existing, profile?.user.name, location]);

  useEffect(() => {
    const areaId = existing?.area_id ?? location?.areaId;
    if (!area && areaId && areas.length) {
      const a = areas.find((x) => x.id === areaId) ?? null;
      setArea(a);
      if (a && !pincode) setPincode(a.pincode);
    }
  }, [areas, existing, location, area, pincode]);

  const onPin = async (la: number, ln: number) => {
    setLat(la);
    setLng(ln);
    try {
      const r = await resolveLocation(la, ln);
      if (r.in_service && r.area_id) {
        const a = areas.find((x) => x.id === r.area_id);
        if (a && a.id !== area?.id) {
          setArea(a);
          setPincode(a.pincode);
        }
      }
    } catch {
      /* keep manual area */
    }
  };

  const useGps = async () => {
    const perm = await ExpoLocation.requestForegroundPermissionsAsync();
    if (!perm.granted) return toast(t('location.permissionDenied'), 'error');
    const pos = await ExpoLocation.getCurrentPositionAsync({});
    onPin(pos.coords.latitude, pos.coords.longitude);
  };

  const save = async () => {
    const errs: Record<string, string> = {};
    if (!house.trim()) errs.house = t('address.houseRequired');
    if (!area) errs.area = t('address.areaRequired');
    setErrors(errs);
    if (Object.keys(errs).length || !area) return;
    setSaving(true);
    try {
      const saved = await saveAddress({
        id: existing?.id,
        label,
        label_custom: label === 'other' ? labelCustom : null,
        contact_name: contactName,
        house,
        building,
        street,
        landmark,
        area_id: area.id,
        area_name: area.name,
        pincode: pincode || area.pincode,
        lat: lat ?? area.lat,
        lng: lng ?? area.lng,
        is_default: isDefault,
      });
      setLocation({
        areaId: area.id,
        areaName: area.name,
        pincode: pincode || area.pincode,
        lat: lat ?? area.lat,
        lng: lng ?? area.lng,
        addressId: saved.id,
        label: label === 'other' ? labelCustom || null : t(`address.${label}`),
      });
      if (forCart) await cartUpdate({ address_id: saved.id, fulfilment: 'delivery' });
      toast(t('common.saved'), 'success');
      router.back();
    } catch (e) {
      toast(errorText(e, t), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      header={<Header title={existing ? t('address.title') : t('address.addNew')} />}
      footer={<Button testID="save-address" title={t('address.saveAddress')} variant="action" size="lg" full loading={saving} onPress={save} />}
    >
      <View style={{ gap: 8 }}>
        <MapPicker lat={lat} lng={lng} height={220} onChange={onPin} />
        <Row justify="space-between">
          <AppText variant="caption" color="textMuted">{t('location.moveMap')}</AppText>
          <AppText variant="label" color="primary" onPress={useGps}>{t('location.useCurrent')}</AppText>
        </Row>
      </View>
      <View style={{ gap: 8 }}>
        <AppText variant="label" color="textMuted">{t('address.label')}</AppText>
        <Row gap={8}>
          {(['home', 'office', 'other'] as const).map((l) => (
            <Chip key={l} label={t(`address.${l}`)} icon={l === 'home' ? 'home-outline' : l === 'office' ? 'briefcase-outline' : 'location-outline'} selected={label === l} onPress={() => setLabel(l)} />
          ))}
        </Row>
        {label === 'other' ? <Input placeholder={t('address.otherName')} value={labelCustom} onChangeText={setLabelCustom} /> : null}
      </View>
      <Input testID="addr-house" label={t('address.house')} value={house} onChangeText={setHouse} error={errors.house} />
      <Input label={t('address.building')} value={building} onChangeText={setBuilding} />
      <Input label={t('address.street')} value={street} onChangeText={setStreet} />
      <Input label={t('address.landmark')} value={landmark} onChangeText={setLandmark} />
      <View style={{ gap: 6 }}>
        <AppText variant="label" color="textMuted">{t('address.area')}</AppText>
        <Row gap={8}>
          <Button testID="addr-area" title={area ? area.name : t('address.areaRequired')} variant="outline" icon="location-outline" onPress={() => setAreaPicker(true)} style={{ flex: 1 }} />
          {area ? <Tag label={area.pincode} tone="primary" /> : null}
        </Row>
        {errors.area ? <AppText variant="caption" color="error">{errors.area}</AppText> : null}
      </View>
      <Input label={t('address.pincode')} value={pincode} onChangeText={(v) => setPincode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" />
      <Input label={t('address.contactName')} value={contactName} onChangeText={setContactName} />
      {!existing?.is_default ? <Chip label={t('address.makeDefault')} icon="star-outline" selected={isDefault} onPress={() => setIsDefault(!isDefault)} /> : null}

      <Modal visible={areaPicker} animationType="slide" onRequestClose={() => setAreaPicker(false)}>
        <Screen header={<Header title={t('address.area')} onBack={() => setAreaPicker(false)} />}>
          <Input icon="search" placeholder={t('location.searchArea')} value={areaQuery} onChangeText={setAreaQuery} autoFocus />
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
              setAreaPicker(false);
            }}
          />
        </Screen>
      </Modal>
    </Screen>
  );
}
