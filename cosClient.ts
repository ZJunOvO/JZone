import COS from 'cos-js-sdk-v5';
import { normalizeSecureMediaUrl } from './utils/mediaUrl';

// ⚠️ 安全警告
// ==============================================================================
// 当前配置使用了永久密钥 (SecretId/SecretKey)，这些信息会暴露在前端代码中。
// 这仅适用于：
// 1. 本地开发调试
// 2. 个人非公开项目（且你可以接受风险）
//
// 生产环境强烈建议：
// 使用后端接口生成临时密钥 (STS)，前端只请求临时密钥来初始化 COS 实例。
// 这样即使用户看到了前端代码，也只能获得有时效性的临时权限。
// ==============================================================================

const secretId = import.meta.env.VITE_COS_SECRET_ID;
const secretKey = import.meta.env.VITE_COS_SECRET_KEY;
const bucket = import.meta.env.VITE_COS_BUCKET;
const region = import.meta.env.VITE_COS_REGION;

// 检查是否已配置 COS
const isCosEnabled = !!(secretId && secretKey && bucket && region);

let cosInstance: COS | null = null;

if (isCosEnabled) {
  cosInstance = new COS({
    SecretId: secretId,
    SecretKey: secretKey,
    // 如果后续切换到 STS 临时密钥模式，可以在这里传入 getAuthorization 回调
  });
}

const toCosError = (prefix: string, err: any) => {
  const code = typeof err?.Code === 'string' ? err.Code : typeof err?.code === 'string' ? err.code : '';
  const message =
    typeof err?.Message === 'string'
      ? err.Message
      : typeof err?.message === 'string'
        ? err.message
        : '';
  const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : undefined;
  const suffix = [code ? `code=${code}` : '', statusCode ? `status=${statusCode}` : '', message ? `message=${message}` : '']
    .filter(Boolean)
    .join(' ');
  return new Error(`${prefix}${suffix ? `: ${suffix}` : ''}`);
};

export interface CosUploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface CosHeadObjectDiagnostic {
  ok: boolean;
  statusCode?: number;
  code?: string;
}

export const COS_AUDIO_BROWSER_CACHE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const COS_IMAGE_BROWSER_CACHE_MAX_AGE_SECONDS = 31 * 24 * 60 * 60;
export const COS_VIDEO_BROWSER_CACHE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
export const COS_AUDIO_BROWSER_CACHE_CONTROL = `private, max-age=${COS_AUDIO_BROWSER_CACHE_MAX_AGE_SECONDS}, immutable`;
export const COS_IMAGE_BROWSER_CACHE_CONTROL = `private, max-age=${COS_IMAGE_BROWSER_CACHE_MAX_AGE_SECONDS}, immutable`;
export const COS_VIDEO_BROWSER_CACHE_CONTROL = `private, max-age=${COS_VIDEO_BROWSER_CACHE_MAX_AGE_SECONDS}, immutable`;

const getMediaCacheControl = (path: string, contentType?: string) => {
  const normalizedType = contentType?.toLowerCase() ?? '';
  if (normalizedType.startsWith('audio/') || /\.(?:aac|amr|flac|m4a|mp3|ogg|opus|wav|3gp|3gpp)$/i.test(path)) {
    return COS_AUDIO_BROWSER_CACHE_CONTROL;
  }
  if (normalizedType.startsWith('video/') || /\.(?:m4v|mov|mp4|webm)$/i.test(path)) {
    return COS_VIDEO_BROWSER_CACHE_CONTROL;
  }
  if (normalizedType.startsWith('image/') || /\.(?:avif|gif|jpe?g|png|webp)$/i.test(path)) {
    return COS_IMAGE_BROWSER_CACHE_CONTROL;
  }
  return 'private, max-age=86400';
};

