import {
  AlertCircle,
  ClipboardPaste,
  FileText,
  Search,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Icons } from '../../Icons';
import { formatLabels } from './lyricsEditorUtils';
import { OnlineLyricsSearch } from './OnlineLyricsSearch';
import type { LyricsSourcePanelProps } from './types';

export const LyricsSourcePanel = ({
  sourceText,
  format,
  timing,
  inputError,
  parseError,
  songTitle,
  songArtist,
  disabled = false,
  onSourceChange,
  onSourcePaste,
  onFileChange,
  onApply,
  onOnlineSelect,
}: LyricsSourcePanelProps) => {
  const [expanded, setExpanded] = useState(() => !sourceText.trim());
  const [sourceMode, setSourceMode] = useState<'manual' | 'online'>('manual');

  useEffect(() => {
    if (!sourceText.trim()) setExpanded(true);
  }, [sourceText]);

  return (
    <section className="border-b border-white/10 py-3" aria-labelledby="lyrics-editor-source-title">
      <details
        open={expanded}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
        data-testid="lyrics-editor-source-panel"
        className="group"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-xl px-1 text-sm font-extrabold text-white/75 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-red-300/60 [&::-webkit-details-marker]:hidden" data-testid="lyrics-editor-source-toggle">
          <FileText size={18} className="shrink-0 text-red-300" aria-hidden="true" />
          <span id="lyrics-editor-source-title">获取歌词</span>
          <span className="ml-auto text-xs font-bold text-white/35 group-open:hidden">展开</span>
          <span className="ml-auto hidden text-xs font-bold text-white/35 group-open:inline">收起</span>
        </summary>

        <div className="pt-3">
          <div className="grid grid-cols-2 rounded-xl bg-white/[0.045] p-1" role="tablist" aria-label="歌词来源">
            <button
              type="button"
              role="tab"
              aria-selected={sourceMode === 'manual'}
              onClick={() => setSourceMode('manual')}
              className={`inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 ${sourceMode === 'manual' ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}
              data-testid="lyrics-source-manual-tab"
            >
              <ClipboardPaste size={15} aria-hidden="true" />
              粘贴或文件
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sourceMode === 'online'}
              onClick={() => setSourceMode('online')}
              className={`inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 ${sourceMode === 'online' ? 'bg-white text-black' : 'text-white/50 hover:text-white'}`}
              data-testid="lyrics-source-online-tab"
            >
              <Search size={15} aria-hidden="true" />
              在线搜索
            </button>
          </div>

          {sourceMode === 'online' ? (
            <OnlineLyricsSearch
              songTitle={songTitle}
              songArtist={songArtist}
              disabled={disabled}
              onSelect={(content, hasTiming) => {
                onOnlineSelect(content, hasTiming);
                setExpanded(false);
              }}
            />
          ) : (
            <div>
              <label htmlFor="lyrics-editor-source" className="sr-only">歌词文本</label>
              <textarea
                id="lyrics-editor-source"
                data-testid="lyrics-editor-source"
                value={sourceText}
                onChange={onSourceChange}
                onPaste={onSourcePaste}
                rows={4}
                spellCheck={false}
                disabled={disabled}
                className="mt-3 min-h-[112px] w-full resize-y rounded-xl border border-white/10 bg-white/[0.045] px-3 py-3 text-base leading-7 text-white outline-none transition-colors placeholder:text-white/30 focus:border-red-300/70 focus:ring-2 focus:ring-red-300/20 disabled:opacity-50"
                placeholder="粘贴歌词，或输入第一行歌词……"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  id="lyrics-editor-file"
                  data-testid="lyrics-editor-file"
                  type="file"
                  accept=".lrc,.txt,.ttml,text/plain,application/xml,text/xml"
                  onChange={onFileChange}
                  disabled={disabled}
                  className="sr-only"
                />
                <label
                  htmlFor="lyrics-editor-file"
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-white/15 px-3 text-sm font-bold text-white/80 transition-colors hover:border-white/30 hover:bg-white/[0.06] focus-within:ring-2 focus-within:ring-red-300/60"
                >
                  <Icons.Upload size={16} aria-hidden="true" />
                  上传文件
                </label>
                <button
                  type="button"
                  data-testid="lyrics-editor-apply-source"
                  onClick={onApply}
                  disabled={disabled}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-white px-4 text-sm font-extrabold text-black transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 active:bg-red-200 disabled:opacity-50"
                >
                  <ClipboardPaste size={16} aria-hidden="true" />
                  载入歌词
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/45" data-testid="lyrics-editor-detected-format">
            <span>格式：{formatLabels[format]}</span>
            {timing === 'word' ? <span>已保留逐字时间</span> : timing === 'line' ? <span>行级时间</span> : <span>未设置时间</span>}
          </div>
          {inputError ? (
            <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-red-200" role="alert" data-testid="lyrics-editor-input-error">
              <AlertCircle size={16} className="mt-1 shrink-0" aria-hidden="true" />
              {inputError}
            </p>
          ) : null}
          {parseError ? (
            <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-red-200" role="alert" data-testid="lyrics-editor-parse-error">
              <AlertCircle size={16} className="mt-1 shrink-0" aria-hidden="true" />
              {parseError}
            </p>
          ) : null}
        </div>
      </details>
    </section>
  );
};
