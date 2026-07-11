export type FeedbackKind = 'success' | 'error' | 'info';

export interface FeedbackAction {
  label: string;
  onClick: () => unknown | Promise<unknown>;
}

export interface FeedbackOptions {
  action?: FeedbackAction;
  /** 传入 0 或 null 时保持显示，直到主动关闭。 */
  duration?: number | null;
  /** 提供稳定 id 可更新同一条反馈，避免重复堆叠。 */
  id?: string;
}

export interface FeedbackItem extends FeedbackOptions {
  createdAt: number;
  duration: number | null;
  id: string;
  kind: FeedbackKind;
  message: string;
}

export interface FeedbackApi {
  clear: () => void;
  dismiss: (id: string) => void;
  error: (message: string, options?: FeedbackOptions) => string;
  info: (message: string, options?: FeedbackOptions) => string;
  show: (kind: FeedbackKind, message: string, options?: FeedbackOptions) => string;
  success: (message: string, options?: FeedbackOptions) => string;
}

type FeedbackListener = () => void;

const DEFAULT_DURATION: Record<FeedbackKind, number> = {
  success: 3200,
  error: 5200,
  info: 4200,
};
const ACTION_DURATION = 7000;
const MAX_VISIBLE_FEEDBACK = 5;
const EMPTY_FEEDBACK: readonly FeedbackItem[] = [];

let sequence = 0;
let items: readonly FeedbackItem[] = EMPTY_FEEDBACK;
const listeners = new Set<FeedbackListener>();

const emit = () => {
  listeners.forEach((listener) => listener());
};

const createId = () => {
  sequence += 1;
  return `feedback-${Date.now()}-${sequence}`;
};

const normalizeDuration = (
  kind: FeedbackKind,
  duration: FeedbackOptions['duration'],
  hasAction: boolean,
) => {
  if (duration === null || duration === 0) return null;
  if (typeof duration === 'number') return Math.max(600, duration);
  return hasAction ? ACTION_DURATION : DEFAULT_DURATION[kind];
};

const show = (kind: FeedbackKind, message: string, options: FeedbackOptions = {}) => {
  const id = options.id ?? createId();
  const nextItem: FeedbackItem = {
    ...options,
    id,
    kind,
    message,
    duration: normalizeDuration(kind, options.duration, Boolean(options.action)),
    createdAt: Date.now(),
  };

  items = [...items.filter((item) => item.id !== id), nextItem].slice(-MAX_VISIBLE_FEEDBACK);
  emit();
  return id;
};

const dismiss = (id: string) => {
  const nextItems = items.filter((item) => item.id !== id);
  if (nextItems.length === items.length) return;
  items = nextItems;
  emit();
};

const clear = () => {
  if (items.length === 0) return;
  items = EMPTY_FEEDBACK;
  emit();
};

export const feedback: FeedbackApi = Object.freeze({
  show,
  success: (message, options) => show('success', message, options),
  error: (message, options) => show('error', message, options),
  info: (message, options) => show('info', message, options),
  dismiss,
  clear,
});

export const subscribeToFeedback = (listener: FeedbackListener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getFeedbackSnapshot = () => items;
export const getFeedbackServerSnapshot = () => EMPTY_FEEDBACK;
