import React from 'react';

const bitmapCache = new Map<string, Promise<ImageBitmap | null>>();
const MAX_BITMAP_CACHE_SIZE = 16;
const SAMPLE_BITMAP_MAX_EDGE = 64;
const SAMPLE_CANVAS_SIZE = 8;
const sampleCanvas = typeof document === 'undefined' ? null : document.createElement('canvas');
const sampleContext = sampleCanvas?.getContext('2d', { willReadFrequently: true }) ?? null;

if (sampleCanvas) {
  sampleCanvas.width = SAMPLE_CANVAS_SIZE;
  sampleCanvas.height = SAMPLE_CANVAS_SIZE;
}

const createSampleBitmap = async (blob: Blob, resizeWidth: number, resizeHeight: number) => {
  try {
    return await createImageBitmap(blob, {
      resizeWidth,
      resizeHeight,
      resizeQuality: 'low',
    });
  } catch {
    try {
      return await createImageBitmap(blob);
    } catch {
      return null;
    }
  }
};

const getBitmap = (source: string, sourceWidth: number, sourceHeight: number) => {
  const cached = bitmapCache.get(source);
  if (cached) {
    bitmapCache.delete(source);
    bitmapCache.set(source, cached);
    return cached;
  }
  const sourceUrl = new URL(source, window.location.href);
  if (sourceUrl.hostname === 'q1.qlogo.cn') {
    const skipped = Promise.resolve(null);
    if (bitmapCache.size >= MAX_BITMAP_CACHE_SIZE) bitmapCache.delete(bitmapCache.keys().next().value as string);
    bitmapCache.set(source, skipped);
    return skipped;
  }
  const maxSourceEdge = Math.max(sourceWidth, sourceHeight);
  const resizeScale = maxSourceEdge > 0
    ? Math.min(1, SAMPLE_BITMAP_MAX_EDGE / maxSourceEdge)
    : 1;
  const resizeWidth = sourceWidth > 0
    ? Math.max(1, Math.round(sourceWidth * resizeScale))
    : SAMPLE_BITMAP_MAX_EDGE;
  const resizeHeight = sourceHeight > 0
    ? Math.max(1, Math.round(sourceHeight * resizeScale))
    : SAMPLE_BITMAP_MAX_EDGE;
  const request = fetch(source, { cache: 'force-cache', mode: 'cors' })
    .then((response) => response.ok ? response.blob() : Promise.reject(new Error('image fetch failed')))
    .then((blob) => createSampleBitmap(blob, resizeWidth, resizeHeight))
    .catch(() => null);
  if (bitmapCache.size >= MAX_BITMAP_CACHE_SIZE) bitmapCache.delete(bitmapCache.keys().next().value as string);
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

type ImageLayout = {
  rect: DOMRect;
  objectFit: string;
};

const getImageLayout = (image: HTMLImageElement, layouts: Map<HTMLImageElement, ImageLayout>) => {
  const cached = layouts.get(image);
  if (cached) return cached;
  const layout = {
    rect: image.getBoundingClientRect(),
    objectFit: getComputedStyle(image).objectFit,
  };
  layouts.set(image, layout);
  return layout;
};

const sampleImageLuminance = async (
  image: HTMLImageElement,
  clientX: number,
  clientY: number,
  layouts: Map<HTMLImageElement, ImageLayout>,
) => {
  if (
    !sampleCanvas
    || !sampleContext
    || !image.currentSrc
    || !image.complete
    || !image.naturalWidth
    || !image.naturalHeight
  ) return null;
  const { rect, objectFit } = getImageLayout(image, layouts);
  if (!rect.width || !rect.height) return null;
  const bitmap = await getBitmap(image.currentSrc, image.naturalWidth, image.naturalHeight);
  if (!bitmap || !bitmap.width || !bitmap.height) return null;
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
    SAMPLE_CANVAS_SIZE,
    SAMPLE_CANVAS_SIZE,
  );
  const pixels = sampleContext.getImageData(0, 0, SAMPLE_CANVAS_SIZE, SAMPLE_CANVAS_SIZE).data;
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

const findImageAtPoint = (
  images: HTMLImageElement[],
  root: Element | null,
  clientX: number,
  clientY: number,
  layouts: Map<HTMLImageElement, ImageLayout>,
) => {
  for (let index = images.length - 1; index >= 0; index -= 1) {
    const image = images[index];
    if (root?.contains(image) || !image.complete || !image.naturalWidth) continue;
    const { rect } = getImageLayout(image, layouts);
    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) return image;
  }
  return null;
};

