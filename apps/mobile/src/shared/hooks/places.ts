import { useQuery } from '@tanstack/react-query';

import { HYDERABAD_CENTER } from '@gg/shared';

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
export const placesEnabled = KEY.length > 0;

export interface PlaceSuggestion {
  placeId: string;
  main: string;
  secondary: string;
}

/** Google Places (New) autocomplete biased to Hyderabad. Disabled when no API key is configured. */
export function usePlaces(query: string) {
  return useQuery({
    queryKey: ['places', query],
    enabled: placesEnabled && query.trim().length >= 3,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<PlaceSuggestion[]> => {
      const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY },
        body: JSON.stringify({
          input: query,
          includedRegionCodes: ['in'],
          locationBias: { circle: { center: { latitude: HYDERABAD_CENTER.lat, longitude: HYDERABAD_CENTER.lng }, radius: 40000 } },
        }),
      });
      const json = (await res.json()) as {
        suggestions?: { placePrediction?: { placeId: string; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } }[];
      };
      return (json.suggestions ?? [])
        .map((s) => s.placePrediction)
        .filter((p): p is NonNullable<typeof p> => !!p)
        .map((p) => ({ placeId: p.placeId, main: p.structuredFormat?.mainText?.text ?? '', secondary: p.structuredFormat?.secondaryText?.text ?? '' }));
    },
  });
}

export async function placeDetails(placeId: string): Promise<{ lat: number; lng: number; address: string; pincode: string | null } | null> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'location,formattedAddress,addressComponents' },
  });
  const json = (await res.json()) as {
    location?: { latitude: number; longitude: number };
    formattedAddress?: string;
    addressComponents?: { longText: string; types: string[] }[];
  };
  if (!json.location) return null;
  return {
    lat: json.location.latitude,
    lng: json.location.longitude,
    address: json.formattedAddress ?? '',
    pincode: json.addressComponents?.find((c) => c.types.includes('postal_code'))?.longText ?? null,
  };
}
