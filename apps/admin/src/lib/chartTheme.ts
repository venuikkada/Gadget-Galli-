import { useEffect, useState } from 'react';

import { darkTokens, extra, lightTokens, marigold, teal } from '@gg/shared';

/** True while the admin is in dark mode (follows the `dark` class on <html>). */
export function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => setDark(el.classList.contains('dark')));
    observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

/** Recharts colours for the current mode: orders in teal, paid and delivered in leaf green, requested in marigold. */
export function chartTheme(dark: boolean) {
  const t = dark ? darkTokens : lightTokens;
  return {
    orders: dark ? teal[300] : teal[600],
    paid: dark ? darkTokens.success : extra.leaf,
    requested: marigold[600],
    grid: t.border,
    tick: { fontSize: 11, fill: t.textMuted },
    tooltip: {
      contentStyle: { background: t.elevated, border: `1px solid ${t.border}`, borderRadius: 12, color: t.text, fontSize: 12 },
      labelStyle: { color: t.text, fontWeight: 600 },
      itemStyle: { color: t.text },
    },
    legend: { color: t.textMuted, fontSize: 12 },
  };
}
