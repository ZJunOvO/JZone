import type { ListeningRecapPeriod } from './types';
import type { RecapPeriodPayload } from './types';
import type { RecapPeriodPreset } from './types';

const MONTH_ID_PATTERN = /^(\d{4})-(\d{2})$/;
const YEAR_ID_PATTERN = /^\d{4}$/;

export const formatPeriodTitle = (period?: Pick<ListeningRecapPeriod, 'type' | 'id'> | null) => {
  if (!period) return '聆听回顾';

  if (period.type === 'month') {
    const match = MONTH_ID_PATTERN.exec(period.id);
    if (match) return `${match[1]} 年 ${Number(match[2])} 月的声音`;
  }

  if (period.type === 'year' && YEAR_ID_PATTERN.test(period.id)) {
    return `${period.id} 年的声音`;
  }

  return '聆听回顾';
};

export const formatPeriodLabel = (period?: Pick<ListeningRecapPeriod, 'type' | 'id'> | null) => {
  if (!period) return '本期';
  if (period.type === 'month') {
    const match = MONTH_ID_PATTERN.exec(period.id);
    if (match) return `${match[1]} 年 ${Number(match[2])} 月`;
  }
  if (period.type === 'year' && YEAR_ID_PATTERN.test(period.id)) return `${period.id} 年`;
  return '本期';
};

const formatBoundary = (value: string | null | undefined, timezone: string, includeTime = false) => {
  if (!value) return null;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return null;

  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone || 'Asia/Shanghai',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(timestamp);
  } catch {
    return null;
  }
};

export const formatPeriodRange = (period?: RecapPeriodPayload | null) => {
  if (!period) return null;
  const timezone = period.timezone || 'Asia/Shanghai';
  const start = formatBoundary(period.start, timezone);
  const end = formatBoundary(period.end, timezone);

  if (!start && !end) return `统计时区：${timezone}`;
  return `${start ?? '起点未提供'} — ${end ?? '终点未提供'} · ${timezone}`;
};

export const formatCoverageStart = (
  coverageStart: string | null | undefined,
  timezone = 'Asia/Shanghai',
) => formatBoundary(coverageStart, timezone, true);

export const formatCount = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toLocaleString('zh-CN');
};

const shiftMonthId = (id: string, offset: number) => {
  const match = MONTH_ID_PATTERN.exec(id);
  if (!match) return null;

  let year = Number(match[1]);
  let month = Number(match[2]) + offset;
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  while (month > 12) {
    month -= 12;
    year += 1;
  }

  if (!Number.isInteger(year) || year < 1 || year > 9999) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
};

export const createPeriodPresets = (referencePeriod?: ListeningRecapPeriod | null): RecapPeriodPreset[] => {
  if (!referencePeriod) return [];

  if (referencePeriod.type !== 'month' || !MONTH_ID_PATTERN.test(referencePeriod.id)) {
    return [
      {
        key: 'current-year',
        label: '年度回顾',
        period: referencePeriod.type === 'year' ? referencePeriod : null,
      },
      {
        key: 'archive-year',
        label: '往年回顾',
        period: null,
        disabled: true,
      },
    ];
  }

  const year = referencePeriod.id.slice(0, 4);
  const previousMonthId = shiftMonthId(referencePeriod.id, -1);

  return [
    {
      key: 'current-month',
      label: '当前月',
      period: referencePeriod,
    },
    {
      key: 'previous-month',
      label: '上个月',
      period: previousMonthId ? { type: 'month', id: previousMonthId } : null,
      disabled: !previousMonthId,
    },
    {
      key: 'current-year',
      label: '今年',
      period: { type: 'year', id: year },
    },
    {
      key: 'archive-year',
      label: '往年回顾',
      period: null,
      disabled: true,
    },
  ];
};

