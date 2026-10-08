import { describe, expect, it } from 'vitest';
import {
  buildWhatsAppOrderMessage,
  canTransition,
  canReportIssue,
  deliversInText,
  distanceKm,
  formatDateTimeIST,
  formatDistance,
  formatDuration,
  formatINR,
  formatINRCompact,
  formatPhone,
  formatTimeIST,
  groupIndian,
  highlightParts,
  hoursTable,
  isShopOpenNow,
  isValidUpiId,
  normalizeIndianPhone,
  normalizeQuery,
  openingHint,
  percentOff,
  upiPaymentUrl,
  whatsappUrl,
} from '../index';

describe('Indian number formats', () => {
  it('groups the Indian way', () => {
    expect(groupIndian('125000')).toBe('1,25,000');
    expect(groupIndian('123456789')).toBe('12,34,56,789');
    expect(groupIndian('999')).toBe('999');
  });
  it('formats rupees', () => {
    expect(formatINR(125000)).toBe('₹1,25,000');
    expect(formatINR(45999)).toBe('₹45,999');
    expect(formatINR('59999.00')).toBe('₹59,999');
    expect(formatINR(499.5)).toBe('₹499.50');
    expect(formatINR(0)).toBe('₹0');
    expect(formatINR(-1500)).toBe('-₹1,500');
    expect(formatINR(1234567, { symbol: false })).toBe('12,34,567');
  });
  it('formats compact rupees', () => {
    expect(formatINRCompact(125000)).toBe('₹1.25L');
    expect(formatINRCompact(23000000)).toBe('₹2.3Cr');
    expect(formatINRCompact(4500)).toBe('₹4.5K');
  });
  it('computes % off MRP', () => {
    expect(percentOff(59999, 69900)).toBe(14);
    expect(percentOff(100, null)).toBe(0);
    expect(percentOff(100, 90)).toBe(0);
  });
});

describe('phone numbers', () => {
  it('normalises Indian mobiles to +91', () => {
    expect(normalizeIndianPhone('98765 43210')).toBe('+919876543210');
    expect(normalizeIndianPhone('+91-98765-43210')).toBe('+919876543210');
    expect(normalizeIndianPhone('09876543210')).toBe('+919876543210');
    expect(normalizeIndianPhone('919876543210')).toBe('+919876543210');
    expect(normalizeIndianPhone('12345')).toBeNull();
    expect(normalizeIndianPhone('5876543210')).toBeNull();
  });
  it('displays +91 98765 43210', () => {
    expect(formatPhone('9876543210')).toBe('+91 98765 43210');
  });
});

describe('IST times', () => {
  it('formats in IST regardless of device zone', () => {
    expect(formatTimeIST('2026-10-08T09:30:00Z')).toBe('3:00 PM');
    expect(formatTimeIST('2026-10-08T18:45:00Z')).toBe('12:15 AM');
  });
  it('shows Today / Yesterday', () => {
    const now = new Date('2026-10-08T10:00:00Z');
    expect(formatDateTimeIST('2026-10-08T05:00:00Z', now)).toBe('Today, 10:30 AM');
    expect(formatDateTimeIST('2026-10-07T05:00:00Z', now)).toBe('Yesterday, 10:30 AM');
    expect(formatDateTimeIST('2026-09-01T05:00:00Z', now)).toBe('1 Sep, 10:30 AM');
  });
  it('formats durations and distances', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 hr');
    expect(formatDuration(90)).toBe('1.5 hrs');
    expect(formatDuration(480)).toBe('Same day');
    expect(deliversInText(120)).toBe('Delivers in about 2 hrs');
    expect(formatDistance(0.42)).toBe('400 m');
    expect(formatDistance(3.26)).toBe('3.3 km');
    expect(formatDistance(14.7)).toBe('15 km');
  });
  it('computes distance like the database', () => {
    // Gachibowli -> Kukatpally is about 8 km
    expect(distanceKm(17.4401, 78.3489, 17.4948, 78.3996)).toBeCloseTo(8.1, 0);
  });
});

