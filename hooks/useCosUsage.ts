import { useState, useEffect } from 'react';
import { cosClient } from '../cosClient';

interface CosUsage {
  usedBytes: number;
  totalBytes: number;
  usedFormatted: string;
  percent: number;
  loading: boolean;
  error: string | null;
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const useCosUsage = (limitGB: number = 10, options?: { enabled?: boolean; cacheTtlMs?: number }) => {
  const cacheKey = `jzone.cos_usage_cache_v1:${limitGB}`;
  const cacheTtlMs = options?.cacheTtlMs ?? 6 * 60 * 60 * 1000;
  const enabled = options?.enabled ?? false;
  const [usage, setUsage] = useState<CosUsage>({
    usedBytes: 0,
    totalBytes: limitGB * 1024 * 1024 * 1024,
    usedFormatted: '—',
    percent: 0,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!cosClient.isEnabled) {
      setUsage(prev => ({ ...prev, loading: false, error: 'COS not configured' }));
      return;
    }

    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw) as { usedBytes: number; fetchedAt: number };
        if (typeof cached?.usedBytes === 'number' && typeof cached?.fetchedAt === 'number') {
          const isFresh = Date.now() - cached.fetchedAt < cacheTtlMs;
          setUsage({
            usedBytes: cached.usedBytes,
            totalBytes: limitGB * 1024 * 1024 * 1024,
            usedFormatted: formatSize(cached.usedBytes),
            percent: Math.min((cached.usedBytes / (limitGB * 1024 * 1024 * 1024)) * 100, 100),
            loading: enabled ? !isFresh : false,
            error: null,
          });
          if (!enabled || isFresh) return;
        }
      } else {
        setUsage(prev => ({ ...prev, usedFormatted: '—', loading: enabled }));
      }
    } catch {
      setUsage(prev => ({ ...prev, usedFormatted: '—', loading: enabled }));
    }

    if (!enabled) return;

    const fetchUsage = async () => {
      try {
        const usedBytes = await cosClient.getBucketUsage();
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ usedBytes, fetchedAt: Date.now() }));
        } catch {}
        setUsage({
          usedBytes,
          totalBytes: limitGB * 1024 * 1024 * 1024,
          usedFormatted: formatSize(usedBytes),
          percent: Math.min((usedBytes / (limitGB * 1024 * 1024 * 1024)) * 100, 100),
          loading: false,
          error: null,
        });
      } catch (e: any) {
        console.error('Failed to fetch COS usage:', e);
        setUsage(prev => ({ ...prev, loading: false, error: e.message || 'Failed to fetch usage' }));
      }
    };

    fetchUsage();
  }, [limitGB, enabled, cacheTtlMs, cacheKey]);

  return usage;
};
