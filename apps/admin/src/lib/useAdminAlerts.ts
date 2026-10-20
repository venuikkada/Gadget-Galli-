import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { formatINR } from '@gg/shared';

import { toast } from '@/components/ui';

import { rpc } from './api';
import { useAuth } from './auth';
import { supabase } from './supabase';
import type { PaymentsToVerify } from './types';

/**
 * Rings and shows a toast as soon as a customer says they have paid, so payments are confirmed within minutes and
 * the shop can send the order. Realtime notifications refresh the list at once; polling every 15 s is the fallback.
 * Payments already waiting when the panel opens don't ring.
 */
export function useAdminAlerts() {
  const qc = useQueryClient();
  const userId = useAuth().session?.user.id;
  const seen = useRef<Set<string> | null>(null);
  const q = useQuery({
    queryKey: ['payments', 'verify'],
    queryFn: () => rpc<PaymentsToVerify>('admin_list_payments_to_verify'),
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    enabled: !!userId,
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`admin-alerts-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => {
        qc.invalidateQueries({ queryKey: ['payments'] });
        qc.invalidateQueries({ queryKey: ['overview'] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  useEffect(() => {
    if (!q.data) return;
    if (seen.current === null) {
      seen.current = new Set(q.data.items.map((i) => i.id));
      return;
    }
    const fresh = q.data.items.filter((i) => !seen.current!.has(i.id));
    if (!fresh.length) return;
    fresh.forEach((i) => seen.current!.add(i.id));
    chime();
    for (const i of fresh) {
      toast(`Payment to verify · ${i.order_no} · ${formatINR(i.grand_total)} by ${i.payment_method === 'bank_transfer' ? 'bank transfer' : 'UPI'}. Open Payments to confirm.`, 'info');
    }
    qc.invalidateQueries({ queryKey: ['overview'] });
  }, [q.data, qc]);
}

/** Two short tones, made with Web Audio so there is no sound file to load. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.4);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* audio blocked until the admin clicks somewhere; the toast still shows */
  }
}
