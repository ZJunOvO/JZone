import COS from 'cos-js-sdk-v5';

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

export const cosClient = {
  isEnabled: isCosEnabled,

  /**
   * 上传文件到 COS
   * @param file 文件对象
   * @param path 存储路径 (例如: user123/song.mp3)
   */
  async uploadFile(file: Blob, path: string, contentType?: string, onProgress?: (progress: CosUploadProgress) => void) {
    if (!cosInstance || !bucket || !region) throw new Error('COS 未配置');

    return new Promise((resolve, reject) => {
      cosInstance!.putObject(
        {
          Bucket: bucket,
          Region: region,
          Key: path,
          Body: file,
          ...(contentType ? { ContentType: contentType } : {}),
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

  /**
   * 获取带签名的访问链接
   * @param path 存储路径
   * @param expiresInSeconds 过期时间（秒），默认 1 小时
   */
  async getSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
    if (!cosInstance || !bucket || !region) throw new Error('COS 未配置');

    return new Promise((resolve, reject) => {
      cosInstance!.getObjectUrl(
        {
          Bucket: bucket,
          Region: region,
          Key: path,
          Sign: true,
          Expires: expiresInSeconds,
        },
        function (err, data) {
          if (err) return reject(toCosError('COS 获取签名链接失败', err));
          // 某些情况下返回的 URL 可能没有协议头，确保加上 https
          const url = data.Url.startsWith('http') ? data.Url : `https://${data.Url}`;
          resolve(url);
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

    return new Promise((resolve, reject) => {
      cosInstance!.getBucket(
        {
          Bucket: bucket,
          Region: region,
          Prefix: '',
          MaxKeys: 1000,
        },
        function (err, data) {
          if (err) return reject(err);
          const totalSize = data.Contents?.reduce((sum, item) => sum + parseInt(item.Size, 10), 0) || 0;
          resolve(totalSize);
        }
      );
    });
  }
};
