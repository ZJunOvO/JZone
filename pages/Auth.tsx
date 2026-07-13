import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from '../components/Icons';
import { useAuth } from '../auth';
import { BUILD_ID } from '../buildInfo';

const isValidEmail = (email: string) => /\S+@\S+\.\S+/.test(email);

export const Auth: React.FC = () => {
  const { status, signInWithPassword, signUpWithPassword, enableSignup } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const [networkHint, setNetworkHint] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  const canSubmit = useMemo(() => {
    return isValidEmail(email) && password.length >= 6 && !busy;
  }, [busy, email, password.length]);
  const submitBlocked = busy || status === 'misconfigured' || (mode === 'signup' && !enableSignup);

  const title = mode === 'login' ? '登录' : '注册';

  useEffect(() => {
    if (!supabaseUrl) return;
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6000);

    fetch(`${supabaseUrl}/auth/v1/health`, {
      signal: controller.signal,
      headers: {
        apikey: supabaseAnonKey || '',
        Authorization: supabaseAnonKey ? `Bearer ${supabaseAnonKey}` : '',
      },
    })
      .then((r) => {
        if (cancelled) return;
        if (r.ok || r.status === 401 || r.status === 404) {
          setNetworkHint(null);
        } else {
          setNetworkHint(`Supabase 可达性检查失败（HTTP ${r.status}），可能导致登录/上传失败。`);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setNetworkHint('Supabase 网络不可达（failed to fetch）。常见原因：浏览器拦截/网络 DNS/代理屏蔽 supabase.co。');
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [supabaseUrl]);

  const syncFieldsFromDom = () => {
    const nextEmail = emailRef.current?.value ?? '';
    const nextPassword = passwordRef.current?.value ?? '';
    if (nextEmail !== email) setEmail(nextEmail);
    if (nextPassword !== password) setPassword(nextPassword);
    return { email: nextEmail, password: nextPassword };
  };

  useEffect(() => {
    const timer = window.setInterval(syncFieldsFromDom, 350);
    const stop = window.setTimeout(() => window.clearInterval(timer), 5000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [email, password]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const synced = syncFieldsFromDom();
    if (!isValidEmail(synced.email) || synced.password.length < 6 || busy) {
      setError('请输入有效邮箱和至少 6 位密码');
      return;
    }
    setError(null);
    setBusy(true);

    const result =
      mode === 'login'
        ? await signInWithPassword(synced.email, synced.password)
        : await signUpWithPassword(synced.email, synced.password);

    if (!result.ok) setError(result.error ?? '操作失败');
    setBusy(false);
  };

  const switchMode = (next: 'login' | 'signup') => {
    setError(null);
    setMode(next);
  };

  return (
    <div className="auth-aurora-page min-h-screen bg-black flex items-center justify-center px-6">
      <div className="auth-aurora-bg" aria-hidden>
        <div className="auth-aurora-field auth-aurora-field-a" />
        <div className="auth-aurora-field auth-aurora-field-b" />
        <div className="auth-aurora-field auth-aurora-field-c" />
        <div className="auth-aurora-light auth-aurora-light-a" />
        <div className="auth-aurora-light auth-aurora-light-b" />
      </div>

      <div className="auth-liquid-card frosted-auth-card relative w-full max-w-md rounded-[34px]" data-liquid-control-root>
        <div className="relative rounded-[34px] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight" data-liquid-adaptive="true">{title}</h1>
            <p className="text-zinc-300 text-sm font-medium mt-1" data-liquid-adaptive="true">仅注册登录用户可访问站点内容</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-red-600/15 border border-red-500/20 flex items-center justify-center text-red-500">
            <Icons.Play size={20} fill="currentColor" />
          </div>
        </div>

        {status === 'misconfigured' && (
          <div className="mb-5 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm">
            Supabase 环境变量未配置：请在 Vercel/本地设置 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY。
          </div>
        )}
        <div className="flex justify-end mb-3">
          <button
            onClick={() => setDiagOpen((v) => !v)}
            className="text-[10px] font-bold uppercase tracking-widest text-zinc-300/75 hover:text-white transition"
            type="button"
            data-liquid-adaptive="true"
          >
            诊断
          </button>
        </div>
        {diagOpen && (
          <div className="mb-5 p-4 rounded-2xl bg-black/35 border border-white/10 text-zinc-100 text-sm">
            {networkHint ?? 'Supabase 可达性检查正常。'}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="auth-email" className="text-[10px] text-zinc-300/80 font-bold uppercase tracking-widest ml-1" data-liquid-adaptive="true">邮箱</label>
            <input
              ref={emailRef}
              id="auth-email"
              data-testid="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onInput={(e) => setEmail(e.currentTarget.value)}
              onFocus={syncFieldsFromDom}
              autoComplete="email"
              inputMode="email"
              className="w-full bg-black/45 text-white p-4 rounded-2xl border border-white/10 focus:border-red-400/70 focus:outline-none text-sm font-medium transition placeholder:text-zinc-500"
              placeholder="name@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="auth-password" className="text-[10px] text-zinc-300/80 font-bold uppercase tracking-widest ml-1" data-liquid-adaptive="true">密码</label>
            <input
              ref={passwordRef}
              id="auth-password"
              data-testid="auth-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onInput={(e) => setPassword(e.currentTarget.value)}
              onFocus={syncFieldsFromDom}
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="w-full bg-black/45 text-white p-4 rounded-2xl border border-white/10 focus:border-red-400/70 focus:outline-none text-sm font-medium transition placeholder:text-zinc-500"
              placeholder="至少 6 位"
            />
          </div>

          {error && <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-2xl p-3">{error}</div>}

          <button
            data-testid="auth-submit"
            disabled={submitBlocked}
            className={`w-full font-bold py-4 rounded-2xl shadow-xl active:scale-[0.98] transition-all ${
              !canSubmit || submitBlocked
                ? 'bg-zinc-800 text-zinc-500'
                : 'bg-red-600 text-white shadow-red-600/20'
            }`}
            type="submit"
          >
            {busy ? '处理中...' : title}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => switchMode('login')}
            data-liquid-adaptive="true"
            className={`text-[11px] font-bold uppercase tracking-widest ${
              mode === 'login' ? 'text-white' : 'text-zinc-300/70 hover:text-white'
            }`}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => switchMode('signup')}
            disabled={!enableSignup}
            data-liquid-adaptive={enableSignup ? 'true' : undefined}
            className={`text-[11px] font-bold uppercase tracking-widest ${
              mode === 'signup'
                ? 'text-white'
                : enableSignup
                  ? 'text-zinc-300/70 hover:text-white'
                  : 'text-zinc-700 cursor-not-allowed'
            }`}
          >
            注册
          </button>
        </div>

        {!enableSignup && (
          <div className="mt-4 text-[12px] text-zinc-300/80" data-liquid-adaptive="true">
            注册入口已关闭。若需要新增账号，请暂时打开 VITE_ENABLE_SIGNUP 并在 Supabase 控制台允许注册。
          </div>
        )}

        <div className="mt-6 text-[10px] text-zinc-400/80 font-mono text-center" data-liquid-adaptive="true">Build: {BUILD_ID}</div>
        </div>
      </div>
    </div>
  );
};

