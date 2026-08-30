import React from 'react';
import { getSongCoverFallback } from '../../utils/cover';
import { normalizeSecureMediaUrl } from '../../utils/mediaUrl';
import {
  createSignedCoverUrl,
  invalidateSignedCoverUrlCache,
} from '../../services/supabase/storageApi';

export interface ResilientCoverImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> {
  src?: string | null;
  coverPath?: string | null;
  fallbackSeed: string;
  onError?: React.ReactEventHandler<HTMLImageElement>;
}

/**
 * 封面统一恢复入口：当前签名失效时只重签一次，再失败则使用稳定占位图。
 * 不做预先 HEAD 请求，避免每张图片额外消耗 COS 请求数。
 */
export const ResilientCoverImage = React.forwardRef<HTMLImageElement, ResilientCoverImageProps>(({
  src,
  coverPath,
  fallbackSeed,
  onError,
  ...imageProps
}, forwardedRef) => {
  const fallbackUrl = React.useMemo(() => getSongCoverFallback(fallbackSeed), [fallbackSeed]);
  const [resolvedSrc, setResolvedSrc] = React.useState(() => normalizeSecureMediaUrl(src || fallbackUrl));
  const retryRef = React.useRef(0);

  React.useEffect(() => {
    retryRef.current = 0;
    setResolvedSrc(normalizeSecureMediaUrl(src || fallbackUrl));
  }, [fallbackUrl, src]);

  const handleError = React.useCallback<React.ReactEventHandler<HTMLImageElement>>(async (event) => {
    onError?.(event);
    const path = coverPath?.trim();
    if (retryRef.current === 0 && path && !/^https?:\/\//i.test(path)) {
      retryRef.current = 1;
      try {
        invalidateSignedCoverUrlCache(path);
        const refreshed = await createSignedCoverUrl(path);
        setResolvedSrc(normalizeSecureMediaUrl(refreshed));
        return;
      } catch {
        // 统一回退由下方处理。
      }
    }
    retryRef.current = 2;
    setResolvedSrc(fallbackUrl);
  }, [coverPath, fallbackUrl, onError]);

  return <img {...imageProps} ref={forwardedRef} src={resolvedSrc} onError={handleError} />;
});

ResilientCoverImage.displayName = 'ResilientCoverImage';
