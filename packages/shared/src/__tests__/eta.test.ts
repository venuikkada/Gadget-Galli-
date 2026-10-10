import { describe, expect, it } from 'vitest';

import { deliveryEtaMins, rideMins, roadKm } from '../map/eta';

// supabase/tests/07_delivery_eta.test.sql checks the same examples against the SQL functions.
describe('delivery estimates', () => {
  it('estimates road distance and ride time', () => {
    expect(roadKm(10)).toBeCloseTo(14);
    expect(rideMins(0.3)).toBe(5);
    expect(rideMins(3.8)).toBe(18);
    expect(rideMins(12)).toBe(56);
  });

  it('adjusts a shop\'s usual time for the customer\'s distance', () => {
    expect(deliveryEtaMins(90, 4)).toBe(90);
    expect(deliveryEtaMins(90, 0.3)).toBe(75);
    expect(deliveryEtaMins(90, 12)).toBe(125);
    expect(deliveryEtaMins(120, 3.8)).toBe(120);
    expect(deliveryEtaMins(30, 0.2)).toBe(20);
  });

  it('falls back to the usual time without a distance', () => {
    expect(deliveryEtaMins(90, null)).toBe(90);
    expect(deliveryEtaMins(null, 3)).toBeNull();
  });
});
