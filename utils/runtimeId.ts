export const createRuntimeUuid = (): string => {
  const cryptoApi = globalThis.crypto;

  if (typeof cryptoApi?.randomUUID === 'function') {
    try {
      return cryptoApi.randomUUID();
    } catch {
      // 部分旧 WebView 暴露了 API，但在非安全上下文中调用仍会失败。
    }
  }

  const bytes = new Uint8Array(16);
  let hasSecureRandom = false;

  if (typeof cryptoApi?.getRandomValues === 'function') {
    try {
      cryptoApi.getRandomValues(bytes);
      hasSecureRandom = true;
    } catch {
      // 继续使用兼容性随机数，运行时 ID 不依赖密码学安全性。
    }
  }

  if (!hasSecureRandom) {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
