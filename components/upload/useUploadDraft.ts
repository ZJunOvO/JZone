import { useCallback, useEffect, useRef, useState } from 'react';
import type { CollectionSelectValue } from '../CollectionCreatableSelect';
import { uploadDraftStorage } from '../../uploadDraftStorage';
import { createUploadDraftMeta, normalizeUploadDraftMeta, type UploadVisibility } from '../../utils/uploadDraftMeta';
import { adjustRangeForDuration, decodeAudioDuration, makePreviewBlob, persistDraftAudio } from '../../utils/uploadAudio';

export interface UploadDraftState {
  step: 1 | 2;
  file: File | null;
  previewUrl: string;
  title: string;
  artist: string;
  album: string;
  collectionSelection: CollectionSelectValue;
  genre: string;
  story: string;
  songVisibility: UploadVisibility;
  coverUrl: string;
  coverFile: File | null;
  duration: number;
  range: [number, number];
  currentPreviewTime: number;
  previewError: string | null;
  isPreviewSupported: boolean;
}

export interface UploadDraftActions {
  audioPreviewRef: React.MutableRefObject<HTMLAudioElement | null>;
  setTitle: (value: string) => void;
  setArtist: (value: string) => void;
  setAlbum: (value: string) => void;
  setCollectionSelection: (value: CollectionSelectValue) => void;
  setGenre: (value: string) => void;
  setStory: (value: string) => void;
  setSongVisibility: (value: UploadVisibility) => void;
  setRange: React.Dispatch<React.SetStateAction<[number, number]>>;
  setPreviewError: (value: string | null) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleCoverUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  playPreviewSection: () => void;
  handleSeek: (time: number) => void;
  handleAudioError: (e: React.SyntheticEvent<HTMLAudioElement>) => void;
  handleAudioLoadedMetadata: (e: React.SyntheticEvent<HTMLAudioElement>) => void;
  resetDraft: () => void;
}

export interface UploadDraftStatus {
  hasDraft: boolean;
  label: string;
}

const randomCover = () => `https://picsum.photos/seed/${Math.random()}/400/400`;

const emptySelection: CollectionSelectValue = { kind: 'none' };

