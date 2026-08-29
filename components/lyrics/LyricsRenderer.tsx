import React from 'react';
import { LyricPlayer as AmllLyricPlayer } from '@applemusic-like-lyrics/react';
import type { LyricPlayerRef } from '@applemusic-like-lyrics/react';
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
  /** 全屏播放页在首行允许向下阻尼拖动，最多到歌词视窗中线。 */
  elasticTopPull?: boolean;
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

const INTRO_DOTS_FADE_MS = 700;

interface LyricsIntroDotsProps {
  currentTimeMs: number;
  firstLineTimeMs: number;
  align: 'left' | 'right';
  animate: boolean;
}

const LyricsIntroDots: React.FC<LyricsIntroDotsProps> = ({
  currentTimeMs,
  firstLineTimeMs,
  align,
  animate,
}) => {
  if (currentTimeMs >= firstLineTimeMs) return null;

  const remainingMs = firstLineTimeMs - currentTimeMs;
  const exitOpacity = Math.min(1, Math.max(0, remainingMs / INTRO_DOTS_FADE_MS));
  const introProgress = firstLineTimeMs > 0
    ? Math.min(1, Math.max(0, currentTimeMs / firstLineTimeMs))
    : 1;
  const getDotProgress = (start: number) => {
    const progress = Math.min(1, Math.max(0, (introProgress - start) / 0.18));
    return progress * progress * (3 - 2 * progress);
  };

  return (
    <div
      className={`pointer-events-none absolute inset-x-4 top-10 z-20 flex ${align === 'right' ? 'justify-end' : 'justify-start'} ${animate ? 'transition-opacity duration-150' : 'transition-none'}`}
      style={{ opacity: exitOpacity }}
      aria-hidden="true"
      data-testid="lyrics-intro-dots"
      data-lyrics-direction={align}
      data-current-time-ms={currentTimeMs}
      data-first-line-time-ms={firstLineTimeMs}
      data-intro-state={remainingMs <= INTRO_DOTS_FADE_MS ? 'ending' : 'active'}
    >
      <span className="flex items-center gap-2 px-1 py-2">
        {[0.08, 0.36, 0.64].map((start, index) => {
          const dotProgress = getDotProgress(start);
          return (
          <span
            key={start}
            className={`h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_14px_rgba(255,255,255,0.22)] ${animate ? 'transition-[opacity,transform] duration-200 ease-out' : ''}`}
            style={{ opacity: dotProgress, transform: `scale(${0.72 + dotProgress * 0.28})` }}
            data-testid={`lyrics-intro-dot-${index}`}
          />
          );
        })}
      </span>
    </div>
  );
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
      block: 'start',
      behavior: animate ? 'smooth' : 'auto',
    });
  }, [activeIndex, animate]);

  const renderLine = (line: LyricsLine, index: number) => {
    const isActive = index === activeIndex;
    const isPassed = activeIndex >= 0 && index < activeIndex;
    const canSeek = typeof onSeek === 'function' && line.startTimeMs !== null;
    const progress = isActive ? getLyricsLineProgress(line, currentTimeMs, durationMs) : 0;
    const direction = line.isDuet ? 'right' : 'left';
    const role = line.isBackground ? 'background' : line.isDuet ? 'duet' : 'lead';
    const lineClassName = [
      'relative w-full rounded-2xl px-4',
      line.isBackground ? 'py-2' : 'py-3',
      direction === 'right' ? 'text-right' : 'text-left',
      animate ? 'transition-colors duration-200' : 'transition-none',
      line.isBackground
        ? (isActive ? 'bg-white/[0.045] text-white/65' : 'text-white/35')
        : (isActive ? 'bg-white/[0.08] text-white' : 'text-white/48'),
      isPassed ? 'opacity-60' : '',
      canSeek ? 'cursor-pointer hover:bg-white/[0.06] active:bg-white/[0.1]' : '',
    ].filter(Boolean).join(' ');
    const mainLineClassName = line.isBackground
      ? 'text-[clamp(1rem,4.2vw,1.4rem)] font-bold leading-[1.3]'
      : isActive
        ? 'text-[clamp(1.65rem,7vw,2.75rem)] font-black leading-[1.14] tracking-[-0.025em]'
        : 'text-[clamp(1.35rem,6vw,2.2rem)] font-extrabold leading-[1.18] tracking-[-0.02em]';

    const content = (
      <>
        <span className={`block whitespace-pre-wrap break-words ${mainLineClassName}`}>
          {line.text}
        </span>
        {line.translatedText && (
          <span className={`mt-1 block whitespace-pre-wrap break-words leading-6 text-white/45 ${line.isBackground ? 'text-xs' : 'text-sm'}`}>
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
            className={`pointer-events-none absolute inset-x-4 bottom-1 h-0.5 rounded-full bg-white/45 ${direction === 'right' ? 'origin-right' : 'origin-left'} ${animate ? 'transition-transform duration-150' : 'transition-none'}`}
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
        className="scroll-mt-[24%] scroll-mb-[38%]"
        role="listitem"
        data-testid={`lyrics-line-${index}`}
        data-lyrics-role={role}
        data-lyrics-direction={direction}
        data-lyrics-active={isActive ? 'true' : 'false'}
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
      className="h-full min-h-[240px] w-full overflow-y-auto overscroll-contain px-1 py-20 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
  elasticTopPull = false,
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
  const amllPlayerRef = React.useRef<LyricPlayerRef>(null);
  const pullStartRef = React.useRef<{ pointerId: number; y: number; maxOffset: number } | null>(null);
  const [topPullOffset, setTopPullOffset] = React.useState(0);
  const [isTopPulling, setIsTopPulling] = React.useState(false);
  const handleAmllLineClick = React.useCallback((event: LyricLineMouseEvent) => {
    const lyricPlayer = amllPlayerRef.current?.lyricPlayer;
    lyricPlayer?.resetScroll();
    seekToMs(event.line.getLine().startTime);
    window.requestAnimationFrame(() => {
      void lyricPlayer?.calcLayout(false, false);
    });
  }, [seekToMs]);
  const animationReduced = reducedMotion || lowPerformance || prefersReducedMotion;
  const amllAvailable = typeof window !== 'undefined'
    && typeof document !== 'undefined'
    && typeof window.requestAnimationFrame === 'function'
    && typeof window.ResizeObserver !== 'undefined';
  const useLightweight = animationReduced || !amllAvailable || !isTimedLyrics(parsedLyrics);
  const firstTimedLine = React.useMemo(() => parsedLyrics?.lines.find((line) => (
    line.text.trim().length > 0
    && line.startTimeMs !== null
    && Number.isFinite(line.startTimeMs)
    && line.startTimeMs >= 0
  )) ?? null, [parsedLyrics]);
  const amllLines = React.useMemo(
    () => (parsedLyrics ? toAmllLyricLines(parsedLyrics, durationMs) : []),
    [parsedLyrics, durationMs],
  );
  const activeLineIndex = React.useMemo(() => (
    parsedLyrics && parsedLyrics.timing !== 'none'
      ? getActiveLyricsLineIndex(parsedLyrics.lines, currentTimeMs)
      : -1
  ), [currentTimeMs, parsedLyrics]);
  React.useEffect(() => {
    if (elasticTopPull) return;
    pullStartRef.current = null;
    setIsTopPulling(false);
    setTopPullOffset(0);
  }, [elasticTopPull]);

  const handleTopPullStart = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!elasticTopPull || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const lyricPlayer = amllPlayerRef.current?.lyricPlayer as unknown as {
      scrollState?: {
        scrollOffset: number;
        scrollBoundary: { minOffset: number };
      };
    } | undefined;
    const scrollState = lyricPlayer?.scrollState;
    const isAtFirstLineBoundary = scrollState
      ? scrollState.scrollOffset <= scrollState.scrollBoundary.minOffset + 2
      : activeLineIndex <= 0;
    if (!isAtFirstLineBoundary) return;
    pullStartRef.current = {
      pointerId: event.pointerId,
      y: event.clientY,
      maxOffset: Math.max(0, event.currentTarget.clientHeight * 0.22),
    };
    setIsTopPulling(true);
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // 合成事件或旧浏览器可能没有可捕获的活动指针，拖动状态仍可正常工作。
    }
  }, [activeLineIndex, elasticTopPull]);

  const handleTopPullMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = pullStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const deltaY = event.clientY - start.y;
    if (deltaY <= 0) {
      setTopPullOffset(0);
      return;
    }
    event.preventDefault();
    const maxOffset = start.maxOffset;
    const resistedOffset = maxOffset * (1 - Math.exp(-deltaY / Math.max(1, maxOffset * 1.35)));
    setTopPullOffset(Math.min(maxOffset, resistedOffset));
  }, []);

  const handleTopPullEnd = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = pullStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    pullStartRef.current = null;
    setIsTopPulling(false);
    setTopPullOffset(0);
  }, []);

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
      className={`relative h-full min-h-[240px] w-full overflow-hidden ${elasticTopPull ? 'touch-none' : ''} ${className}`.trim()}
      style={style}
      onPointerDown={handleTopPullStart}
      onPointerMove={handleTopPullMove}
      onPointerUp={handleTopPullEnd}
      onPointerCancel={handleTopPullEnd}
      data-testid="lyrics-renderer"
      data-lyrics-renderer-mode={useLightweight ? 'lightweight' : 'amll'}
      data-lyrics-timing={parsedLyrics.timing}
      data-lyrics-intro-first-ms={firstTimedLine?.startTimeMs ?? undefined}
    >
      {!useLightweight && (
        <style>{`
          .jzone-lyrics-amll .FmKaba_interludeDots { display: none !important; }
          .jzone-lyrics-amll .FmKaba_lyricMainLine { font-weight: 800; }
          .jzone-lyrics-amll .FmKaba_lyricBgLine { opacity: 0.4; }
        `}</style>
      )}
      <div
        className="relative h-full w-full will-change-transform"
        style={{
          transform: `translate3d(0, ${topPullOffset}px, 0)`,
          transition: isTopPulling || animationReduced
            ? 'none'
            : 'transform 520ms cubic-bezier(0.18, 0.86, 0.2, 1.18)',
        }}
        data-testid="lyrics-elastic-layer"
        data-pull-active={isTopPulling ? 'true' : 'false'}
      >
        {firstTimedLine?.startTimeMs !== null && firstTimedLine?.startTimeMs !== undefined && (
          <LyricsIntroDots
            currentTimeMs={currentTimeMs}
            firstLineTimeMs={firstTimedLine.startTimeMs}
            align={firstTimedLine.isDuet ? 'right' : 'left'}
            animate={!animationReduced}
          />
        )}
        <div
          className="h-full w-full [mask-image:linear-gradient(to_bottom,transparent_0,black_7%,black_88%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0,black_7%,black_88%,transparent_100%)]"
          data-testid="lyrics-edge-fade"
        >
          {useLightweight || amllLines.length === 0 ? lightweight : (
            <AmllErrorBoundary
              resetKey={`${parsedLyrics.format}:${parsedLyrics.rawContent}`}
              fallback={lightweight}
            >
              <AmllLyricPlayer
                ref={amllPlayerRef}
                className="jzone-lyrics-amll h-full w-full"
                lyricLines={amllLines}
                currentTime={currentTimeMs}
                playing={playing}
                disabled={!pageVisible}
                enableSpring={!animationReduced}
                enableScale={!animationReduced}
                enableBlur={!animationReduced}
                alignAnchor="top"
                alignPosition={0.28}
                wordFadeWidth={parsedLyrics.timing === 'word' ? 0.5 : 0.0001}
                onLyricLineClick={handleAmllLineClick}
                style={{
                  '--amll-lp-font-size': 'clamp(24px, 6.5vw, 42px)',
                  '--amll-lp-color': 'rgba(255, 255, 255, 0.94)',
                  '--amll-lp-bg-line-scale': '0.62',
                  '--amll-lp-line-width-aspect': '1',
                  '--amll-lp-line-padding-x': '0.18em',
                  fontWeight: 800,
                } as React.CSSProperties}
              />
            </AmllErrorBoundary>
          )}
        </div>
      </div>
    </div>
  );
};
