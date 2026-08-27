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
    <NarrativeReveal className="px-5 pb-20 pt-10 sm:px-8 sm:pb-28 sm:pt-14" data-testid="listening-recap-opening">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 flex items-center gap-3 text-[10px] font-bold uppercase tracking-normal text-white/42">
          <span className="h-px w-9 bg-red-400/65" aria-hidden="true" />
          <span>聆听回顾</span>
        </div>

        <div className="relative mx-auto w-[min(86vw,420px)]">
          <div className="relative">
            {loading ? (
              <div
                className="aspect-square w-full rounded-[30px] bg-[linear-gradient(145deg,#211d27,#0b0b0d_68%)]"
                aria-hidden="true"
              />
            ) : coverSong ? (
              <Artwork song={coverSong} size="hero" />
            ) : (
              <div
                className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-[30px] bg-[radial-gradient(ellipse_at_30%_20%,rgba(244,63,94,0.25),transparent_32%),radial-gradient(ellipse_at_76%_74%,rgba(99,102,241,0.2),transparent_40%),linear-gradient(145deg,#17151d,#070708_68%)]"
                aria-hidden="true"
              >
                <Icons.Music2 className="relative text-white/30" size={44} strokeWidth={1.2} />
              </div>
            )}
          </div>
        </div>

        <div className="mt-14 max-w-2xl sm:mt-16">
          <p className="text-sm font-semibold tracking-normal text-red-300/85">一段时间，几种声音</p>
          <h1 className="mt-5 text-[2.85rem] font-black leading-[0.92] tracking-normal text-white sm:text-[5.6rem]">
            {titleHasSuffix ? (
              <>
                <span className="block">{titleLead}</span>
                <span className="block whitespace-nowrap">{titleSuffix}</span>
              </>
            ) : title}
          </h1>
          <p className="mt-7 text-sm font-medium leading-7 text-white/55">
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
