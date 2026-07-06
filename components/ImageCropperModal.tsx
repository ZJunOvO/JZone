import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Cropper from 'react-easy-crop';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from './Icons';
import { useModalPresence } from '../modalPresence';
import { downscaleImageBlob } from '../imageProcessing';

interface ImageCropperModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  onCropComplete: (croppedBlob: Blob) => void;
  mode: 'avatar' | 'banner' | 'cover' | 'player_skin';
  aspectOverride?: number;
}

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const res = await fetch(dataUrl);
  return await res.blob();
};

const getCroppedImg = async (imageSrc: string, pixelCrop: any): Promise<Blob> => {
  const image = new Image();
  image.src = imageSrc;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('图片加载失败'));
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  if (typeof canvas.toBlob === 'function') {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('裁剪失败'));
        }
      }, 'image/jpeg', 0.95);
    });
  }

  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  return await dataUrlToBlob(dataUrl);
};

export const ImageCropperModal: React.FC<ImageCropperModalProps> = ({ isOpen, onClose, imageSrc, onCropComplete, mode, aspectOverride }) => {
  useModalPresence(isOpen);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const didInitZoomRef = useRef(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [cropSize, setCropSize] = useState<{ width: number; height: number } | null>(null);
  const [mediaSize, setMediaSize] = useState<{ width: number; height: number } | null>(null);

  const onCropChange = setCrop;
  const onZoomChange = setZoom;

  const onCropCompleteHandler = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    try {
      if (!croppedAreaPixels) return;
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      let compressed = croppedBlob;
      if (mode === 'avatar') {
        compressed = await downscaleImageBlob(croppedBlob, { maxWidth: 512, maxHeight: 512, mimeType: 'image/jpeg', quality: 0.86 });
      } else if (mode === 'banner') {
        compressed = await downscaleImageBlob(croppedBlob, { maxWidth: 1920, maxHeight: 1920, mimeType: 'image/jpeg', quality: 0.84 });
      } else if (mode === 'player_skin') {
        compressed = await downscaleImageBlob(croppedBlob, { maxWidth: 1080, maxHeight: 1920, mimeType: 'image/jpeg', quality: 0.86 });
      }
      onCropComplete(compressed);
      onClose();
    } catch (e) {
      console.error(e);
    }
  };

  let aspect = 1;
  let cropShape: 'rect' | 'round' = 'rect';

  if (mode === 'avatar') {
    aspect = 1;
    cropShape = 'round';
  } else if (mode === 'banner') {
    aspect = 21 / 9;
    cropShape = 'rect';
  } else if (mode === 'player_skin') {
    aspect = 9 / 16;
    cropShape = 'rect';
  }

  const effectiveAspect = useMemo(() => {
    if (typeof aspectOverride === 'number' && Number.isFinite(aspectOverride) && aspectOverride > 0) return aspectOverride;
    return aspect;
  }, [aspect, aspectOverride]);

  useEffect(() => {
    if (!isOpen) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setMinZoom(1);
    setCroppedAreaPixels(null);
    setMediaSize(null);
    didInitZoomRef.current = false;
  }, [isOpen, imageSrc]);

  useEffect(() => {
    if (!isOpen) return;

    const update = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cw = Math.max(1, Math.floor(rect.width));
      const ch = Math.max(1, Math.floor(rect.height));

      let w = cw;
      let h = Math.floor(w / effectiveAspect);
      if (h > ch) {
        h = ch;
        w = Math.floor(h * effectiveAspect);
      }
      setCropSize({ width: w, height: h });
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [effectiveAspect, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!mediaSize || !cropSize) return;
    const contain = Math.min(cropSize.width / mediaSize.width, cropSize.height / mediaSize.height);
    const cover = Math.max(cropSize.width / mediaSize.width, cropSize.height / mediaSize.height);
    const nextMin = Math.max(0.05, contain);
    setMinZoom(nextMin);
    if (!didInitZoomRef.current) {
      didInitZoomRef.current = true;
      setZoom(cover);
      return;
    }
    setZoom((z) => {
      if (!Number.isFinite(z)) return cover;
      if (z < nextMin) return nextMin;
      return z;
    });
  }, [cropSize, isOpen, mediaSize]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative w-full max-w-lg bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[80vh] md:h-[600px]"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 z-10 bg-zinc-900">
            <h3 className="text-lg font-bold text-white">图片裁剪</h3>
            <button onClick={onClose} className="text-zinc-400 hover:text-white">
              <Icons.X size={24} />
            </button>
          </div>

          <div ref={containerRef} className="relative flex-1 bg-black touch-none">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={effectiveAspect}
              cropShape={cropShape}
              showGrid={false}
              objectFit="contain"
              minZoom={minZoom}
              restrictPosition={false}
              cropSize={cropSize ?? undefined}
              onCropChange={onCropChange}
              onZoomChange={onZoomChange}
              onCropComplete={onCropCompleteHandler}
              onMediaLoaded={(m) => {
                const mw = Math.max(1, Math.floor((m as any).naturalWidth ?? (m as any).width ?? 1));
                const mh = Math.max(1, Math.floor((m as any).naturalHeight ?? (m as any).height ?? 1));
                setMediaSize({ width: mw, height: mh });
              }}
            />
          </div>

          <div className="p-6 bg-zinc-900 z-10 space-y-4">
            <div className="flex items-center gap-4">
              <Icons.Minus size={16} className="text-zinc-500" />
              <input
                type="range"
                value={zoom}
                min={minZoom}
                max={4}
                step={0.1}
                aria-labelledby="Zoom"
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-white"
              />
              <Icons.Plus size={16} className="text-zinc-500" />
            </div>
            <button
              onClick={handleSave}
              className="w-full bg-white text-black font-bold py-3 rounded-xl active:scale-95 transition-transform"
            >
              确认裁剪
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
