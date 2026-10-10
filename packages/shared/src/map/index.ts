// Maps and delivery estimates. Imported as '@gg/shared/map' (not from the package index) so that screens without
// a map do not carry Leaflet.
export * from './eta';
export * from './html';

/** Google Maps directions to a point. A plain link: it opens the Google Maps app or website, no API key needed. */
export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
