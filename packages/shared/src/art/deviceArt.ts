// Product illustrations for listings without a photo: a flat drawing of the device for each category (phone, laptop,
// graphics card, CCTV camera…), coloured per brand so neighbouring products don't look identical. Returns plain SVG
// markup, so the mobile apps (react-native-svg SvgXml) and the admin panel (<img src="data:…">) share one source.

export type DeviceKind =
  | 'phone'
  | 'tablet'
  | 'watch'
  | 'earbuds'
  | 'headphones'
  | 'headset'
  | 'charger'
  | 'cable'
  | 'phoneCase'
  | 'screenGuard'
  | 'powerBank'
  | 'cctvCamera'
  | 'dvr'
  | 'hdd'
  | 'powerSupply'
  | 'coaxCable'
  | 'doorPhone'
  | 'cctvKit'
  | 'tools'
  | 'laptop'
  | 'desktop'
  | 'allInOne'
  | 'monitor'
  | 'gpu'
  | 'cpu'
  | 'motherboard'
  | 'ram'
  | 'ssd'
  | 'psu'
  | 'cabinet'
  | 'cooler'
  | 'keyboard'
  | 'mouse'
  | 'webcam'
  | 'printer'
  | 'router'
  | 'ups'
  | 'speaker'
  | 'box';

/** Category slug (sub-category or top level) → what to draw. */
const KIND_BY_SLUG: Record<string, DeviceKind> = {
  mobiles: 'phone',
  smartphones: 'phone',
  tablets: 'tablet',
  smartwatches: 'watch',
  earbuds: 'earbuds',
  chargers: 'charger',
  cables: 'cable',
  cases: 'phoneCase',
  'screen-guards': 'screenGuard',
  'power-banks': 'powerBank',
  'cctv-security': 'cctvCamera',
  'cctv-cameras': 'cctvCamera',
  'dvr-nvr': 'dvr',
  'surveillance-hdd': 'hdd',
  'cctv-power': 'powerSupply',
  'cctv-cables': 'coaxCable',
  'video-door-phones': 'doorPhone',
  'cctv-kits': 'cctvKit',
  'installation-service': 'tools',
  'laptops-computers': 'laptop',
  laptops: 'laptop',
  desktops: 'desktop',
  'all-in-ones': 'allInOne',
  monitors: 'monitor',
  components: 'gpu',
  'graphics-cards': 'gpu',
  processors: 'cpu',
  motherboards: 'motherboard',
  ram: 'ram',
  storage: 'ssd',
  psu: 'psu',
  cabinets: 'cabinet',
  coolers: 'cooler',
  peripherals: 'keyboard',
  keyboards: 'keyboard',
  mice: 'mouse',
  headsets: 'headset',
  webcams: 'webcam',
  printers: 'printer',
  routers: 'router',
  ups: 'ups',
  speakers: 'speaker',
};

/** Guesses from the product name when the category is unknown (order items, for example). First match wins. */
const KIND_BY_NAME: [RegExp, DeviceKind][] = [
  [/\b(case|cover)\b/, 'phoneCase'],
  [/screen guard|tempered glass|screen protector/, 'screenGuard'],
  [/power ?bank/, 'powerBank'],
  [/door ?phone|video door/, 'doorPhone'],
  [/\bkit\b.*(cctv|camera)|(cctv|camera).*\bkit\b/, 'cctvKit'],
  [/\b(dvr|nvr)\b/, 'dvr'],
  [/install/, 'tools'],
  [/surveillance|purple|skyhawk/, 'hdd'],
  [/\b(ssd|nvme|m\.2|hard disk|hdd)\b/, 'ssd'],
  [/rtx|gtx|radeon|graphics card|\brx ?\d{4}/, 'gpu'],
  [/ryzen|core i[3579]|processor|\bcpu\b|threadripper|pentium|celeron/, 'cpu'],
  [/motherboard|\b[abhxz]\d{3}m?\b/, 'motherboard'],
  [/\bddr[345]\b|\bram\b|memory module/, 'ram'],
  [/smps|\bpsu\b|power supply|80\+/, 'psu'],
  [/cabinet|tower case|mid tower/, 'cabinet'],
  [/cooler|\baio\b|liquid cool/, 'cooler'],
  [/keyboard/, 'keyboard'],
  [/\bmouse\b/, 'mouse'],
  [/headset/, 'headset'],
  [/headphone/, 'headphones'],
  [/earbud|buds|airpods|\btws\b/, 'earbuds'],
  [/smart ?watch|\bwatch\b/, 'watch'],
  [/webcam/, 'webcam'],
  [/printer/, 'printer'],
  [/router|wi-?fi|mesh|access point/, 'router'],
  [/\bups\b|inverter/, 'ups'],
  [/speaker|soundbar/, 'speaker'],
  [/charger|adapter/, 'charger'],
  [/cable|cord/, 'cable'],
  [/camera|cctv|dome|bullet/, 'cctvCamera'],
  [/monitor/, 'monitor'],
  [/all-in-one|\baio pc\b|imac/, 'allInOne'],
  [/desktop|gaming pc/, 'desktop'],
  [/tablet|ipad|\btab\b/, 'tablet'],
  [/laptop|notebook|macbook|thinkpad|vivobook|ideapad|zenbook|pavilion|inspiron|victus|nitro|legion/, 'laptop'],
  [/phone|iphone|galaxy|redmi|pixel|oneplus|vivo|oppo|realme|poco|nothing/, 'phone'],
];

