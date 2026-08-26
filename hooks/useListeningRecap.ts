import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth';
import { supabaseApi } from '../supabaseApi';
import {
  clearListeningRecapCacheForUser,
  getCurrentListeningRecapPeriod,
  getListeningRecapCacheKey,
  LISTENING_RECAP_CACHE_EVENT,
  readListeningRecapCache,
  writeListeningRecapCache,
} from '../services/supabase/listeningRecapCache';
import {
  listeningRecapErrorFromResponse,
  mapListeningRecapError,
  ListeningRecapApiError,
} from '../services/supabase/listeningRecap';
import { normalizeListeningRecapPeriod, type ListeningRecapPeriod, type ListeningRecapResponse } from '../services/supabase/listeningRecapTypes';

export type ListeningRecapLoadStatus = 'loading' | 'ready' | 'stale' | 'error';

export interface UseListeningRecapResult {
  status: ListeningRecapLoadStatus;
  response: ListeningRecapResponse | null;
  error: ListeningRecapApiError | null;
  retry: () => void;
  period: ListeningRecapPeriod;
  currentRequestPeriod: ListeningRecapPeriod;
  isRefreshing: boolean;
}

export type ListeningRecapPreviewStatus = 'ready' | 'empty';

export interface UseListeningRecapPreviewResult {
  status: ListeningRecapPreviewStatus;
  response: ListeningRecapResponse | null;
  period: ListeningRecapPeriod;
  hasCache: boolean;
  isStale: boolean;
}

interface ListeningRecapHookState {
  status: ListeningRecapLoadStatus;
  response: ListeningRecapResponse | null;
  error: ListeningRecapApiError | null;
  ownerUserId: string | null;
  period: ListeningRecapPeriod;
  isRefreshing: boolean;
}

interface ListeningRecapPreviewState {
  response: ListeningRecapResponse | null;
  ownerUserId: string | null;
  hasCache: boolean;
  isStale: boolean;
}

const inFlightRecapRequests = new Map<string, Promise<ListeningRecapResponse>>();

const periodKey = (period: ListeningRecapPeriod) => `${period.type}:${period.id}`;

const getRequestKey = (userId: string, period: ListeningRecapPeriod) => (
  getListeningRecapCacheKey(userId, period)
);

const fetchRecapOnce = (
  userId: string,
  period: ListeningRecapPeriod,
): Promise<ListeningRecapResponse> => {
  const key = getRequestKey(userId, period);
  const existing = inFlightRecapRequests.get(key);
  if (existing) return existing;

  let request: Promise<ListeningRecapResponse>;
  request = supabaseApi.fetchListeningRecap(period).finally(() => {
    if (inFlightRecapRequests.get(key) === request) inFlightRecapRequests.delete(key);
  });
  inFlightRecapRequests.set(key, request);
  return request;
};

const errorFromResponse = (response: ListeningRecapResponse) => {
  if (response.coverage.status !== 'error') return null;
  return listeningRecapErrorFromResponse(
    response.error ?? { code: 'unknown_error', retryable: false, messageKey: null },
  );
};

const createAuthError = (status: 'signed_out' | 'misconfigured'): ListeningRecapApiError => (
  new ListeningRecapApiError({
    code: status === 'misconfigured' ? 'not_configured' : 'not_authenticated',
    retryable: false,
  })
);

