import React from 'react';
import { Icons } from '../components/Icons';
import { useCosUsage } from '../hooks/useCosUsage';

type AuditCandidate = {
  kind?: string;
  path?: string;
  sourcePath?: string;
  canonicalPath?: string;
  paths?: string[];
  estimatedSavingsPercent?: number;
};

type AuditReport = {
  schemaVersion?: string | number;
  readOnly?: boolean;
  generatedAt?: string;
  summary?: Record<string, unknown>;
  candidates?: AuditCandidate[];
  warnings?: string[];
};

type CostMetrics = {
  updatedAt: string;
  trafficBytes: number;
  requestCount: number;
  storageBytes: number;
  costCny: number;
  trend?: Array<{ date: string; trafficBytes?: number; requestCount?: number; storageBytes?: number; costCny?: number }>;
};

const formatBytes = (bytes: unknown) => {
  const value = typeof bytes === 'number' && Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${Math.round(value)} B`;
};

const metricValue = (summary: Record<string, unknown> | undefined, key: string) => (
  typeof summary?.[key] === 'number' ? summary[key] as number : 0
);

export const MediaGovernance: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const usage = useCosUsage(10, { enabled: true, cacheTtlMs: 6 * 60 * 60 * 1000 });
  const [report, setReport] = React.useState<AuditReport | null>(null);
  const [reportError, setReportError] = React.useState('');
  const [costMetrics, setCostMetrics] = React.useState<CostMetrics | null>(null);
  const [costError, setCostError] = React.useState('');
  const endpoint = (import.meta.env.VITE_MEDIA_GOVERNANCE_ENDPOINT as string | undefined)?.trim();

  React.useEffect(() => {
    if (!endpoint) return;
    const controller = new AbortController();
    fetch(endpoint, { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<CostMetrics>;
      })
      .then(setCostMetrics)
      .catch((error) => {
        if ((error as DOMException)?.name !== 'AbortError') setCostError('服务端统计暂时不可用');
      });
    return () => controller.abort();
  }, [endpoint]);

  const importReport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as AuditReport;
      if (!parsed || parsed.readOnly !== true || !Array.isArray(parsed.candidates) || !parsed.summary) {
        throw new Error('invalid report');
      }
      setReport(parsed);
      setReportError('');
    } catch {
      setReport(null);
      setReportError('无法识别该报告，请导入 COS 只读审计生成的 JSON。');
    }
  };

  const duplicateCoverCount = metricValue(report?.summary, 'duplicateCoverHashCandidateCount');
  const highBitrateCount = metricValue(report?.summary, 'estimatedHighBitrateCandidateCount');
  const duplicateCoverSavings = metricValue(report?.summary, 'estimatedDuplicateCoverStorageBytesPotentiallyRemovable');
  const egressSavings = metricValue(report?.summary, 'estimatedPlaybackEgressBytesSavedPerFullPlay');

  return (
    <div className="min-h-screen bg-[#08080a] pb-16 text-white">
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-black/72 px-5 pb-4 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button type="button" onClick={onBack} aria-label="返回" className="grid h-11 w-11 place-items-center rounded-full text-white/70 hover:bg-white/[0.07] hover:text-white">
            <Icons.ChevronLeft size={21} />
          </button>
          <div>
            <h1 className="text-xl font-black">媒体资产治理</h1>
            <p className="mt-0.5 text-xs text-white/38">只读观察、迁移预览与费用接入状态</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-9 px-5 py-7">
        <section>
          <h2 className="text-sm font-black">当前存储</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric label="已用空间" value={usage.loading ? '读取中…' : usage.error ? '不可用' : usage.usedFormatted} />
            <Metric label="桶容量参考" value={formatBytes(usage.totalBytes)} />
            <Metric label="外网流量" value={costMetrics ? formatBytes(costMetrics.trafficBytes) : '未接入'} />
            <Metric label="读取请求" value={costMetrics ? costMetrics.requestCount.toLocaleString() : '未接入'} />
            <Metric label="账单存储量" value={costMetrics ? formatBytes(costMetrics.storageBytes) : '未接入'} />
            <Metric label="本期费用" value={costMetrics ? `¥${costMetrics.costCny.toFixed(2)}` : '未接入'} />
          </div>
          <p className="mt-3 text-xs leading-5 text-white/35">
            存储量最多每 6 小时刷新一次。流量、请求和实账费用必须由受保护的服务端接口汇总，浏览器端不会保存腾讯云密钥。
          </p>
          {costError ? <p className="mt-2 text-xs text-amber-300/80">{costError}</p> : null}
          {costMetrics?.trend?.length ? (
            <div className="mt-5 border-y border-white/[0.06] py-4">
              <div className="mb-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/32">
                <span>费用趋势</span>
                <span>更新于 {new Date(costMetrics.updatedAt).toLocaleString()}</span>
              </div>
              <div className="flex h-24 items-end gap-1.5" aria-label="COS 费用趋势">
                {costMetrics.trend.slice(-14).map((item) => {
                  const maxCost = Math.max(...costMetrics.trend!.slice(-14).map((point) => point.costCny ?? 0), 0.01);
                  const height = Math.max(4, ((item.costCny ?? 0) / maxCost) * 100);
                  return (
                    <div key={item.date} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${item.date} · ¥${(item.costCny ?? 0).toFixed(2)}`}>
                      <div className="w-full rounded-t-sm bg-red-400/55 transition-colors group-hover:bg-red-300/80" style={{ height: `${height}%` }} />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>

        <section className="border-t border-white/[0.07] pt-7">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-sm font-black">历史资源迁移预览</h2>
              <p className="mt-1 text-xs text-white/35">导入本地只读扫描报告；此页面不会修改或删除远端对象。</p>
            </div>
            <label className="shrink-0 cursor-pointer whitespace-nowrap rounded-full bg-white px-4 py-2 text-xs font-black text-black active:scale-95">
              导入报告
              <input type="file" accept="application/json,.json" className="hidden" onChange={importReport} />
            </label>
          </div>
          {reportError ? <p className="mt-3 text-xs text-red-300">{reportError}</p> : null}
          {report ? (
            <>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Metric label="重复封面组" value={duplicateCoverCount.toLocaleString()} />
                <Metric label="高码率候选" value={highBitrateCount.toLocaleString()} />
                <Metric label="封面可回收" value={formatBytes(duplicateCoverSavings)} />
                <Metric label="每轮播放可省" value={formatBytes(egressSavings)} />
              </div>
              <div className="mt-5 divide-y divide-white/[0.06] border-y border-white/[0.06]">
                {(report.candidates ?? []).slice(0, 30).map((candidate, index) => (
                  <div key={`${candidate.kind}-${candidate.path ?? candidate.sourcePath ?? candidate.canonicalPath}-${index}`} className="flex items-center gap-4 py-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white/72">
                      {candidate.path ?? candidate.sourcePath ?? candidate.canonicalPath ?? candidate.paths?.[0] ?? '未知对象'}
                    </span>
                    <span className="shrink-0 text-[10px] font-bold uppercase text-white/32">{candidate.kind ?? 'candidate'}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-white/30">报告生成于 {report.generatedAt ? new Date(report.generatedAt).toLocaleString() : '未知时间'}。候选项仍需人工确认后才能进入迁移。</p>
            </>
          ) : (
            <div className="mt-5 border-y border-white/[0.06] py-10 text-center text-sm text-white/30">尚未导入只读审计报告</div>
          )}
        </section>

        <section className="border-t border-white/[0.07] pt-7">
          <h2 className="text-sm font-black">安全清理规则</h2>
          <div className="mt-4 space-y-3 text-sm leading-6 text-white/55">
            <p>新封面先上传并完成歌曲数据更新，之后才检查旧封面是否仍被歌曲或专辑引用。</p>
            <p>内容哈希共享封面不会因单首歌曲更新而直接删除；非共享旧资源只有在全局引用数为 0 时才会清理。</p>
          </div>
        </section>
      </main>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0 rounded-xl bg-white/[0.045] px-4 py-4 ring-1 ring-inset ring-white/[0.06]">
    <div className="text-[10px] font-bold uppercase tracking-wider text-white/32">{label}</div>
    <div className="mt-2 truncate text-lg font-black text-white/88">{value}</div>
  </div>
);
