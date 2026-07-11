import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2, X, type LucideIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { feedback, type FeedbackItem, type FeedbackKind } from './feedback';

const KIND_META: Record<
  FeedbackKind,
  { Icon: LucideIcon; label: string }
> = {
  success: { Icon: CheckCircle2, label: '成功' },
  error: { Icon: AlertCircle, label: '错误' },
  info: { Icon: Info, label: '提示' },
};

interface FeedbackToastProps {
  item: FeedbackItem;
}

export const FeedbackToast: React.FC<FeedbackToastProps> = ({ item }) => {
  const [isActing, setIsActing] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const remainingRef = useRef(item.duration);
  const reduceMotion = useReducedMotion();
  const { Icon, label } = KIND_META[item.kind];

  const clearTimer = useCallback(() => {
    if (timeoutRef.current === null) return;
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const resumeTimer = useCallback(() => {
    if (remainingRef.current === null || timeoutRef.current !== null || isActing) return;
    startedAtRef.current = Date.now();
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      feedback.dismiss(item.id);
    }, remainingRef.current);
  }, [isActing, item.id]);

  const pauseTimer = useCallback(() => {
    if (timeoutRef.current === null || remainingRef.current === null) return;
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current));
    clearTimer();
  }, [clearTimer]);

  useEffect(() => {
    remainingRef.current = item.duration;
    resumeTimer();
    return clearTimer;
  }, [clearTimer, item.createdAt, item.duration, resumeTimer]);

  useEffect(() => {
    const onWindowBlur = () => pauseTimer();
    const onWindowFocus = () => resumeTimer();
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
    return () => {
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('focus', onWindowFocus);
    };
  }, [pauseTimer, resumeTimer]);

  const runAction = async () => {
    if (!item.action || isActing) return;
    pauseTimer();
    setIsActing(true);
    try {
      await item.action.onClick();
    } catch (error) {
      console.error('反馈操作执行失败', error);
    } finally {
      feedback.dismiss(item.id);
    }
  };

  return (
    <motion.div
      layout={reduceMotion ? false : 'position'}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: reduceMotion ? 0.01 : 0.2, ease: [0.2, 0.8, 0.2, 1] }}
      role={item.kind === 'error' ? 'alert' : 'status'}
      aria-live={item.kind === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={`jzone-feedback jzone-feedback--${item.kind}`}
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
      onFocusCapture={pauseTimer}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) resumeTimer();
      }}
      data-feedback-id={item.id}
      data-testid={`feedback-${item.kind}`}
    >
      <div className="jzone-feedback__icon" aria-hidden="true">
        <Icon size={19} strokeWidth={2.25} />
      </div>

      <div className="jzone-feedback__content">
        <span className="sr-only">{label}：</span>
        <p className="jzone-feedback__message">{item.message}</p>
      </div>

      <div className="jzone-feedback__controls">
        {item.action ? (
          <button
            type="button"
            className="jzone-feedback__action"
            onClick={runAction}
            disabled={isActing}
            title={item.action.label}
          >
            {isActing ? <Loader2 aria-hidden="true" size={16} className="jzone-feedback__spinner" /> : null}
            <span>{item.action.label}</span>
          </button>
        ) : null}
        <button
          type="button"
          className="jzone-feedback__close"
          onClick={() => feedback.dismiss(item.id)}
          aria-label={`关闭${label}反馈`}
          title="关闭"
        >
          <X aria-hidden="true" size={16} strokeWidth={2.25} />
        </button>
      </div>
    </motion.div>
  );
};
