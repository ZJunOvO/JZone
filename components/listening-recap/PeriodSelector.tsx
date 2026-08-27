import React, { useMemo } from 'react';
import { LiquidGlassSurface } from '../LiquidGlassSurface';
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
    return (
      <div className="flex min-w-0 justify-center" data-testid="listening-recap-period-selector">
        <span className="truncate text-xs font-bold text-white/45">{formatPeriodLabel(selectedPeriod)}</span>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 justify-center" data-testid="listening-recap-period-selector">
      <div className="relative w-fit max-w-full overflow-hidden rounded-full" data-liquid-control-root>
        <LiquidGlassSurface borderRadiusClass="rounded-full" material="shuding" coverage="full" />
        <div className="relative z-10 flex w-max max-w-full items-center gap-0.5 overflow-x-auto no-scrollbar rounded-full p-1">
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
                className={`min-h-11 shrink-0 rounded-full px-2.5 text-[11px] font-extrabold leading-none transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/80 motion-reduce:transition-none ${
                  isSelected
                    ? 'text-red-300'
                    : preset.disabled
                      ? 'cursor-not-allowed text-white/30 opacity-70'
                      : 'text-white/60 hover:bg-white/[0.08] hover:text-white'
                }`}
                data-liquid-adaptive={!isSelected && !preset.disabled ? 'true' : undefined}
                data-liquid-tone={!isSelected && !preset.disabled ? 'secondary' : undefined}
                title={preset.disabled ? '待服务端提供有覆盖的历史年份' : undefined}
                data-testid={`listening-recap-period-${preset.key}`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>
      <span className="sr-only">当前周期：{formatPeriodLabel(selectedPeriod)}</span>
    </div>
  );
};
