import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Boxes,
  LayoutDashboard,
  LogOut,
  Map,
  Megaphone,
  Menu,
  Moon,
  ReceiptText,
  ShieldAlert,
  Store,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';

import { rpc } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Overview } from '@/lib/types';

import { cx } from './ui';

export function useOverview() {
  return useQuery({ queryKey: ['overview'], queryFn: () => rpc<Overview>('admin_overview'), refetchInterval: 60_000 });
}

export function useDarkMode(): [boolean, (v: boolean) => void] {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem('gg-admin-theme');
      if (saved) return saved === 'dark';
    } catch {
      /* storage unavailable */
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('gg-admin-theme', dark ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }, [dark]);
  return [dark, setDark];
}

function NavItem({ to, icon, label, count, end, onClick }: { to: string; icon: ReactNode; label: string; count?: number; end?: boolean; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        cx('relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition', isActive ? 'bg-white/12 text-white' : 'text-white/75 hover:bg-white/8 hover:text-white')
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-accent" /> : null}
          {icon}
          <span className="flex-1">{label}</span>
          {count ? <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-ink">{count}</span> : null}
        </>
      )}
    </NavLink>
  );
}

export function Layout() {
  const { profile, isSuper, signOut } = useAuth();
  const { data: o } = useOverview();
  const [dark, setDark] = useDarkMode();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      <NavItem to="/" end icon={<LayoutDashboard className="size-5" />} label="Dashboard" />
      <NavItem to="/shops" icon={<Store className="size-5" />} label="Shops" count={o?.shops_pending} />
      <NavItem to="/orders" icon={<ReceiptText className="size-5" />} label="Orders" count={o?.stuck_orders} />
      <NavItem to="/problems" icon={<ShieldAlert className="size-5" />} label="Problems" count={o?.issues_open} />
      <NavItem to="/catalog" icon={<Boxes className="size-5" />} label="Catalog" count={o?.catalog_pending} />
      <NavItem to="/customers" icon={<Users className="size-5" />} label="Customers" />
      <NavItem to="/content" icon={<Megaphone className="size-5" />} label="Content & growth" />
      <NavItem to="/areas" icon={<Map className="size-5" />} label="Areas" />
      <NavItem to="/reports" icon={<BarChart3 className="size-5" />} label="Reports" />
    </nav>
  );

  const footer = (
    <div className="space-y-2 border-t border-white/12 pt-4">
      <div className="px-2">
        <div className="truncate text-sm font-semibold text-white">{profile?.user.name ?? profile?.user.email}</div>
        <div className="text-xs text-white/75">{isSuper ? 'Super admin' : 'Support'}</div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setDark(!dark)}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/20 py-2 text-xs font-semibold text-white/85 hover:bg-white/10 hover:text-white"
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {dark ? 'Light' : 'Dark'}
        </button>
        <button
          type="button"
          onClick={signOut}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/20 py-2 text-xs font-semibold text-white/85 hover:bg-white/10 hover:text-white"
        >
          <LogOut className="size-4" />
          Log out
        </button>
      </div>
    </div>
  );

  const brand = (
    <div className="flex items-center gap-2.5 px-2">
      <img src="/logo.png" alt="" className="size-10 rounded-xl ring-2 ring-white/20" />
      <div>
        <div className="font-display text-base leading-tight font-bold text-white">Gadget Galli</div>
        <div className="text-xs font-semibold text-accent">Admin</div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-full">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 bg-gradient-to-b from-primary-800 to-primary-950 p-4 lg:flex">
        {brand}
        {nav}
        {footer}
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="flex h-full w-72 flex-col gap-6 bg-gradient-to-b from-primary-800 to-primary-950 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              {brand}
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-white hover:bg-white/10" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-gradient-to-r from-primary-900 to-primary-700 px-4 py-3 shadow-md lg:hidden">
          <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-white hover:bg-white/10" aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          {brand}
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
