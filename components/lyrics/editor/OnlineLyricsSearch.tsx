import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { searchLrcLibLyrics, toUntimedLyricsText, type LrcLibLyricsResult } from '../../../services/lyrics/lrclib';
import { Icons } from '../../Icons';

interface OnlineLyricsSearchProps {
  songTitle?: string;
  songArtist?: string;
  disabled?: boolean;
  onSelect: (content: string, hasTiming: boolean, result: LrcLibLyricsResult) => void;
}

const formatDuration = (duration: number | null) => {
  if (!duration) return '';
  const minutes = Math.floor(duration / 60);
  const seconds = Math.round(duration % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

export const OnlineLyricsSearch = ({
  songTitle = '',
  songArtist = '',
  disabled = false,
  onSelect,
}: OnlineLyricsSearchProps) => {
  const [trackName, setTrackName] = useState(songTitle);
  const [artistName, setArtistName] = useState(songArtist);
  const [results, setResults] = useState<LrcLibLyricsResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchSequenceRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setTrackName(songTitle);
    setArtistName(songArtist);
    setResults([]);
    setSearched(false);
    setError(null);
    abortRef.current?.abort();
  }, [songArtist, songTitle]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const runSearch = async () => {
    const sequence = ++searchSequenceRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    setSearched(true);
    setError(null);
    try {
      const nextResults = await searchLrcLibLyrics({
        trackName,
        artistName,
        signal: controller.signal,
      });
      if (sequence !== searchSequenceRef.current) return;
      setResults(nextResults);
    } catch (searchError) {
      if (sequence !== searchSequenceRef.current || controller.signal.aborted) return;
      setResults([]);
      setError(searchError instanceof Error ? searchError.message : '在线歌词搜索失败。');
    } finally {
      if (sequence === searchSequenceRef.current) setSearching(false);
    }
  };

  return (
    <div className="pt-3" data-testid="lyrics-online-search">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto]">
        <label className="min-w-0">
          <span className="sr-only">原曲名称</span>
          <input
            value={trackName}
            onChange={(event) => setTrackName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
              event.preventDefault();
              void runSearch();
            }}
            disabled={disabled || searching}
            placeholder="原曲名称"
            className="min-h-12 w-full rounded-xl border border-white/10 bg-white/[0.045] px-3 text-base text-white outline-none transition-colors placeholder:text-white/28 focus:border-red-300/65 focus:ring-2 focus:ring-red-300/20 disabled:opacity-50"
            data-testid="lyrics-online-track"
          />
        </label>
        <label className="min-w-0">
          <span className="sr-only">原唱，可留空</span>
          <input
            value={artistName}
            onChange={(event) => setArtistName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
              event.preventDefault();
              void runSearch();
            }}
            disabled={disabled || searching}
            placeholder="原唱（可留空）"
            className="min-h-12 w-full rounded-xl border border-white/10 bg-white/[0.045] px-3 text-base text-white outline-none transition-colors placeholder:text-white/28 focus:border-red-300/65 focus:ring-2 focus:ring-red-300/20 disabled:opacity-50"
            data-testid="lyrics-online-artist"
          />
        </label>
        <button
          type="button"
          onClick={() => { void runSearch(); }}
          disabled={disabled || searching || !trackName.trim()}
          className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-black transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70 disabled:cursor-not-allowed disabled:opacity-40"
          data-testid="lyrics-online-submit"
        >
          {searching ? <Icons.RotateCcw size={16} className="animate-spin" aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
          {searching ? '搜索中' : '搜索'}
        </button>
      </div>

      <p className="mt-2 text-xs leading-5 text-white/38">Live 录音可改填原曲和原唱；导入后只保留歌词顺序，时间将重新适配。</p>

      {error ? <p className="mt-3 text-sm leading-6 text-red-200" role="alert" data-testid="lyrics-online-error">{error}</p> : null}
      {!error && searched && !searching && results.length === 0 ? (
        <p className="mt-4 text-center text-sm text-white/45" role="status" data-testid="lyrics-online-empty">没有找到合适歌词，可以改用原曲名或直接粘贴。</p>
      ) : null}

      {results.length > 0 ? (
        <div className="mt-3 divide-y divide-white/8 border-y border-white/10" role="list" aria-label="在线歌词搜索结果">
          {results.map((result) => {
            const plainContent = toUntimedLyricsText(result);
            const syncedContent = result.syncedLyrics;
            const lineCount = plainContent.split(/\r?\n/).filter((line) => line.trim()).length;
            return (
              <div
                key={result.id}
                role="listitem"
                className="px-1 py-3"
                data-testid={`lyrics-online-result-${result.id}`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold text-white">{result.trackName}</p>
                    <p className="mt-1 truncate text-xs text-white/48">{result.artistName || '未知艺人'}{result.albumName ? ` · ${result.albumName}` : ''}</p>
                    <p className="mt-1 text-[11px] font-bold text-white/30">{lineCount} 行{result.duration ? ` · ${formatDuration(result.duration)}` : ''}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-white/12 px-2 py-1 text-[10px] font-bold text-white/55">
                    {syncedContent ? '含 LRC 时间轴' : '仅纯文本'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {syncedContent ? (
                    <button
                      type="button"
                      onClick={() => onSelect(syncedContent, true, result)}
                      disabled={disabled}
                      className="min-h-11 cursor-pointer rounded-xl bg-white px-3 text-xs font-black text-black transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70 disabled:opacity-40"
                      data-testid={`lyrics-online-synced-${result.id}`}
                    >
                      导入同步 LRC
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onSelect(plainContent, false, result)}
                    disabled={disabled || !plainContent}
                    className={`min-h-11 cursor-pointer rounded-xl border border-white/12 px-3 text-xs font-bold text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 disabled:opacity-35 ${syncedContent ? '' : 'col-span-2'}`}
                    data-testid={`lyrics-online-plain-${result.id}`}
                  >
                    仅导入纯文本
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
