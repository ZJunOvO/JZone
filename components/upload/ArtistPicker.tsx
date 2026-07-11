import React, { useEffect, useMemo, useState } from 'react';
import { Icons } from '../Icons';
import { hasSupabaseConfig } from '../../supabaseClient';
import { supabaseApi, type ProfileRow, type SongArtistInput } from '../../supabaseApi';
import type { CurrentArtistProfile } from '../../hooks/useCurrentArtistProfile';

type ArtistProfile = Pick<ProfileRow, 'id' | 'nickname' | 'avatar_url'>;

interface ArtistPickerProps {
  value: string;
  currentArtist?: string;
  currentProfile?: CurrentArtistProfile | null;
  onChange: (value: string) => void;
  credits?: SongArtistInput[];
  onCreditsChange?: (value: SongArtistInput[]) => void;
}

export const ArtistPicker: React.FC<ArtistPickerProps> = ({ value, currentArtist, currentProfile, onChange, credits = [], onCreditsChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [profiles, setProfiles] = useState<ArtistProfile[]>([]);

  useEffect(() => {
    if (!isOpen || !hasSupabaseConfig) return;
    let cancelled = false;
    supabaseApi
      .fetchArtistProfiles()
      .then((rows) => {
        if (!cancelled) setProfiles(rows.filter((row) => row.nickname?.trim()));
      })
      .catch(() => {
        if (!cancelled) setProfiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const normalizedCurrent = currentArtist?.trim() || '';
  const normalizedValue = value.trim();
  const filteredProfiles = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const seen = new Set<string>();
    return profiles
      .filter((profile) => profile.id !== currentProfile?.id)
      .map((profile) => ({ ...profile, displayName: profile.nickname?.trim() || '' }))
      .filter((profile) => {
        if (!profile.displayName) return false;
        const key = profile.displayName.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return !needle || key.includes(needle);
      })
      .slice(0, 8);
  }, [currentProfile?.id, profiles, query]);

  const applyArtist = (next: string, profileId?: string | null) => {
    if (onCreditsChange) {
      const duplicate = credits.some((credit) => (
        profileId ? credit.profileId === profileId : credit.displayName.trim().toLowerCase() === next.trim().toLowerCase()
      ));
      if (!duplicate) {
        const nextCredits: SongArtistInput[] = [
          ...credits,
          {
            profileId: profileId ?? null,
            displayName: next.trim(),
            role: credits.length === 0 ? 'primary' : 'featured',
            sortOrder: credits.length,
          },
        ];
        onCreditsChange(nextCredits);
        onChange(nextCredits.map((credit) => credit.displayName).join(' / '));
      }
      setQuery('');
      return;
    }
    onChange(next.trim());
    setQuery('');
    setIsOpen(false);
  };

  const removeCredit = (index: number) => {
    if (!onCreditsChange) return;
    const nextCredits = credits
      .filter((_, creditIndex) => creditIndex !== index)
      .map((credit, creditIndex) => ({
        ...credit,
        role: creditIndex === 0 && credit.role === 'featured' ? 'primary' as const : credit.role,
        sortOrder: creditIndex,
      }));
    onCreditsChange(nextCredits);
    onChange(nextCredits.map((credit) => credit.displayName).join(' / '));
  };

  const isSelected = (displayName: string, profileId?: string | null) => credits.some((credit) => (
    profileId ? credit.profileId === profileId : credit.displayName.trim().toLowerCase() === displayName.trim().toLowerCase()
  ));

  const customValue = query.trim();

  return (
    <div className="relative space-y-1.5">
      <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest ml-1">艺人</label>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full bg-black/40 text-left text-white p-4 rounded-2xl border border-white/5 focus:border-red-500/50 focus:outline-none text-sm font-medium transition flex items-center justify-between gap-3"
      >
        <span className={normalizedValue ? 'text-white truncate' : 'text-zinc-600 truncate'}>
          {credits.length ? credits.map((credit) => credit.displayName).join(' / ') : normalizedValue || normalizedCurrent || '选择或输入艺人'}
        </span>
        <Icons.ChevronDown size={16} className={`shrink-0 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {onCreditsChange && credits.length ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {credits.map((credit, index) => (
            <div key={`${credit.profileId ?? credit.displayName}-${index}`} className="min-h-9 flex items-center gap-2 rounded-full bg-white/[0.07] border border-white/5 pl-3 pr-1 text-xs text-zinc-200">
              <span>{credit.displayName}</span>
              <span className="text-[9px] text-zinc-500">{index === 0 ? '主艺人' : '合作'}</span>
              <button type="button" onClick={() => removeCredit(index)} className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-500 hover:text-white" aria-label={`移除艺人 ${credit.displayName}`}>
                <Icons.X size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-[180] mt-2 rounded-2xl border border-white/10 bg-zinc-950/95 shadow-2xl shadow-black/60 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-3 border-b border-white/5">
            <Icons.Search size={16} className="text-zinc-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
              placeholder="搜索用户，或输入多个艺人"
              autoFocus
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} className="text-zinc-500 hover:text-white">
                <Icons.X size={15} />
              </button>
            ) : null}
          </div>

          <div className="max-h-72 overflow-y-auto p-2 space-y-1">
            {normalizedCurrent ? (
              <button
                type="button"
                onClick={() => applyArtist(normalizedCurrent, currentProfile?.id)}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/5 transition"
              >
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white overflow-hidden">
                  {currentProfile?.avatar_url ? (
                    <img src={currentProfile.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Icons.User size={16} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white truncate">{normalizedCurrent}</div>
                  <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">当前用户</div>
                </div>
                {(onCreditsChange ? isSelected(normalizedCurrent, currentProfile?.id) : normalizedValue === normalizedCurrent) ? <Icons.Check size={16} className="text-red-400" /> : null}
              </button>
            ) : null}

            {filteredProfiles.map((profile) => {
              const displayName = profile.displayName;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => applyArtist(displayName, profile.id)}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/5 transition"
                >
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                    {profile.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Icons.User size={16} className="text-zinc-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-white truncate">{displayName}</div>
                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">数据库用户</div>
                  </div>
                  {(onCreditsChange ? isSelected(displayName, profile.id) : normalizedValue === displayName) ? <Icons.Check size={16} className="text-red-400" /> : null}
                </button>
              );
            })}

            {customValue ? (
              <button
                type="button"
                onClick={() => applyArtist(customValue, null)}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/5 transition"
              >
                <div className="w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center text-red-300">
                  <Icons.Edit2 size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white truncate">{customValue}</div>
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">使用自定义艺人 / 多艺人</div>
                </div>
              </button>
            ) : null}
            {onCreditsChange ? (
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-full min-h-11 mt-1 rounded-xl bg-white text-black text-sm font-bold active:scale-[0.99] transition"
              >
                完成
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
