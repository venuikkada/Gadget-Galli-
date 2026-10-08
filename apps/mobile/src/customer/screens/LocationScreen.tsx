import { Ionicons } from '@expo/vector-icons';
import * as ExpoLocation from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { Address, Area } from '@gg/shared';

import { AreaList } from '@/shared/components/AreaList';
import { useLocationStore } from '@/shared/hooks/location';
import { placeDetails, placesEnabled, usePlaces } from '@/shared/hooks/places';
import { useProfile, useUpdateProfile } from '@/shared/hooks/profile';
import { useTranslation } from '@/shared/i18n';
import { useTheme } from '@/shared/theme/ThemeProvider';
import { AppText, Button, Card, Header, Input, Row, Screen, Tag, toast } from '@/shared/ui';

import { resolveLocation } from '../api';

/** "Use current location", saved addresses, or pick a Hyderabad area. */
export default function LocationScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const setLocation = useLocationStore((s) => s.setLocation);
  const current = useLocationStore((s) => s.location);
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const [query, setQuery] = useState('');
  const [detecting, setDetecting] = useState(false);
  const places = usePlaces(query);

  const done = () => (router.canGoBack() ? router.back() : router.replace('/home'));

  const fromCoords = async (lat: number, lng: number, label?: string | null) => {
    const r = await resolveLocation(lat, lng);
    if (!r.in_service || !r.area_id) {
      router.push({ pathname: '/not-served', params: { lat: String(lat), lng: String(lng), place: label ?? '' } });
      return false;
    }
    setLocation({ areaId: r.area_id, areaName: r.area_name ?? '', pincode: r.pincode ?? '', lat, lng, label: label ?? null, addressId: null });
    updateProfile.mutate({ last_area_id: r.area_id });
    return true;
  };

  const useGps = async () => {
    setDetecting(true);
    try {
      const perm = await ExpoLocation.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        toast(t('location.permissionDenied'), 'error');
        return;
      }
      const pos = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced });
      if (await fromCoords(pos.coords.latitude, pos.coords.longitude)) done();
    } catch {
      toast(t('location.permissionDenied'), 'error');
    } finally {
      setDetecting(false);
    }
  };

  const pickAddress = (a: Address) => {
    if (!a.area_id) return;
    setLocation({ areaId: a.area_id, areaName: a.area_name ?? '', pincode: a.pincode ?? '', lat: a.lat, lng: a.lng, addressId: a.id, label: a.label === 'other' ? a.label_custom ?? null : t(`address.${a.label}`) });
    updateProfile.mutate({ last_area_id: a.area_id });
    done();
  };

  const pickArea = (a: Area) => {
    setLocation({ areaId: a.id, areaName: a.name, pincode: a.pincode, lat: a.lat, lng: a.lng, addressId: null, label: null });
    updateProfile.mutate({ last_area_id: a.id });
    done();
  };

  const addresses = profile?.addresses ?? [];

  return (
    <Screen header={<Header title={t('location.title')} back={!!current} />}>
      <Button testID="use-gps" title={detecting ? t('location.detecting') : t('location.useCurrent')} icon="navigate" variant="secondary" size="lg" loading={detecting} onPress={useGps} full />

      {addresses.length ? (
        <View style={{ gap: 10 }}>
          <AppText variant="label" color="textMuted">{t('location.savedAddresses')}</AppText>
          {addresses.map((a) => (
            <Card key={a.id} onPress={() => pickAddress(a)}>
              <Row gap={12} align="flex-start">
                <Ionicons name={a.label === 'office' ? 'briefcase-outline' : a.label === 'home' ? 'home-outline' : 'location-outline'} size={20} color={colors.primary} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Row gap={6}>
                    <AppText variant="title">{a.label === 'other' ? a.label_custom || t('address.other') : t(`address.${a.label}`)}</AppText>
                    {a.is_default ? <Tag label={t('address.default')} tone="primary" /> : null}
                  </Row>
                  <AppText variant="caption" color="textMuted" numberOfLines={2}>
                    {[a.house, a.building, a.street, a.area_name, a.pincode].filter(Boolean).join(', ')}
                  </AppText>
                </View>
              </Row>
            </Card>
          ))}
        </View>
      ) : null}
      <Button title={t('address.addNew')} icon="add" variant="ghost" onPress={() => router.push('/address')} style={{ alignSelf: 'flex-start' }} />

      <Input testID="area-search" icon="search" placeholder={placesEnabled ? t('location.searchPlaces') : t('location.searchArea')} value={query} onChangeText={setQuery} />
      {placesEnabled && places.data?.length ? (
        <Card style={{ gap: 2 }}>
          {places.data.map((p) => (
            <Pressable
              key={p.placeId}
              onPress={async () => {
                const d = await placeDetails(p.placeId);
                if (d && (await fromCoords(d.lat, d.lng, p.main))) done();
              }}
              style={{ paddingVertical: 10 }}
            >
              <AppText variant="title" numberOfLines={1}>{p.main}</AppText>
              <AppText variant="caption" color="textMuted" numberOfLines={1}>{p.secondary}</AppText>
            </Pressable>
          ))}
        </Card>
      ) : null}
      <AppText variant="label" color="textMuted">{t('location.pickArea')}</AppText>
      <AreaList query={query} onPick={pickArea} selectedId={current?.areaId} />
    </Screen>
  );
}
