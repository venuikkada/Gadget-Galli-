import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface DeliveryLocation {
  areaId: number;
  areaName: string;
  pincode: string;
  lat: number | null;
  lng: number | null;
  addressId?: string | null;
  label?: string | null;
}

interface LocationState {
  location: DeliveryLocation | null;
  hydrated: boolean;
  setLocation: (l: DeliveryLocation) => void;
  clear: () => void;
}

/** The customer's current delivery location ("Delivering to: Kukatpally, 500072"). */
export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      location: null,
      hydrated: false,
      setLocation: (location) => set({ location }),
      clear: () => set({ location: null }),
    }),
    {
      name: 'gg.location',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ location: s.location }),
      onRehydrateStorage: () => () => useLocationStore.setState({ hydrated: true }),
    },
  ),
);

/** Arguments for the search/listing functions: area + coordinates. */
export function useLocArgs() {
  const loc = useLocationStore((s) => s.location);
  return { p_area_id: loc?.areaId ?? null, p_lat: loc?.lat ?? null, p_lng: loc?.lng ?? null };
}
