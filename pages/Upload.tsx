import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Icons } from '../components/Icons';
import { useAuth } from '../auth';
import { UploadEditor } from '../components/upload/UploadEditor';
import type { UploadDraftStatus } from '../components/upload/useUploadDraft';
import { UniversalContextMenu } from '../components/UniversalContextMenu';
import { Song } from '../types';
import { AddSongToCollectionDialog } from '../components/AddSongToCollectionDialog';
import { SongRowSkeleton } from '../components/Skeletons';
import { useCurrentArtistProfile } from '../hooks/useCurrentArtistProfile';
import { LyricsWorkbenchDialog } from '../components/lyrics';
import { ResilientCoverImage } from '../components/media/ResilientCoverImage';

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
};

export const Upload: React.FC = () => {
  const { songs, playContext, playerState } = useStore();
  const { user } = useAuth();
  const { profile: currentArtistProfile, displayName: currentArtistName } = useCurrentArtistProfile();
  const [contextMenu, setContextMenu] = useState<{ isOpen: boolean; anchor?: { x: number; y: number }; item: Song } | null>(null);
  const [draftStatus, setDraftStatus] = useState<UploadDraftStatus>({ hasDraft: false, label: '暂无草稿' });
  const [collectionTarget, setCollectionTarget] = useState<Song | null>(null);
  const [isUploadSaving, setIsUploadSaving] = useState(false);
  const [isLyricsWorkbenchOpen, setIsLyricsWorkbenchOpen] = useState(false);

  const myUploads = useMemo(
    () => songs.filter((s) => (s.ownerId ? s.ownerId === user?.id : s.uploadedBy === 'Me')),
    [songs, user?.id]
  );
  const totalPlays = myUploads.reduce((sum, song) => sum + (song.playsCount ?? 0), 0);
  const privateCount = myUploads.filter((song) => song.isPublic === false || song.visibility === 'private').length;
  const totalSize = myUploads.reduce((sum, song) => sum + (song.fileSize ?? 0), 0);
  const defaultArtist = currentArtistName;

  const openMenu = (song: Song, anchor: { x: number; y: number }) => {
    setContextMenu({ isOpen: true, anchor, item: song });
  };

  return (
    <div className="pb-32 pt-14 px-6 space-y-10 min-h-screen">
      <header className="space-y-5">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">创作</h1>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white/[0.06] border border-white/5 px-3 py-3">
            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">总播放</div>
            <div className="mt-1 text-lg text-white font-extrabold tabular-nums">{totalPlays.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl bg-white/[0.06] border border-white/5 px-3 py-3">
            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">私有</div>
            <div className="mt-1 text-lg text-white font-extrabold tabular-nums">{privateCount}</div>
          </div>
          <div className="rounded-2xl bg-white/[0.06] border border-white/5 px-3 py-3">
            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">空间</div>
            <div className="mt-1 text-lg text-white font-extrabold tabular-nums">{formatBytes(totalSize)}</div>
          </div>
        </div>
      </header>

      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xl font-bold text-white tracking-tight">上传音乐</h2>
          <span className={`text-[10px] font-bold uppercase tracking-widest truncate max-w-[160px] ${draftStatus.hasDraft ? 'text-red-400' : 'text-zinc-500'}`}>
            {draftStatus.label}
          </span>
        </div>
        <UploadEditor
          variant="page"
          defaultArtist={defaultArtist}
          currentArtistProfile={currentArtistProfile}
          onDraftStatusChange={setDraftStatus}
          onSavingChange={setIsUploadSaving}
        />
      </section>

      <section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <h2 className="text-xl font-bold text-white tracking-tight">我的上传</h2>
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{myUploads.length} 首</span>
            <button
              type="button"
              data-testid="lyrics-workbench-open"
              onClick={() => setIsLyricsWorkbenchOpen(true)}
              disabled={myUploads.length === 0}
              className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/15 px-3 text-xs font-bold text-zinc-300 transition-colors hover:border-white/30 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Icons.Music2 size={14} aria-hidden="true" />
              歌词制作
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {isUploadSaving && (
            <SongRowSkeleton showIndex={false} />
          )}
          {myUploads.length === 0 && !isUploadSaving ? (
            <div className="py-12 text-center bg-zinc-900/20 rounded-[28px] border border-white/5 border-dashed">
              <p className="text-zinc-600 text-sm italic">快去上传你的第一份创作吧</p>
            </div>
          ) : (
            myUploads.map((song) => (
              <div
                key={song.id}
                onClick={() => playContext(myUploads.map((item) => item.id), song.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMenu(song, { x: e.clientX, y: e.clientY });
                }}
                className={`flex items-center p-3 rounded-2xl cursor-pointer transition-all active:scale-[0.98] group ${
                  contextMenu?.item.id === song.id
                    ? 'bg-zinc-800/95 ring-1 ring-white/18 shadow-xl shadow-black/40'
                    : playerState.currentSongId === song.id
                      ? 'bg-zinc-900/80 ring-1 ring-white/5 shadow-xl shadow-black/40'
                      : 'hover:bg-zinc-900'
                }`}
              >
                <div className="relative w-12 h-12 shrink-0 mr-4">
                  <ResilientCoverImage src={song.coverUrl} coverPath={song.coverPath} fallbackSeed={song.id} className="w-full h-full rounded-lg object-cover bg-zinc-800 shadow-md border border-white/5" alt={song.title} />
                  {playerState.currentSongId === song.id && playerState.isPlaying && (
                    <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                      <div className="flex gap-[2.5px] items-end h-3">
                        <div className="w-0.5 bg-red-500 animate-[bounce_1s_infinite] h-full"></div>
                        <div className="w-0.5 bg-red-500 animate-[bounce_1.2s_infinite] h-2/3 shadow-[0_0_4px_rgba(239,68,68,0.5)]"></div>
                        <div className="w-0.5 bg-red-500 animate-[bounce_0.8s_infinite] h-1/2"></div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-1.5">
                    <h4 className={`text-sm font-bold truncate tracking-tight ${playerState.currentSongId === song.id ? 'text-red-500' : 'text-zinc-100'}`}>
                      {song.title}
                    </h4>
                    {(song.isPublic === false || song.visibility === 'private') && <Icons.Lock size={12} className="text-zinc-500 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-zinc-500 truncate font-bold mt-0.5 opacity-80">
                    {song.artist} {song.album ? `· ${song.album}` : ''}
                  </p>
                </div>

                <button
                  type="button"
                  aria-label={`将 ${song.title} 加入专辑或歌单`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCollectionTarget(song);
                  }}
                  className="w-11 h-11 flex items-center justify-center text-zinc-500 hover:text-white active:scale-95 transition"
                >
                  <Icons.PlusCircle size={18} />
                </button>

                <button
                  type="button"
                  aria-label={`打开 ${song.title} 的更多操作`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    openMenu(song, { x: rect.left, y: rect.top });
                  }}
                  className="w-11 h-11 flex items-center justify-center text-zinc-500 hover:text-white active:scale-95 transition"
                >
                  <Icons.MoreHorizontal size={18} />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {contextMenu && (
        <UniversalContextMenu
          isOpen={contextMenu.isOpen}
          onClose={() => setContextMenu(null)}
          anchorPosition={contextMenu.anchor}
          item={contextMenu.item}
          type="song"
        />
      )}

      <AddSongToCollectionDialog
        isOpen={!!collectionTarget}
        song={collectionTarget}
        onClose={() => setCollectionTarget(null)}
      />

      <LyricsWorkbenchDialog
        isOpen={isLyricsWorkbenchOpen}
        songs={myUploads}
        onClose={() => setIsLyricsWorkbenchOpen(false)}
      />
    </div>
  );
};
