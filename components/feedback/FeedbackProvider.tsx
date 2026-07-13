import React, { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import {
  getFeedbackServerSnapshot,
  getFeedbackSnapshot,
  subscribeToFeedback,
} from './feedback';
import { FeedbackToast } from './FeedbackToast';
import './feedback.css';

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
    <>
      {children}
      {viewport}
    </>
  );
};
