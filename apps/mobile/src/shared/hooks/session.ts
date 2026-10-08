import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '../api/supabase';

interface SessionState {
  session: Session | null;
  ready: boolean;
}

export const useSession = create<SessionState>(() => ({ session: null, ready: false }));

let started = false;
/** Starts listening to Supabase auth once (called from the root layout). */
export function startAuthListener() {
  if (started) return;
  started = true;
  supabase.auth
    .getSession()
    .then(({ data }) => useSession.setState({ session: data.session, ready: true }))
    .catch(() => useSession.setState({ session: null, ready: true }));
  supabase.auth.onAuthStateChange((_event, session) => {
    useSession.setState({ session, ready: true });
  });
}

export const useUserId = () => useSession((s) => s.session?.user.id ?? null);
