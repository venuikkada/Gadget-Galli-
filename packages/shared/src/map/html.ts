import { extra, marigold, teal } from '../palette';
import { LEAFLET_CSS, LEAFLET_JS } from './leafletAssets';

/** OpenStreetMap's own tiles: free, no key. Busy apps should move to a tile provider (see docs/DEPLOY-HOSTINGER.md). */
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

export interface MapPoint {
  lat: number;
  lng: number;
}

/** `shop` is a teal pin, `home` a marigold one (the customer's address). */
export interface MapPin extends MapPoint {
  kind: 'shop' | 'home';
}

export interface MapHtmlOptions {
  /** `pick`: drag the map under a fixed centre pin. `route`: show pins (and a dashed line between the first two). */
  mode: 'pick' | 'route';
  center?: MapPoint | null;
  zoom?: number;
  pins?: MapPin[];
  line?: boolean;
  /** Route maps: allow panning and zooming (off by default, so the page scrolls past them). */
  interactive?: boolean;
  dark?: boolean;
  tileUrl?: string;
  attribution?: string;
  /** Tags the messages a map posts, for pages with more than one map. */
  id?: string;
}

/** Messages a map page posts to the app. */
export type MapMessage = { type: 'ready'; id?: string } | { type: 'move'; id?: string; lat: number; lng: number; user: boolean };

/** Messages the app sends to a map page. */
export type MapCommand = { type: 'center'; lat: number; lng: number; zoom?: number };

const HYDERABAD = { lat: 17.385, lng: 78.4867 };

function pinSvg(fill: string, inner: string, w = 34, h = 44) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 34 44"><path d="M17 43s14-14.6 14-25A14 14 0 0 0 3 18c0 10.4 14 25 14 25z" fill="${fill}" stroke="#fff" stroke-width="2.5"/><circle cx="17" cy="18" r="6" fill="${inner}"/></svg>`;
}

/**
 * A complete HTML page with Leaflet and OpenStreetMap tiles. The apps show it in a WebView (Android, iOS) or an
 * iframe (websites, admin) and talk to it with postMessage: it posts `ready` and `move`, and accepts `center`.
 */
export function mapHtml(o: MapHtmlOptions): string {
  const cfg = {
    mode: o.mode,
    center: o.center ?? null,
    zoom: o.zoom ?? (o.center ? 17 : 11),
    pins: o.pins ?? [],
    line: o.line ?? true,
    interactive: o.mode === 'pick' || !!o.interactive,
    tileUrl: o.tileUrl || OSM_TILE_URL,
    attribution: o.attribution || OSM_ATTRIBUTION,
    id: o.id ?? '',
    fallback: HYDERABAD,
    pins_svg: {
      shop: pinSvg(teal[600], '#FFFFFF'),
      home: pinSvg(marigold[500], extra.ink),
    },
    line_color: o.dark ? teal[300] : teal[700],
  };
  const bg = o.dark ? '#0C1D1F' : '#E8EEEE';
  const json = JSON.stringify(cfg).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>${LEAFLET_CSS}
html,body,#map{margin:0;padding:0;height:100%;width:100%;background:${bg};overflow:hidden}
.leaflet-container{background:${bg};font:11px/1.4 -apple-system,system-ui,Roboto,sans-serif}
.leaflet-control-attribution{font-size:10px}
${o.dark ? '.leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.9) contrast(.85) saturate(.7)}' : ''}
.gg-pin{background:none;border:0}
.gg-center{position:absolute;left:50%;top:50%;width:40px;height:52px;margin:-50px 0 0 -20px;z-index:1000;pointer-events:none;transition:transform .15s}
.gg-center.lift{transform:translateY(-8px)}
.gg-shadow{position:absolute;left:50%;top:50%;width:14px;height:6px;margin:-3px 0 0 -7px;border-radius:50%;background:rgba(0,0,0,.28);z-index:999;pointer-events:none}
</style></head><body><div id="map"></div>
${o.mode === 'pick' ? `<div class="gg-shadow"></div><div class="gg-center" id="pin">${pinSvg(marigold[500], extra.ink, 40, 52)}</div>` : ''}
<script>${LEAFLET_JS}</script>
<script>(function () {
  var O = ${json};
  function post(m) {
    m.id = O.id;
    var s = JSON.stringify(m);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else if (window.parent && window.parent !== window) window.parent.postMessage(s, '*');
  }
  var map = L.map('map', { zoomControl: O.interactive, attributionControl: true, scrollWheelZoom: O.mode === 'pick' ? 'center' : false });
  map.attributionControl.setPrefix(false);
  L.tileLayer(O.tileUrl, { maxZoom: 19, attribution: O.attribution }).addTo(map);
  function icon(kind) { return L.divIcon({ html: O.pins_svg[kind] || O.pins_svg.home, className: 'gg-pin', iconSize: [34, 44], iconAnchor: [17, 43] }); }

  if (O.mode === 'pick') {
    var c = O.center || O.fallback;
    var user = false, pin = document.getElementById('pin'), box = map.getContainer();
    map.setView([c.lat, c.lng], O.zoom);
    // Only a touch, click, wheel or key on the map counts as the person moving it; Leaflet's own zoom events also
    // fire for the opening view and for moves the app asks for.
    function touched() { user = true; }
    box.addEventListener('pointerdown', touched);
    box.addEventListener('touchstart', touched, { passive: true });
    box.addEventListener('wheel', touched, { passive: true });
    box.addEventListener('keydown', touched);
    map.on('movestart', function () { pin.className = 'gg-center lift'; });
    map.on('moveend', function () {
      pin.className = 'gg-center';
      var p = map.getCenter();
      post({ type: 'move', lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6, user: user });
      user = false;
    });
  } else {
    var pts = [];
    for (var i = 0; i < O.pins.length; i++) {
      var p = O.pins[i];
      pts.push([p.lat, p.lng]);
      L.marker([p.lat, p.lng], { icon: icon(p.kind), interactive: false, keyboard: false }).addTo(map);
    }
    if (O.line && pts.length > 1) L.polyline(pts.slice(0, 2), { color: O.line_color, weight: 4, opacity: 0.9, dashArray: '1 9', lineCap: 'round' }).addTo(map);
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 });
    else if (pts.length === 1) map.setView(pts[0], 16);
    else map.setView([O.fallback.lat, O.fallback.lng], 11);
    if (!O.interactive) {
      map.dragging.disable(); map.touchZoom.disable(); map.doubleClickZoom.disable();
      map.scrollWheelZoom.disable(); map.boxZoom.disable(); map.keyboard.disable();
      if (map.tap) map.tap.disable();
    }
  }

  window.ggMap = function (m) {
    if (m && m.type === 'center') map.setView([m.lat, m.lng], m.zoom || Math.max(map.getZoom(), 17));
  };
  function onMessage(e) {
    var m;
    try { m = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (err) { return; }
    if (m && m.type === 'center') window.ggMap(m);
  }
  window.addEventListener('message', onMessage);
  document.addEventListener('message', onMessage);
  post({ type: 'ready' });
})();</script></body></html>`;
}
