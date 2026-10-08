import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, MapPin, Smartphone, Star, Truck } from 'lucide-react';
import { useEffect } from 'react';
import { useParams } from 'react-router';

import { formatDuration, formatINR, openingHint, percentOff, type ProductPage, type ShopPage } from '@gg/shared';

import { Spinner } from '@/components/ui';
import { publicUrl, rpc } from '@/lib/api';

const SCHEME = (import.meta.env.VITE_APP_SCHEME as string | undefined) || 'gadgetgalli';
const PLAY = (import.meta.env.VITE_PLAY_STORE_URL as string | undefined) || 'https://play.google.com/store/apps/details?id=in.gadgetgalli.app';
const APPSTORE = (import.meta.env.VITE_APP_STORE_URL as string | undefined) || '';

function setMeta(title: string, description: string, image?: string | null) {
  document.title = `${title} · Gadget Galli`;
  const set = (attr: string, key: string, value: string) => {
    let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.content = value;
  };
  set('name', 'description', description);
  set('property', 'og:title', title);
  set('property', 'og:description', description);
  if (image) set('property', 'og:image', image);
}

function imageUrl(path: string | null | undefined) {
  if (!path) return null;
  return /^https?:/.test(path) ? path : publicUrl('product-photos', path);
}

/** Opens the app if installed (deep link), otherwise the store. */
function openApp(path: string) {
  const ua = navigator.userAgent;
  const store = /iPhone|iPad|iPod/i.test(ua) ? APPSTORE || PLAY : PLAY;
  const started = Date.now();
  window.location.href = `${SCHEME}://${path}`;
  setTimeout(() => {
    if (Date.now() - started < 2200 && document.visibilityState === 'visible') window.location.href = store;
  }, 1500);
}

function AppButtons({ path }: { path: string }) {
  return (
    <div className="space-y-3">
      <button type="button" onClick={() => openApp(path)} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-action text-base font-semibold text-white shadow-lg shadow-orange-500/20 hover:bg-action-dark" data-testid="open-app">
        <Smartphone className="size-5" /> Open in Gadget Galli app
      </button>
      <div className="flex gap-3">
        <a href={PLAY} className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-center text-sm font-semibold hover:bg-slate-50">
          Get it on Google Play
        </a>
        {APPSTORE ? (
          <a href={APPSTORE} className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-center text-sm font-semibold hover:bg-slate-50">
            Download on the App Store
          </a>
        ) : null}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-bg text-ink">
      <header className="bg-primary px-4 py-3 text-white">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <img src="/logo.png" alt="" className="size-8 rounded-lg" />
          <div>
            <div className="font-display font-bold leading-tight">Gadget Galli</div>
            <div className="text-xs opacity-80">Hyderabad electronics shops, delivered in hours</div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-xl space-y-5 px-4 py-6">{children}</main>
      <footer className="pb-8 text-center text-xs text-slate-500">Pay the shop directly by UPI · Delivered by Porter, Rapido, Uber or the shop&apos;s rider</footer>
    </div>
  );
}

