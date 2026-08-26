import React, { useState } from 'react';
import type { ListeningRecapPeriod } from '../services/supabase/listeningRecapTypes';

const LISTENING_RECAP_PATH = '/listening-recap';
const LISTENING_RECAP_NAVIGATION_EVENT = 'jzone:navigate-listening-recap';
const LISTENING_RECAP_HISTORY_TYPE = 'listening-recap';

type ListeningRecapRoute = {
  isListeningRecap: boolean;
  period: ListeningRecapPeriod | null;
  shouldNormalize: boolean;
};

const getCurrentListeningRecapPeriod = (): ListeningRecapPeriod => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    if (year && month) return { type: 'month', id: `${year}-${month}` };
  } catch {}

  const now = new Date();
  return {
    type: 'month',
    id: `${String(now.getUTCFullYear()).padStart(4, '0')}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
  };
};

const parseListeningRecapPeriodValue = (value: string | null) => {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const month = Number(value.slice(5));
    const year = Number(value.slice(0, 4));
    if (year > 0 && month >= 1 && month <= 12) {
      return { period: { type: 'month', id: value } as ListeningRecapPeriod, valid: true };
    }
  }
  if (value && /^\d{4}$/.test(value) && Number(value) > 0) {
    return { period: { type: 'year', id: value } as ListeningRecapPeriod, valid: true };
  }
  return { period: getCurrentListeningRecapPeriod(), valid: value === null };
};

const readListeningRecapRoute = (): ListeningRecapRoute => {
  if (typeof window === 'undefined') {
    return { isListeningRecap: false, period: null, shouldNormalize: false };
  }
  const path = window.location.pathname || '/';
  const isListeningRecap = path === LISTENING_RECAP_PATH || path === `${LISTENING_RECAP_PATH}/`;
  if (!isListeningRecap) return { isListeningRecap: false, period: null, shouldNormalize: false };

  const params = new URLSearchParams(window.location.search);
  const rawPeriod = params.get('period');
  const parsed = parseListeningRecapPeriodValue(rawPeriod);
  return {
    isListeningRecap: true,
    period: parsed.period,
    shouldNormalize: params.has('period') && !parsed.valid,
  };
};

const serializeListeningRecapPeriod = (period: ListeningRecapPeriod) => period.id;

const buildListeningRecapUrl = (period?: ListeningRecapPeriod) => {
  const params = new URLSearchParams();
  if (period) params.set('period', serializeListeningRecapPeriod(period));
  const query = params.toString();
  return `${LISTENING_RECAP_PATH}${query ? `?${query}` : ''}`;
};

const normalizeListeningRecapPeriod = (period?: ListeningRecapPeriod | null) => {
  if (!period) return getCurrentListeningRecapPeriod();
  const parsed = parseListeningRecapPeriodValue(period.id);
  if (!parsed.valid || parsed.period.type !== period.type) return getCurrentListeningRecapPeriod();
  return parsed.period;
};

export interface AppRouteState {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  profileUserId?: string;
  setProfileUserId: (id?: string) => void;
  collectionId: string | null;
  openCollection: (id: string, push: boolean) => void;
  closeCollection: () => void;
  isListeningRecap: boolean;
  listeningRecapPeriod: ListeningRecapPeriod | null;
  openListeningRecap: (period?: ListeningRecapPeriod, push?: boolean) => void;
  closeListeningRecap: () => void;
  replaceListeningRecapPeriod: (period: ListeningRecapPeriod) => void;
}

const parseCollectionIdFromPath = () => {
  try {
    const path = window.location.pathname || '/';
    const match = path.match(/^\/collection\/([^/]+)$/i);
    if (!match) return null;
    const id = match[1];
    return id ? decodeURIComponent(id) : null;
  } catch {
    return null;
  }
};

const readInitialTab = () => {
  try {
    return localStorage.getItem('jzone.activeTab') || 'home';
  } catch {
    return 'home';
  }
};

export const useAppRoute = (): AppRouteState => {
  const [activeTab, setActiveTabState] = useState(readInitialTab);
  const [profileUserId, setProfileUserId] = useState<string | undefined>(undefined);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [isListeningRecap, setIsListeningRecap] = useState(() => readListeningRecapRoute().isListeningRecap);
  const [listeningRecapPeriod, setListeningRecapPeriod] = useState<ListeningRecapPeriod | null>(
    () => readListeningRecapRoute().period,
  );

  const setActiveTab = React.useCallback((tab: string) => {
    setActiveTabState(tab);
    try {
      localStorage.setItem('jzone.activeTab', tab);
    } catch {}
  }, []);

  const openCollection = React.useCallback((id: string, push: boolean) => {
    setCollectionId(id);
    if (push) {
      try {
        window.history.pushState({ type: 'collection', id }, '', `/collection/${encodeURIComponent(id)}`);
      } catch {}
    }
  }, []);

  const closeCollection = React.useCallback(() => {
    const current = parseCollectionIdFromPath();
    setCollectionId(null);
    if (current) {
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-testid="profile-collection-card-${CSS.escape(current)}"]`)?.focus();
      });
    }
    if (current) {
      try {
        window.history.back();
      } catch {}
    }
  }, []);

  const syncListeningRecapRoute = React.useCallback(() => {
    const route = readListeningRecapRoute();
    setIsListeningRecap(route.isListeningRecap);
    setListeningRecapPeriod(route.period);
    if (route.shouldNormalize) {
      try {
        window.history.replaceState(window.history.state, '', buildListeningRecapUrl(route.period ?? undefined));
      } catch {}
    }
  }, []);

  const openListeningRecap = React.useCallback((period?: ListeningRecapPeriod, push = true) => {
    const normalizedPeriod = normalizeListeningRecapPeriod(period);
    setIsListeningRecap(true);
    setListeningRecapPeriod(normalizedPeriod);
    setCollectionId(null);
    try {
      const currentState = window.history.state && typeof window.history.state === 'object'
        ? window.history.state as Record<string, unknown>
        : {};
      const nextState = {
        ...currentState,
        type: LISTENING_RECAP_HISTORY_TYPE,
        pushed: push,
        period: normalizedPeriod,
      };
      const nextUrl = buildListeningRecapUrl(period ? normalizedPeriod : undefined);
      if (push) window.history.pushState(nextState, '', nextUrl);
      else window.history.replaceState(nextState, '', nextUrl);
    } catch {}
  }, []);

  const closeListeningRecap = React.useCallback(() => {
    const currentRoute = readListeningRecapRoute();
    if (!currentRoute.isListeningRecap) {
      setIsListeningRecap(false);
      setListeningRecapPeriod(null);
      return;
    }

    const state = window.history.state && typeof window.history.state === 'object'
      ? window.history.state as { type?: string; pushed?: boolean }
      : null;
    setIsListeningRecap(false);
    setListeningRecapPeriod(null);
    if (state?.type === LISTENING_RECAP_HISTORY_TYPE && state.pushed) {
      try {
        window.history.back();
        return;
      } catch {}
    }
    try {
      window.history.replaceState(window.history.state, '', '/');
    } catch {}
  }, []);

  const replaceListeningRecapPeriod = React.useCallback((period: ListeningRecapPeriod) => {
    const normalizedPeriod = normalizeListeningRecapPeriod(period);
    setIsListeningRecap(true);
    setListeningRecapPeriod(normalizedPeriod);
    try {
      const currentState = window.history.state && typeof window.history.state === 'object'
        ? window.history.state as Record<string, unknown>
        : {};
      window.history.replaceState(
        {
          ...currentState,
          type: LISTENING_RECAP_HISTORY_TYPE,
          period: normalizedPeriod,
        },
        '',
        buildListeningRecapUrl(normalizedPeriod),
      );
    } catch {}
  }, []);

  React.useEffect(() => {
    const initial = parseCollectionIdFromPath();
    if (initial) setCollectionId(initial);
    const onPop = () => {
      const id = parseCollectionIdFromPath();
      setCollectionId(id);
      syncListeningRecapRoute();
    };
    syncListeningRecapRoute();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [syncListeningRecapRoute]);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent)?.detail as { userId?: string } | undefined;
      setProfileUserId(detail?.userId);
      setActiveTab('profile');
      setCollectionId(null);
    };
    window.addEventListener('jzone:navigate-profile', handler as any);
    return () => window.removeEventListener('jzone:navigate-profile', handler as any);
  }, [setActiveTab]);

  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ period?: ListeningRecapPeriod }>).detail;
      openListeningRecap(detail?.period, true);
    };
    window.addEventListener(LISTENING_RECAP_NAVIGATION_EVENT, handler as EventListener);
    return () => window.removeEventListener(LISTENING_RECAP_NAVIGATION_EVENT, handler as EventListener);
  }, [openListeningRecap]);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent)?.detail as { id?: string } | undefined;
      if (!detail?.id) return;
      openCollection(detail.id, true);
    };
    window.addEventListener('jzone:navigate-collection', handler as any);
    return () => window.removeEventListener('jzone:navigate-collection', handler as any);
  }, [openCollection]);

  React.useEffect(() => {
    const handler = () => {
      setProfileUserId(undefined);
      setCollectionId(null);
      setActiveTab('library');
    };
    window.addEventListener('jzone:navigate-library', handler);
    return () => window.removeEventListener('jzone:navigate-library', handler);
  }, [setActiveTab]);

  return {
    activeTab,
    setActiveTab,
    profileUserId,
    setProfileUserId,
    collectionId,
    openCollection,
    closeCollection,
    isListeningRecap,
    listeningRecapPeriod,
    openListeningRecap,
    closeListeningRecap,
    replaceListeningRecapPeriod,
  };
};
