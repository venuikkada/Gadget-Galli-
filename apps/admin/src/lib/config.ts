/**
 * Server and link settings. A local or CI build uses the VITE_* values baked in at build time; a hosted build
 * can also load /config.js (window.GG_CONFIG), so the same files can be uploaded once and pointed at a server
 * afterwards (see docs/DEPLOY-HOSTINGER.md). Values in config.js win.
 */
type RuntimeConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  customerAppUrl?: string;
  playStoreUrl?: string;
  appStoreUrl?: string;
  mapTileUrl?: string;
  mapAttribution?: string;
};

const runtime: RuntimeConfig = (window as unknown as { GG_CONFIG?: RuntimeConfig }).GG_CONFIG ?? {};
const env = (value: unknown) => (typeof value === 'string' ? value : '');
const trimSlash = (url: string) => url.trim().replace(/\/+$/, '');

export const config = {
  supabaseUrl: trimSlash(runtime.supabaseUrl || env(import.meta.env.VITE_SUPABASE_URL)),
  supabaseAnonKey: (runtime.supabaseAnonKey || env(import.meta.env.VITE_SUPABASE_ANON_KEY)).trim(),
  /** The customer website. When set, share pages offer "Open in your browser". */
  customerAppUrl: trimSlash(runtime.customerAppUrl || env(import.meta.env.VITE_CUSTOMER_APP_URL)),
  playStoreUrl: runtime.playStoreUrl || env(import.meta.env.VITE_PLAY_STORE_URL) || 'https://play.google.com/store/apps/details?id=in.gadgetgalli.app',
  appStoreUrl: runtime.appStoreUrl || env(import.meta.env.VITE_APP_STORE_URL),
  /** Map tiles and their credit line; empty means OpenStreetMap's own tiles. */
  mapTileUrl: (runtime.mapTileUrl || env(import.meta.env.VITE_MAP_TILE_URL)).trim(),
  mapAttribution: (runtime.mapAttribution || env(import.meta.env.VITE_MAP_ATTRIBUTION)).trim(),
};