export const useUploadDraft = (defaultArtist?: string) => {
  const [draft, setDraft] = useState<UploadDraftState>({
    step: 1,
    file: null,
    previewUrl: '',
    title: '',
    artist: '',
    album: '',
    collectionSelection: emptySelection,
    genre: '',
    story: '',
    songVisibility: 'public',
    coverUrl: randomCover(),
    coverFile: null,
    duration: 240,
    range: [0, 240],
    currentPreviewTime: 0,
    previewError: null,
    isPreviewSupported: true,
  });
  const [status, setStatus] = useState<UploadDraftStatus>({ hasDraft: false, label: '暂无草稿' });
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef('');
  const coverUrlRef = useRef('');
  const durationJobRef = useRef(0);

  const patchDraft = useCallback((updates: Partial<UploadDraftState>) => {
    setDraft((prev) => ({ ...prev, ...updates }));
  }, []);

  const updateStatus = useCallback((next: UploadDraftState) => {
    const hasDraft = Boolean(next.file || next.title || next.artist || next.album || next.genre || next.story || next.coverFile);
    if (next.file) {
      setStatus({ hasDraft: true, label: `草稿：${next.file.name}` });
      return;
    }
    setStatus({ hasDraft, label: hasDraft ? '草稿已保存' : '暂无草稿' });
  }, []);

  useEffect(() => {
    previewUrlRef.current = draft.previewUrl;
  }, [draft.previewUrl]);

  useEffect(() => {
    coverUrlRef.current = draft.coverUrl;
  }, [draft.coverUrl]);

  useEffect(() => {
    updateStatus(draft);
  }, [draft, updateStatus]);

  useEffect(() => {
    const audio = audioPreviewRef.current;
    if (!audio) return;

    const updateTime = () => {
      setDraft((prev) => {
        const currentPreviewTime = audio.currentTime;
        if (prev.step === 2 && !audio.paused && Number.isFinite(prev.range[1]) && currentPreviewTime >= prev.range[1]) {
          audio.pause();
        }
        return { ...prev, currentPreviewTime };
      });
    };

    audio.addEventListener('timeupdate', updateTime);
    return () => audio.removeEventListener('timeupdate', updateTime);
  }, []);

  useEffect(() => {
    const audio = audioPreviewRef.current;
    if (!audio || !draft.previewUrl) return;
    audio.load();
  }, [draft.previewUrl]);

  useEffect(() => {
    if (!draft.file) return;
    const job = ++durationJobRef.current;
    (async () => {
      try {
        const dur = await decodeAudioDuration(draft.file!);
        if (job !== durationJobRef.current) return;
        if (dur === null) return;
        setDraft((prev) => ({ ...prev, duration: dur, range: adjustRangeForDuration(prev.range, dur) }));
      } catch {}
    })();
  }, [draft.file]);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      const [draftMeta, draftAudio, draftCover] = await Promise.all([
        uploadDraftStorage.getMeta().catch(() => null),
        uploadDraftStorage.getAudio().catch(() => null),
        uploadDraftStorage.getCover().catch(() => null),
      ]);

      if (cancelled) return;

      setDraft((prev) => {
        let next = { ...prev };

        if (draftMeta) {
          const normalizedMeta = normalizeUploadDraftMeta(draftMeta);
          next = {
            ...next,
            title: normalizedMeta.title,
            artist: normalizedMeta.artist,
            album: normalizedMeta.album,
            genre: normalizedMeta.genre,
            story: normalizedMeta.story,
            songVisibility: normalizedMeta.visibility,
            duration: normalizedMeta.duration ?? next.duration,
            range: normalizedMeta.range ?? next.range,
          };
        }

        if (draftAudio) {
          next = {
            ...next,
            file: draftAudio,
            previewUrl: URL.createObjectURL(makePreviewBlob(draftAudio)),
            step: 2,
          };
        }

        if (draftCover) {
          next = {
            ...next,
            coverFile: draftCover,
            coverUrl: URL.createObjectURL(draftCover),
          };
        }

        return next;
      });
    };

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    uploadDraftStorage
      .setMeta(
        createUploadDraftMeta({
          title: draft.title,
          artist: draft.artist,
          album: draft.album,
          genre: draft.genre,
          story: draft.story,
          visibility: draft.songVisibility,
          duration: draft.duration,
          range: draft.range,
        })
      )
      .catch(() => {});
  }, [draft.album, draft.artist, draft.duration, draft.genre, draft.range, draft.songVisibility, draft.story, draft.title]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      if (coverUrlRef.current.startsWith('blob:')) URL.revokeObjectURL(coverUrlRef.current);
    };
  }, []);

  const resetDraft = useCallback(() => {
    uploadDraftStorage.clearAll().catch(() => {});
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    if (coverUrlRef.current.startsWith('blob:')) URL.revokeObjectURL(coverUrlRef.current);
    setDraft({
      step: 1,
      file: null,
      previewUrl: '',
      title: '',
      artist: '',
      album: '',
      collectionSelection: emptySelection,
      genre: '',
      story: '',
      songVisibility: 'public',
      coverUrl: randomCover(),
      coverFile: null,
      duration: 240,
      range: [0, 240],
      currentPreviewTime: 0,
      previewError: null,
      isPreviewSupported: true,
    });
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.[0]) return;
      const selectedFile = e.target.files[0];
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const nextPreviewUrl = URL.createObjectURL(makePreviewBlob(selectedFile));
      persistDraftAudio(selectedFile);

      setDraft((prev) => {
        const nameParts = selectedFile.name.replace(/\.[^/.]+$/, '').split('-');
        if (nameParts.length > 1) {
          return {
            ...prev,
            file: selectedFile,
            previewUrl: nextPreviewUrl,
            previewError: null,
            isPreviewSupported: true,
            step: 2,
            artist: nameParts[0].trim(),
            title: nameParts.slice(1).join('-').trim(),
          };
        }

        return {
          ...prev,
          file: selectedFile,
          previewUrl: nextPreviewUrl,
          previewError: null,
          isPreviewSupported: true,
          step: 2,
          title: nameParts[0],
          artist: prev.artist || defaultArtist || '',
        };
      });
    },
    [defaultArtist]
  );

  const handleCoverUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const nextFile = e.target.files[0];
    if (coverUrlRef.current.startsWith('blob:')) URL.revokeObjectURL(coverUrlRef.current);
    const coverUrl = URL.createObjectURL(nextFile);
    uploadDraftStorage.setCover(nextFile).catch(() => {});
    patchDraft({ coverFile: nextFile, coverUrl });
  }, [patchDraft]);

  const playPreviewSection = useCallback(() => {
    if (!audioPreviewRef.current) return;
    const audio = audioPreviewRef.current;
    patchDraft({ previewError: null });
    const startTime = draft.range[0];

    const start = async () => {
      if (audio.readyState === 0) audio.load();
      await new Promise<void>((resolve) => {
        if (audio.readyState >= 1) return resolve();
        const onLoaded = () => {
          audio.removeEventListener('loadedmetadata', onLoaded);
          resolve();
        };
        audio.addEventListener('loadedmetadata', onLoaded);
      });
      audio.currentTime = Number.isFinite(startTime) ? startTime : 0;
      await audio.play();
    };

    start().catch((e) => {
      const detail = typeof e?.message === 'string' ? e.message : audio.error?.code ? `MediaError(${audio.error.code})` : '未知错误';
      patchDraft({ previewError: `无法播放预览：${detail}` });
    });
  }, [draft.range, patchDraft]);

  const handleSeek = useCallback((time: number) => {
    if (!audioPreviewRef.current) return;
    audioPreviewRef.current.currentTime = time;
    patchDraft({ currentPreviewTime: time });
  }, [patchDraft]);

  const handleAudioError = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    const audio = e.currentTarget;
    const code = audio.error?.code ? `MediaError(${audio.error.code})` : 'unknown';
    patchDraft({
      isPreviewSupported: false,
      duration: Number.isFinite(draft.duration) && draft.duration > 0 ? draft.duration : 240,
      range: Number.isFinite(draft.range[1]) && draft.range[1] > 0 ? draft.range : [0, 240],
      currentPreviewTime: 0,
      previewError: code === 'MediaError(4)' ? '音频预览失败：当前浏览器不支持该 M4A/MP4 编码，仍可直接上传' : `音频加载失败：${code}`,
    });
  }, [draft.duration, draft.range, patchDraft]);

  const handleAudioLoadedMetadata = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    const dur = e.currentTarget.duration;
    if (!Number.isFinite(dur) || dur <= 0) {
      patchDraft({
        isPreviewSupported: false,
        duration: Number.isFinite(draft.duration) && draft.duration > 0 ? draft.duration : 240,
        range: Number.isFinite(draft.range[1]) && draft.range[1] > 0 ? draft.range : [0, 240],
        currentPreviewTime: 0,
        previewError: '音频预览失败：无法读取时长，仍可直接上传',
      });
      return;
    }

    patchDraft({
      duration: dur,
      range: !Number.isFinite(draft.range[1]) || Math.abs(draft.range[1] - dur) > 1 ? [0, dur] : draft.range,
    });
  }, [draft.duration, draft.range, patchDraft]);

  const actions: UploadDraftActions = {
    audioPreviewRef,
    setTitle: (value) => patchDraft({ title: value }),
    setArtist: (value) => patchDraft({ artist: value }),
    setAlbum: (value) => patchDraft({ album: value }),
    setCollectionSelection: (value) => patchDraft({ collectionSelection: value }),
    setGenre: (value) => patchDraft({ genre: value }),
    setStory: (value) => patchDraft({ story: value }),
    setSongVisibility: (value) => patchDraft({ songVisibility: value }),
    setRange: (value) => setDraft((prev) => ({ ...prev, range: typeof value === 'function' ? value(prev.range) : value })),
    setPreviewError: (value) => patchDraft({ previewError: value }),
    handleFileChange,
    handleCoverUpload,
    playPreviewSection,
    handleSeek,
    handleAudioError,
    handleAudioLoadedMetadata,
    resetDraft,
  };

  return { draft, actions, status };
};
