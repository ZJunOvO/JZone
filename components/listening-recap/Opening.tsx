import React from 'react';
import { Icons } from '../Icons';
import { NarrativeReveal } from './NarrativeReveal';
import { formatCoverageStart, formatPeriodRange, formatPeriodTitle } from './formatters';
import { Artwork } from './Artwork';
import type {
  ListeningRecapPeriod,
  RecapCoveragePayload,
  RecapOpening,
  RecapPeriodPayload,
} from './types';

interface OpeningProps {
  period: RecapPeriodPayload | null;
  fallbackPeriod?: ListeningRecapPeriod | null;
  opening?: RecapOpening | null;
  coverage?: RecapCoveragePayload | null;
  loading?: boolean;
}

export const Opening: React.FC<OpeningProps> = ({ period, fallbackPeriod, opening, coverage, loading = false }) => {
  const title = opening?.title?.trim() || formatPeriodTitle(period ?? fallbackPeriod);
  const titleSuffix = '的声音';
  const titleHasSuffix = title.endsWith(titleSuffix);
  const titleLead = titleHasSuffix ? title.slice(0, -titleSuffix.length) : title;
  const coverSong = opening?.coverSong ?? null;
  const range = formatPeriodRange(period);
  const isPartialCoverage = coverage?.status === 'event_partial';
  const coverageStart = coverage?.status === 'event_partial'
    ? formatCoverageStart(coverage.coverageStart, period?.timezone)
    : null;

  return (
    <NarrativeReveal className="px-5 pb-16 pt-8 sm:px-8 sm:pb-24 sm:pt-12" data-testid="listening-recap-opening">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.24em] text-white/45">
          <span className="h-px w-8 bg-red-400/70" aria-hidden="true" />
          <span>聆听回顾</span>
        </div>

        <div className="mx-auto max-w-[420px]">
          {loading ? (
            <div
              className="aspect-square w-full rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.1),transparent_32%),linear-gradient(145deg,#19171f,#09090b)]"
              aria-hidden="true"
            />
          ) : coverSong ? (
            <Artwork song={coverSong} size="hero" />
          ) : (
            <div
              className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_30%_20%,rgba(244,63,94,0.25),transparent_28%),radial-gradient(circle_at_76%_74%,rgba(99,102,241,0.2),transparent_36%),linear-gradient(145deg,#17151d,#070708_68%)]"
              aria-hidden="true"
            >
              <div className="absolute h-40 w-40 rounded-full border border-white/10 bg-white/[0.025] shadow-[0_0_90px_rgba(244,63,94,0.16)]" />
              <Icons.Music2 className="relative text-white/30" size={44} strokeWidth={1.2} />
            </div>
          )}
        </div>

        <div className="mt-10 max-w-2xl">
          <p className="text-sm font-semibold text-red-300/85">一段时间，几种声音</p>
          <h1 className="mt-4 text-[2.7rem] font-black leading-[0.94] text-white sm:text-[5.8rem]">
            {titleHasSuffix ? (
              <>
                <span className="block">{titleLead}</span>
                <span className="block whitespace-nowrap">{titleSuffix}</span>
              </>
            ) : title}
          </h1>
          <p className="mt-6 text-sm font-medium leading-7 text-white/55">
            {range ?? (loading ? '正在整理本期的时间范围…' : '本期时间范围暂不可用')}
          </p>
          {isPartialCoverage ? (
            <p className="mt-2 text-xs font-medium leading-6 text-amber-200/70">
              {coverageStart
                ? `从 ${coverageStart} 起有可查记录，以下内容只覆盖这一段。`
                : '本期只覆盖已知起点之后的可查记录。'}
            </p>
          ) : null}
        </div>
      </div>
    </NarrativeReveal>
  );
};
