export const MEDIA_FAILURE_CATEGORIES = [
  'missing',
  'forbidden',
  'network',
  'available',
  'unknown',
] as const;

export type MediaFailureCategory = typeof MEDIA_FAILURE_CATEGORIES[number];

const MEDIA_FAILURE_CATEGORY_SET = new Set<string>(MEDIA_FAILURE_CATEGORIES);

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' ? value as Record<string, unknown> : null
);

const getStatusCode = (value: Record<string, unknown>) => {
  const raw = value.statusCode ?? value.status ?? value.status_code;
  const statusCode = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(statusCode) ? statusCode : undefined;
};

const getText = (...values: unknown[]) => values
  .filter((value): value is string => typeof value === 'string')
  .join(' ')
  .toLowerCase();

const isMediaFailureCategory = (value: unknown): value is MediaFailureCategory => (
  typeof value === 'string' && MEDIA_FAILURE_CATEGORY_SET.has(value)
);

/**
 * 将 COS HEAD、浏览器媒体错误或网络错误收敛为有限的用户可理解分类。
 * 这里只读取错误元数据，不把 URL、对象路径或密钥带入返回值。
 */
export const classifyMediaFailure = (value: unknown): MediaFailureCategory => {
  if (isMediaFailureCategory(value)) return value;

  const record = asRecord(value);
  if (!record) return 'unknown';

  const statusCode = getStatusCode(record);
  const code = getText(record.code, record.Code, record.errorCode, record.name);
  const message = getText(record.message, record.Message, record.error);

  if (record.ok === true || record.available === true) return 'available';
  if (
    statusCode === 404
    || /(?:no.?such(?:key|object)|not.?found|missing|resource.?not.?found)/i.test(code)
    || /(?:no.?such(?:key|object)|not.?found|resource does not exist)/i.test(message)
  ) {
    return 'missing';
  }
  if (
    statusCode === 401
    || statusCode === 403
    || /(?:access.?denied|forbidden|unauthori[sz]ed|permission|signaturedoesnotmatch|invalidaccesskey)/i.test(code)
    || /(?:access.?denied|forbidden|unauthori[sz]ed|permission denied|not allowed)/i.test(message)
  ) {
    return 'forbidden';
  }

  const mediaErrorCode = Number(record.code);
  if (
    statusCode === 0
    || mediaErrorCode === 2
    || /(?:network|failed to fetch|load failed|timeout|timed out|econn(?:reset|aborted)|err_network|cors)/i.test(code)
    || /(?:network|failed to fetch|load failed|timeout|timed out|econn(?:reset|aborted)|err_network|cors)/i.test(message)
  ) {
    return 'network';
  }

  if (statusCode !== undefined && statusCode >= 200 && statusCode < 400 && record.ok !== false) {
    return 'available';
  }

  return 'unknown';
};

const FAILURE_PRIORITY: Record<MediaFailureCategory, number> = {
  available: 0,
  forbidden: 1,
  network: 2,
  missing: 3,
  unknown: 4,
};

/** 汇总多个音源的诊断结果，优先保留最能指导用户下一步的分类。 */
export const summarizeMediaFailure = (
  values: readonly (MediaFailureCategory | unknown)[],
): MediaFailureCategory => {
  let summary: MediaFailureCategory = 'unknown';
  for (const value of values) {
    const category = isMediaFailureCategory(value) ? value : classifyMediaFailure(value);
    if (FAILURE_PRIORITY[category] < FAILURE_PRIORITY[summary]) summary = category;
  }
  return summary;
};

export const isRetryableMediaFailure = (category: MediaFailureCategory) => (
  category === 'network' || category === 'available' || category === 'unknown'
);

export const getMediaFailureMessage = (category: MediaFailureCategory) => {
  switch (category) {
    case 'missing':
      return '这首歌的音频文件已找不到，可能已被移除；请联系上传者或管理员。';
    case 'forbidden':
      return '这首歌的音频暂时没有访问权限，请登录后重试或联系上传者。';
    case 'network':
      return '网络暂时不可用，音频未能加载；请检查网络后重试。';
    case 'available':
      return '音频文件仍可访问，但播放链接可能已失效；已尝试刷新，请稍后再试。';
    case 'unknown':
    default:
      return '音频暂时无法播放，请稍后重试；若持续失败，请联系管理员。';
  }
};