function ProductShare({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['share', 'product', id], queryFn: () => rpc<ProductPage | null>('get_product_page', { p_product_id: id }) });
  const p = q.data?.product;
  const offers = (q.data?.offers ?? []).filter((o) => o.in_stock);
  const min = offers.length ? Math.min(...offers.map((o) => o.price)) : null;
  useEffect(() => {
    if (p) setMeta(p.name, min != null ? `From ${formatINR(min)} at ${offers.length} Hyderabad shops. Order on WhatsApp, delivered in hours.` : 'Compare prices at Hyderabad shops on Gadget Galli.', imageUrl(p.photos[0]));
  }, [p, min, offers.length]);

  if (q.isLoading) return <Spinner />;
  if (!p) return <p className="text-center text-slate-500">This product is no longer available.</p>;
  return (
    <>
      <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
        {p.photos[0] ? <img src={imageUrl(p.photos[0]) ?? ''} alt={p.name} className="aspect-square w-full object-contain p-6" /> : <div className="aspect-[2/1] bg-primary-soft" />}
        <div className="space-y-2 p-5">
          <div className="text-xs font-semibold text-slate-500 uppercase">{p.brand}</div>
          <h1 className="text-xl leading-snug font-bold">{p.name}</h1>
          {min != null ? (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{formatINR(min)}</span>
              {p.mrp && p.mrp > min ? (
                <>
                  <span className="text-slate-400 line-through">{formatINR(p.mrp)}</span>
                  <span className="font-semibold text-success">{percentOff(min, p.mrp)}% off</span>
                </>
              ) : null}
            </div>
          ) : null}
          <p className="text-sm text-slate-600">{offers.length ? `Available at ${offers.length} shop${offers.length > 1 ? 's' : ''} in Hyderabad` : 'Currently out of stock at all shops'}</p>
          {p.key_specs.length ? (
            <ul className="flex flex-wrap gap-1.5 pt-1">
              {p.key_specs.map((s) => (
                <li key={s} className="rounded-lg bg-slate-100 px-2 py-1 text-xs">
                  {s}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      {offers.slice(0, 4).map((o) => (
        <div key={o.shop_product_id} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <div className="min-w-0">
            <div className="flex items-center gap-1 font-semibold">
              <span className="truncate">{o.shop_name}</span>
              {o.verified ? <BadgeCheck className="size-4 shrink-0 text-primary" /> : null}
            </div>
            <div className="text-xs text-slate-500">
              {o.area} · usually {formatDuration(o.delivery_mins)}
            </div>
          </div>
          <div className="text-lg font-bold">{formatINR(o.price)}</div>
        </div>
      ))}
      <AppButtons path={`product/${p.id}`} />
    </>
  );
}

function ShopShare({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['share', 'shop', id], queryFn: () => rpc<ShopPage | null>('get_shop_page', { p_shop_id: id }) });
  const s = q.data;
  useEffect(() => {
    if (s) setMeta(s.name, `${s.area?.name ?? 'Hyderabad'} · ${s.rating_count ? `${Number(s.rating_avg).toFixed(1)}★ · ` : ''}Order on Gadget Galli and get it delivered in hours.`, publicUrl('shop-media', s.cover_path ?? s.logo_path));
  }, [s]);
  if (q.isLoading) return <Spinner />;
  if (!s || s.status !== 'approved') return <p className="text-center text-slate-500">This shop is not available right now.</p>;
  const cover = publicUrl('shop-media', s.cover_path ?? s.photos.find((p) => p.kind === 'front')?.path);
  return (
    <>
      <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
        {cover ? <img src={cover} alt="" className="aspect-[2/1] w-full object-cover" /> : <div className="aspect-[3/1] bg-gradient-to-r from-primary to-indigo-400" />}
        <div className="space-y-2 p-5">
          <div className="flex items-center gap-3">
            {s.logo_path ? <img src={publicUrl('shop-media', s.logo_path) ?? ''} alt="" className="size-12 rounded-xl object-cover" /> : null}
            <div>
              <h1 className="flex items-center gap-1 text-xl font-bold">
                {s.name} {s.verified ? <BadgeCheck className="size-5 text-primary" /> : null}
              </h1>
              <div className="flex items-center gap-1 text-sm text-slate-500">
                <MapPin className="size-3.5" /> {[s.area?.name, s.pincode].filter(Boolean).join(' ')}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {s.rating_count ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-success px-2 py-0.5 font-semibold text-white">
                {Number(s.rating_avg).toFixed(1)} <Star className="size-3.5 fill-white" />
              </span>
            ) : null}
            <span className={s.is_open_now ? 'font-semibold text-success' : 'font-semibold text-error'}>{openingHint(s.hours, s.is_open)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Truck className="size-4" /> Usually delivers in {formatDuration(s.delivery.delivery_mins)}
            {s.delivery.store_pickup ? ' · store pickup' : ''}
          </div>
          {s.description ? <p className="text-sm text-slate-600">{s.description}</p> : null}
        </div>
      </div>
      <AppButtons path={`shop/${s.id}`} />
    </>
  );
}

export default function SharePage() {
  const { type, id } = useParams<{ type: string; id: string }>();
  return <Shell>{type === 'product' && id ? <ProductShare id={id} /> : type === 'shop' && id ? <ShopShare id={id} /> : <p className="text-center text-slate-500">Link not found.</p>}</Shell>;
}
