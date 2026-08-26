import React from 'react';
import { NarrativeReveal } from './NarrativeReveal';
import { formatCount, formatCoverageStart } from './formatters';
import type { RecapCoveragePayload, RecapPeriodPayload, RecapSummary } from './types';

interface SummaryProps {
  summary: RecapSummary;
  coverage?: RecapCoveragePayload | null;
  period?: RecapPeriodPayload | null;
}

export const Summary: React.FC<SummaryProps> = ({ summary, coverage, period }) => {
  const hasEvents = summary.validPlayCount > 0;
  const partialStart = coverage?.status === 'event_partial'
    ? formatCoverageStart(coverage.coverageStart, period?.timezone)
    : null;
  const isPartialCoverage = coverage?.status === 'event_partial';

  return (
    <NarrativeReveal className="border-t border-white/10 px-5 py-16 sm:px-8 sm:py-24" data-testid="listening-recap-summary">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/40">真实摘要</p>
        <h2 className="mt-5 max-w-2xl text-3xl font-extrabold leading-tight text-white sm:text-5xl">
          {hasEvents ? '这段时间，留下了这些事实。' : '这段时间，还没有新的声音被确认。'}
        </h2>

        <div className="mt-10 flex flex-wrap items-baseline gap-x-3 gap-y-2 text-xl font-medium leading-tight text-white/65 sm:text-2xl">
          <span><strong className="text-5xl font-black text-white sm:text-7xl">{formatCount(summary.listeningDayCount)}</strong> 天</span>
          <span className="text-white/25" aria-hidden="true">·</span>
          <span><strong className="text-5xl font-black text-white sm:text-7xl">{formatCount(summary.songCount)}</strong> 首</span>
          <span className="text-white/25" aria-hidden="true">·</span>
          <span><strong className="text-5xl font-black text-white sm:text-7xl">{formatCount(summary.validPlayCount)}</strong> 次有效播放</span>
        </div>

        <p className="mt-8 max-w-xl text-sm font-medium leading-7 text-white/48">
          {hasEvents
            ? `你在 ${formatCount(summary.listeningDayCount)} 天听过 ${formatCount(summary.songCount)} 首歌，共 ${formatCount(summary.validPlayCount)} 次有效播放。`
            : '本期还没有可回顾的有效播放。'}
        </p>
        {isPartialCoverage ? (
          <p className="mt-3 text-xs font-semibold leading-6 text-amber-200/70">
            {partialStart
              ? `以上数字只覆盖从 ${partialStart} 起的已确认记录。`
              : '以上数字只覆盖已知起点之后的已确认记录。'}
          </p>
        ) : null}
      </div>
    </NarrativeReveal>
  );
};
