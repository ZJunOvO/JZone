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
      <header className="sticky top-0 z-30 bg-transparent px-4 pb-3 pt-[calc(env(safe-area-inset-top)+10px)] sm:px-6">
        <div className="pointer-events-none absolute inset-x-0 -top-2 bottom-[-2.5rem] z-0" aria-hidden="true">
          <div className="absolute inset-0 bg-[#070709]/78 backdrop-blur-xl [mask-image:linear-gradient(to_bottom,black_0%,black_54%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_54%,transparent_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-[#070709]/80 via-[#070709]/35 to-transparent blur-md" />
        </div>
        <div className="relative z-10 mx-auto flex min-h-11 max-w-4xl items-center justify-center">
          <button
            type="button"
            onClick={onBack}
            className="absolute left-0 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/80 motion-reduce:transition-none"
            aria-label="返回"
            data-testid="listening-recap-back"
          >
            <Icons.ChevronLeft size={20} aria-hidden="true" />
          </button>
          <div className="w-full px-14">
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
