import {
  agoParts,
  dayParts,
  durationParts,
  openingState,
  trimNumber,
  type ShopHours,
  type Weekday,
} from '@gg/shared';

import { i18n } from './index';

/**
 * Translated versions of the English helpers in @gg/shared (timeAgo, formatDuration,
 * deliversInText, openingHint, weekday labels). Components that call these also use
 * useTranslation(), so they re-render when the language changes.
 */
const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts);

export function tAgo(date: Date | string | number): string {
  const p = agoParts(date);
  if (p.kind === 'now') return t('time.justNow');
  if (p.kind === 'mins') return t('time.minsAgo', { n: p.n });
  if (p.kind === 'hours') return p.n === 1 ? t('time.hourAgo') : t('time.hoursAgo', { n: p.n });
  return p.n === 1 ? t('time.dayAgo') : t('time.daysAgo', { n: p.n });
}

export function tDuration(mins: number | null | undefined): string {
  const p = durationParts(mins);
  if (!p) return '';
  if (p.kind === 'sameDay') return t('time.sameDay');
  if (p.kind === 'mins') return t('time.mins', { n: p.n });
  return p.n === 1 ? t('time.hour') : t('time.hours', { n: trimNumber(p.n) });
}

export function tDeliversIn(mins: number | null | undefined): string {
  const p = durationParts(mins);
  if (!p) return '';
  if (p.kind === 'sameDay') return t('time.deliversSameDay');
  return t('time.deliversIn', { time: tDuration(mins) });
}

export function tWeekday(day: Weekday, short = false): string {
  return t(`${short ? 'weekdayShort' : 'weekday'}.${day}`);
}

export function tOpening(hours: ShopHours | null | undefined, manualOpen: boolean): string {
  const s = openingState(hours, manualOpen);
  switch (s.kind) {
    case 'open24':
      return t('time.open24');
    case 'openUntil':
      return t('time.openUntil', { time: s.time });
    case 'openNow':
      return t('time.openNow');
    case 'closedNow':
      return t('time.closedNow');
    case 'opensToday':
      return t('time.opensToday', { time: s.time });
    case 'opensTomorrow':
      return t('time.opensTomorrow', { time: s.time });
    case 'opensOn':
      return t('time.opensOn', { day: tWeekday(s.day), time: s.time });
    default:
      return t('time.closed');
  }
}

/** "Today, 3:45 PM" / "Yesterday, …" / "8 Oct, 3:45 PM" in the app language (IST). */
export function tDateTime(date: Date | string | number): string {
  const d = dayParts(date);
  if (d.day === 'today') return t('time.today', { time: d.time });
  if (d.day === 'yesterday') return t('time.yesterday', { time: d.time });
  return `${d.date}, ${d.time}`;
}
