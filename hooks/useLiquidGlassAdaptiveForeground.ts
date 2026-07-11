import React from 'react';

const bitmapCache = new Map<string, Promise<ImageBitmap | null>>();
const sampleCanvas = typeof document === 'undefined' ? null : document.createElement('canvas');
const sampleContext = sampleCanvas?.getContext('2d', { willReadFrequently: true }) ?? null;

if (sampleCanvas) {
  sampleCanvas.width = 8;
  sampleCanvas.height = 8;
}

const getBitmap = (source: string) => {
  const cached = bitmapCache.get(source);
  if (cached) return cached;
  const request = fetch(source, { cache: 'force-cache', mode: 'cors' })
    .then((response) => response.ok ? response.blob() : Promise.reject(new Error('image fetch failed')))
    .then((blob) => createImageBitmap(blob))
    .catch(() => null);
  bitmapCache.set(source, request);
  return request;
};

const relativeLuminance = (red: number, green: number, blue: number) => {
  const linearize = (value: number) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);
};

const sampleImageLuminance = async (image: HTMLImageElement, clientX: number, clientY: number) => {
  if (!sampleCanvas || !sampleContext || !image.currentSrc) return null;
  const bitmap = await getBitmap(image.currentSrc);
  if (!bitmap) return null;
  const rect = image.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const objectFit = getComputedStyle(image).objectFit;
  const scale = objectFit === 'contain'
    ? Math.min(rect.width / bitmap.width, rect.height / bitmap.height)
    : Math.max(rect.width / bitmap.width, rect.height / bitmap.height);
  const renderedWidth = bitmap.width * scale;
  const renderedHeight = bitmap.height * scale;
  const cropX = (renderedWidth - rect.width) / 2;
  const cropY = (renderedHeight - rect.height) / 2;
  const sourceX = Math.max(0, Math.min(bitmap.width - 1, (clientX - rect.left + cropX) / scale));
  const sourceY = Math.max(0, Math.min(bitmap.height - 1, (clientY - rect.top + cropY) / scale));
  const radius = Math.max(3, Math.min(bitmap.width, bitmap.height) * 0.025);
  sampleContext.clearRect(0, 0, 8, 8);
  sampleContext.drawImage(
    bitmap,
    Math.max(0, sourceX - radius),
    Math.max(0, sourceY - radius),
    Math.min(bitmap.width, radius * 2),
    Math.min(bitmap.height, radius * 2),
    0,
    0,
    8,
    8,
  );
  const pixels = sampleContext.getImageData(0, 0, 8, 8).data;
  let luminance = 0;
  let samples = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 32) continue;
    luminance += relativeLuminance(pixels[index], pixels[index + 1], pixels[index + 2]);
    samples += 1;
  }
  return samples ? luminance / samples : null;
};

const parseBackgroundLuminance = (element: Element) => {
  const match = getComputedStyle(element).backgroundColor.match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;
  const values = match[1].split(',').map((value) => Number(value.trim()));
  if (values.length < 3 || values.some((value, index) => index < 3 && !Number.isFinite(value))) return null;
  const alpha = Number.isFinite(values[3]) ? values[3] : 1;
  if (alpha < 0.18) return null;
  return relativeLuminance(values[0], values[1], values[2]);
};

const findImageAtPoint = (root: Element | null, clientX: number, clientY: number) => {
  const images = Array.from(document.images);
  for (let index = images.length - 1; index >= 0; index -= 1) {
    const image = images[index];
    if (root?.contains(image) || !image.complete || !image.naturalWidth) continue;
    const rect = image.getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) return image;
  }
  return null;
};

const samplePoint = async (root: Element | null, clientX: number, clientY: number) => {
  const stack = document.elementsFromPoint(clientX, clientY).filter((element) => !root?.contains(element));
  const image = stack.find((element): element is HTMLImageElement => element instanceof HTMLImageElement)
    ?? findImageAtPoint(root, clientX, clientY);
  let luminance = image ? await sampleImageLuminance(image, clientX, clientY) : null;
  if (luminance === null) {
    for (const element of stack) {
      luminance = parseBackgroundLuminance(element);
      if (luminance !== null) break;
    }
  }
  if (luminance === null) luminance = 0;
  return luminance;
};

const sampleTarget = async (target: HTMLElement | SVGElement) => {
  const rect = target.getBoundingClientRect();
  if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > window.innerHeight) return;
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  const root = target.closest('[data-liquid-control-root]');
  const offsetX = Math.min(20, rect.width * 0.34);
  const offsetY = Math.min(18, rect.height * 0.3);
  const samples = await Promise.all([
    samplePoint(root, clientX, clientY),
    samplePoint(root, clientX - offsetX, clientY),
    samplePoint(root, clientX + offsetX, clientY),
    samplePoint(root, clientX, clientY - offsetY),
    samplePoint(root, clientX, clientY + offsetY),
  ]);
  const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const luminance = Math.max(average, Math.max(...samples) * 0.72);
  const current = target.getAttribute('data-liquid-foreground');
  const next = current === 'dark'
    ? (luminance < 0.3 ? 'light' : 'dark')
    : (luminance > 0.42 ? 'dark' : 'light');
  target.setAttribute('data-liquid-foreground', next);
};

export const useLiquidGlassAdaptiveForeground = () => {
  React.useEffect(() => {
    let disposed = false;
    let timer = 0;
    let frame = 0;
    const update = () => {
      if (disposed) return;
      const targets = Array.from(document.querySelectorAll<HTMLElement | SVGElement>('[data-liquid-adaptive="true"]'));
      void Promise.all(targets.map(sampleTarget));
    };
    const schedule = () => {
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        frame = window.requestAnimationFrame(update);
      }, 90);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    window.addEventListener('pointermove', schedule, { passive: true });
    window.addEventListener('pointerup', schedule, { passive: true });
    window.addEventListener('touchend', schedule, { passive: true });
    const interval = window.setInterval(schedule, 900);
    schedule();
    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(interval);
      if (timer) window.clearTimeout(timer);
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('pointermove', schedule);
      window.removeEventListener('pointerup', schedule);
      window.removeEventListener('touchend', schedule);
    };
  }, []);
};
