import React from 'react';
import { LyricPlayer as AmllLyricPlayer } from '@applemusic-like-lyrics/react';
import type { LyricLineMouseEvent } from '@applemusic-like-lyrics/core';
import '@applemusic-like-lyrics/core/style.css';
import {
  clampSeekTimeSeconds,
  getActiveLyricsLineIndex,
  getLyricsLineProgress,
  isParsedLyrics,
  isTimedLyrics,
  normalizePlaybackTimeSeconds,
  parseLyrics,
  toAmllLyricLines,
} from '../../utils/lyrics';
import type { LyricsInput, LyricsLine, ParsedLyrics } from '../../utils/lyrics';
import { LyricsEmptyState } from './LyricsEmptyState';

export interface LyricsRendererProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  lyrics?: LyricsInput | ParsedLyrics | null;
  currentTime?: number;
  duration?: number;
  playing?: boolean;
  onSeek?: (time: number) => void;
  reducedMotion?: boolean;
  lowPerformance?: boolean;
}

interface ParsedLyricsState {
  lyrics: ParsedLyrics | null;
  error: Error | null;
}

interface AmllErrorBoundaryProps {
  resetKey: string;
  fallback: React.ReactNode;
  children: React.ReactNode;
}

interface AmllErrorBoundaryState {
  hasError: boolean;
}

class AmllErrorBoundary extends React.Component<AmllErrorBoundaryProps, AmllErrorBoundaryState> {
  state: AmllErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AmllErrorBoundaryState {
    return { hasError: true };
  }

  componentDidUpdate(previousProps: AmllErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

const usePrefersReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefersReducedMotion(mediaQuery.matches);
    update();
    if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', update);
    else mediaQuery.addListener?.(update);

    return () => {
      if (mediaQuery.removeEventListener) mediaQuery.removeEventListener('change', update);
      else mediaQuery.removeListener?.(update);
    };
  }, []);

  return prefersReducedMotion;
};

const usePageVisibility = () => {
  const [pageVisible, setPageVisible] = React.useState(() => (
    typeof document === 'undefined' || document.visibilityState !== 'hidden'
  ));

  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const update = () => setPageVisible(document.visibilityState !== 'hidden');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  return pageVisible;
};

const parseLyricsInput = (input: LyricsRendererProps['lyrics']): ParsedLyricsState => {
  if (!input) return { lyrics: null, error: null };
  if (isParsedLyrics(input)) return { lyrics: input, error: null };

  try {
    return { lyrics: parseLyrics(input), error: null };
  } catch (error) {
    return {
      lyrics: null,
      error: error instanceof Error ? error : new Error('歌词解析失败。'),
    };
  }
};

