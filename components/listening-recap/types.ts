import type {
  ListeningRecapPeriod,
  ListeningRecapResponse,
} from '../../services/supabase/listeningRecapTypes';

export type { ListeningRecapPeriod, ListeningRecapResponse };

export type RecapLoadStatus = 'loading' | 'ready' | 'stale' | 'error';

export type RecapPeriodPayload = ListeningRecapResponse['period'];
export type RecapCoveragePayload = ListeningRecapResponse['coverage'];
export type RecapSummary = NonNullable<ListeningRecapResponse['summary']>;
export type RecapOpening = NonNullable<ListeningRecapResponse['opening']>;
export type RecapLongestCompanion = NonNullable<ListeningRecapResponse['longestCompanion']>;
export type RecapOwnedSounds = NonNullable<ListeningRecapResponse['ownedSounds']>;
export type RecapQueue = NonNullable<ListeningRecapResponse['queue']>;
export type RecapError = NonNullable<ListeningRecapResponse['error']>;
export type RecapSong = NonNullable<RecapOpening['coverSong']>;

export interface RecapPeriodPreset {
  key: 'current-month' | 'previous-month' | 'current-year' | 'archive-year';
  label: string;
  period: ListeningRecapPeriod | null;
  disabled?: boolean;
}