export function deviceKindFor(slug: string | null | undefined, name = ''): DeviceKind {
  if (slug && KIND_BY_SLUG[slug]) return KIND_BY_SLUG[slug];
  const n = name.toLowerCase();
  return KIND_BY_NAME.find(([re]) => re.test(n))?.[1] ?? 'box';
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------
interface Body {
  base: string;
  light: string;
  dark: string;
  /** Text / detail colour that reads on this body. */
  ink: string;
}
const BODIES: Record<'graphite' | 'silver' | 'midnight' | 'white', Body> = {
  graphite: { base: '#2B3440', light: '#435064', dark: '#161B22', ink: '#E7ECF2' },
  silver: { base: '#D3D9E1', light: '#F1F4F7', dark: '#A7B1BD', ink: '#2B3440' },
  midnight: { base: '#23324F', light: '#3A5280', dark: '#121B2E', ink: '#E2E8F5' },
  white: { base: '#EEF1F5', light: '#FFFFFF', dark: '#CBD3DD', ink: '#2B3440' },
};
const ACCENTS: [string, string][] = [
  ['#2BB3A8', '#0E5E6F'],
  ['#9B7BFF', '#3E2A9C'],
  ['#FBB040', '#E2455C'],
  ['#4CC3FF', '#1E4FC2'],
  ['#7BD66B', '#13806E'],
  ['#FF7AA8', '#7A2BC2'],
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface DeviceArtOptions {
  kind: DeviceKind;
  /** Brand + model, used to vary the colours. */
  seed?: string;
  /** Dark theme: slightly deeper shadows. */
  dark?: boolean;
}

/** SVG markup (viewBox 0 0 120 120, transparent background) for a product without a photo. */
export function deviceArtSvg({ kind, seed = '', dark = false }: DeviceArtOptions): string {
  const h = hash(`${kind}|${seed}`);
  const [a1, a2] = ACCENTS[h % ACCENTS.length]!;
  const bodyKey = (['graphite', 'silver', 'midnight', 'white'] as const)[(h >>> 4) % 4]!;
  const body = DEFAULT_BODY[kind] ? BODIES[DEFAULT_BODY[kind]!(h)] : BODIES[bodyKey];
  const id = `gg${kind}${h % 997}`;
  const c: Ctx = { id, a1, a2, b: body, shadow: dark ? 0.32 : 0.14 };
  const inner = (DRAW[kind] ?? DRAW.box)(c);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs>${defs(c)}</defs>${inner}</svg>`;
}

/** The same drawing as a data: URI, for <img src> on the web. */
export function deviceArtDataUri(opts: DeviceArtOptions): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(deviceArtSvg(opts))}`;
}

// Some devices look wrong in some colours (a white graphics card, a silver keyboard is fine…).
const DEFAULT_BODY: Partial<Record<DeviceKind, (h: number) => keyof typeof BODIES>> = {
  gpu: (h) => (h % 3 === 0 ? 'midnight' : 'graphite'),
  cpu: () => 'silver',
  motherboard: () => 'graphite',
  ram: (h) => (h % 2 ? 'graphite' : 'midnight'),
  psu: () => 'graphite',
  cabinet: (h) => (h % 3 === 0 ? 'white' : 'graphite'),
  cctvCamera: () => 'white',
  cctvKit: () => 'white',
  dvr: () => 'graphite',
  hdd: () => 'silver',
  powerSupply: () => 'graphite',
  router: (h) => (h % 2 ? 'white' : 'graphite'),
  printer: (h) => (h % 2 ? 'white' : 'graphite'),
  ups: () => 'graphite',
  charger: (h) => (h % 2 ? 'white' : 'graphite'),
  doorPhone: () => 'white',
  tools: () => 'graphite',
  webcam: () => 'graphite',
};

interface Ctx {
  id: string;
  a1: string;
  a2: string;
  b: Body;
  shadow: number;
}

function defs({ id, a1, a2, b }: Ctx): string {
  return [
    `<linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a1}"/><stop offset="1" stop-color="${a2}"/></linearGradient>`,
    `<linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b.light}"/><stop offset="1" stop-color="${b.base}"/></linearGradient>`,
    `<linearGradient id="${id}d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b.base}"/><stop offset="1" stop-color="${b.dark}"/></linearGradient>`,
    `<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F6D27A"/><stop offset="1" stop-color="#C8962E"/></linearGradient>`,
    `<linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3F5F8"/><stop offset="1" stop-color="#AEB8C4"/></linearGradient>`,
  ].join('');
}

const S = (c: Ctx) => `url(#${c.id}s)`; // screen / accent gradient
const B = (c: Ctx) => `url(#${c.id}b)`; // body, light at the top
const D = (c: Ctx) => `url(#${c.id}d)`; // body, darker
const G = (c: Ctx) => `url(#${c.id}g)`; // gold contacts
const M = (c: Ctx) => `url(#${c.id}m)`; // brushed metal

const shadow = (c: Ctx, cx: number, cy: number, rx: number, ry = 4) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#0B1220" opacity="${c.shadow}"/>`;
/** Soft shapes on a screen so it doesn't look blank. */
const wallpaper = (x: number, y: number, w: number, hgt: number) =>
  `<circle cx="${x + w * 0.78}" cy="${y + hgt * 0.22}" r="${Math.min(w, hgt) * 0.42}" fill="#FFFFFF" opacity="0.16"/>` +
  `<circle cx="${x + w * 0.18}" cy="${y + hgt * 0.82}" r="${Math.min(w, hgt) * 0.5}" fill="#FFFFFF" opacity="0.10"/>`;
const fan = (cx: number, cy: number, r: number, hub: string, blade: string, ring?: string) => {
  const blades = [0, 72, 144, 216, 288]
    .map(
      (deg) =>
        `<path d="M${cx} ${cy} q${(r * 0.55).toFixed(1)} ${(-r * 0.2).toFixed(1)} ${(r * 0.78).toFixed(1)} ${(-r * 0.62).toFixed(1)} q${(-r * 0.42).toFixed(1)} ${(r * 0.02).toFixed(1)} ${(-r * 0.78).toFixed(1)} ${(r * 0.62).toFixed(1)}z" fill="${blade}" transform="rotate(${deg} ${cx} ${cy})"/>`,
    )
    .join('');
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#0E131A"/>` +
    (ring ? `<circle cx="${cx}" cy="${cy}" r="${r - 0.8}" fill="none" stroke="${ring}" stroke-width="1.6" opacity="0.9"/>` : '') +
    blades +
    `<circle cx="${cx}" cy="${cy}" r="${r * 0.28}" fill="${hub}"/>`
  );
};

const DRAW: Record<DeviceKind, (c: Ctx) => string> = {
  phone: (c) =>
    shadow(c, 60, 106, 22) +
    `<rect x="37" y="10" width="46" height="92" rx="10" fill="${D(c)}"/>` +
    `<rect x="39.5" y="12.5" width="41" height="87" rx="8" fill="${S(c)}"/>` +
    wallpaper(39.5, 12.5, 41, 87) +
    `<rect x="53" y="16" width="14" height="4" rx="2" fill="#0B0F14"/>` +
    `<rect x="45" y="80" width="30" height="8" rx="4" fill="#FFFFFF" opacity="0.28"/>` +
    `<rect x="44" y="30" width="20" height="3" rx="1.5" fill="#FFFFFF" opacity="0.6"/>` +
    `<rect x="44" y="36" width="12" height="2.4" rx="1.2" fill="#FFFFFF" opacity="0.45"/>` +
    `<rect x="83" y="30" width="1.6" height="12" rx="0.8" fill="${c.b.dark}"/>`,
  tablet: (c) =>
    shadow(c, 60, 98, 42) +
    `<rect x="14" y="24" width="92" height="66" rx="8" fill="${D(c)}"/>` +
    `<rect x="17.5" y="27.5" width="85" height="59" rx="5" fill="${S(c)}"/>` +
    wallpaper(17.5, 27.5, 85, 59) +
    `<rect x="24" y="36" width="28" height="4" rx="2" fill="#FFFFFF" opacity="0.6"/>` +
    `<rect x="24" y="44" width="18" height="3" rx="1.5" fill="#FFFFFF" opacity="0.45"/>` +
    [0, 1, 2, 3].map((i) => `<rect x="${24 + i * 18}" y="70" width="12" height="9" rx="3" fill="#FFFFFF" opacity="0.3"/>`).join(''),
  watch: (c) =>
    shadow(c, 60, 108, 18) +
    `<rect x="48" y="8" width="24" height="30" rx="6" fill="${S(c)}" opacity="0.85"/>` +
    `<rect x="48" y="82" width="24" height="24" rx="6" fill="${S(c)}" opacity="0.85"/>` +
    `<rect x="36" y="30" width="48" height="58" rx="14" fill="${D(c)}"/>` +
    `<rect x="40" y="34" width="40" height="50" rx="11" fill="#0B0F14"/>` +
    `<circle cx="60" cy="59" r="16" fill="none" stroke="${S(c)}" stroke-width="5" stroke-dasharray="70 31" stroke-linecap="round"/>` +
    `<text x="60" y="63" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#FFFFFF" text-anchor="middle">10:09</text>` +
    `<rect x="84" y="50" width="4" height="12" rx="2" fill="${c.b.dark}"/>`,
  earbuds: (c) =>
    shadow(c, 60, 100, 34) +
    `<rect x="27" y="52" width="66" height="44" rx="22" fill="${B(c)}"/>` +
    `<path d="M27 70 h66" stroke="${c.b.dark}" stroke-width="1.2" opacity="0.6"/>` +
    `<circle cx="60" cy="84" r="2" fill="${c.a1}"/>` +
    `<g transform="rotate(-18 42 40)"><ellipse cx="42" cy="34" rx="10" ry="11" fill="${B(c)}"/><rect x="38" y="40" width="8" height="22" rx="4" fill="${B(c)}"/><circle cx="42" cy="32" r="4.5" fill="${c.b.dark}" opacity="0.7"/></g>` +
    `<g transform="rotate(18 78 40)"><ellipse cx="78" cy="34" rx="10" ry="11" fill="${B(c)}"/><rect x="74" y="40" width="8" height="22" rx="4" fill="${B(c)}"/><circle cx="78" cy="32" r="4.5" fill="${c.b.dark}" opacity="0.7"/></g>`,
  headphones: (c) => DRAW.headset(c).replace(/<path data-mic[^>]*\/>/, ''),
  headset: (c) =>
    shadow(c, 60, 106, 34) +
    `<path d="M24 66 C24 30 96 30 96 66" fill="none" stroke="${D(c)}" stroke-width="9" stroke-linecap="round"/>` +
    `<path d="M30 60 C32 38 88 38 90 60" fill="none" stroke="${S(c)}" stroke-width="3" stroke-linecap="round" opacity="0.8"/>` +
    `<rect x="14" y="58" width="24" height="38" rx="11" fill="${D(c)}"/><rect x="20" y="62" width="14" height="30" rx="7" fill="${S(c)}" opacity="0.9"/>` +
    `<rect x="82" y="58" width="24" height="38" rx="11" fill="${D(c)}"/><rect x="86" y="62" width="14" height="30" rx="7" fill="${S(c)}" opacity="0.9"/>` +
    `<path data-mic="1" d="M24 90 C30 106 44 106 52 100" fill="none" stroke="${c.b.dark}" stroke-width="3.5" stroke-linecap="round"/>`,
  charger: (c) =>
    shadow(c, 56, 104, 26) +
    `<rect x="52" y="12" width="4" height="16" rx="1.5" fill="${M(c)}"/><rect x="64" y="12" width="4" height="16" rx="1.5" fill="${M(c)}"/>` +
    `<rect x="36" y="26" width="48" height="54" rx="10" fill="${B(c)}"/>` +
    `<rect x="52" y="70" width="16" height="5" rx="2.5" fill="#0B0F14"/>` +
    `<path d="M60 75 C60 92 40 92 36 104" fill="none" stroke="${c.a2}" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="M57 44 l6 0 -5 9 7 0 -11 14 3 -10 -6 0z" fill="${c.a1}"/>`,
  cable: (c) =>
    shadow(c, 60, 104, 32) +
    `<path d="M30 80 C10 60 30 30 60 36 C92 42 100 72 80 82 C62 92 42 76 50 60 C58 46 82 54 76 68" fill="none" stroke="${S(c)}" stroke-width="6" stroke-linecap="round"/>` +
    `<rect x="18" y="80" width="18" height="12" rx="3" fill="${M(c)}" transform="rotate(-40 27 86)"/>` +
    `<rect x="70" y="64" width="16" height="10" rx="3" fill="${M(c)}" transform="rotate(60 78 69)"/>`,
  phoneCase: (c) =>
    shadow(c, 60, 106, 22) +
    `<rect x="35" y="9" width="50" height="95" rx="12" fill="${S(c)}"/>` +
    `<rect x="39" y="13" width="42" height="87" rx="9" fill="#FFFFFF" opacity="0.14"/>` +
    `<rect x="41" y="17" width="22" height="22" rx="7" fill="#0B0F14" opacity="0.85"/>` +
    `<circle cx="47.5" cy="23.5" r="4.2" fill="#2B3440" stroke="#5B6575" stroke-width="1"/><circle cx="56.5" cy="23.5" r="4.2" fill="#2B3440" stroke="#5B6575" stroke-width="1"/><circle cx="47.5" cy="32.5" r="4.2" fill="#2B3440" stroke="#5B6575" stroke-width="1"/>` +
    `<circle cx="57" cy="33" r="1.8" fill="#FDE68A"/>`,
  screenGuard: (c) =>
    shadow(c, 60, 106, 24) +
    DRAW.phone(c).replace(shadow(c, 60, 106, 22), '') +
    `<rect x="31" y="6" width="46" height="92" rx="10" fill="#FFFFFF" opacity="0.32" stroke="#FFFFFF" stroke-width="1.2"/>` +
    `<path d="M40 20 L58 6 M40 36 L72 8" stroke="#FFFFFF" stroke-width="3" opacity="0.6" stroke-linecap="round"/>`,
  powerBank: (c) =>
    shadow(c, 60, 104, 26) +
    `<rect x="38" y="16" width="44" height="84" rx="12" fill="${B(c)}"/>` +
    `<rect x="44" y="24" width="32" height="44" rx="6" fill="${S(c)}" opacity="0.92"/>` +
    `<path d="M57 34 l8 0 -6 10 8 0 -13 16 4 -12 -7 0z" fill="#FFFFFF" opacity="0.92"/>` +
    [0, 1, 2, 3].map((i) => `<circle cx="${51 + i * 6}" cy="78" r="2" fill="${i < 3 ? c.a1 : c.b.dark}"/>`).join('') +
    `<rect x="52" y="88" width="16" height="4" rx="2" fill="#0B0F14"/>`,
  cctvCamera: (c) =>
    shadow(c, 58, 106, 30) +
    `<rect x="54" y="60" width="10" height="30" rx="3" fill="${D(c)}"/>` +
    `<rect x="40" y="88" width="38" height="10" rx="4" fill="${D(c)}"/>` +
    `<g transform="rotate(-12 60 46)">` +
    `<rect x="18" y="30" width="78" height="34" rx="14" fill="${B(c)}"/>` +
    `<rect x="16" y="26" width="64" height="8" rx="4" fill="${D(c)}"/>` +
    `<circle cx="88" cy="47" r="13" fill="#0B0F14"/>` +
    `<circle cx="88" cy="47" r="8" fill="${S(c)}"/>` +
    `<circle cx="85" cy="44" r="2.5" fill="#FFFFFF" opacity="0.7"/>` +
    [0, 1, 2].map((i) => `<circle cx="${30 + i * 8}" cy="52" r="2" fill="${c.b.dark}" opacity="0.6"/>`).join('') +
    `</g>`,
  dvr: (c) =>
    shadow(c, 60, 92, 44) +
    `<rect x="14" y="48" width="92" height="38" rx="6" fill="${D(c)}"/>` +
    `<rect x="14" y="48" width="92" height="8" rx="4" fill="${c.b.light}" opacity="0.5"/>` +
    [0, 1, 2, 3].map((i) => `<circle cx="${26 + i * 8}" cy="72" r="2.4" fill="${i % 2 ? c.a1 : '#4ADE80'}"/>`).join('') +
    `<rect x="64" y="66" width="34" height="10" rx="3" fill="#0B0F14"/>` +
    `<rect x="66" y="68" width="18" height="6" rx="2" fill="${S(c)}"/>` +
    `<rect x="36" y="18" width="48" height="26" rx="4" fill="#0B0F14"/>` +
    `<rect x="38" y="20" width="21" height="10" fill="${S(c)}" opacity="0.9"/><rect x="61" y="20" width="21" height="10" fill="${S(c)}" opacity="0.6"/>` +
    `<rect x="38" y="32" width="21" height="10" fill="${S(c)}" opacity="0.6"/><rect x="61" y="32" width="21" height="10" fill="${S(c)}" opacity="0.9"/>`,
  hdd: (c) =>
    shadow(c, 60, 104, 30) +
    `<rect x="30" y="14" width="60" height="86" rx="6" fill="${M(c)}"/>` +
    `<rect x="36" y="20" width="48" height="56" rx="4" fill="${S(c)}"/>` +
    `<circle cx="60" cy="44" r="15" fill="#FFFFFF" opacity="0.25"/>` +
    `<circle cx="60" cy="44" r="4" fill="#FFFFFF" opacity="0.7"/>` +
    `<rect x="40" y="62" width="40" height="4" rx="2" fill="#FFFFFF" opacity="0.6"/>` +
    [[34, 18], [86, 18], [34, 96], [86, 96]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="#8A95A3"/>`).join('') +
    `<rect x="36" y="82" width="48" height="10" rx="2" fill="#0B0F14" opacity="0.8"/>`,
  powerSupply: (c) =>
    shadow(c, 60, 98, 38) +
    `<rect x="22" y="30" width="76" height="60" rx="6" fill="${D(c)}"/>` +
    [0, 1, 2, 3, 4, 5].map((i) => `<rect x="${30 + i * 10}" y="38" width="6" height="12" rx="1.5" fill="${M(c)}"/>`).join('') +
    [0, 1, 2, 3, 4, 5].map((i) => `<circle cx="${33 + i * 10}" cy="56" r="1.8" fill="#0B0F14"/>`).join('') +
    `<circle cx="88" cy="78" r="2.6" fill="#4ADE80"/>` +
    `<rect x="30" y="72" width="40" height="8" rx="2" fill="${S(c)}"/>`,
  coaxCable: (c) =>
    shadow(c, 60, 102, 34) +
    `<ellipse cx="60" cy="64" rx="34" ry="26" fill="none" stroke="#1F2933" stroke-width="7"/>` +
    `<ellipse cx="60" cy="64" rx="26" ry="19" fill="none" stroke="#1F2933" stroke-width="7"/>` +
    `<ellipse cx="60" cy="64" rx="18" ry="12" fill="none" stroke="#1F2933" stroke-width="7"/>` +
    `<path d="M92 64 C102 64 104 40 94 32" fill="none" stroke="#1F2933" stroke-width="5" stroke-linecap="round"/>` +
    `<rect x="86" y="18" width="16" height="16" rx="3" fill="${M(c)}"/><rect x="90" y="12" width="8" height="8" rx="2" fill="${G(c)}"/>`,
  doorPhone: (c) =>
    shadow(c, 54, 104, 38) +
    `<rect x="12" y="26" width="70" height="56" rx="8" fill="${B(c)}"/>` +
    `<rect x="17" y="31" width="44" height="46" rx="4" fill="${S(c)}"/>` +
    `<circle cx="39" cy="50" r="9" fill="#FFFFFF" opacity="0.4"/><path d="M26 77 C28 64 50 64 52 77z" fill="#FFFFFF" opacity="0.4"/>` +
    [0, 1, 2].map((i) => `<circle cx="72" cy="${42 + i * 12}" r="3.5" fill="${c.b.dark}"/>`).join('') +
    `<rect x="86" y="40" width="22" height="58" rx="6" fill="${D(c)}"/>` +
    `<circle cx="97" cy="54" r="6" fill="#0B0F14"/><circle cx="97" cy="54" r="3" fill="${c.a1}"/>` +
    `<circle cx="97" cy="80" r="5" fill="${c.b.light}" stroke="${c.a1}" stroke-width="1.5"/>`,
  cctvKit: (c) =>
    shadow(c, 60, 104, 46) +
    `<rect x="18" y="80" width="84" height="18" rx="4" fill="#1F2933"/>` +
    [0, 1, 2].map((i) => `<circle cx="${28 + i * 7}" cy="89" r="1.8" fill="#4ADE80"/>`).join('') +
    `<path d="M24 56 a16 16 0 0 1 32 0z" fill="${B(c)}"/><rect x="22" y="56" width="36" height="6" rx="2" fill="${D(c)}"/>` +
    `<circle cx="40" cy="50" r="6" fill="#0B0F14"/><circle cx="40" cy="50" r="3" fill="${c.a1}"/>` +
    `<g transform="rotate(-10 82 44)"><rect x="62" y="36" width="40" height="18" rx="8" fill="${B(c)}"/><circle cx="100" cy="45" r="7" fill="#0B0F14"/><circle cx="100" cy="45" r="3.5" fill="${c.a1}"/></g>` +
    `<rect x="78" y="54" width="6" height="18" rx="2" fill="${D(c)}"/>`,
  tools: (c) =>
    shadow(c, 60, 104, 34) +
    `<g transform="rotate(45 60 60)"><rect x="54" y="18" width="12" height="70" rx="5" fill="${M(c)}"/><path d="M48 14 a14 14 0 1 0 24 0 l-6 8 h-12z" fill="${M(c)}"/></g>` +
    `<g transform="rotate(-45 60 60)"><rect x="56" y="14" width="8" height="46" rx="2" fill="${M(c)}"/><rect x="52" y="58" width="16" height="40" rx="7" fill="${S(c)}"/></g>`,
  laptop: (c) =>
    shadow(c, 60, 98, 50, 5) +
    `<rect x="22" y="22" width="76" height="52" rx="5" fill="${D(c)}"/>` +
    `<rect x="25.5" y="25.5" width="69" height="45" rx="2.5" fill="${S(c)}"/>` +
    wallpaper(25.5, 25.5, 69, 45) +
    `<rect x="31" y="32" width="24" height="3.5" rx="1.75" fill="#FFFFFF" opacity="0.6"/>` +
    `<rect x="31" y="39" width="16" height="2.8" rx="1.4" fill="#FFFFFF" opacity="0.45"/>` +
    `<path d="M12 78 L22 74 H98 L108 78 V82 Q108 86 104 86 H16 Q12 86 12 82Z" fill="${B(c)}"/>` +
    `<rect x="50" y="78" width="20" height="3" rx="1.5" fill="${c.b.dark}" opacity="0.6"/>`,
  desktop: (c) =>
    shadow(c, 62, 106, 30) +
    `<rect x="36" y="12" width="50" height="90" rx="6" fill="${D(c)}"/>` +
    `<rect x="41" y="18" width="34" height="78" rx="3" fill="#0B0F14" opacity="0.85"/>` +
    fan(58, 36, 11, c.b.light, c.a2, c.a1) +
    fan(58, 62, 11, c.b.light, c.a2, c.a1) +
    `<rect x="44" y="80" width="28" height="12" rx="2" fill="${S(c)}" opacity="0.5"/>` +
    `<circle cx="80" cy="20" r="2.2" fill="${c.a1}"/>` +
    [0, 1, 2, 3, 4].map((i) => `<rect x="78" y="${30 + i * 6}" width="5" height="2" rx="1" fill="${c.b.light}" opacity="0.6"/>`).join(''),
  allInOne: (c) =>
    shadow(c, 60, 104, 26) +
    `<rect x="14" y="16" width="92" height="64" rx="6" fill="${D(c)}"/>` +
    `<rect x="18" y="20" width="84" height="50" rx="3" fill="${S(c)}"/>` +
    wallpaper(18, 20, 84, 50) +
    `<rect x="14" y="70" width="92" height="10" rx="0" fill="${B(c)}"/>` +
    `<path d="M50 80 h20 l4 18 h-28z" fill="${D(c)}"/>` +
    `<rect x="36" y="96" width="48" height="6" rx="3" fill="${B(c)}"/>`,
  monitor: (c) =>
    shadow(c, 60, 104, 28) +
    `<rect x="10" y="18" width="100" height="62" rx="5" fill="${D(c)}"/>` +
    `<rect x="12.5" y="20.5" width="95" height="54" rx="3" fill="${S(c)}"/>` +
    wallpaper(12.5, 20.5, 95, 54) +
    `<rect x="20" y="30" width="30" height="4" rx="2" fill="#FFFFFF" opacity="0.55"/>` +
    `<rect x="54" y="80" width="12" height="16" fill="${D(c)}"/>` +
    `<path d="M38 96 h44 a4 4 0 0 1 4 4 v2 h-52 v-2 a4 4 0 0 1 4 -4z" fill="${B(c)}"/>`,
  gpu: (c) =>
    shadow(c, 60, 92, 50, 5) +
    `<rect x="98" y="34" width="12" height="46" rx="2" fill="${M(c)}"/>` +
    `<rect x="10" y="34" width="90" height="46" rx="7" fill="${D(c)}"/>` +
    `<path d="M10 72 h90 v1 a7 7 0 0 1 -7 7 h-76 a7 7 0 0 1 -7 -7z" fill="${S(c)}" opacity="0.9"/>` +
    fan(34, 55, 16, c.b.light, '#3A4452', c.a1) +
    fan(76, 55, 16, c.b.light, '#3A4452', c.a1) +
    `<rect x="24" y="80" width="56" height="6" rx="1" fill="${G(c)}"/>` +
    `<rect x="44" y="36" width="20" height="3" rx="1.5" fill="${c.a1}" opacity="0.8"/>`,
  cpu: (c) =>
    shadow(c, 60, 104, 36) +
    `<rect x="20" y="20" width="80" height="80" rx="6" fill="#1E5631"/>` +
    `<rect x="22" y="22" width="76" height="76" rx="5" fill="none" stroke="${G(c)}" stroke-width="2" stroke-dasharray="2 2"/>` +
    `<rect x="32" y="32" width="56" height="56" rx="6" fill="${M(c)}"/>` +
    `<rect x="40" y="52" width="40" height="5" rx="2.5" fill="${S(c)}"/>` +
    `<rect x="40" y="62" width="26" height="3.5" rx="1.75" fill="#7C8796"/>` +
    `<rect x="40" y="42" width="16" height="5" rx="2" fill="#7C8796"/>`,
  motherboard: (c) =>
    shadow(c, 60, 106, 42) +
    `<rect x="18" y="12" width="84" height="92" rx="4" fill="#1A2230"/>` +
    `<rect x="30" y="22" width="30" height="30" rx="3" fill="${M(c)}"/><rect x="36" y="28" width="18" height="18" rx="2" fill="#AEB8C4"/>` +
    [0, 1, 2, 3].map((i) => `<rect x="${68 + i * 6}" y="20" width="3" height="40" rx="1" fill="${i % 2 ? c.a1 : c.b.light}"/>`).join('') +
    `<rect x="26" y="64" width="64" height="5" rx="1.5" fill="${S(c)}"/>` +
    `<rect x="26" y="78" width="64" height="4" rx="1.5" fill="#4B5563"/>` +
    `<rect x="22" y="88" width="20" height="10" rx="2" fill="${D(c)}"/>` +
    `<rect x="18" y="12" width="8" height="40" rx="2" fill="${D(c)}"/>` +
    `<circle cx="96" cy="96" r="3" fill="${c.a1}"/>`,
  ram: (c) =>
    shadow(c, 60, 92, 50, 4) +
    `<rect x="8" y="40" width="104" height="40" rx="4" fill="${D(c)}"/>` +
    `<path d="M8 44 h104 v-6 l-6 -6 h-16 l-4 4 h-20 l-4 -4 h-20 l-4 4 h-20 l-4 -4 h-6 z" fill="${S(c)}"/>` +
    `<rect x="16" y="50" width="88" height="14" rx="2" fill="#0B0F14" opacity="0.4"/>` +
    `<rect x="20" y="54" width="30" height="4" rx="2" fill="${c.b.light}" opacity="0.7"/>` +
    `<rect x="12" y="80" width="96" height="6" fill="${G(c)}"/>` +
    `<rect x="56" y="80" width="4" height="6" fill="${c.b.dark}"/>`,
  ssd: (c) =>
    shadow(c, 60, 98, 38) +
    `<rect x="22" y="24" width="76" height="68" rx="6" fill="${D(c)}"/>` +
    `<rect x="22" y="24" width="76" height="68" rx="6" fill="#FFFFFF" opacity="0.06"/>` +
    `<rect x="30" y="34" width="60" height="26" rx="3" fill="${S(c)}"/>` +
    `<rect x="36" y="42" width="30" height="5" rx="2.5" fill="#FFFFFF" opacity="0.8"/>` +
    `<rect x="36" y="50" width="20" height="3" rx="1.5" fill="#FFFFFF" opacity="0.6"/>` +
    `<rect x="30" y="68" width="40" height="3" rx="1.5" fill="${c.b.light}" opacity="0.5"/>` +
    `<rect x="30" y="76" width="28" height="3" rx="1.5" fill="${c.b.light}" opacity="0.4"/>`,
  psu: (c) =>
    shadow(c, 60, 100, 44) +
    `<rect x="16" y="28" width="88" height="66" rx="6" fill="${D(c)}"/>` +
    fan(60, 61, 25, c.b.light, '#3A4452', c.a1) +
    [0, 1, 2, 3].map((i) => `<rect x="20" y="${34 + i * 5}" width="6" height="2" rx="1" fill="${c.b.light}" opacity="0.5"/>`).join('') +
    `<rect x="88" y="34" width="10" height="8" rx="1.5" fill="#0B0F14"/>`,
  cabinet: (c) =>
    shadow(c, 60, 108, 36) +
    `<rect x="28" y="8" width="64" height="96" rx="5" fill="${D(c)}"/>` +
    `<rect x="33" y="14" width="44" height="84" rx="3" fill="#0B0F14" opacity="0.88"/>` +
    fan(55, 34, 12, c.b.light, '#2E3742', c.a1) +
    fan(55, 62, 12, c.b.light, '#2E3742', c.a2) +
    `<rect x="38" y="80" width="34" height="12" rx="2" fill="${S(c)}" opacity="0.4"/>` +
    `<rect x="81" y="14" width="6" height="84" rx="2" fill="${S(c)}"/>`,
  cooler: (c) =>
    shadow(c, 60, 106, 34) +
    [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect x="24" y="${16 + i * 9}" width="72" height="5" rx="1.5" fill="${M(c)}"/>`).join('') +
    `<rect x="30" y="10" width="4" height="86" rx="2" fill="#C26E3A"/><rect x="86" y="10" width="4" height="86" rx="2" fill="#C26E3A"/>` +
    fan(60, 54, 27, c.b.light, '#2E3742', c.a1),
  keyboard: (c) =>
    shadow(c, 60, 92, 52, 5) +
    `<rect x="8" y="42" width="104" height="44" rx="7" fill="${D(c)}"/>` +
    [0, 1, 2].map((r) => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => `<rect x="${13 + k * 8.9}" y="${47 + r * 9}" width="7" height="7" rx="1.5" fill="${c.b.light}" opacity="${0.75 - r * 0.05}"/>`).join('')).join('') +
    `<rect x="31" y="74" width="58" height="7" rx="1.5" fill="${c.b.light}" opacity="0.75"/>` +
    `<rect x="8" y="42" width="104" height="44" rx="7" fill="none" stroke="${c.a1}" stroke-width="1.6" opacity="0.8"/>`,
  mouse: (c) =>
    shadow(c, 60, 106, 22) +
    `<path d="M60 12 C82 12 88 34 88 58 C88 88 76 102 60 102 C44 102 32 88 32 58 C32 34 38 12 60 12Z" fill="${D(c)}"/>` +
    `<path d="M60 12 V44 M32 46 C44 48 76 48 88 46" stroke="#0B0F14" stroke-width="1.4" fill="none" opacity="0.5"/>` +
    `<rect x="56.5" y="22" width="7" height="16" rx="3.5" fill="${S(c)}"/>` +
    `<path d="M40 86 C48 96 72 96 80 86" fill="none" stroke="${S(c)}" stroke-width="3" stroke-linecap="round"/>`,
  webcam: (c) =>
    shadow(c, 60, 104, 26) +
    `<rect x="18" y="26" width="84" height="40" rx="20" fill="${D(c)}"/>` +
    `<circle cx="60" cy="46" r="14" fill="#0B0F14"/><circle cx="60" cy="46" r="9" fill="${S(c)}"/><circle cx="57" cy="43" r="2.5" fill="#FFFFFF" opacity="0.7"/>` +
    `<circle cx="86" cy="46" r="2.2" fill="#4ADE80"/>` +
    `<path d="M50 66 h20 l6 20 h-32z" fill="${D(c)}"/><rect x="40" y="86" width="40" height="10" rx="4" fill="${D(c)}"/>`,
  printer: (c) =>
    shadow(c, 60, 104, 46) +
    `<rect x="34" y="14" width="52" height="30" rx="2" fill="#FFFFFF" stroke="#CBD5E1"/>` +
    `<rect x="40" y="22" width="30" height="3" rx="1.5" fill="${c.a1}"/><rect x="40" y="29" width="22" height="3" rx="1.5" fill="#CBD5E1"/>` +
    `<rect x="14" y="38" width="92" height="44" rx="8" fill="${B(c)}"/>` +
    `<rect x="26" y="76" width="68" height="20" rx="3" fill="${D(c)}"/>` +
    `<rect x="32" y="84" width="56" height="18" rx="1" fill="#FFFFFF" stroke="#CBD5E1"/>` +
    `<rect x="76" y="48" width="20" height="10" rx="2" fill="${S(c)}"/>` +
    `<circle cx="24" cy="52" r="2.4" fill="#4ADE80"/>`,
  router: (c) =>
    shadow(c, 60, 96, 48) +
    [22, 46, 74, 98].map((x, i) => `<rect x="${x - 3}" y="${18 + (i % 2) * 6}" width="6" height="44" rx="3" fill="${D(c)}" transform="rotate(${[-14, -5, 5, 14][i]} ${x} 62)"/>`).join('') +
    `<rect x="12" y="60" width="96" height="28" rx="9" fill="${B(c)}"/>` +
    [0, 1, 2, 3, 4, 5].map((i) => `<circle cx="${30 + i * 10}" cy="76" r="2.2" fill="${i < 4 ? c.a1 : '#4ADE80'}"/>`).join('') +
    `<path d="M84 72 q6 -6 12 0 M87 76 q3 -3 6 0" stroke="${c.a1}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  ups: (c) =>
    shadow(c, 60, 106, 28) +
    `<rect x="34" y="14" width="52" height="88" rx="6" fill="${D(c)}"/>` +
    `<rect x="40" y="22" width="40" height="18" rx="3" fill="#0B0F14"/>` +
    `<rect x="43" y="25" width="34" height="12" rx="2" fill="${S(c)}"/>` +
    `<text x="60" y="34.5" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="#FFFFFF" text-anchor="middle">230V</text>` +
    `<circle cx="60" cy="56" r="8" fill="${c.b.light}" opacity="0.3"/><path d="M60 50 v6 M55.5 53 a6 6 0 1 0 9 0" stroke="${c.a1}" stroke-width="2" fill="none" stroke-linecap="round"/>` +
    [0, 1, 2, 3, 4, 5].map((i) => `<rect x="42" y="${72 + i * 4.5}" width="36" height="2" rx="1" fill="${c.b.light}" opacity="0.35"/>`).join(''),
  speaker: (c) =>
    shadow(c, 60, 104, 34) +
    `<rect x="18" y="34" width="84" height="62" rx="28" fill="${D(c)}"/>` +
    `<rect x="24" y="40" width="72" height="50" rx="24" fill="${S(c)}" opacity="0.92"/>` +
    [0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => `<circle cx="${32 + k * 7}" cy="${51 + r * 7}" r="1.6" fill="#0B0F14" opacity="0.35"/>`).join('')).join('') +
    `<rect x="40" y="26" width="40" height="10" rx="5" fill="${D(c)}"/>` +
    `<circle cx="60" cy="31" r="2" fill="${c.a1}"/>`,
  box: (c) =>
    shadow(c, 60, 104, 34) +
    `<path d="M60 18 L98 36 V82 L60 100 L22 82 V36Z" fill="${S(c)}"/>` +
    `<path d="M60 18 L98 36 L60 54 L22 36Z" fill="#FFFFFF" opacity="0.3"/>` +
    `<path d="M60 54 V100" stroke="#FFFFFF" stroke-width="1.5" opacity="0.4"/>` +
    `<path d="M41 27 L79 45 V60" stroke="#FFFFFF" stroke-width="5" opacity="0.5" fill="none"/>`,
};
