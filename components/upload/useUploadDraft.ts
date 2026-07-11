import { useCallback, useEffect, useRef, useState } from 'react';
import type { CollectionSelectValue } from '../CollectionCreatableSelect';
import { uploadDraftStorage } from '../../uploadDraftStorage';
import { createUploadDraftMeta, normalizeUploadDraftMeta, type UploadVisibility } from '../../utils/uploadDraftMeta';
import { adjustRangeForDuration, makePreviewBlob, persistDraftAudio, readAudioDurationMetadata, readEmbeddedAudioTags, snapshotAudioFile } from '../../utils/uploadAudio';
import { transcodeAudioToMp3 } from '../../utils/audioTranscode';
import type { SongArtistInput } from '../../supabaseApi';
import type { CurrentArtistProfile } from '../../hooks/useCurrentArtistProfile';
import { prepareImageForEditing } from '../../imageProcessing';

export interface UploadDraftState {
  step: 1 | 2;
  file: File | null;
  previewUrl: string;
  title: string;
  artist: string;
  artistCredits: SongArtistInput[];
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
  sourceWarning: string | null;
  isPreviewSupported: boolean;
  isPreviewPlaying: boolean;
  isReadingFile: boolean;
  transcodeProgress: number;
  transcodeMessage: string;
  isTranscoding: boolean;
  fileInputVersion: number;
}

export interface UploadDraftActions {
  audioPreviewRef: React.MutableRefObject<HTMLAudioElement | null>;
  setTitle: (value: string) => void;
  setArtist: (value: string) => void;
  setArtistCredits: (value: SongArtistInput[]) => void;
  setAlbum: (value: string) => void;
  setCollectionSelection: (value: CollectionSelectValue) => void;
  setGenre: (value: string) => void;
  setStory: (value: string) => void;
  setSongVisibility: (value: UploadVisibility) => void;
  setRange: React.Dispatch<React.SetStateAction<[number, number]>>;
  setPreviewError: (value: string | null) => void;
  loadFile: (file: File) => Promise<void>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleCoverUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  playPreviewSection: () => void;
  playPreviewFromStart: () => void;
  handleSeek: (time: number) => void;
  handleAudioTimeUpdate: (e: React.SyntheticEvent<HTMLAudioElement>) => void;
  handleAudioPlay: (e: React.SyntheticEvent<HTMLAudioElement>) => void;
  handleAudioPause: (e: React.SyntheticEvent<HTMLAudioElement>) => void;
  handleAudioEnded: (e: React.SyntheticEvent<HTMLAudioElement>) => void;
  handleAudioError: (e: React.SyntheticEvent<HTMLAudioElement>) => void;
  handleAudioLoadedMetadata: (e: React.SyntheticEvent<HTMLAudioElement>) => void;
  transcodeToMp3: () => void;
  resetDraft: () => void;
}

export interface UploadDraftStatus {
  hasDraft: boolean;
  label: string;
}

const randomCover = () => `https://picsum.photos/seed/${Math.random()}/400/400`;

const emptySelection: CollectionSelectValue = { kind: 'none' };

const looksLikeAuthFallbackArtist = (value: string) => {
  const normalized = value.trim();
  return /^\d{5,}$/.test(normalized) || /^\d{5,}@qq\.com$/i.test(normalized);
};

const createDefaultCredits = (defaultArtist?: string, currentProfile?: CurrentArtistProfile | null): SongArtistInput[] => {
  const displayName = defaultArtist?.trim();
  if (!displayName) return [];
  return [{ profileId: currentProfile?.id ?? null, displayName, role: 'primary', sortOrder: 0 }];
};

