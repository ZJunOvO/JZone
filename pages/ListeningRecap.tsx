import React, { useRef } from 'react';
import { Icons } from '../components/Icons';
import {
  Ending,
  LongestCompanion,
  Opening,
  OwnedSounds,
  PeriodSelector,
  Status,
  Summary,
} from '../components/listening-recap';
import { useListeningRecap } from '../hooks/useListeningRecap';
import type {
  ListeningRecapPeriod,
  ListeningRecapResponse,
} from '../services/supabase/listeningRecapTypes';

export interface ListeningRecapPageProps {
  period?: ListeningRecapPeriod;
  onBack: () => void;
  onPeriodChange: (period: ListeningRecapPeriod) => void;
  onPlaySong: (songId: string) => void;
  onPlayQueue: (songIds: string[], startSongId: string) => void;
}

const LoadingStory: React.FC = () => (
  <div className="border-y border-white/10 px-5 py-8 sm:px-8" role="status" data-testid="listening-recap-loading">
    <div className="mx-auto flex max-w-3xl items-center gap-3 text-sm font-semibold text-white/55">
      <span className="h-2 w-2 rounded-full bg-white/70" aria-hidden="true" />
      正在加载本期回顾…
    </div>
  </div>
);

const getResponsePeriod = (response: ListeningRecapResponse | null): ListeningRecapPeriod | null => {
  if (!response?.period) return null;
  return {
    type: response.period.type,
    id: response.period.id,
  };
};

export const ListeningRecap: React.FC<ListeningRecapPageProps> = ({
  period,
  onBack,
  onPeriodChange,
  onPlaySong,
  onPlayQueue,
}) => {
  const recap = useListeningRecap(period);
  const response = recap.response;
  const responsePeriod = getResponsePeriod(response);
  const selectedPeriod = period ?? responsePeriod ?? recap.currentRequestPeriod;
  const referencePeriodRef = useRef<ListeningRecapPeriod | null>(period ?? responsePeriod ?? recap.currentRequestPeriod);
  const referencePeriod = referencePeriodRef.current ?? period ?? responsePeriod ?? recap.currentRequestPeriod;
  const loadError = response?.error ?? (recap.error
    ? { code: recap.error.code, retryable: recap.error.retryable }
    : null);
  const isLoadingWithoutResponse = recap.status === 'loading' && !response;
  const isLegacyOnly = response?.coverage?.status === 'legacy_only';
  const hasRenderableResponse = Boolean(response && !isLegacyOnly && response.coverage.status !== 'error');

  return (
    <div
      className="min-h-full bg-[#070709] text-white"
      data-testid="listening-recap-page"
      aria-busy={isLoadingWithoutResponse}
    >
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070709]/85 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/80"
              aria-label="返回"
              data-testid="listening-recap-back"
            >
              <Icons.ChevronLeft size={20} aria-hidden="true" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-white">聆听回顾</p>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-white/40">{selectedPeriod ? `${selectedPeriod.type === 'month' ? '按月' : '按年'}查看` : '正在准备本期'}</p>
            </div>
          </div>
          <div className="min-w-0 w-full max-w-full overflow-x-auto sm:w-auto sm:shrink-0 sm:overflow-visible">
            <PeriodSelector
              selectedPeriod={selectedPeriod}
              referencePeriod={referencePeriod}
              onPeriodChange={onPeriodChange}
            />
          </div>
        </div>
      </header>

      <main className="overflow-hidden">
        <Opening
          period={response?.period ?? null}
          fallbackPeriod={period ?? recap.currentRequestPeriod}
          opening={response?.opening ?? null}
          coverage={response?.coverage ?? null}
          loading={isLoadingWithoutResponse}
        />

        <Status
          loadStatus={recap.status}
          coverage={response?.coverage ?? null}
          period={response?.period ?? null}
          error={loadError}
          hasResponse={Boolean(response)}
          onRetry={() => {
            void recap.retry();
          }}
        />

        {isLoadingWithoutResponse ? <LoadingStory /> : null}

        {hasRenderableResponse && response ? (
          <>
            {response.summary ? (
              <Summary summary={response.summary} coverage={response.coverage} period={response.period} />
            ) : null}
            {response.longestCompanion?.songs?.length ? (
              <LongestCompanion companion={response.longestCompanion} onPlaySong={onPlaySong} />
            ) : null}
            {response.ownedSounds?.songs?.length ? (
              <OwnedSounds ownedSounds={response.ownedSounds} onPlaySong={onPlaySong} />
            ) : null}
            <Ending queue={response.queue} onPlayQueue={onPlayQueue} />
          </>
        ) : null}
      </main>
    </div>
  );
};

export const ListeningRecapPage = ListeningRecap;

export default ListeningRecapPage;
