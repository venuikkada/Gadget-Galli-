/**
 * Where the app finds its server, and which side of the marketplace it shows.
 *
 * Store builds and local web builds use the EXPO_PUBLIC_* values baked in at build time. A web build hosted
 * as a website can also load /config.js, which sets window.GG_CONFIG: the same files can then be uploaded
 * once and pointed at a server afterwards, and one build serves both the customer site and the Shop Partner
 * site (see docs/DEPLOY-HOSTINGER.md). Values in config.js win over the built-in ones.
 */
export type AppSide = 'all' | 'customer' | 'partner';

type RuntimeConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  app?: string;
  demo?: boolean;
  shareBaseUrl?: string;
  /** The admin website, which also serves the share pages. */
  adminUrl?: string;
  customerAppUrl?: string;
  partnerAppUrl?: string;
  playStoreUrl?: string;
};

const runtime: RuntimeConfig = (globalThis as { GG_CONFIG?: RuntimeConfig }).GG_CONFIG ?? {};
const trimSlash = (url: string) => url.trim().replace(/\/+$/, '');
const side = (runtime.app || process.env.EXPO_PUBLIC_APP || 'all') as AppSide;

export const config = {
  supabaseUrl: trimSlash(runtime.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || ''),
  supabaseAnonKey: (runtime.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim(),
  /** 'all' is the store app (customers and shop owners); 'customer' and 'partner' are the separate websites. */
  app: (['all', 'customer', 'partner'].includes(side) ? side : 'all') as AppSide,
  /** Shows the demo phone numbers on the login screen. Only for demo servers that use test OTPs. */
  demo: runtime.demo ?? process.env.EXPO_PUBLIC_DEMO === '1',
  /** Where share links (/s/product/…) are served: the admin website. */
  shareBaseUrl: trimSlash(runtime.shareBaseUrl || runtime.adminUrl || process.env.EXPO_PUBLIC_SHARE_BASE_URL || 'https://gadgetgalli.in'),
  /** The other website, for "Switch to Shop Partner" and "Switch to buying" on the separate sites. */
  customerAppUrl: trimSlash(runtime.customerAppUrl || process.env.EXPO_PUBLIC_CUSTOMER_APP_URL || ''),
  partnerAppUrl: trimSlash(runtime.partnerAppUrl || process.env.EXPO_PUBLIC_PARTNER_APP_URL || ''),
  /** Where invite links send friends when there is no customer website. */
  playStoreUrl: runtime.playStoreUrl || process.env.EXPO_PUBLIC_PLAY_STORE_URL || 'https://play.google.com/store/apps/details?id=in.gadgetgalli.app',
};
