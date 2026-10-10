/**
 * Distance-aware delivery estimates (docs/DECISIONS.md, "Delivery time"). The same numbers are computed in SQL by
 * gg_ride_mins and gg_delivery_eta_mins (supabase/migrations/20261011000012_delivery_eta.sql); tests on both sides
 * check the same examples so the two cannot drift apart.
 */

/** City roads are about 40% longer than the straight line between two points. */
export const ROAD_FACTOR = 1.4;
/** Average two-wheeler speed in Hyderabad traffic, km/h. */
export const BIKE_KMPH = 18;
/** A shop's usual delivery time is taken to cover a typical trip of this many (straight-line) km. */
export const TYPICAL_TRIP_KM = 4;
/** No estimate goes below this: the shop still has to confirm, take payment and pack. */
export const MIN_DELIVERY_MINS = 20;

/** Estimated road distance for a straight-line distance. */
export function roadKm(km: number): number {
  return km * ROAD_FACTOR;
}

function rideExact(km: number): number {
  return ((km * ROAD_FACTOR) / BIKE_KMPH) * 60;
}

/** Ride time on a two-wheeler for a straight-line distance, in whole minutes (at least 5). */
export function rideMins(km: number): number {
  return Math.max(5, Math.ceil(rideExact(km)));
}

/**
 * Delivery estimate for a shop at this distance: its usual time, shortened or lengthened by how much nearer or
 * farther the customer is than a typical trip. Rounded to 5 minutes and never under 20. Without a distance it is
 * simply the shop's usual time.
 */
export function deliveryEtaMins(baseMins: number | null | undefined, km: number | null | undefined): number | null {
  if (baseMins == null) return null;
  if (km == null || !Number.isFinite(km)) return baseMins;
  const raw = baseMins + rideExact(km) - rideExact(TYPICAL_TRIP_KM);
  return Math.max(MIN_DELIVERY_MINS, Math.round(raw / 5) * 5);
}