export const useListeningRecap = (period?: ListeningRecapPeriod): UseListeningRecapResult => {
  const { status: authStatus, user } = useAuth();
  const requestedPeriod = useMemo(
    () => period ? normalizeListeningRecapPeriod(period) : getCurrentListeningRecapPeriod(),
    [period?.type, period?.id],
  );
  const requestedPeriodKey = periodKey(requestedPeriod);
  const userId = user?.id ?? null;
  const previousUserIdRef = useRef<string | null>(null);
  const requestGenerationRef = useRef(0);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [state, setState] = useState<ListeningRecapHookState>(() => ({
    status: 'loading',
    response: null,
    error: null,
    ownerUserId: null,
    period: requestedPeriod,
    isRefreshing: false,
  }));

  const retry = useCallback(() => setRetryGeneration((generation) => generation + 1), []);

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    if (previousUserId && previousUserId !== userId) clearListeningRecapCacheForUser(previousUserId);
    previousUserIdRef.current = userId;

    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    let active = true;
    const isCurrent = () => active && requestGenerationRef.current === requestGeneration;
    const baseState = {
      ownerUserId: userId,
      period: requestedPeriod,
    };

    if (authStatus === 'loading') {
      setState({ ...baseState, status: 'loading', response: null, error: null, isRefreshing: false });
      return () => { active = false; };
    }

    if (authStatus === 'misconfigured') {
      setState({
        ...baseState,
        status: 'error',
        response: null,
        error: createAuthError('misconfigured'),
        isRefreshing: false,
      });
      return () => { active = false; };
    }

    if (authStatus !== 'signed_in' || !userId) {
      setState({
        ...baseState,
        status: 'error',
        response: null,
        error: createAuthError('signed_out'),
        isRefreshing: false,
      });
      return () => { active = false; };
    }

    const cached = readListeningRecapCache(userId, requestedPeriod);
    setState({
      ...baseState,
      status: cached ? (cached.isFresh ? 'ready' : 'stale') : 'loading',
      response: cached?.response ?? null,
      error: null,
      isRefreshing: true,
    });

    fetchRecapOnce(userId, requestedPeriod)
      .then((nextResponse) => {
        if (!isCurrent()) return;
        const responseError = errorFromResponse(nextResponse);
        if (responseError) {
          setState((previous) => ({
            ...previous,
            status: previous.response ? 'stale' : 'error',
            error: responseError,
            isRefreshing: false,
          }));
          return;
        }
        try {
          writeListeningRecapCache(userId, nextResponse);
        } catch {
          // 缓存失败不应丢弃本次已确认的服务端响应。
        }
        setState({
          ...baseState,
          status: 'ready',
          response: nextResponse,
          error: null,
          isRefreshing: false,
        });
      })
      .catch((error) => {
        if (!isCurrent()) return;
        const mappedError = mapListeningRecapError(error);
        setState((previous) => ({
          ...previous,
          status: previous.response ? 'stale' : 'error',
          error: mappedError,
          isRefreshing: false,
        }));
      });

    return () => {
      active = false;
    };
  }, [authStatus, requestedPeriodKey, requestedPeriod, retryGeneration, userId]);

  const stateMatchesRequest = state.ownerUserId === userId && periodKey(state.period) === requestedPeriodKey;
  return {
    status: stateMatchesRequest ? state.status : 'loading',
    response: stateMatchesRequest ? state.response : null,
    error: stateMatchesRequest ? state.error : null,
    retry,
    period: requestedPeriod,
    currentRequestPeriod: requestedPeriod,
    isRefreshing: stateMatchesRequest && state.isRefreshing,
  };
};

const readPreviewState = (userId: string | null, period: ListeningRecapPeriod): ListeningRecapPreviewState => {
  if (!userId) return { response: null, ownerUserId: null, hasCache: false, isStale: false };
  const cached = readListeningRecapCache(userId, period);
  return {
    response: cached?.response ?? null,
    ownerUserId: userId,
    hasCache: Boolean(cached),
    isStale: Boolean(cached && !cached.isFresh),
  };
};

export const useListeningRecapPreview = (): UseListeningRecapPreviewResult => {
  const { user } = useAuth();
  const period = useMemo(() => getCurrentListeningRecapPeriod(), []);
  const periodId = period.id;
  const userId = user?.id ?? null;
  const previousUserIdRef = useRef<string | null>(null);
  const [state, setState] = useState<ListeningRecapPreviewState>(() => readPreviewState(userId, period));

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    if (previousUserId && previousUserId !== userId) clearListeningRecapCacheForUser(previousUserId);
    previousUserIdRef.current = userId;

    let active = true;
    const refreshFromCache = () => {
      if (!active) return;
      setState(readPreviewState(userId, { type: 'month', id: periodId }));
    };
    refreshFromCache();
    if (typeof window !== 'undefined') window.addEventListener(LISTENING_RECAP_CACHE_EVENT, refreshFromCache);
    return () => {
      active = false;
      if (typeof window !== 'undefined') window.removeEventListener(LISTENING_RECAP_CACHE_EVENT, refreshFromCache);
    };
  }, [periodId, userId]);

  const stateMatchesUser = state.ownerUserId === userId;
  return {
    status: stateMatchesUser && state.hasCache ? 'ready' : 'empty',
    response: stateMatchesUser ? state.response : null,
    period,
    hasCache: stateMatchesUser && state.hasCache,
    isStale: stateMatchesUser && state.isStale,
  };
};