export const useUploadDraft = (defaultArtist?: string, currentProfile?: CurrentArtistProfile | null) => {
  const [draft, setDraft] = useState<UploadDraftState>({
    step: 1,
    file: null,
    previewUrl: '',
    title: '',
    artist: defaultArtist || '',
    artistCredits: createDefaultCredits(defaultArtist, currentProfile),
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
    sourceWarning: null,
    isPreviewSupported: true,
    isPreviewPlaying: false,
    isReadingFile: false,
    transcodeProgress: 0,
    transcodeMessage: '',
    isTranscoding: false,
    fileInputVersion: 0,
  });
  const [status, setStatus] = useState<UploadDraftStatus>({ hasDraft: false, label: '暂无草稿' });
  const [isDraftRestored, setIsDraftRestored] = useState(false);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef('');
  const coverUrlRef = useRef('');
  const durationJobRef = useRef(0);
  const artistEditedRef = useRef(false);
  const lastDefaultArtistRef = useRef(defaultArtist?.trim() || '');
  const fileSelectionSeqRef = useRef(0);
  const previewPlaySeqRef = useRef(0);

  const patchDraft = useCallback((updates: Partial<UploadDraftState>) => {
    setDraft((prev) => ({ ...prev, ...updates }));
  }, []);

  useEffect(() => {
    const normalizedDefault = defaultArtist?.trim();
    const previousDefault = lastDefaultArtistRef.current;
    if (normalizedDefault) lastDefaultArtistRef.current = normalizedDefault;
    if (!normalizedDefault || artistEditedRef.current) return;
    setDraft((prev) => {
      const currentArtist = prev.artist.trim();
      const primary = prev.artistCredits[0];
      const primaryIsFallback = !primary
        || (!primary.profileId && (primary.displayName === previousDefault || looksLikeAuthFallbackArtist(primary.displayName)));
      const shouldReplace = !currentArtist
        || currentArtist === previousDefault
        || looksLikeAuthFallbackArtist(currentArtist)
        || primaryIsFallback;
      if (!shouldReplace) return prev;

      const currentCredit = createDefaultCredits(normalizedDefault, currentProfile)[0];
      const remainingCredits = prev.artistCredits.filter((credit, index) => {
        if (index === 0 && primaryIsFallback) return false;
        return !currentProfile?.id || credit.profileId !== currentProfile.id;
      });
      return {
        ...prev,
        artist: normalizedDefault,
        artistCredits: currentCredit
          ? [currentCredit, ...remainingCredits].map((credit, index) => ({
              ...credit,
              role: index === 0 ? 'primary' : credit.role === 'primary' ? 'featured' : credit.role,
              sortOrder: index,
            }))
          : prev.artistCredits,
      };
    });
  }, [currentProfile, defaultArtist]);

  const updateStatus = useCallback((next: UploadDraftState) => {
    const hasCustomArtist = Boolean(next.artist.trim() && next.artist.trim() !== (defaultArtist || '').trim());
    const hasDraft = Boolean(next.file || next.title || hasCustomArtist || next.album || next.genre || next.story || next.coverFile);
    if (next.file) {
      setStatus({ hasDraft: true, label: `草稿：${next.file.name}` });
      return;
    }
    setStatus({ hasDraft, label: hasDraft ? '草稿已保存' : '暂无草稿' });
  }, [currentProfile, defaultArtist]);

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
    if (!audio || !draft.previewUrl) return;
    audio.load();
  }, [draft.previewUrl]);

  useEffect(() => {
    if (!draft.file) return;
    const job = ++durationJobRef.current;
    (async () => {
      try {
        const dur = await readAudioDurationMetadata(draft.file!);
        if (job !== durationJobRef.current) return;
        if (dur === null) return;
        setDraft((prev) => ({ ...prev, duration: dur, range: adjustRangeForDuration(prev.range, dur) }));
      } catch {}
    })();
  }, [draft.file]);

  useEffect(() => {
    let cancelled = false;
    const restoreSeq = fileSelectionSeqRef.current;

    const restore = async () => {
      try {
        const [draftMeta, draftAudio, draftCover] = await Promise.all([
          uploadDraftStorage.getMeta().catch(() => null),
          uploadDraftStorage.getAudio().catch(() => null),
          uploadDraftStorage.getCover().catch(() => null),
        ]);

        if (cancelled) return;
        if (fileSelectionSeqRef.current !== restoreSeq) return;

        setDraft((prev) => {
        if (prev.file) return prev;
        let next = { ...prev };

        if (draftMeta) {
          const normalizedMeta = normalizeUploadDraftMeta(draftMeta);
          const metaArtist = normalizedMeta.artist.trim();
          const normalizedDefault = defaultArtist?.trim() || '';
          const restoredArtist =
            normalizedDefault && looksLikeAuthFallbackArtist(metaArtist) && metaArtist !== normalizedDefault
              ? normalizedDefault
              : metaArtist || next.artist || normalizedDefault;
          const restoredPrimary = normalizedMeta.artistCredits[0];
          const restoredPrimaryIsFallback = Boolean(
            restoredPrimary
            && !restoredPrimary.profileId
            && looksLikeAuthFallbackArtist(restoredPrimary.displayName)
          );
          const restoredCredits = restoredPrimaryIsFallback && normalizedDefault
            ? [
                ...createDefaultCredits(normalizedDefault, currentProfile),
                ...normalizedMeta.artistCredits.slice(1).filter((credit) => !currentProfile?.id || credit.profileId !== currentProfile.id),
              ].map((credit, index) => ({
                ...credit,
                role: index === 0 ? 'primary' as const : credit.role === 'primary' ? 'featured' as const : credit.role,
                sortOrder: index,
              }))
            : normalizedMeta.artistCredits;
          next = {
            ...next,
            title: normalizedMeta.title,
            artist: restoredArtist,
            artistCredits: restoredCredits.length
              ? restoredCredits
              : createDefaultCredits(restoredArtist, currentProfile),
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
      } finally {
        if (!cancelled) setIsDraftRestored(true);
      }
    };

    restore();
    return () => {
      cancelled = true;
    };
  }, [currentProfile, defaultArtist]);

  useEffect(() => {
    if (!isDraftRestored) return;
    uploadDraftStorage
      .setMeta(
        createUploadDraftMeta({
          title: draft.title,
          artist: draft.artist,
          artistCredits: draft.artistCredits,
          album: draft.album,
          genre: draft.genre,
          story: draft.story,
          visibility: draft.songVisibility,
          duration: draft.duration,
          range: draft.range,
        })
      )
      .catch(() => {});
  }, [draft.album, draft.artist, draft.artistCredits, draft.duration, draft.genre, draft.range, draft.songVisibility, draft.story, draft.title, isDraftRestored]);

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
    setDraft((prev) => ({
      step: 1,
      file: null,
      previewUrl: '',
      title: '',
      artist: defaultArtist || '',
      artistCredits: createDefaultCredits(defaultArtist, currentProfile),
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
      sourceWarning: null,
      isPreviewSupported: true,
      isPreviewPlaying: false,
      isReadingFile: false,
      transcodeProgress: 0,
      transcodeMessage: '',
      isTranscoding: false,
      fileInputVersion: prev.fileInputVersion + 1,
    }));
    artistEditedRef.current = false;
    lastDefaultArtistRef.current = defaultArtist?.trim() || '';
  }, [currentProfile, defaultArtist]);

  const loadFile = useCallback(
    async (rawFile: File) => {
      const selectionSeq = fileSelectionSeqRef.current + 1;
      fileSelectionSeqRef.current = selectionSeq;
      patchDraft({
        isReadingFile: true,
        previewError: null,
        sourceWarning: null,
        transcodeMessage: '',
        transcodeProgress: 0,
        isTranscoding: false,
        isPreviewPlaying: false,
      });

      let selectedFile: File;
      try {
        selectedFile = await snapshotAudioFile(rawFile);
      } catch (error) {
        const detail = error instanceof Error ? error.message : '浏览器没有返回可读取的音频文件。';
        patchDraft({
          file: null,
          previewUrl: '',
          step: 1,
          previewError: `音频文件读取失败：${detail}`,
          sourceWarning: null,
          isPreviewSupported: false,
          isPreviewPlaying: false,
          isReadingFile: false,
          transcodeMessage: '',
          transcodeProgress: 0,
          isTranscoding: false,
          fileInputVersion: Date.now(),
        });
        return;
      }

      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const nextPreviewUrl = URL.createObjectURL(makePreviewBlob(selectedFile));
      await persistDraftAudio(selectedFile).catch(() => {});
      const embeddedTags: { title?: string; artist?: string } = await readEmbeddedAudioTags(selectedFile).catch(() => ({}));
      if (fileSelectionSeqRef.current !== selectionSeq) {
        URL.revokeObjectURL(nextPreviewUrl);
        return;
      }

      setDraft((prev) => {
        const fileTitle = selectedFile.name.replace(/\.[^/.]+$/, '').trim();
        const prevArtist = prev.artist.trim();
        const normalizedDefault = defaultArtist?.trim() || '';
        const nextArtist =
          !prevArtist || (normalizedDefault && looksLikeAuthFallbackArtist(prevArtist) && prevArtist !== normalizedDefault)
            ? normalizedDefault
            : prev.artist;
        const shouldReplaceCredits = !prev.artistCredits.length
          || (!prev.artistCredits[0]?.profileId && looksLikeAuthFallbackArtist(prev.artistCredits[0]?.displayName || ''));

        return {
          ...prev,
          file: selectedFile,
          previewUrl: nextPreviewUrl,
          previewError: null,
          isPreviewSupported: true,
          isPreviewPlaying: false,
          isReadingFile: false,
          transcodeProgress: 0,
          transcodeMessage: '',
          isTranscoding: false,
          step: 2,
          title: fileTitle,
          artist: nextArtist,
          artistCredits: shouldReplaceCredits ? createDefaultCredits(nextArtist, currentProfile) : prev.artistCredits,
          sourceWarning:
            embeddedTags.title && fileTitle && embeddedTags.title !== fileTitle
              ? `音频内嵌标题是「${embeddedTags.title}」${embeddedTags.artist ? ` / ${embeddedTags.artist}` : ''}，请确认你选择的是正确音频。`
              : null,
          fileInputVersion: prev.fileInputVersion + 1,
        };
      });

    },
    [currentProfile, defaultArtist, patchDraft]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.currentTarget;
      const rawFile = e.target.files?.[0];
      if (rawFile) void loadFile(rawFile);
      window.setTimeout(() => {
        input.value = '';
      }, 0);
    },
    [loadFile]
  );

  const handleCoverUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const sourceFile = input.files?.[0];
    input.value = '';
    if (!sourceFile) return;
    prepareImageForEditing(sourceFile)
      .then((prepared) => {
        const nextFile = new File([prepared], 'cover.jpg', { type: 'image/jpeg', lastModified: Date.now() });
        if (coverUrlRef.current.startsWith('blob:')) URL.revokeObjectURL(coverUrlRef.current);
        const coverUrl = URL.createObjectURL(nextFile);
        uploadDraftStorage.setCover(nextFile).catch(() => {});
        patchDraft({ coverFile: nextFile, coverUrl });
      })
      .catch((error) => {
        patchDraft({ previewError: error instanceof Error ? `封面读取失败：${error.message}` : '封面读取失败' });
      });
  }, [patchDraft]);

  const transcodeToMp3 = useCallback(() => {
    if (!draft.file || draft.isTranscoding) return;
    const sourceFile = draft.file;
    patchDraft({
      isTranscoding: true,
      transcodeProgress: 0,
      transcodeMessage: '准备转码…',
      previewError: null,
      isPreviewPlaying: false,
    });

    transcodeAudioToMp3(sourceFile, ({ progress, message }) => {
      setDraft((prev) => ({
        ...prev,
        transcodeProgress: Math.max(prev.transcodeProgress, Math.round(progress * 100)),
        transcodeMessage: message,
      }));
    })
      .then((mp3File) => {
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const nextPreviewUrl = URL.createObjectURL(mp3File);
        persistDraftAudio(mp3File).catch(() => {});
        setDraft((prev) => ({
          ...prev,
          file: mp3File,
          previewUrl: nextPreviewUrl,
          previewError: null,
          sourceWarning: null,
          isPreviewSupported: true,
          isPreviewPlaying: false,
          isTranscoding: false,
          transcodeProgress: 100,
          transcodeMessage: '已转为 MP3，可继续预览和上传',
          currentPreviewTime: 0,
        }));
      })
      .catch((error) => {
        const detail = typeof error?.message === 'string' ? error.message : '未知错误';
        patchDraft({
          isTranscoding: false,
          transcodeMessage: '',
          isPreviewPlaying: false,
          previewError: `音频转码失败：${detail}`,
        });
      });
  }, [draft.file, draft.isTranscoding, patchDraft]);

  const playPreviewFromStart = useCallback(() => {
    if (!audioPreviewRef.current) return;
    const audio = audioPreviewRef.current;
    const playSeq = ++previewPlaySeqRef.current;
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
      if (playSeq !== previewPlaySeqRef.current) return;
      patchDraft({ isPreviewPlaying: true, currentPreviewTime: audio.currentTime });
    };

    start().catch((e) => {
      if (playSeq !== previewPlaySeqRef.current) return;
      const detail = typeof e?.message === 'string' ? e.message : audio.error?.code ? `MediaError(${audio.error.code})` : '未知错误';
      if ((e as DOMException)?.name === 'AbortError' || /interrupted by a call to pause/i.test(detail)) return;
      patchDraft({ previewError: `无法播放预览：${detail}`, isPreviewPlaying: false });
    });
  }, [draft.range, patchDraft]);

  const playPreviewSection = useCallback(() => {
    const audio = audioPreviewRef.current;
    if (!audio) return;
    if (!audio.paused && !audio.ended) {
      previewPlaySeqRef.current += 1;
      audio.pause();
      patchDraft({ isPreviewPlaying: false });
      return;
    }
    playPreviewFromStart();
  }, [patchDraft, playPreviewFromStart]);

  const handleSeek = useCallback((time: number) => {
    if (!audioPreviewRef.current) return;
    audioPreviewRef.current.currentTime = time;
    patchDraft({ currentPreviewTime: time });
  }, [patchDraft]);

  const handleAudioTimeUpdate = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    const audio = e.currentTarget;
    setDraft((prev) => {
      const currentPreviewTime = audio.currentTime;
      if (prev.step === 2 && !audio.paused && Number.isFinite(prev.range[1]) && currentPreviewTime >= prev.range[1]) {
        audio.pause();
        return { ...prev, currentPreviewTime, isPreviewPlaying: false };
      }
      return { ...prev, currentPreviewTime };
    });
  }, []);

  const handleAudioPlay = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    patchDraft({ isPreviewPlaying: true, currentPreviewTime: e.currentTarget.currentTime });
  }, [patchDraft]);

  const handleAudioPause = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    patchDraft({ isPreviewPlaying: false, currentPreviewTime: e.currentTarget.currentTime });
  }, [patchDraft]);

  const handleAudioEnded = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    patchDraft({ isPreviewPlaying: false, currentPreviewTime: e.currentTarget.currentTime });
  }, [patchDraft]);

  const handleAudioError = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    const audio = e.currentTarget;
    const code = audio.error?.code ? `MediaError(${audio.error.code})` : 'unknown';
    setDraft((prev) => ({
      ...prev,
      isPreviewSupported: false,
      duration: Number.isFinite(prev.duration) && prev.duration > 0 ? prev.duration : 240,
      range: Number.isFinite(prev.range[1]) && prev.range[1] > 0 ? prev.range : [0, 240],
      currentPreviewTime: 0,
      isPreviewPlaying: false,
      previewError: code === 'MediaError(4)' ? '音频预览失败：当前浏览器不支持该 M4A/MP4 编码，仍可直接上传' : `音频加载失败：${code}`,
    }));
  }, []);

  const handleAudioLoadedMetadata = useCallback((e: React.SyntheticEvent<HTMLAudioElement>) => {
    const dur = e.currentTarget.duration;
    if (!Number.isFinite(dur) || dur <= 0) {
      setDraft((prev) => ({
        ...prev,
        isPreviewSupported: false,
        duration: Number.isFinite(prev.duration) && prev.duration > 0 ? prev.duration : 240,
        range: Number.isFinite(prev.range[1]) && prev.range[1] > 0 ? prev.range : [0, 240],
        currentPreviewTime: 0,
        isPreviewPlaying: false,
        previewError: '音频预览失败：无法读取时长，仍可直接上传',
      }));
      return;
    }

    setDraft((prev) => ({
      ...prev,
      duration: dur,
      range: !Number.isFinite(prev.range[1]) || Math.abs(prev.range[1] - dur) > 1 ? [0, dur] : prev.range,
    }));
  }, []);

  const actions: UploadDraftActions = {
    audioPreviewRef,
    setTitle: (value) => patchDraft({ title: value }),
    setArtist: (value) => {
      artistEditedRef.current = true;
      patchDraft({ artist: value });
    },
    setArtistCredits: (value) => {
      artistEditedRef.current = true;
      patchDraft({ artistCredits: value });
    },
    setAlbum: (value) => patchDraft({ album: value }),
    setCollectionSelection: (value) => patchDraft({ collectionSelection: value }),
    setGenre: (value) => patchDraft({ genre: value }),
    setStory: (value) => patchDraft({ story: value }),
    setSongVisibility: (value) => patchDraft({ songVisibility: value }),
    setRange: (value) => setDraft((prev) => ({ ...prev, range: typeof value === 'function' ? value(prev.range) : value })),
    setPreviewError: (value) => patchDraft({ previewError: value }),
    loadFile,
    handleFileChange,
    handleCoverUpload,
    playPreviewSection,
    playPreviewFromStart,
    handleSeek,
    handleAudioTimeUpdate,
    handleAudioPlay,
    handleAudioPause,
    handleAudioEnded,
    handleAudioError,
    handleAudioLoadedMetadata,
    transcodeToMp3,
    resetDraft,
  };

  return { draft, actions, status };
};
