import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { hasSupabaseConfig, supabase } from './supabaseClient';

type AuthStatus = 'loading' | 'signed_out' | 'signed_in' | 'misconfigured';

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  signInWithPassword: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  enableSignup: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const enableSignup = (import.meta.env.VITE_ENABLE_SIGNUP ?? 'true') === 'true';
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>(hasSupabaseConfig ? 'loading' : 'misconfigured');

  useEffect(() => {
    if (!hasSupabaseConfig) return;

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setStatus(data.session ? 'signed_in' : 'signed_out');
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setStatus(nextSession ? 'signed_in' : 'signed_out');
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    return {
      status,
      session,
      user,
      enableSignup,
      signInWithPassword: async (email, password) => {
        if (!hasSupabaseConfig) return { ok: false, error: 'Supabase 未配置' };
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error ? { ok: false, error: error.message } : { ok: true };
      },
      signUpWithPassword: async (email, password) => {
        if (!hasSupabaseConfig) return { ok: false, error: 'Supabase 未配置' };
        if (!enableSignup) return { ok: false, error: '注册已关闭' };
        const { error } = await supabase.auth.signUp({ email, password });
        return error ? { ok: false, error: error.message } : { ok: true };
      },
      signOut: async () => {
        if (!hasSupabaseConfig) return;
        await supabase.auth.signOut();
      },
    };
  }, [enableSignup, session, status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

