/**
 * Gadget Galli colours: "Peacock Teal + Marigold".
 *
 * One brand colour, peacock teal, with marigold gold as the highlight for offers, stars and counts. The mobile
 * theme, the admin panel's CSS, status chips and charts all take their values from here, and
 * __tests__/palette.test.ts checks the contrast of every text-on-colour pair (4.5:1 for text, 3:1 for icons).
 *
 * Rules:
 * - `primary` (teal-600) is for links, chips, tabs and icons; `action` (teal-700) fills every buy surface
 *   (cart bar, Add, stepper, "Call shop to order", "Pay by UPI"), dark enough for 82%-white captions.
 * - Marigold is never a button and never sits behind white text.
 * - Dark mode turns filled colours bright and the text on them dark.
 */
import type { OrderStatus } from './constants';

export const teal = {
  50: '#E8F5F5',
  100: '#CDEDED',
  200: '#9DDADA',
  300: '#5FC0C1',
  400: '#2AA3A7',
  500: '#0E8C91', // decoration only: white text on it is 4.06:1
  600: '#0B7A80',
  700: '#08656B',
  800: '#064F55',
  900: '#053D42',
  950: '#03282C',
} as const;

export const marigold = {
  50: '#FFF8E6',
  100: '#FFEEC2',
  200: '#FFDF8A',
  300: '#FFCD4D',
  400: '#FFC026',
  500: '#FFB300',
  600: '#E89E00',
  700: '#B97900',
  800: '#8A5800',
  900: '#5C3B00',
} as const;

/** Neutrals with a slight teal bias. */
export const grey = {
  50: '#F4F7F7',
  100: '#EEF3F3',
  200: '#DCE5E5',
  300: '#C3D1D2',
  400: '#8FA3A5',
  500: '#5F7275',
  600: '#475A5D',
  700: '#33464A',
  800: '#1C3134',
  900: '#0C1D1F',
  950: '#061314',
} as const;

/** Supporting hues for category families, statuses and charts. */
export const extra = {
  leaf: '#237A2E',
  lagoon: '#1F64AD',
  plum: '#7A3E9D',
  saffron: '#D9730D',
  amber: '#B45309',
  red: '#C62828',
  ink: '#0E1B1D',
  whatsapp: '#25D366',
} as const;

export type ColorMode = 'light' | 'dark';

export interface ThemeTokens {
  background: string;
  surface: string;
  elevated: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  border: string;
  divider: string;
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  onPrimary: string;
  action: string;
  actionPressed: string;
  actionSoft: string;
  onAction: string;
  accent: string;
  accentPressed: string;
  accentSoft: string;
  /** Marigold-family text that reads on light surfaces (offers, OTP digits, "Lowest price"). */
  accentInk: string;
  onAccent: string;
  /** The "% off" text. */
  offer: string;
  success: string;
  successSoft: string;
  onSuccess: string;
  warning: string;
  warningSoft: string;
  onWarning: string;
  error: string;
  errorSoft: string;
  onError: string;
  whatsapp: string;
  onWhatsapp: string;
  /** Toasts and other dark-on-light surfaces. */
  inverse: string;
  onInverse: string;
  /** Text and icons on the brand gradients. */
  onBrand: string;
  onBrandMuted: string;
  star: string;
  skeleton: string;
  overlay: string;
  shadow: string;
}

export const lightTokens: ThemeTokens = {
  background: grey[50],
  surface: '#FFFFFF',
  elevated: '#FFFFFF',
  surfaceAlt: grey[100],
  text: extra.ink,
  textMuted: grey[600],
  textSubtle: grey[500],
  border: grey[200],
  divider: '#E8EEEE',
  primary: teal[600],
  primaryPressed: teal[700],
  primarySoft: teal[50],
  onPrimary: '#FFFFFF',
  action: teal[700],
  actionPressed: teal[800],
  actionSoft: teal[50],
  onAction: '#FFFFFF',
  accent: marigold[500],
  accentPressed: marigold[600],
  accentSoft: '#FFF3D6',
  accentInk: '#7A4E00',
  onAccent: extra.ink,
  offer: extra.leaf,
  success: extra.leaf,
  successSoft: '#EAF5EB',
  onSuccess: '#FFFFFF',
  warning: extra.amber,
  warningSoft: '#FFF6EA',
  onWarning: '#FFFFFF',
  error: extra.red,
  errorSoft: '#FDECEC',
  onError: '#FFFFFF',
  whatsapp: extra.whatsapp,
  onWhatsapp: '#073B20',
  inverse: extra.ink,
  onInverse: '#FFFFFF',
  onBrand: '#FFFFFF',
  onBrandMuted: 'rgba(255, 255, 255, 0.85)',
  star: marigold[500],
  skeleton: '#E3EBEB',
  overlay: 'rgba(3, 40, 44, 0.55)',
  shadow: '#0A2E31',
};