describe('shop hours', () => {
  const hours = {
    mon: { open: '10:00', close: '21:00' },
    tue: { open: '10:00', close: '21:00' },
    wed: { open: '10:00', close: '21:00' },
    thu: { open: '10:00', close: '21:00' },
    fri: { open: '10:00', close: '21:00' },
    sat: { open: '10:00', close: '21:00' },
    sun: { open: '10:00', close: '21:00', closed: true },
  };
  it('respects IST hours and the manual switch', () => {
    // Thursday 8 Oct 2026, 3 PM IST
    expect(isShopOpenNow(hours, true, new Date('2026-10-08T09:30:00Z'))).toBe(true);
    expect(isShopOpenNow(hours, false, new Date('2026-10-08T09:30:00Z'))).toBe(false);
    // 10 PM IST
    expect(isShopOpenNow(hours, true, new Date('2026-10-08T16:30:00Z'))).toBe(false);
    // Sunday
    expect(isShopOpenNow(hours, true, new Date('2026-10-11T09:30:00Z'))).toBe(false);
  });
  it('treats open == close as 24 hours', () => {
    const allDay = { mon: { open: '00:00', close: '00:00' } };
    expect(isShopOpenNow(allDay, true, new Date('2026-10-05T17:00:00Z'))).toBe(true); // Monday 10:30 PM IST
    expect(hoursTable(allDay)[0]!.text).toBe('Open 24 hours');
  });
  it('gives an opening hint', () => {
    expect(openingHint(hours, true, new Date('2026-10-08T02:00:00Z'))).toBe('Closed · opens 10:00 AM');
    expect(openingHint(hours, true, new Date('2026-10-10T16:30:00Z'))).toBe('Closed · opens Monday 10:00 AM');
  });
});

describe('orders', () => {
  it('allows only valid transitions', () => {
    expect(canTransition('REQUESTED', 'CONFIRMED', 'shop')).toBe(true);
    expect(canTransition('REQUESTED', 'CONFIRMED', 'customer')).toBe(false);
    expect(canTransition('PAID', 'CANCELLED', 'customer')).toBe(false);
    expect(canTransition('DISPATCHED', 'DELIVERED', 'customer')).toBe(true);
    expect(canTransition('ISSUE_REPORTED', 'PACKED', 'shop', 'PAID')).toBe(true);
    expect(canTransition('DELIVERED', 'REQUESTED', 'admin')).toBe(true);
  });
  it('limits problem reports to 7 days after delivery', () => {
    const now = new Date('2026-10-08T10:00:00Z');
    expect(canReportIssue('DELIVERED', '2026-10-02T10:00:00Z', now)).toBe(true);
    expect(canReportIssue('DELIVERED', '2026-09-30T10:00:00Z', now)).toBe(false);
    expect(canReportIssue('REQUESTED', null, now)).toBe(false);
  });
  it('builds the WhatsApp order message', () => {
    const text = buildWhatsAppOrderMessage({
      orderNo: 'GG-26-001234',
      shopName: 'KPHB Computer World',
      customerName: 'Ravi Kumar',
      items: [{ name: 'ZOTAC RTX 4060 8GB', qty: 1, price: 28999, condition: 'new', variant: null }],
      itemTotal: 28999,
      deliveryCharge: 0,
      grandTotal: 28999,
      fulfilment: 'delivery',
      address: { house: 'Flat 302', building: 'Sai Residency', area: 'Kukatpally', pincode: '500072', landmark: 'Near JNTU Metro' },
      note: 'Need GST bill',
    });
    expect(text).toContain('*Order no: GG-26-001234*');
    expect(text).toContain('1 × ₹28,999 = ₹28,999');
    expect(text).toContain('Delivery: Free');
    expect(text).toContain('*Total: ₹28,999*');
    expect(text).toContain('Deliver to: Ravi Kumar, Flat 302, Sai Residency, Kukatpally, 500072');
    expect(text).toContain('Note: Need GST bill');
    expect(whatsappUrl('+91 98765 43210', 'hi')).toBe('https://wa.me/919876543210?text=hi');
  });
  it('builds a UPI payment link', () => {
    expect(upiPaymentUrl({ upiId: 'kphb@okicici', payeeName: 'KPHB Computer World', amount: 28999, orderNo: 'GG-26-001234' })).toBe(
      'upi://pay?pa=kphb%40okicici&pn=KPHB%20Computer%20World&am=28999.00&cu=INR&tn=Gadget%20Galli%20GG-26-001234',
    );
    expect(isValidUpiId('shop.name@okhdfcbank')).toBe(true);
    expect(isValidUpiId('not-a-upi')).toBe(false);
  });
});

describe('search helpers', () => {
  it('normalises like the database', () => {
    expect(normalizeQuery('RTX4060')).toBe('rtx 4060');
    expect(normalizeQuery('iPhone 15 (128GB)')).toBe('iphone 15 128 gb');
    expect(normalizeQuery('  i5-13400F ')).toBe('i 5 13400 f');
  });
  it('splits labels for highlighting', () => {
    expect(highlightParts('Apple iPhone 15', 'iph')).toEqual([
      { text: 'Apple ', match: false },
      { text: 'iPh', match: true },
      { text: 'one 15', match: false },
    ]);
  });
});
