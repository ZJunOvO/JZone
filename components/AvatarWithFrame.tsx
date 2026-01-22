import React from 'react';
import { getAvatarFrameUrl } from '../config/avatarFrames';

interface AvatarWithFrameProps {
  src?: string | null;
  frameId?: string | null;
  size?: number | string;
  className?: string;
  onClick?: () => void;
  alt?: string;
}

export const AvatarWithFrame: React.FC<AvatarWithFrameProps> = ({ 
  src, 
  frameId, 
  size = '100%', 
  className = '', 
  onClick,
  alt = 'Avatar'
}) => {
  const frameUrl = getAvatarFrameUrl(frameId);
  const sizeStyle = typeof size === 'number' ? { width: size, height: size } : { width: size, height: size };
  const hasFrame = !!frameUrl;

  return (
    <div 
      className={`relative select-none ${className}`} 
      style={sizeStyle}
      onClick={onClick}
    >
      {/* 
        Level 1: Avatar Layer (Bottom)
        无论是否有框，始终保持最原始、最纯粹的填充状态。
        严禁添加 padding, inset, border 或 scale，确保头像永远撑满容器。
      */}
      <div className={`
        absolute rounded-full overflow-hidden z-0 bg-zinc-800 transition-all duration-300 inset-0
        ${hasFrame ? 'border-[2.25px] border-white' : ''}
      `}>
        <img 
          src={src || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop"} 
          alt={alt}
          className={`w-full h-full object-cover transition-transform duration-300 ${hasFrame ? 'scale-[0.95]' : 'scale-100'}`}
        />
      </div>

      {/* 
        Level 2: Frame Layer (Top)
        仅在有框时渲染。
        scale-[1.325]: 关键点！让相框稍微比头像大一圈，
        这样相框的内边缘就能自然套在头像的外边缘上，
        同时云朵等装饰物能溢出头像范围，产生“包裹感”。
      */}
      {hasFrame && (
        <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center overflow-visible">
            <img 
              src={frameUrl} 
              alt="Frame" 
              className="w-full h-full object-contain scale-[1.30422] -translate-x-[1.25px]"
            />
        </div>
      )}
    </div>
  );
};