export const darkTokens: ThemeTokens = {
  background: grey[950],
  surface: grey[900],
  elevated: '#10252A',
  surfaceAlt: '#132A2D',
  text: '#E6F2F1',
  textMuted: '#A7BDBD',
  textSubtle: '#86A0A1',
  border: '#1F3B3F',
  divider: '#17302F',
  primary: '#33C2C8',
  primaryPressed: '#2AAEB4',
  primarySoft: '#0E3236',
  onPrimary: '#022A2C',
  action: '#33C2C8',
  actionPressed: '#2AAEB4',
  actionSoft: '#0E3236',
  onAction: '#022A2C',
  accent: '#FFC233',
  accentPressed: marigold[500],
  accentSoft: '#3A2C06',
  accentInk: '#FFCF5C',
  onAccent: '#1F1600',
  offer: '#7AD68C',
  success: '#5BC97A',
  successSoft: '#10301A',
  onSuccess: '#05230F',
  warning: '#F0A53C',
  warningSoft: '#3A2608',
  onWarning: '#2A1700',
  error: '#FF7A7A',
  errorSoft: '#3B1515',
  onError: '#2B0505',
  whatsapp: extra.whatsapp,
  onWhatsapp: '#073B20',
  inverse: '#E6F2F1',
  onInverse: extra.ink,
  onBrand: '#FFFFFF',
  onBrandMuted: 'rgba(255, 255, 255, 0.85)',
  star: '#FFC233',
  skeleton: '#17302F',
  overlay: 'rgba(0, 0, 0, 0.6)',
  shadow: '#000000',
};

export const themeTokens: Record<ColorMode, ThemeTokens> = { light: lightTokens, dark: darkTokens };

/** Two-stop gradients (start → end). Text on them uses `onBrand` unless noted. */
export interface Gradients {
  header: [string, string];
  partnerHeader: [string, string];
  /** Sticky cart bar; dark mode uses dark text (`onAction`). */
  cartBar: [string, string];
  /** Shop open/closed cards: every line in full white (85% white is too faint here). */
  open: [string, string];
  closed: [string, string];
}

export const gradients: Record<ColorMode, Gradients> = {
  light: {
    header: [teal[800], teal[700]],
    partnerHeader: [teal[950], teal[800]],
    cartBar: [teal[800], teal[700]],
    open: ['#1B5E25', extra.leaf],
    closed: ['#8E1C1C', extra.red],
  },
  dark: {
    header: ['#082C30', '#0B3B40'],
    partnerHeader: ['#041A1C', '#082C30'],
    cartBar: ['#33C2C8', '#5FD0D4'],
    open: ['#1B5E25', extra.leaf],
    closed: ['#8E1C1C', extra.red],
  },
};

export type FamilyKey = 'peacock' | 'marigold' | 'lagoon' | 'plum' | 'leaf';

export interface FamilyColors {
  /** Tile background, and the second stop of the placeholder diagonal. */
  tint: string;
  tint2: string;
  /** Icon (and short label) colour on the tint. */
  icon: string;
}

export interface CategoryFamily {
  key: FamilyKey;
  light: FamilyColors;
  dark: FamilyColors;
  /** Shop-cover gradient; nothing is written on it. */
  cover: [string, string];
}

