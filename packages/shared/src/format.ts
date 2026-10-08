/**
 * Indian formats: ₹1,25,000 prices, +91 phone numbers and IST times.
 * Implemented by hand (not Intl) so output is identical on every device and JS engine.
 */

const IST_OFFSET_MIN = 330;

/** Groups the integer part the Indian way: 1,25,000 / 12,34,56,789. */
export function groupIndian(intDigits: string): string {
  if (intDigits.length <= 3) return intDigits;
  const last3 = intDigits.slice(-3);
  let rest = intDigits.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return `${parts.join(',')},${last3}`;
}

/** ₹1,25,000 — shows paise only when present (₹499.50). */
export function formatINR(value: number | string | null | undefined, opts: { symbol?: boolean; decimals?: 'auto' | 0 | 2 } = {}): string {
  const { symbol = true, decimals = 'auto' } = opts;
  const n = typeof value === 'string' ? Number(value) : value ?? 0;
  if (!Number.isFinite(n)) return symbol ? '₹0' : '0';
  const negative = n < 0;
  const abs = Math.abs(n);
  const showPaise = decimals === 2 || (decimals === 'auto' && Math.round(abs * 100) % 100 !== 0);
  const fixed = showPaise ? abs.toFixed(2) : Math.round(abs).toString();
  const [intPart, frac] = fixed.split('.');
  const body = groupIndian(intPart!) + (frac ? `.${frac}` : '');
  return `${negative ? '-' : ''}${symbol ? '₹' : ''}${body}`;
}

/** ₹1.25L / ₹2.3Cr for dashboards. */
export function formatINRCompact(value: number | null | undefined): string {
  const n = value ?? 0;
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${trimZeros((n / 1e7).toFixed(2))}Cr`;
  if (abs >= 1e5) return `₹${trimZeros((n / 1e5).toFixed(2))}L`;
  if (abs >= 1e3) return `₹${trimZeros((n / 1e3).toFixed(1))}K`;
  return formatINR(n);
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

/** Percentage off MRP, rounded down ("23% off"). Returns 0 when there is no discount. */
export function percentOff(price: number, mrp: number | null | undefined): number {
  if (!mrp || mrp <= price || mrp <= 0) return 0;
  return Math.floor(((mrp - price) / mrp) * 100);
}

/**
 * Normalises an Indian mobile number to E.164 (+91XXXXXXXXXX).
 * Accepts "98765 43210", "+91-98765-43210", "09876543210", "919876543210".
 * Returns null when it is not a valid 10-digit Indian mobile number.
 */
export function normalizeIndianPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91${digits}`;
}

/** +91 98765 43210 */
export function formatPhone(input: string | null | undefined): string {
  const e164 = normalizeIndianPhone(input);
  if (!e164) return input ?? '';
  const d = e164.slice(3);
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
}

/** Digits only with country code, as WhatsApp (wa.me) expects: 919876543210. */
export function waNumber(input: string | null | undefined): string {
  const e164 = normalizeIndianPhone(input);
  return e164 ? e164.slice(1) : (input ?? '').replace(/\D/g, '');
}

export interface ISTParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  weekday: number; // 0 = Sunday
}

/** Breaks a date into its Asia/Kolkata wall-clock parts regardless of the device time zone. */
export function istParts(date: Date | string | number = new Date()): ISTParts {
  const d = date instanceof Date ? date : new Date(date);
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const WEEKDAY_LABEL: Record<Weekday, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
};

/** 3:45 PM (IST) */
export function formatTimeIST(date: Date | string | number): string {
  const p = istParts(date);
  return formatClock(p.hour, p.minute);
}

/** "10:00" -> "10:00 AM" */
export function formatClock(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function formatHHMM(hhmm: string | null | undefined): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return formatClock(h ?? 0, m ?? 0);
}

/** 8 Oct 2026 (IST) */
export function formatDateIST(date: Date | string | number, withYear = true): string {
  const p = istParts(date);
  return `${p.day} ${MONTHS[p.month - 1]}${withYear ? ` ${p.year}` : ''}`;
}

/** 8 Oct, 3:45 PM — or "Today, 3:45 PM" / "Yesterday, 3:45 PM" (IST). */
export function formatDateTimeIST(date: Date | string | number, now: Date = new Date()): string {
  const p = istParts(date);
  const today = istParts(now);
  const yesterday = istParts(now.getTime() - 86_400_000);
  const time = formatClock(p.hour, p.minute);
  if (p.year === today.year && p.month === today.month && p.day === today.day) return `Today, ${time}`;
  if (p.year === yesterday.year && p.month === yesterday.month && p.day === yesterday.day) return `Yesterday, ${time}`;
  return `${p.day} ${MONTHS[p.month - 1]}${p.year !== today.year ? ` ${p.year}` : ''}, ${time}`;
}

/** "just now", "5 min ago", "2 hrs ago", "3 days ago" */
export function timeAgo(date: Date | string | number, now: Date = new Date()): string {
  const d = date instanceof Date ? date : new Date(date);
  const mins = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

/** 45 -> "45 min", 60 -> "1 hr", 90 -> "1.5 hrs", 480 -> "Same day" */
export function formatDuration(mins: number | null | undefined): string {
  if (mins == null || !Number.isFinite(mins)) return '';
  if (mins >= 480) return 'Same day';
  if (mins < 60) return `${Math.max(1, Math.round(mins))} min`;
  const hrs = Math.round((mins / 60) * 2) / 2;
  return `${trimZeros(hrs.toFixed(1))} hr${hrs > 1 ? 's' : ''}`;
}

/** "Delivers in about 2 hrs" */
export function deliversInText(mins: number | null | undefined): string {
  if (mins == null) return '';
  if (mins >= 480) return 'Delivers same day';
  return `Delivers in about ${formatDuration(mins)}`;
}

/** 0.4 -> "400 m", 3.26 -> "3.3 km" */
export function formatDistance(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return '';
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** Great-circle distance in km. Mirrors the SQL function gg_distance_km. */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return 'GG';
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || 'GG';
}
