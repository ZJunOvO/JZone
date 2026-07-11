export const downscaleImageBlob = async (
  input: Blob,
  options: { maxWidth: number; maxHeight?: number; mimeType?: string; quality?: number }
): Promise<Blob> => {
  const hasKnownNonImageType = typeof input?.type === 'string' && Boolean(input.type) && !input.type.startsWith('image/');
  if (hasKnownNonImageType) return input;

  const maxWidth = Math.max(1, Math.floor(options.maxWidth));
  const maxHeight = Math.max(1, Math.floor(options.maxHeight ?? options.maxWidth));
  const mimeType = options.mimeType ?? 'image/jpeg';
  const quality = typeof options.quality === 'number' ? options.quality : 0.86;

  const loadViaImage = async () => {
    const url = URL.createObjectURL(input);
    try {
      const img = new Image();
      img.decoding = 'async';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('图片解码失败'));
        img.src = url;
      });
      return { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => ctx.drawImage(img, 0, 0, w, h) };
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const loadViaImageBitmap = async () => {
    const bitmap = await createImageBitmap(input);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => {
        ctx.drawImage(bitmap, 0, 0, w, h);
        bitmap.close();
      },
    };
  };

  const loader = typeof createImageBitmap === 'function' ? loadViaImageBitmap : loadViaImage;
  const decoded = await loader();
  const srcW = Math.max(1, Math.floor(decoded.width));
  const srcH = Math.max(1, Math.floor(decoded.height));

  const scale = Math.min(1, maxWidth / srcW, maxHeight / srcH);
  const outW = Math.max(1, Math.floor(srcW * scale));
  const outH = Math.max(1, Math.floor(srcH * scale));

  if (outW === srcW && outH === srcH && input.type === mimeType) return input;

  const canvas: HTMLCanvasElement | OffscreenCanvas =
    typeof (globalThis as any).OffscreenCanvas === 'function'
      ? new (globalThis as any).OffscreenCanvas(outW, outH)
      : Object.assign(document.createElement('canvas'), { width: outW, height: outH });

  const ctx = (canvas as any).getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) return input;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  decoded.draw(ctx, outW, outH);

  if (typeof (canvas as any).convertToBlob === 'function') {
    return await (canvas as any).convertToBlob({ type: mimeType, quality });
  }

  const htmlCanvas = canvas as HTMLCanvasElement;
  return await new Promise<Blob>((resolve, reject) => {
    htmlCanvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('图片压缩失败'));
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
};

export const prepareImageForEditing = (input: Blob, maxDimension = 2048) => downscaleImageBlob(input, {
  maxWidth: maxDimension,
  maxHeight: maxDimension,
  mimeType: 'image/jpeg',
  quality: 0.9,
});