/** One colour family per top-level category (and shop type), so the same kind of product always looks alike. */
export const families: Record<FamilyKey, CategoryFamily> = {
  peacock: {
    key: 'peacock',
    light: { tint: '#E3F4F4', tint2: '#CDEDED', icon: teal[700] },
    dark: { tint: '#0E3236', tint2: '#124046', icon: '#5FD0D4' },
    cover: [teal[800], teal[500]],
  },
  marigold: {
    key: 'marigold',
    light: { tint: '#FFF3D6', tint2: '#FFE7AD', icon: '#7A4E00' },
    dark: { tint: '#3A2C06', tint2: '#4A3808', icon: '#FFCF5C' },
    cover: [marigold[900], marigold[700]],
  },
  lagoon: {
    key: 'lagoon',
    light: { tint: '#E6F0FA', tint2: '#CFE2F6', icon: '#1C5A9C' },
    dark: { tint: '#10263D', tint2: '#163252', icon: '#8CBDF0' },
    cover: ['#123E6E', extra.lagoon],
  },
  plum: {
    key: 'plum',
    light: { tint: '#F3EAF8', tint2: '#E6D3F0', icon: '#6A3489' },
    dark: { tint: '#2C1A38', tint2: '#3A2349', icon: '#D3A6EE' },
    cover: ['#4B2366', extra.plum],
  },
  leaf: {
    key: 'leaf',
    light: { tint: '#E7F4E8', tint2: '#CFE9D2', icon: '#1F6B2A' },
    dark: { tint: '#10301A', tint2: '#163D22', icon: '#7AD68C' },
    cover: ['#1B5E25', '#2E8B3A'],
  },
};

const FAMILY_BY_SLUG: Record<string, FamilyKey> = {
  mobiles: 'peacock',
  'cctv-security': 'marigold',
  'laptops-computers': 'lagoon',
  components: 'plum',
  peripherals: 'leaf',
};

const FAMILY_BY_SHOP_TYPE: Record<string, FamilyKey> = {
  mobiles: 'peacock',
  cctv_security: 'marigold',
  computers_laptops: 'lagoon',
  components_peripherals: 'plum',
};

const FAMILY_ORDER: FamilyKey[] = ['peacock', 'marigold', 'lagoon', 'plum', 'leaf'];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * The colour family for a top-level category slug or a shop type. Anything unknown gets a stable
 * family picked from `fallbackSeed` (a name or id), so it never changes between visits.
 */
export function familyFor(key: string | null | undefined, fallbackSeed = ''): CategoryFamily {
  const k = key ?? '';
  const found = FAMILY_BY_SLUG[k] ?? FAMILY_BY_SHOP_TYPE[k];
  if (found) return families[found];
  return families[FAMILY_ORDER[hashString(fallbackSeed || k) % FAMILY_ORDER.length]];
}

/** Shop-logo fallback colours; white initials read on all of them. */
export const avatarColors = [teal[600], marigold[800], extra.lagoon, extra.plum, extra.leaf, extra.amber] as const;

export function avatarColor(seed: string): string {
  return avatarColors[hashString(seed) % avatarColors.length];
}

/** Series colours for charts, KPI icons and confetti, in order of use. */
export const chartColors = [teal[600], marigold[600], extra.lagoon, extra.leaf, extra.plum, extra.saffron] as const;

export interface BannerPreset {
  key: string;
  /** The colour stored in banners.bg_color that picks this preset. */
  color: string;
  label: string;
  gradient: [string, string];
  /** Text colour on the gradient. */
  text: string;
}

/** The home-banner colours the admin can choose; each draws a gradient with readable text. */
export const bannerPresets: BannerPreset[] = [
  { key: 'peacock', color: teal[600], label: 'Peacock', gradient: [teal[800], teal[600]], text: '#FFFFFF' },
  { key: 'midnight', color: teal[950], label: 'Midnight', gradient: [teal[950], teal[700]], text: '#FFFFFF' },
  { key: 'marigold', color: marigold[500], label: 'Marigold', gradient: [marigold[400], marigold[500]], text: extra.ink },
  { key: 'leaf', color: extra.leaf, label: 'Leaf', gradient: ['#1B5E25', extra.leaf], text: '#FFFFFF' },
  { key: 'lagoon', color: extra.lagoon, label: 'Lagoon', gradient: ['#123E6E', extra.lagoon], text: '#FFFFFF' },
  { key: 'plum', color: extra.plum, label: 'Plum', gradient: ['#4B2366', extra.plum], text: '#FFFFFF' },
  { key: 'pearl', color: teal[50], label: 'Pearl', gradient: [teal[50], teal[100]], text: extra.ink },
];