const formatSeekLabel = (timeMs: number | null) => {
  if (timeMs === null || !Number.isFinite(timeMs)) return '';
  const totalSeconds = Math.max(0, Math.floor(timeMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
};

interface LightweightLyricsProps {
  lyrics: ParsedLyrics;
  currentTimeMs: number;
  durationMs?: number;
  animate: boolean;
  onSeek?: (timeMs: number) => void;
}

const LightweightLyrics: React.FC<LightweightLyricsProps> = ({
  lyrics,
  currentTimeMs,
  durationMs,
  animate,
  onSeek,
}) => {
  const activeIndex = isTimedLyrics(lyrics)
    ? getActiveLyricsLineIndex(lyrics.lines, currentTimeMs)
    : -1;
  const lineRefs = React.useRef<Array<HTMLDivElement | null>>([]);

  React.useEffect(() => {
    if (activeIndex < 0) return;
    const activeElement = lineRefs.current[activeIndex];
    activeElement?.scrollIntoView({
      block: 'center',
      behavior: animate ? 'smooth' : 'auto',
    });
  }, [activeIndex, animate]);

  const renderLine = (line: LyricsLine, index: number) => {
    const isActive = index === activeIndex;
    const isPassed = activeIndex >= 0 && index < activeIndex;
    const canSeek = typeof onSeek === 'function' && line.startTimeMs !== null;
    const progress = isActive ? getLyricsLineProgress(line, currentTimeMs, durationMs) : 0;
    const lineClassName = [
      'relative w-full rounded-2xl px-4 py-3 text-left',
      animate ? 'transition-colors duration-200' : 'transition-none',
      isActive ? 'bg-white/[0.08] text-white' : 'text-white/45',
      isPassed ? 'opacity-60' : '',
      canSeek ? 'cursor-pointer hover:bg-white/[0.06] active:bg-white/[0.1]' : '',
    ].filter(Boolean).join(' ');

    const content = (
      <>
        <span className="block whitespace-pre-wrap break-words text-[clamp(1rem,4.8vw,1.5rem)] font-semibold leading-8">
          {line.text}
        </span>
        {line.translatedText && (
          <span className="mt-1 block whitespace-pre-wrap break-words text-sm leading-6 text-white/45">
            {line.translatedText}
          </span>
        )}
        {line.romanizedText && (
          <span className="mt-1 block whitespace-pre-wrap break-words text-xs leading-5 text-white/35">
            {line.romanizedText}
          </span>
        )}
        {isActive && isTimedLyrics(lyrics) && (
          <span
            className={`pointer-events-none absolute inset-x-4 bottom-1 h-0.5 origin-left rounded-full bg-white/45 ${animate ? 'transition-transform duration-150' : 'transition-none'}`}
            style={{ transform: `scaleX(${progress})` }}
            aria-hidden="true"
          />
        )}
      </>
    );

    return (
      <div
        key={line.id}
        ref={(element) => { lineRefs.current[index] = element; }}
        className="scroll-mt-[45%] scroll-mb-[45%]"
        role="listitem"
        data-testid={`lyrics-line-${index}`}
      >
        {canSeek ? (
          <button
            type="button"
            className={lineClassName}
            onClick={() => onSeek?.(line.startTimeMs ?? 0)}
            aria-label={`跳转到 ${formatSeekLabel(line.startTimeMs)}：${line.text}`}
          >
            {content}
          </button>
        ) : (
          <div className={lineClassName}>{content}</div>
        )}
      </div>
    );
  };

  return (
    <div
      className="h-full min-h-[240px] w-full overflow-y-auto overscroll-contain px-2 py-24 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="list"
      aria-label="歌词"
      data-testid="lyrics-lightweight"
      data-lyrics-timing={lyrics.timing}
    >
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center gap-2">
        {lyrics.lines.map(renderLine)}
      </div>
    </div>
  );
};

export const LyricsRenderer: React.FC<LyricsRendererProps> = ({
  lyrics,
  currentTime = 0,
  duration,
  playing = true,
  onSeek,
  reducedMotion = false,
  lowPerformance = false,
  className = '',
  style,
  ...rest
}) => {
  const prefersReducedMotion = usePrefersReducedMotion();
  const pageVisible = usePageVisibility();
  const parsedState = React.useMemo(() => parseLyricsInput(lyrics), [lyrics]);
  const parsedLyrics = parsedState.lyrics;
  const safeDuration = typeof duration === 'number' && Number.isFinite(duration) && duration >= 0
    ? duration
    : undefined;
  const safeCurrentTime = normalizePlaybackTimeSeconds(currentTime, safeDuration);
  const currentTimeMs = Math.round(safeCurrentTime * 1_000);
  const durationMs = safeDuration === undefined ? undefined : Math.round(safeDuration * 1_000);
  const seekToMs = React.useCallback((timeMs: number) => {
    if (!onSeek || !Number.isFinite(timeMs)) return;
    onSeek(clampSeekTimeSeconds(timeMs, safeDuration));
  }, [onSeek, safeDuration]);
  const animationReduced = reducedMotion || lowPerformance || prefersReducedMotion;
  const amllAvailable = typeof window !== 'undefined'
    && typeof document !== 'undefined'
    && typeof window.requestAnimationFrame === 'function'
    && typeof window.ResizeObserver !== 'undefined';
  const useLightweight = animationReduced || !amllAvailable || !isTimedLyrics(parsedLyrics);
  const amllLines = React.useMemo(
    () => (parsedLyrics ? toAmllLyricLines(parsedLyrics, durationMs) : []),
    [parsedLyrics, durationMs],
  );

  if (parsedState.error) {
    return (
      <div {...rest} className={`relative h-full min-h-[240px] w-full ${className}`.trim()} style={style} data-testid="lyrics-renderer">
        <LyricsEmptyState
          title="歌词无法显示"
          description="歌词格式无法解析，请检查内容后重试。"
        />
      </div>
    );
  }

  if (!parsedLyrics || parsedLyrics.lines.length === 0) {
    return (
      <div {...rest} className={`relative h-full min-h-[240px] w-full ${className}`.trim()} style={style} data-testid="lyrics-renderer">
        <LyricsEmptyState />
      </div>
    );
  }

  const lightweight = (
    <LightweightLyrics
      lyrics={parsedLyrics}
      currentTimeMs={currentTimeMs}
      durationMs={durationMs}
      animate={!animationReduced}
      onSeek={onSeek ? seekToMs : undefined}
    />
  );

  return (
    <div
      {...rest}
      className={`relative h-full min-h-[240px] w-full overflow-hidden ${className}`.trim()}
      style={style}
      data-testid="lyrics-renderer"
      data-lyrics-renderer-mode={useLightweight ? 'lightweight' : 'amll'}
      data-lyrics-timing={parsedLyrics.timing}
    >
      {useLightweight || amllLines.length === 0 ? lightweight : (
        <AmllErrorBoundary
          resetKey={`${parsedLyrics.format}:${parsedLyrics.rawContent}`}
          fallback={lightweight}
        >
          <AmllLyricPlayer
            className="h-full w-full"
            lyricLines={amllLines}
            currentTime={currentTimeMs}
            playing={playing}
            disabled={!pageVisible}
            enableSpring={!animationReduced}
            enableScale={!animationReduced}
            enableBlur={!animationReduced}
            wordFadeWidth={parsedLyrics.timing === 'word' ? 0.5 : 0.0001}
            onLyricLineClick={(event: LyricLineMouseEvent) => seekToMs(event.line.getLine().startTime)}
            style={{
              '--amll-lp-font-size': 'clamp(17px, 4.8vw, 28px)',
              '--amll-lp-color': 'rgba(255, 255, 255, 0.94)',
            } as React.CSSProperties}
          />
        </AmllErrorBoundary>
      )}
    </div>
  );
};
