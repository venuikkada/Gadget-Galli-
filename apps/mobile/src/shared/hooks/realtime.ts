import { useEffect, useRef } from 'react';

import { supabase } from '../api/supabase';

/**
 * Subscribes to Postgres changes (Supabase Realtime) and calls onChange for each event.
 * Row-level security applies, so users only receive rows they can read.
 */
export function useRealtime(
  channel: string,
  table: string,
  filter: string | null,
  onChange: (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => void,
  enabled = true,
) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    if (!enabled) return;
    const ch = supabase
      .channel(channel)
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => cb.current(payload),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [channel, table, filter, enabled]);
}