/** Banner colours from before the redesign, mapped to the new presets. */
const LEGACY_BANNER: Record<string, string> = {
  '#4F46E5': 'peacock',
  '#0F172A': 'midnight',
  '#FF6B35': 'marigold',
  '#16A34A': 'leaf',
};

/** The gradient and text colour for a banner's stored colour. Unknown colours get a darker second stop. */
export function bannerStyle(color: string | null | undefined): { gradient: [string, string]; text: string } {
  const c = (color ?? '').trim().toUpperCase();
  const key = LEGACY_BANNER[c];
  const preset = bannerPresets.find((p) => p.color.toUpperCase() === c || p.key === key);
  if (preset) return { gradient: preset.gradient, text: preset.text };
  if (!/^#[0-9A-F]{6}$/.test(c)) return { gradient: bannerPresets[0].gradient, text: bannerPresets[0].text };
  return { gradient: [c, shade(c, 0.28)], text: readableOn(c) };
}

/** Status chip colours: background, text and the small dot. */
export interface StatusColor {
  bg: string;
  fg: string;
  dot: string;
}

export const statusPalette: Record<ColorMode, Record<OrderStatus, StatusColor>> = {
  light: {
    REQUESTED: { bg: '#FFF3D6', fg: '#7A4E00', dot: marigold[600] },
    CONFIRMED: { bg: teal[50], fg: teal[700], dot: teal[600] },
    PAID: { bg: '#E6F0FA', fg: '#1C5A9C', dot: extra.lagoon },
    PACKED: { bg: '#F3EAF8', fg: '#6A3489', dot: extra.plum },
    DISPATCHED: { bg: '#FFEEDD', fg: '#8F4200', dot: extra.saffron },
    DELIVERED: { bg: '#EAF5EB', fg: '#1F6B2A', dot: extra.leaf },
    REJECTED: { bg: '#FDECEC', fg: '#A12222', dot: extra.red },
    CANCELLED: { bg: grey[100], fg: grey[600], dot: grey[500] },
    EXPIRED: { bg: grey[100], fg: grey[600], dot: grey[400] },
    ISSUE_REPORTED: { bg: '#FDECEC', fg: '#A12222', dot: extra.red },
  },
  dark: {
    REQUESTED: { bg: '#3A2C06', fg: '#FFCF5C', dot: '#FFC233' },
    CONFIRMED: { bg: '#0E3236', fg: '#5FD0D4', dot: '#33C2C8' },
    PAID: { bg: '#10263D', fg: '#8CBDF0', dot: '#5B9BE0' },
    PACKED: { bg: '#2C1A38', fg: '#D3A6EE', dot: '#B57BDB' },
    DISPATCHED: { bg: '#3A2410', fg: '#FFB27A', dot: '#F08A3C' },
    DELIVERED: { bg: '#10301A', fg: '#7AD68C', dot: '#5BC97A' },
    REJECTED: { bg: '#3B1515', fg: '#FF8A8A', dot: '#FF7A7A' },
    CANCELLED: { bg: '#1A2C2E', fg: '#A7BDBD', dot: '#86A0A1' },
    EXPIRED: { bg: '#1A2C2E', fg: '#93AAAB', dot: grey[500] },
    ISSUE_REPORTED: { bg: '#3B1515', fg: '#FF8A8A', dot: '#FF7A7A' },
  },
};

export function statusColors(status: OrderStatus, dark = false): StatusColor {
  return statusPalette[dark ? 'dark' : 'light'][status];
}

// ---------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** WCAG relative luminance of a #RRGGBB colour. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #RRGGBB colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `fg` drawn at `alpha` opacity over `bg`, as a solid colour. */
export function blend(fg: string, bg: string, alpha: number): string {
  const f = parseHex(fg);
  const b = parseHex(bg);
  return toHex([0, 1, 2].map((i) => f[i] * alpha + b[i] * (1 - alpha)) as [number, number, number]);
}

/** Darkens a colour towards black by `amount` (0 to 1). */
export function shade(hex: string, amount: number): string {
  return blend('#000000', hex, amount);
}

/** White or ink, whichever reads better on `bg`. */
export function readableOn(bg: string): string {
  return contrast('#FFFFFF', bg) >= contrast(extra.ink, bg) ? '#FFFFFF' : extra.ink;
}
