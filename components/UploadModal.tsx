import React from 'react';
import { Icons } from './Icons';
import { UploadEditor } from './upload/UploadEditor';
import { useCurrentArtistProfile } from '../hooks/useCurrentArtistProfile';

interface UploadModalProps {
  onClose: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({ onClose }) => {
  const { profile, displayName } = useCurrentArtistProfile();

  return (
    <div className="fixed inset-0 z-[130] bg-black/90 backdrop-blur-xl overflow-y-auto">
      <div className="min-h-screen px-6 py-12 pb-32 max-w-lg mx-auto relative">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-extrabold text-white tracking-tight">添加音乐</h2>
          <button
            onClick={onClose}
            aria-label="关闭上传"
            className="p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition"
          >
            <Icons.X size={20} />
          </button>
        </div>

        <UploadEditor variant="modal" defaultArtist={displayName} currentArtistProfile={profile} onSaved={onClose} />
      </div>
    </div>
  );
};
