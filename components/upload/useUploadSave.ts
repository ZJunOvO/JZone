import { useCallback, useState } from 'react';
import { useStore } from '../../store';
import type { Song } from '../../types';
import { useAuth } from '../../auth';
import { hasSupabaseConfig } from '../../supabaseClient';
import { supabaseApi } from '../../supabaseApi';
import { localLibraryStorage } from '../../localLibraryStorage';
import { attachUploadedSongToCollection, createUploadedSongFromRow, resolveUploadAlbum } from '../../utils/uploadFlow';
import type { UploadDraftState } from './useUploadDraft';

export const useUploadSave = ({
  draft,
  defaultArtist,
  resetDraft,
  onSaved,
}: {
  draft: UploadDraftState;
  defaultArtist?: string;
  resetDraft: () => void;
  onSaved?: () => void;
}) => {
  const { addSong } = useStore();
  const { user } = useAuth();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const save = useCallback(async () => {
    if (!draft.file || isSaving) return;
    setSaveError(null);
    setIsSaving(true);

    try {
      if (hasSupabaseConfig && user) {
        const albumForSong = resolveUploadAlbum(draft.collectionSelection, draft.album);
        const row = await supabaseApi.uploadAndCreateSong({
          userId: user.id,
          title: draft.title || '未命名',
          artist: draft.artist || defaultArtist || '未知艺人',
          album: albumForSong || '未知专辑',
          genre: draft.genre || undefined,
          story: draft.story || undefined,
          fileSize: draft.file.size,
          duration: draft.duration,
          trimStart: draft.range[0],
          trimEnd: draft.range[1],
          audioFile: draft.file,
          coverFile: draft.coverFile ?? undefined,
          visibility: draft.songVisibility,
        });

        let signedCoverUrl = draft.coverUrl;
        if (row.cover_path) {
          try {
            signedCoverUrl = await supabaseApi.createSignedCoverUrl(row.cover_path);
          } catch {}
        }

        addSong(createUploadedSongFromRow({ row, coverUrl: signedCoverUrl, visibility: draft.songVisibility }));

        try {
          await attachUploadedSongToCollection(draft.collectionSelection, row.id);
        } catch (e) {
          console.warn('歌曲已上传，但加入合集失败:', e);
          alert('歌曲已上传成功，但加入合集失败。你可以稍后在合集里手动添加。');
        }

        alert('歌曲已成功保存！');
        resetDraft();
        onSaved?.();
        return;
      }

      const songId = Math.random().toString(36).substr(2, 9);
      const persistedMeta = {
        id: songId,
        title: draft.title || '未命名',
        artist: draft.artist || defaultArtist || '未知艺人',
        album: draft.album || '未知专辑',
        genre: draft.genre || undefined,
        story: draft.story || undefined,
        fileSize: draft.file.size,
        duration: draft.duration,
        trimStart: draft.range[0],
        trimEnd: draft.range[1],
        uploadedBy: 'Me',
        addedAt: Date.now(),
        coverUrl: draft.coverFile ? undefined : draft.coverUrl,
      };

      localLibraryStorage
        .saveSong({ meta: persistedMeta, audioFile: draft.file, coverFile: draft.coverFile ?? undefined })
        .catch(() => {});

      const newSong: Song = {
        id: songId,
        title: persistedMeta.title,
        artist: persistedMeta.artist,
        album: persistedMeta.album,
        genre: persistedMeta.genre,
        story: persistedMeta.story,
        fileSize: persistedMeta.fileSize,
        coverUrl: draft.coverFile ? URL.createObjectURL(draft.coverFile) : draft.coverUrl,
        audioUrl: URL.createObjectURL(draft.file),
        duration: draft.duration,
        trimStart: draft.range[0],
        trimEnd: draft.range[1],
        uploadedBy: 'Me',
        addedAt: persistedMeta.addedAt,
      };

      addSong(newSong);
      alert('歌曲已成功保存！');
      resetDraft();
      onSaved?.();
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : '';
      setSaveError(msg || '上传失败：请检查腾讯云 COS 是否欠费、密钥权限与 Bucket 区域配置');
    } finally {
      setIsSaving(false);
    }
  }, [addSong, defaultArtist, draft, isSaving, onSaved, resetDraft, user]);

  return { save, isSaving, saveError, setSaveError };
};
