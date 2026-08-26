import React from 'react';
import { Icons } from '../Icons';
import { NarrativeReveal } from './NarrativeReveal';
import { formatCoverageStart } from './formatters';
import type {
  RecapCoveragePayload,
  RecapError,
  RecapLoadStatus,
  RecapPeriodPayload,
} from './types';

interface StatusProps {
  loadStatus: RecapLoadStatus;
  coverage?: RecapCoveragePayload | null;
  period?: RecapPeriodPayload | null;
  error?: RecapError | null;
  hasResponse: boolean;
  onRetry: () => void;
}

export const Status: React.FC<StatusProps> = ({ loadStatus, coverage, period, error, hasResponse, onRetry }) => {
  const partialStart = coverage?.status === 'event_partial'
    ? formatCoverageStart(coverage.coverageStart, period?.timezone)
    : null;

  if (loadStatus === 'loading' && hasResponse) {
    return (
      <div className="border-y border-white/10 px-5 py-4 sm:px-8" role="status" data-testid="listening-recap-updating">
        <div className="mx-auto flex max-w-3xl items-center gap-3 text-sm font-semibold text-white/55">
          <span className="h-2 w-2 rounded-full bg-red-300" aria-hidden="true" />
          正在更新本期回顾，已确认内容仍然保留。
        </div>
      </div>
    );
  }

  if (loadStatus === 'stale' && hasResponse) {
    return (
      <div className="border-y border-amber-200/15 bg-amber-200/[0.04] px-5 py-4 sm:px-8" role="status" data-testid="listening-recap-stale">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 text-sm font-semibold text-amber-100/75">
          <span>当前显示的是已确认内容，最新更新暂未完成。</span>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-xs font-extrabold text-amber-50 transition-colors hover:bg-amber-100/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/80"
            data-testid="listening-recap-stale-retry"
          >
            <Icons.RotateCcw size={14} aria-hidden="true" />
            重试更新
          </button>
        </div>
      </div>
    );
  }

  if (loadStatus === 'error') {
    const retryable = error?.retryable !== false;
    return (
      <NarrativeReveal className="border-y border-red-300/20 bg-red-300/[0.04] px-5 py-8 sm:px-8" data-testid="listening-recap-error">
        <div className="mx-auto flex max-w-3xl flex-wrap items-end justify-between gap-5" role="alert">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-200/70">回顾暂时不可用</p>
            <p className="mt-3 text-base font-semibold leading-7 text-red-50/85">
              这次请求没有成功，不会把失败显示为 0 次。
            </p>
            <p className="mt-2 text-xs font-medium text-red-100/45">错误码：{error?.code || 'unknown'}</p>
          </div>
          {retryable ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-red-100/25 px-4 text-sm font-extrabold text-red-50 transition-colors hover:bg-red-100/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-100/80"
              data-testid="listening-recap-error-retry"
            >
              <Icons.RotateCcw size={15} aria-hidden="true" />
              重试
            </button>
          ) : null}
        </div>
      </NarrativeReveal>
    );
  }

  if (coverage?.status === 'legacy_only') {
    return (
      <div className="border-y border-amber-200/15 bg-amber-200/[0.035] px-5 py-5 sm:px-8" role="status" data-testid="listening-recap-legacy-only">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-bold text-amber-100/80">已有历史累计，但无法按本期还原。</p>
          <p className="mt-1 text-xs font-medium leading-6 text-amber-100/50">旧累计没有每次播放的时间，不能生成这段时间的数字或章节。</p>
        </div>
      </div>
    );
  }

  if (coverage?.status === 'no_event') {
    return (
      <div className="border-y border-white/10 px-5 py-5 sm:px-8" role="status" data-testid="listening-recap-no-event">
        <div className="mx-auto max-w-3xl text-sm font-semibold text-white/55">本期还没有可回顾的有效播放。</div>
      </div>
    );
  }

  if (coverage?.status === 'event_partial') {
    return (
      <div className="border-y border-amber-200/15 bg-amber-200/[0.035] px-5 py-4 sm:px-8" role="status" data-testid="listening-recap-partial">
        <div className="mx-auto max-w-3xl text-sm font-semibold text-amber-100/70">
          {partialStart ? `本期只覆盖从 ${partialStart} 起的已确认记录。` : '本期只覆盖已知起点之后的已确认记录。'}
        </div>
      </div>
    );
  }

  return null;
};
