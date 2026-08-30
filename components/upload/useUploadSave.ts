import { useCallback, useState } from 'react';
import { useStore } from '../../store';
import type { Song } from '../../types';
import { useAuth } from '../../auth';
import { hasSupabaseConfig } from '../../supabaseClient';
import { supabaseApi } from '../../supabaseApi';
import { localLibraryStorage } from '../../localLibraryStorage';
import { attachUploadedSongToCollection, createUploadedSongFromRow, resolveUploadAlbum } from '../../utils/uploadFlow';
import type { UploadDraftState } from './useUploadDraft';
import { feedback } from '../feedback';
import { analyzeAudioDelivery, STREAM_COPY_BITRATE_KBPS } from '../../utils/audioDelivery';
import { transcodeAudioForStreaming } from '../../utils/audioTranscode';
import type { LyricsEditorSavePayload } from '../lyrics';
import type { SongLyricsNormalizedContent } from '../../services/supabase/types';

export interface UploadSaveProgress {
  percent: number;
  message: string;
}

export const useUploadSave = ({
  draft,
  defaultArtist,
  resetDraft,
  onSaved,
  lyrics,
}: {
  draft: UploadDraftState;
  defaultArtist?: string;
  resetDraft: () => void;
  onSaved?: () => void;
  lyrics?: LyricsEditorSavePayload | null;
}) => {
  const { addSong } = useStore();
  const { user } = useAuth();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<UploadSaveProgress | null>(null);

  const save = useCallback(async () => {
    if (!draft.file || isSaving) return;
    setSaveError(null);
    setSaveProgress({ percent: 0, message: '准备上传' });
    setIsSaving(true);

    try {
      if (hasSupabaseConfig && user) {
        let streamAudioFile: File | undefined;
        const delivery = analyzeAudioDelivery(draft.file, draft.duration);
        if (draft.streamOptimizationEnabled && delivery.canCreateStreamCopy) {
          setSaveProgress({ percent: 1, message: '正在生成节流播放副本' });
          try {
            const candidate = await transcodeAudioForStreaming(
              draft.file,
              STREAM_COPY_BITRATE_KBPS,
              (progress) => {
                setSaveProgress({
                  percent: Math.max(1, Math.round(progress.progress * 22)),
                  message: progress.message,
                });
              },
            );

            if (candidate.size < draft.file.size * 0.9) {
              streamAudioFile = candidate;
            } else {
              feedback.info('播放副本节省不足 10%，已直接使用原文件播放');
            }
          } catch (error) {
            console.warn('节流播放副本生成失败，回退到原文件:', error);
            feedback.info('播放副本生成失败，已自动使用原文件继续上传', { duration: 7000 });
          }
        }

        const albumForSong = resolveUploadAlbum(draft.collectionSelection, draft.album);
        const uploadProgressBase = streamAudioFile ? 24 : 0;
        const uploadProgressSpan = streamAudioFile ? 72 : 96;
        const row = await supabaseApi.uploadAndCreateSong({
          userId: user.id,
          title: draft.title || '未命名',
          artist: draft.artist || defaultArtist || '未知艺人',
          album: albumForSong || '未知专辑',
          genre: draft.genre || undefined,
          story: draft.story || undefined,
          recordedAt: draft.recordedAt || undefined,
          fileSize: draft.file.size,
          duration: draft.duration,
          trimStart: draft.range[0],
          trimEnd: draft.range[1],
          audioFile: draft.file,
          streamAudioFile,
          streamBitrateKbps: streamAudioFile ? STREAM_COPY_BITRATE_KBPS : undefined,
          coverFile: draft.coverFile ?? undefined,
          visibility: draft.songVisibility,
          onUploadProgress: (progress) => {
            setSaveProgress({
              percent: uploadProgressBase + Math.round(progress.percent * uploadProgressSpan / 100),
              message: progress.message,
            });
          },
        });

        setSaveProgress({ percent: 96, message: '正在生成封面访问链接' });
        let signedCoverUrl = draft.coverUrl;
        if (row.cover_path) {
          try {
            signedCoverUrl = await supabaseApi.createSignedCoverUrl(row.cover_path);
          } catch {}
        }

        setSaveProgress({ percent: 98, message: '正在同步到本地资料库' });
        addSong(createUploadedSongFromRow({ row, coverUrl: signedCoverUrl, visibility: draft.songVisibility }));

        let lyricsSyncFailed = false;
        if (lyrics) {
          try {
            setSaveProgress({ percent: 98, message: '正在同步歌词' });
            await supabaseApi.upsertSongLyrics(row.id, {
              format: lyrics.format,
              source: lyrics.source,
              rawContent: lyrics.rawContent,
              normalizedContent: lyrics.normalizedContent as unknown as SongLyricsNormalizedContent,
              offsetMs: lyrics.offsetMs,
              version: lyrics.version,
            });
          } catch (error) {
            lyricsSyncFailed = true;
            console.warn('歌曲已保存，但歌词同步失败:', error);
          }
        }

        try {
          const artistCredits = draft.artistCredits.length
            ? draft.artistCredits
            : draft.artist
                .split(/\s*(?:\/|、|&|，|,)\s*/)
                .filter(Boolean)
                .map((displayName, index) => ({
                  displayName,
                  role: index === 0 ? 'primary' as const : 'featured' as const,
                  sortOrder: index,
                }));
          if (artistCredits.length) {
            await supabaseApi.upsertSongArtists(row.id, artistCredits, draft.artist);
          }
        } catch (error) {
          console.warn('歌曲已上传，但结构化艺人信息同步失败:', error);
          feedback.info('歌曲已上传，艺人关系可稍后在歌曲信息中重试', { duration: 7000 });
        }

        try {
          setSaveProgress({ percent: 99, message: '正在同步专辑/歌单' });
          await attachUploadedSongToCollection(draft.collectionSelection, row.id);
        } catch (e) {
          console.warn('歌曲已上传，但加入合集失败:', e);
          feedback.info('歌曲已上传，但加入合集失败，可稍后手动添加', { duration: 7000 });
        }

        if (draft.collectionSelection.kind === 'none' && albumForSong?.trim()) {
          try {
            setSaveProgress({ percent: 99, message: '正在同步专辑关系' });
            await supabaseApi.syncSongAlbumByTitle(row.id, albumForSong);
          } catch (e) {
            console.warn('歌曲已上传，但同步专辑关联失败:', e);
            feedback.info('歌曲已上传，但专辑关系同步失败，可稍后重试', { duration: 7000 });
          }
        }

        setSaveProgress({ percent: 100, message: '保存完成' });
        if (lyricsSyncFailed) {
          feedback.info('歌曲已保存，歌词可稍后补录', { duration: 7000 });
        } else {
          feedback.success('歌曲已保存到资料库');
        }
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
        recordedAt: draft.recordedAt || undefined,
        coverUrl: draft.coverFile ? undefined : draft.coverUrl,
      };

      localLibraryStorage
        .saveSong({ meta: persistedMeta, audioFile: draft.file, coverFile: draft.coverFile ?? undefined })
        .catch(() => {});

      setSaveProgress({ percent: 80, message: '正在保存到本地资料库' });
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
        recordedAt: persistedMeta.recordedAt,
      };

      addSong(newSong);
      setSaveProgress({ percent: 100, message: '保存完成' });
      if (lyrics) {
        feedback.info('歌曲已保存，歌词可稍后补录', { duration: 7000 });
      } else {
        feedback.success('歌曲已保存到资料库');
      }
      resetDraft();
      onSaved?.();
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : '';
      if (/network|failed to fetch|xhr|cors/i.test(msg)) {
        setSaveError('上传网络错误：请确认手机与电脑网络可访问腾讯云 COS，并重新选择原始音频文件再试。若文件来自聊天软件，请先保存到系统文件/下载目录。');
      } else {
        setSaveError(msg || '上传失败：请检查腾讯云 COS 是否欠费、密钥权限与 Bucket 区域配置');
      }
    } finally {
      setIsSaving(false);
      window.setTimeout(() => setSaveProgress(null), 600);
    }
  }, [addSong, defaultArtist, draft, isSaving, lyrics, onSaved, resetDraft, user]);

  return { save, isSaving, saveError, setSaveError, saveProgress };
};
