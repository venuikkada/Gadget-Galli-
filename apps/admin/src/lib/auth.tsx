import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Profile } from '@gg/shared';

import { rpc } from './api';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  isSuper: boolean;
  /** Signed in with the password, but 2-step verification is on and the 6-digit code is still needed. */
  needsCode: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  verifyCode: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsCode, setNeedsCode] = useState(false);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setNeedsCode(false);
      return;
    }
    setNeedsCode(await codeStillNeeded());
    try {
      setProfile(await rpc<Profile>('my_profile'));
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Profile is loaded outside the callback (Supabase recommends not awaiting inside it).
      setTimeout(() => loadProfile(s), 0);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    setSession(data.session);
    await loadProfile(data.session);
  }, [loadProfile]);

  const verifyCode = useCallback(async (code: string) => {
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) throw listError;
    const factor = factors.totp[0];
    if (!factor) throw new Error('2-step verification is not set up for this account.');
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    if (error) throw error;
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await loadProfile(data.session);
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const value = useMemo<AuthState>(() => {
    const role = profile?.user.admin_role ?? null;
    return {
      session,
      profile,
      loading,
      isAdmin: !!role && !profile?.user.is_blocked && !needsCode,
      isSuper: role === 'super_admin' && !needsCode,
      needsCode,
      signIn,
      verifyCode,
      signOut,
      reload: () => loadProfile(session),
    };
  }, [session, profile, loading, needsCode, signIn, verifyCode, signOut, loadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** True when this account has 2-step verification on and the session has not passed it yet. */
async function codeStillNeeded(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
  } catch {
    return false;
  }
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
