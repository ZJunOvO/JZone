import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CollectionRow, CollectionType, supabaseApi } from '../supabaseApi';
import { Icons } from './Icons';
import { useAuth } from '../auth';

export type CollectionSelectValue =
  | { kind: 'none' }
  | { kind: 'existing'; id: string; title: string; type: CollectionType }
  | { kind: 'create'; title: string; type: CollectionType };

export const CollectionCreatableSelect: React.FC<{
  label: string;
  value: CollectionSelectValue;
  onChange: (v: CollectionSelectValue) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CollectionRow[]>([]);
  const [reloadTick, setReloadTick] = useState(0);
  const reqSeq = useRef(0);
  const cacheRef = useRef(new Map<string, CollectionRow[]>());

  const displayText = useMemo(() => {
    if (value.kind === 'existing') return `${value.type === 'album' ? '专辑' : '歌单'} · ${value.title}`;
    if (value.kind === 'create') return `新建${value.type === 'album' ? '专辑' : '歌单'} · ${value.title}`;
    return '';
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [open]);

  useEffect(() => {
    const handleCollectionsChanged = () => {
      cacheRef.current.clear();
      if (open) setReloadTick((v) => v + 1);
    };
    window.addEventListener('jzone:collections-changed', handleCollectionsChanged);
    return () => window.removeEventListener('jzone:collections-changed', handleCollectionsChanged);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!supabaseApi.isEnabled()) {
      setResults([]);
      setLoading(false);
      return;
    }
    const q = query.trim();
    const key = q ? `search:${q.toLowerCase()}` : 'all';

    const cached = cacheRef.current.get(key);
    if (cached) {
      setResults(cached);
      setLoading(false);
      return;
    }

    const seq = ++reqSeq.current;
    setLoading(true);
    const t = window.setTimeout(() => {
      const request = q ? supabaseApi.searchMyCollections(q, 20, user?.id) : supabaseApi.fetchMyCollections(undefined, 40);
      request
        .then((rows) => {
          if (seq !== reqSeq.current) return;
          cacheRef.current.set(key, rows);
          setResults(rows);
        })
        .catch(() => {
          if (seq !== reqSeq.current) return;
          setResults([]);
        })
        .finally(() => {
          if (seq !== reqSeq.current) return;
          setLoading(false);
        });
    }, q ? 260 : 0);

    return () => window.clearTimeout(t);
  }, [open, query, user?.id, reloadTick]);

  const grouped = useMemo(() => {
    const albums = results.filter((r) => r.type === 'album');
    const playlists = results.filter((r) => r.type === 'playlist');
    return { albums, playlists };
  }, [results]);

  const chooseExisting = (r: CollectionRow) => {
    onChange({ kind: 'existing', id: r.id, title: r.title, type: r.type });
    setOpen(false);
  };

  const chooseCreate = (type: CollectionType) => {
    const t = query.trim();
    if (!t) return;
    onChange({ kind: 'create', title: t, type });
    setOpen(false);
  };

  const clear = () => {
    onChange({ kind: 'none' });
    setQuery('');
  };

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full bg-black/40 text-white p-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition flex items-center justify-between gap-3"
      >
        <div className="min-w-0 truncate text-left">
          {displayText ? <span className="text-white">{displayText}</span> : <span className="text-zinc-600">{placeholder ?? '搜索或创建…'}</span>}
        </div>
        <div className="flex items-center gap-2">
          {value.kind !== 'none' ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                clear();
              }}
              className="text-zinc-500 hover:text-white transition"
              role="button"
              aria-label="clear"
            >
              <Icons.X size={16} />
            </span>
          ) : null}
          <Icons.ChevronDown size={16} className="text-zinc-500" />
        </div>
      </button>

      {open && (
        <div className="fixed inset-0 z-[300] overscroll-contain" onWheel={(e) => e.stopPropagation()} onTouchMove={(e) => e.stopPropagation()}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} onTouchMove={(e) => e.preventDefault()} />
          <div className="frosted-glass-panel absolute left-1/2 top-1/2 flex max-h-[min(78vh,620px)] w-[min(420px,calc(100%-48px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[24px] shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center gap-3">
              <Icons.Search size={20} className="text-zinc-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索"
                className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-zinc-600"
                autoFocus
              />
              <button onClick={() => setOpen(false)} className="p-2 rounded-full bg-white/5 text-zinc-300 active:scale-95 transition">
                <Icons.X size={16} />
              </button>
            </div>

            {!supabaseApi.isEnabled() ? (
              <div className="p-5 text-sm text-zinc-400">未配置 Supabase，暂不支持创建/关联专辑与歌单。</div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y no-scrollbar p-3 space-y-3">
                {query.trim() ? (
                  <div className="space-y-2">
                    <button
                      onClick={() => chooseCreate('album')}
                      className="w-full text-left px-4 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
                    >
                      <div className="text-sm font-bold text-white">✨ 创建新专辑 “{query.trim()}”</div>
                    </button>
                    <button
                      onClick={() => chooseCreate('playlist')}
                      className="w-full text-left px-4 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
                    >
                      <div className="text-sm font-bold text-white">✨ 创建新歌单 “{query.trim()}”</div>
                    </button>
                  </div>
                ) : null}

                {loading ? <div className="py-6 text-center text-zinc-500 text-sm">检索中…</div> : null}

                {grouped.albums.length ? (
                  <div className="space-y-2">
                    <div className="px-2 text-[10px] uppercase tracking-widest text-zinc-500 font-bold">专辑</div>
                    {grouped.albums.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => chooseExisting(r)}
                        className="w-full text-left px-4 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
                      >
                        <div className="text-sm font-bold text-white truncate">[专辑] {r.title}</div>
                      </button>
                    ))}
                  </div>
                ) : null}

                {grouped.playlists.length ? (
                  <div className="space-y-2">
                    <div className="px-2 text-[10px] uppercase tracking-widest text-zinc-500 font-bold">歌单</div>
                    {grouped.playlists.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => chooseExisting(r)}
                        className="w-full text-left px-4 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
                      >
                        <div className="text-sm font-bold text-white truncate">[歌单] {r.title}</div>
                      </button>
                    ))}
                  </div>
                ) : null}

                {!loading && query.trim() && !results.length ? (
                  <div className="py-6 text-center text-zinc-500 text-sm">没有匹配结果</div>
                ) : null}

                {!loading && !query.trim() && !results.length ? (
                  <div className="py-6 text-center text-zinc-500 text-sm">还没有可加入的专辑或歌单</div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
