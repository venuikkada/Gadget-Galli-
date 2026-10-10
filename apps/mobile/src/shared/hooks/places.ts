import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

export interface Place {
  id: string;
  main: string;
  secondary: string;
  lat: number;
  lng: number;
}

// Hyderabad and its suburbs: west, north, east, south.
const VIEWBOX = '78.20,17.65,78.75,17.15';

/**
 * Place search on OpenStreetMap (Nominatim, free), limited to Hyderabad. Call it when the person submits, never on
 * every keystroke: Nominatim allows about one request a second and asks apps not to search-as-you-type.
 */
export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=in&bounded=1&accept-language=en' +
    `&viewbox=${VIEWBOX}&q=${encodeURIComponent(q)}`;
  // Nominatim asks apps to identify themselves; browsers send their own User-Agent and the page address.
  const res = await fetch(url, { headers: Platform.OS === 'web' ? {} : { 'User-Agent': 'GadgetGalli/1.0 (+https://gadgetgalli.in)' } });
  if (!res.ok) throw new Error(`place search failed: ${res.status}`);
  const rows = (await res.json()) as { place_id: number; name?: string; display_name: string; lat: string; lon: string }[];
  return rows.map((r) => {
    const parts = r.display_name.split(', ');
    const main = r.name || parts[0] || r.display_name;
    return { id: String(r.place_id), main, secondary: parts.filter((p) => p !== main).slice(0, 3).join(', '), lat: Number(r.lat), lng: Number(r.lon) };
  });
}

/** Runs searchPlaces on demand and keeps the results, loading and failure state. */
export function usePlaceSearch() {
  const [state, setState] = useState<{ loading: boolean; results: Place[] | null; failed: boolean }>({ loading: false, results: null, failed: false });
  const run = useCallback(async (query: string) => {
    if (query.trim().length < 3) return;
    setState({ loading: true, results: null, failed: false });
    try {
      setState({ loading: false, results: await searchPlaces(query), failed: false });
    } catch {
      setState({ loading: false, results: null, failed: true });
    }
  }, []);
  const clear = useCallback(() => setState({ loading: false, results: null, failed: false }), []);
  return { ...state, run, clear };
}
