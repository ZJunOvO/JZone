import React, { useState } from 'react';

export interface AppRouteState {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  profileUserId?: string;
  setProfileUserId: (id?: string) => void;
  collectionId: string | null;
  openCollection: (id: string, push: boolean) => void;
  closeCollection: () => void;
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

  React.useEffect(() => {
    const initial = parseCollectionIdFromPath();
    if (initial) setCollectionId(initial);
    const onPop = () => {
      const id = parseCollectionIdFromPath();
      setCollectionId(id);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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
  };
};
