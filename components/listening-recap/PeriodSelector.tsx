import React, { useMemo } from 'react';
import { Icons } from '../Icons';
import { createPeriodPresets, formatPeriodLabel } from './formatters';
import type { ListeningRecapPeriod } from './types';

interface PeriodSelectorProps {
  selectedPeriod?: ListeningRecapPeriod | null;
  referencePeriod?: ListeningRecapPeriod | null;
  onPeriodChange: (period: ListeningRecapPeriod) => void;
}

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({ selectedPeriod, referencePeriod, onPeriodChange }) => {
  const presets = useMemo(() => createPeriodPresets(referencePeriod), [referencePeriod?.type, referencePeriod?.id]);

  if (!presets.length) {
    return <span className="text-xs font-bold text-white/45">{formatPeriodLabel(selectedPeriod)}</span>;
  }

  return (
    <div className="min-w-0" data-testid="listening-recap-period-selector">
      <div className="flex max-w-full items-center gap-1 overflow-x-auto no-scrollbar rounded-full border border-white/10 bg-white/[0.045] p-1">
        {presets.map((preset) => {
          const isSelected = Boolean(
            preset.period &&
            selectedPeriod &&
            preset.period.type === selectedPeriod.type &&
            preset.period.id === selectedPeriod.id,
          );

          return (
            <button
              key={preset.key}
              type="button"
              disabled={preset.disabled || !preset.period}
              onClick={() => {
                if (preset.period) onPeriodChange(preset.period);
              }}
              aria-current={isSelected ? 'page' : undefined}
              aria-label={preset.disabled ? `${preset.label}暂不可用` : `查看${preset.label}`}
              className={`min-h-11 shrink-0 rounded-full px-3 text-xs font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/80 ${
                isSelected
                  ? 'bg-white text-black'
                  : preset.disabled
                    ? 'cursor-not-allowed text-white/25'
                    : 'text-white/55 hover:bg-white/10 hover:text-white'
              }`}
              title={preset.disabled ? '待服务端提供有覆盖的历史年份' : undefined}
              data-testid={`listening-recap-period-${preset.key}`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <span className="sr-only">当前周期：{formatPeriodLabel(selectedPeriod)}</span>
    </div>
  );
};
