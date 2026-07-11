import React, { createContext, useContext, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import {
  feedback,
  getFeedbackServerSnapshot,
  getFeedbackSnapshot,
  subscribeToFeedback,
  type FeedbackApi,
} from './feedback';
import { FeedbackToast } from './FeedbackToast';
import './feedback.css';

const FeedbackContext = createContext<FeedbackApi | null>(null);

export interface FeedbackProviderProps {
  children: React.ReactNode;
}

export const FeedbackProvider: React.FC<FeedbackProviderProps> = ({ children }) => {
  const items = useSyncExternalStore(
    subscribeToFeedback,
    getFeedbackSnapshot,
    getFeedbackServerSnapshot,
  );

  const viewport = typeof document === 'undefined'
    ? null
    : createPortal(
        <div className="jzone-feedback-viewport" role="region" aria-label="应用反馈">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <FeedbackToast key={item.id} item={item} />
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      );

  return (
    <FeedbackContext.Provider value={feedback}>
      {children}
      {viewport}
    </FeedbackContext.Provider>
  );
};

export const useFeedback = () => {
  const api = useContext(FeedbackContext);
  if (!api) throw new Error('useFeedback 必须在 FeedbackProvider 内使用');
  return api;
};
