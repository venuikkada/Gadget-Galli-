import { Ionicons } from '@expo/vector-icons';
import * as ExpoLocation from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Modal, View } from 'react-native';

import type { Address, Area } from '@gg/shared';

import { errorText } from '@/shared/api/rpc';
import { AreaList } from '@/shared/components/AreaList';
import { MapPicker } from '@/shared/components/MapPicker';
import { PlaceResults } from '@/shared/components/PlaceResults';
import { useLocationStore } from '@/shared/hooks/location';
import { usePlaceSearch } from '@/shared/hooks/places';
import { useProfile } from '@/shared/hooks/profile';
import { useAreas } from '@/shared/hooks/reference';
import { useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Chip, Header, Input, Row, Screen, Tag, toast } from '@/shared/ui';

import { cartUpdate, resolveLocation, saveAddress } from '../api';

/** Add or edit a saved address: house/flat, building, street, landmark, area, pincode and map pin. */
export default function AddressScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
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
  // The pin counts as placed once the person drags the map, uses GPS or picks a search result (or the address had one).
  const [pinSet, setPinSet] = useState(false);
  const [locating, setLocating] = useState(false);
  const [placeQuery, setPlaceQuery] = useState('');
  const places = usePlaceSearch();
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
      setPinSet(existing.lat != null && existing.lng != null);
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

  const onPin = async (la: number, ln: number, byUser = false) => {
    setLat(la);
    setLng(ln);
    if (byUser) {
      setPinSet(true);
      setErrors((e) => ({ ...e, pin: '' }));
    }
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
    setLocating(true);
    try {
      const perm = await ExpoLocation.requestForegroundPermissionsAsync();
      if (!perm.granted) return toast(t('location.permissionDenied'), 'error');
      const pos = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.High });
      await onPin(pos.coords.latitude, pos.coords.longitude, true);
    } catch {
      toast(t('location.permissionDenied'), 'error');
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    const errs: Record<string, string> = {};
    if (!house.trim()) errs.house = t('address.houseRequired');
    if (!area) errs.area = t('address.areaRequired');
    if (!pinSet || lat == null || lng == null) errs.pin = t('map.pinRequired');
    setErrors(errs);
    if (Object.keys(errs).some((k) => errs[k]) || !area || lat == null || lng == null) return;
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
        lat,
        lng,
        is_default: isDefault,
      });
      setLocation({
        areaId: area.id,
        areaName: area.name,
        pincode: pincode || area.pincode,
        lat,
        lng,
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
      <View style={{ gap: 10 }}>
        <MapPicker lat={lat} lng={lng} height={260} onChange={onPin} />
        <Row gap={6} align="flex-start">
          <Ionicons name={pinSet ? 'checkmark-circle' : 'hand-left-outline'} size={16} color={pinSet ? colors.success : errors.pin ? colors.error : colors.textMuted} style={{ marginTop: 1 }} />
          <AppText variant="caption" color={pinSet ? 'success' : errors.pin ? 'error' : 'textMuted'} weight={pinSet || errors.pin ? 'semibold' : undefined} style={{ flex: 1 }} testID="pin-status">
            {pinSet ? t('map.pinSet') : errors.pin || t('location.moveMap')}
          </AppText>
        </Row>
        <Button testID="addr-gps" title={locating ? t('location.detecting') : t('location.useCurrent')} icon="navigate" variant="secondary" loading={locating} onPress={useGps} full />
        <Input
          icon="search"
          placeholder={t('location.searchPlaces')}
          value={placeQuery}
          onChangeText={(v) => {
            setPlaceQuery(v);
            places.clear();
          }}
          onSubmitEditing={() => places.run(placeQuery)}
          returnKeyType="search"
        />
        <PlaceResults
          query={placeQuery}
          search={places}
          onPick={(p) => {
            places.clear();
            setPlaceQuery('');
            onPin(p.lat, p.lng, true);
          }}
        />
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
