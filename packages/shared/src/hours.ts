import { formatHHMM, istParts, WEEKDAYS, WEEKDAY_LABEL, type Weekday } from './format';

export interface DayHours {
  open: string; // "10:00"
  close: string; // "21:00"
  closed?: boolean;
}
export type ShopHours = Partial<Record<Weekday, DayHours>>;

export const DEFAULT_HOURS: ShopHours = {
  mon: { open: '10:00', close: '21:00' },
  tue: { open: '10:00', close: '21:00' },
  wed: { open: '10:00', close: '21:00' },
  thu: { open: '10:00', close: '21:00' },
  fri: { open: '10:00', close: '21:00' },
  sat: { open: '10:00', close: '21:00' },
  sun: { open: '10:00', close: '21:00', closed: true },
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function withinDay(day: DayHours | undefined, minuteOfDay: number): boolean {
  if (!day || day.closed) return false;
  const open = toMinutes(day.open);
  const close = toMinutes(day.close);
  if (close > open) return minuteOfDay >= open && minuteOfDay < close;
  // Hours that run past midnight, e.g. 18:00 - 01:00
  return minuteOfDay >= open || minuteOfDay < close;
}

/**
 * Open now = the shop's manual Open switch is on AND the current IST time is inside today's hours.
 * Mirrors the SQL function gg_shop_open_now.
 */
export function isShopOpenNow(hours: ShopHours | null | undefined, manualOpen: boolean, now: Date = new Date()): boolean {
  if (!manualOpen) return false;
  if (!hours || Object.keys(hours).length === 0) return true;
  const p = istParts(now);
  const today = WEEKDAYS[p.weekday]!;
  const minute = p.hour * 60 + p.minute;
  if (withinDay(hours[today], minute)) return true;
  // Still inside yesterday's past-midnight window?
  const yesterday = hours[WEEKDAYS[(p.weekday + 6) % 7]!];
  if (yesterday && !yesterday.closed && toMinutes(yesterday.close) <= toMinutes(yesterday.open)) {
    return minute < toMinutes(yesterday.close);
  }
  return false;
}

export type OpeningState =
  | { kind: 'open24' }
  | { kind: 'openUntil'; time: string }
  | { kind: 'openNow' }
  | { kind: 'closedNow' }
  | { kind: 'opensToday'; time: string }
  | { kind: 'opensTomorrow'; time: string }
  | { kind: 'opensOn'; day: Weekday; time: string }
  | { kind: 'closed' };

/** Where the shop stands right now, as data (apps turn it into translated text). */
export function openingState(hours: ShopHours | null | undefined, manualOpen: boolean, now: Date = new Date()): OpeningState {
  if (!hours || Object.keys(hours).length === 0) return manualOpen ? { kind: 'openNow' } : { kind: 'closed' };
  const p = istParts(now);
  const today = WEEKDAYS[p.weekday]!;
  const minute = p.hour * 60 + p.minute;
  if (isShopOpenNow(hours, manualOpen, now)) {
    const h = hours[today];
    if (!h || h.open === h.close) return { kind: 'open24' };
    return { kind: 'openUntil', time: formatHHMM(h.close) };
  }
  if (!manualOpen) return { kind: 'closedNow' };
  const t = hours[today];
  if (t && !t.closed && minute < toMinutes(t.open)) return { kind: 'opensToday', time: formatHHMM(t.open) };
  for (let i = 1; i <= 7; i++) {
    const wd = WEEKDAYS[(p.weekday + i) % 7]!;
    const h = hours[wd];
    if (h && !h.closed) {
      return i === 1 ? { kind: 'opensTomorrow', time: formatHHMM(h.open) } : { kind: 'opensOn', day: wd, time: formatHHMM(h.open) };
    }
  }
  return { kind: 'closed' };
}

/** "Open now · closes 9:00 PM" or "Closed · opens tomorrow 10:00 AM" (English). */
export function openingHint(hours: ShopHours | null | undefined, manualOpen: boolean, now: Date = new Date()): string {
  const s = openingState(hours, manualOpen, now);
  switch (s.kind) {
    case 'open24':
      return 'Open now · 24 hours';
    case 'openUntil':
      return `Open now · closes ${s.time}`;
    case 'openNow':
      return 'Open now';
    case 'closedNow':
      return 'Closed for now';
    case 'opensToday':
      return `Closed · opens ${s.time}`;
    case 'opensTomorrow':
      return `Closed · opens tomorrow ${s.time}`;
    case 'opensOn':
      return `Closed · opens ${WEEKDAY_LABEL[s.day]} ${s.time}`;
    default:
      return 'Closed';
  }
}

/** Rows for an hours table: [{day:'Monday', text:'10:00 AM – 9:00 PM'}] */
export function hoursTable(hours: ShopHours | null | undefined): { day: Weekday; label: string; text: string; closed: boolean; allDay: boolean; range: string }[] {
  const order: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return order.map((d) => {
    const h = hours?.[d];
    const closed = !h || !!h.closed;
    const allDay = !closed && h!.open === h!.close;
    const range = closed || allDay ? '' : `${formatHHMM(h!.open)} – ${formatHHMM(h!.close)}`;
    return {
      day: d,
      label: WEEKDAY_LABEL[d],
      text: closed ? 'Closed' : allDay ? 'Open 24 hours' : range,
      closed,
      allDay,
      range,
    };
  });
}
