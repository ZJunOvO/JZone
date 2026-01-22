import { useLayoutEffect, useRef } from 'react';

const EVENT_NAME = 'jzone:modal-presence';

type ModalEventDetail = { id: string; action: 'open' | 'close' };

const randomId = () => {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `m_${Math.random().toString(36).slice(2)}_${Date.now()}`;
};

export const useModalPresence = (isOpen: boolean) => {
  const idRef = useRef<string>(randomId());
  const activeRef = useRef(false);

  useLayoutEffect(() => {
    const dispatch = (action: 'open' | 'close') => {
      const detail: ModalEventDetail = { id: idRef.current, action };
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
    };

    if (isOpen && !activeRef.current) {
      activeRef.current = true;
      dispatch('open');
    }
    if (!isOpen && activeRef.current) {
      activeRef.current = false;
      dispatch('close');
    }

    return () => {
      if (activeRef.current) {
        activeRef.current = false;
        dispatch('close');
      }
    };
  }, [isOpen]);
};

export const listenModalPresence = (onChange: (openCountDelta: number) => void) => {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<ModalEventDetail>).detail;
    if (!detail) return;
    onChange(detail.action === 'open' ? 1 : -1);
  };
  window.addEventListener(EVENT_NAME, handler as any);
  return () => window.removeEventListener(EVENT_NAME, handler as any);
};