export const cosClient = {
  isEnabled: isCosEnabled,

  async headObject(path: string): Promise<CosHeadObjectDiagnostic> {
    if (!cosInstance || !bucket || !region) throw new Error('COS 未配置');

    return new Promise((resolve) => {
      cosInstance!.headObject(
        {
          Bucket: bucket,
          Region: region,
          Key: path,
        },
        (err, data) => {
          if (err) {
            const statusCode = Number((err as any)?.statusCode ?? (err as any)?.status);
            const code = String((err as any)?.Code ?? (err as any)?.code ?? '');
            resolve({
              ok: false,
              ...(Number.isFinite(statusCode) ? { statusCode } : {}),
              ...(code ? { code } : {}),
            });
            return;
          }

          resolve({
            ok: true,
            statusCode: typeof data?.statusCode === 'number' ? data.statusCode : 200,
          });
        },
      );
    });
  },

  async objectExists(path: string): Promise<boolean> {
    const result = await cosClient.headObject(path);
    const code = result.code ?? '';
    if (result.ok) return true;
    if (result.statusCode === 404 || /^(?:NoSuchKey|NotFound|NoSuchObject)$/i.test(code)) return false;
    throw toCosError('COS 检查对象失败', result);
  },

  /**
   * 上传文件到 COS
   * @param file 文件对象
   * @param path 存储路径 (例如: user123/song.mp3)
   */
  async uploadFile(file: Blob, path: string, contentType?: string, onProgress?: (progress: CosUploadProgress) => void) {
    if (!cosInstance || !bucket || !region) throw new Error('COS 未配置');

    const resolvedContentType = contentType || file.type || undefined;

    return new Promise((resolve, reject) => {
      cosInstance!.putObject(
        {
          Bucket: bucket,
          Region: region,
          Key: path,
          Body: file,
          ...(resolvedContentType ? { ContentType: resolvedContentType } : {}),
          CacheControl: getMediaCacheControl(path, resolvedContentType),
          onProgress: function (progressData) {
            const total = typeof progressData.total === 'number' ? progressData.total : file.size;
            const loaded = typeof progressData.loaded === 'number' ? progressData.loaded : Math.round((progressData.percent ?? 0) * total);
            const percent = Math.max(0, Math.min(100, Math.round((progressData.percent ?? (total ? loaded / total : 0)) * 100)));
            onProgress?.({ loaded, total, percent });
          },
        },
        function (err, data) {
          if (err) return reject(toCosError('COS 上传失败', err));
          resolve(data);
        }
      );
    });
  },

  async uploadFileIfAbsent(file: Blob, path: string, contentType?: string, onProgress?: (progress: CosUploadProgress) => void) {
    try {
      if (await cosClient.objectExists(path)) {
        onProgress?.({ loaded: file.size, total: file.size, percent: 100 });
        return { skipped: true } as const;
      }
    } catch (error) {
      // 部分旧 CORS 规则未开放 HEAD；内容寻址对象即使覆盖写入也仍是同一份内容。
      console.warn('COS 对象查重不可用，回退为幂等覆盖上传:', error);
    }

    const data = await cosClient.uploadFile(file, path, contentType, onProgress);
    return { skipped: false, data } as const;
  },

  /**
   * 获取带签名的访问链接
   * @param path 存储路径
   * @param expiresInSeconds 过期时间（秒），默认 1 小时
   */
  async getSignedUrl(path: string, expiresInSeconds = 3600, responseCacheControl?: string): Promise<string> {
    if (!cosInstance || !bucket || !region) throw new Error('COS 未配置');

    return new Promise((resolve, reject) => {
      cosInstance!.getObjectUrl(
        {
          Bucket: bucket,
          Region: region,
          Key: path,
          Sign: true,
          Expires: expiresInSeconds,
          ...(responseCacheControl ? { Query: { 'response-cache-control': responseCacheControl } } : {}),
        },
        function (err, data) {
          if (err) return reject(toCosError('COS 获取签名链接失败', err));
          // COS SDK 可能返回 HTTP 链接；HTTPS 页面会将其作为混合内容拦截。
          const url = data.Url.startsWith('http') ? data.Url : `https://${data.Url}`;
          resolve(normalizeSecureMediaUrl(url) ?? url);
        }
      );
    });
  },
  
  async deleteFiles(paths: string[]) {
    if (!cosInstance || !bucket || !region) throw new Error('COS 未配置');
    
    if (paths.length === 0) return;

    return new Promise((resolve, reject) => {
      cosInstance!.deleteMultipleObject(
        {
          Bucket: bucket,
          Region: region,
          Objects: paths.map(p => ({ Key: p })),
        },
        function (err, data) {
          if (err) return reject(toCosError('COS 删除失败', err));
          resolve(data);
        }
      );
    });
  },

  async getBucketUsage(): Promise<number> {
    if (!cosInstance || !bucket || !region) throw new Error('COS 未配置');

    let marker: string | undefined;
    let totalSize = 0;

    while (true) {
      const data = await new Promise<COS.GetBucketResult>((resolve, reject) => {
        cosInstance!.getBucket(
          {
            Bucket: bucket,
            Region: region,
            Prefix: '',
            MaxKeys: 1000,
            ...(marker ? { Marker: marker } : {}),
          },
          (err, result) => {
            if (err) {
              reject(toCosError('COS 读取对象列表失败', err));
              return;
            }
            resolve(result);
          },
        );
      });

      for (const item of data.Contents ?? []) {
        const size = Number(item.Size);
        if (Number.isFinite(size) && size >= 0) totalSize += size;
      }

      if (String(data.IsTruncated).toLowerCase() !== 'true') return totalSize;

      const nextMarker = data.NextMarker || data.Contents?.at(-1)?.Key;
      if (!nextMarker || nextMarker === marker) {
        throw new Error('COS 对象列表分页缺少有效的继续标记');
      }
      marker = nextMarker;
    }
  }
};