const samplePoint = async (
  images: HTMLImageElement[],
  root: Element | null,
  clientX: number,
  clientY: number,
  layouts: Map<HTMLImageElement, ImageLayout>,
) => {
  const stack = document.elementsFromPoint(clientX, clientY).filter((element) => !root?.contains(element));
  const image = stack.find((element): element is HTMLImageElement => element instanceof HTMLImageElement)
    ?? findImageAtPoint(images, root, clientX, clientY, layouts);
  let luminance = image ? await sampleImageLuminance(image, clientX, clientY, layouts) : null;
  if (luminance === null) {
    for (const element of stack) {
      luminance = parseBackgroundLuminance(element);
      if (luminance !== null) break;
    }
  }
  if (luminance === null) luminance = 0;
  return luminance;
};

const getVisibleTargetRect = (target: HTMLElement | SVGElement) => {
  if (!target.isConnected) return null;
  const style = getComputedStyle(target);
  if (
    style.display === 'none'
    || style.visibility === 'hidden'
    || style.visibility === 'collapse'
    || style.contentVisibility === 'hidden'
    || Number(style.opacity) === 0
  ) return null;
  const rect = target.getBoundingClientRect();
  if (
    rect.width <= 0
    || rect.height <= 0
    || rect.right <= 0
    || rect.left >= window.innerWidth
    || rect.bottom <= 0
    || rect.top >= window.innerHeight
  ) return null;
  return rect;
};

const sampleTarget = async (
  target: HTMLElement | SVGElement,
  rect: DOMRect,
  images: HTMLImageElement[],
  layouts: Map<HTMLImageElement, ImageLayout>,
) => {
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  const root = target.closest('[data-liquid-control-root]');
  const offsetX = Math.min(20, rect.width * 0.34);
  const offsetY = Math.min(18, rect.height * 0.3);
  const samples = await Promise.all([
    samplePoint(images, root, clientX, clientY, layouts),
    samplePoint(images, root, clientX - offsetX, clientY, layouts),
    samplePoint(images, root, clientX + offsetX, clientY, layouts),
    samplePoint(images, root, clientX, clientY - offsetY, layouts),
    samplePoint(images, root, clientX, clientY + offsetY, layouts),
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
    let scrollTimer = 0;
    let frame = 0;
    let updateInFlight = false;
    let rerunRequested = false;
    let scrollPending = false;
    const update = async () => {
      if (disposed || document.visibilityState === 'hidden') return;
      if (updateInFlight) {
        rerunRequested = true;
        return;
      }
      updateInFlight = true;
      const targets = Array.from(document.querySelectorAll<HTMLElement | SVGElement>('[data-liquid-adaptive="true"]'))
        .map((target) => {
          const rect = getVisibleTargetRect(target);
          return rect ? { target, rect } : null;
        })
        .filter((entry): entry is { target: HTMLElement | SVGElement; rect: DOMRect } => entry !== null);
      const images = Array.from(document.images).filter((image) => image.complete && image.naturalWidth > 0);
      const imageLayouts = new Map<HTMLImageElement, ImageLayout>();
      try {
        await Promise.all(targets.map(({ target, rect }) => sampleTarget(target, rect, images, imageLayouts)));
      } finally {
        updateInFlight = false;
        if (rerunRequested) {
          rerunRequested = false;
          schedule();
        }
      }
    };
    function scheduleWithDelay(delay: number) {
      if (disposed || document.visibilityState === 'hidden' || scrollPending) return;
      if (updateInFlight) {
        rerunRequested = true;
        return;
      }
      if (timer || frame) return;
      timer = window.setTimeout(() => {
        timer = 0;
        if (disposed || document.visibilityState === 'hidden') return;
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          if (disposed || document.visibilityState === 'hidden') return;
          void update();
        });
      }, delay);
    }
    function schedule() {
      scheduleWithDelay(90);
    }
    function scheduleAfterScroll() {
      if (disposed) return;
      scrollPending = true;
      if (timer) {
        window.clearTimeout(timer);
        timer = 0;
      }
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      if (scrollTimer) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        scrollTimer = 0;
        scrollPending = false;
        scheduleWithDelay(0);
      }, 140);
    }
    const handlePointerMove = (event: PointerEvent) => {
      if (event.buttons > 0) schedule();
    };
    const handleImageLoad = (event: Event) => {
      if (event.target instanceof HTMLImageElement) schedule();
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'data-liquid-adaptive'],
    });
    window.addEventListener('scroll', scheduleAfterScroll, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', schedule, { passive: true });
    window.addEventListener('touchend', schedule, { passive: true });
    document.addEventListener('load', handleImageLoad, true);
    document.addEventListener('visibilitychange', schedule);
    schedule();
    return () => {
      disposed = true;
      observer.disconnect();
      if (timer) window.clearTimeout(timer);
      if (scrollTimer) window.clearTimeout(scrollTimer);
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', scheduleAfterScroll, true);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', schedule);
      window.removeEventListener('touchend', schedule);
      document.removeEventListener('load', handleImageLoad, true);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, []);
};
