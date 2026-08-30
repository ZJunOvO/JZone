import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icons } from '../Icons';
import type { CollectionRow } from '../../supabaseApi';
import type { Song } from '../../types';
import { sharedElementIds, SHARED_ELEMENT_TRANSITION } from '../motion/sharedElementRegistry';
import { ResilientCoverImage } from '../media/ResilientCoverImage';

type ProfileTab = 'creation' | 'collection';
type ProfileSubTab = 'uploads' | 'albums' | 'playlists' | string;

interface ProfileContentProps {
  activeTab: ProfileTab;
  activeSubTab: ProfileSubTab;
  setActiveSubTab: (tab: ProfileSubTab) => void;
  myUploads: Song[];
  favoriteSongs: Song[];
  myAlbums: CollectionRow[];
  myPlaylists: CollectionRow[];
  collectionsLoading: boolean;
  isCurrentUser: boolean;
  playContext: (songIds: string[], startSongId: string) => void;
  onSongContextMenu: (anchor: { x: number; y: number }, song: Song) => void;
  onCollectionContextMenu: (anchor: { x: number; y: number }, collection: CollectionRow) => void;
  onCreateCollection: (type: 'album' | 'playlist') => void;
  selectedSongId?: string;
  selectedCollectionId?: string;
}

const SongList: React.FC<{
  songs: Song[];
  playContext: (songIds: string[], startSongId: string) => void;
  onSongContextMenu: (anchor: { x: number; y: number }, song: Song) => void;
  selectedSongId?: string;
}> = ({ songs, playContext, onSongContextMenu, selectedSongId }) => (
  <div className="px-6 space-y-2">
    {songs.map((song) => (
      <button
        key={song.id}
        onClick={() => playContext(songs.map((item) => item.id), song.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          onSongContextMenu({ x: e.clientX, y: e.clientY }, song);
        }}
        className={`w-full flex items-center gap-3 p-3 rounded-2xl transition active:scale-[0.98] text-left ${
          selectedSongId === song.id ? 'bg-white/12 ring-1 ring-white/18' : 'bg-white/5 hover:bg-white/10'
        }`}
      >
        <div className="relative">
          <ResilientCoverImage
            src={song.coverUrl}
            coverPath={song.coverPath}
            fallbackSeed={song.id}
            loading="lazy"
            decoding="async"
            className="w-12 h-12 rounded-lg object-cover shadow-lg"
            alt={song.title}
          />
          {song.pinnedAt && (
            <div className="absolute -top-1 -right-1 bg-red-500 rounded-full p-[2px] border border-black">
              <Icons.Pin size={8} className="text-white" fill="currentColor" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-white font-medium truncate">
            {song.title}
            {song.isPublic === false && <Icons.Lock size={12} className="inline ml-1 text-zinc-500" />}
          </h4>
          <p className="text-zinc-400 text-xs truncate">{song.artist}</p>
        </div>
        <div className="text-zinc-500 text-xs font-mono">{song.playsCount || 0} plays</div>
      </button>
    ))}
  </div>
);

const EmptyCollectionState: React.FC<{
  icon: React.ReactNode;
  label: string;
  actionLabel: string;
  isCurrentUser: boolean;
  onCreate: () => void;
}> = ({ icon, label, actionLabel, isCurrentUser, onCreate }) => {
  if (!isCurrentUser) return <div className="py-12 text-center text-zinc-500 text-sm">暂无内容</div>;

  return (
    <div className="py-16 text-center flex flex-col items-center gap-4">
      <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center text-zinc-600">
        {icon}
      </div>
      <p className="text-zinc-500 font-medium">{label}</p>
      <button onClick={onCreate} className="px-6 py-2 bg-white/10 rounded-full text-white text-sm font-bold">
        {actionLabel}
      </button>
    </div>
  );
};

const CollectionList: React.FC<{
  collections: CollectionRow[];
  collectionsLoading: boolean;
  emptyIcon: React.ReactNode;
  emptyLabel: string;
  actionLabel: string;
  createType: 'album' | 'playlist';
  showPlayCount?: boolean;
  isCurrentUser: boolean;
  onCreateCollection: (type: 'album' | 'playlist') => void;
  onCollectionContextMenu: (anchor: { x: number; y: number }, collection: CollectionRow) => void;
  selectedCollectionId?: string;
}> = ({
  collections,
  collectionsLoading,
  emptyIcon,
  emptyLabel,
  actionLabel,
  createType,
  showPlayCount,
  isCurrentUser,
  onCreateCollection,
  onCollectionContextMenu,
  selectedCollectionId,
}) => (
  <div className="px-6 space-y-2">
    {collectionsLoading ? (
      <div className="py-12 text-center text-zinc-500 text-sm">加载中…</div>
    ) : collections.length ? (
      collections.map((collection) => (
        <button
          key={collection.id}
          data-testid={`profile-collection-card-${collection.id}`}
          data-collection-card="true"
          onClick={() => window.dispatchEvent(new CustomEvent('jzone:navigate-collection', { detail: { id: collection.id } }))}
          onContextMenu={(e) => {
            e.preventDefault();
            if (!isCurrentUser) return;
            onCollectionContextMenu({ x: e.clientX, y: e.clientY }, collection);
          }}
          className={`w-full flex items-center gap-3 p-3 rounded-2xl transition active:scale-[0.98] text-left relative ${
            selectedCollectionId === collection.id ? 'bg-white/12 ring-1 ring-white/18' : 'bg-white/5 hover:bg-white/10'
          }`}
        >
          <motion.div
            className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-800 shrink-0 relative"
            layoutId={sharedElementIds.collectionCover(collection.id)}
            transition={{ layout: SHARED_ELEMENT_TRANSITION }}
            data-shared-element="collection-cover"
          >
            {collection.cover_url ? (
              <ResilientCoverImage src={collection.cover_url} coverPath={collection.cover_url} fallbackSeed={collection.id} className="w-full h-full object-cover" alt="" loading="lazy" decoding="async" />
            ) : null}
          </motion.div>
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold truncate flex items-center gap-2">
              {collection.title}
              {collection.pinned_at && <Icons.Pin size={12} className="text-red-500 fill-red-500" />}
            </div>
            <div className="text-zinc-500 text-xs font-medium truncate">
              {collection.visibility === 'public' ? '公开' : '私有'}
              {showPlayCount ? ` · ${(collection.play_count ?? 0).toLocaleString()}次播放` : ''}
            </div>
          </div>
          <Icons.ChevronRight size={16} className="text-white/20" />
        </button>
      ))
    ) : (
      <EmptyCollectionState
        icon={emptyIcon}
        label={emptyLabel}
        actionLabel={actionLabel}
        isCurrentUser={isCurrentUser}
        onCreate={() => onCreateCollection(createType)}
      />
    )}
  </div>
);

export const ProfileContent: React.FC<ProfileContentProps> = ({
  activeTab,
  activeSubTab,
  setActiveSubTab,
  myUploads,
  favoriteSongs,
  myAlbums,
  myPlaylists,
  collectionsLoading,
  isCurrentUser,
  playContext,
  onSongContextMenu,
  onCollectionContextMenu,
  onCreateCollection,
  selectedSongId,
  selectedCollectionId,
}) => (
  <AnimatePresence mode="wait">
    <motion.div
      key={activeTab}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="min-h-[400px]"
    >
      {activeTab === 'creation' && (
        <div className="grid grid-cols-1 gap-4 pb-32">
          <div className="flex gap-4 px-6 overflow-x-auto no-scrollbar justify-center">
            {[
              { id: 'uploads', label: '收录', count: myUploads.length },
              { id: 'albums', label: '专辑', count: myAlbums.length },
              { id: 'playlists', label: '歌单', count: myPlaylists.length },
            ].map((sub) => (
              <button
                key={sub.id}
                data-testid={`profile-subtab-${sub.id}`}
                onClick={() => setActiveSubTab(sub.id)}
                className={`px-3 py-1 text-sm font-bold transition-colors relative group ${
                  activeSubTab === sub.id ? 'text-white' : 'text-white/40 hover:text-white/60'
                }`}
              >
                <span className="relative inline-block pr-3">
                  {sub.label}
                  <sup className="absolute top-[2px] right-0 text-[10px] leading-none opacity-80">{sub.count}</sup>
                </span>
              </button>
            ))}
          </div>

          {activeSubTab === 'uploads' && (
            <>
              {myUploads.length ? (
                <SongList songs={myUploads} playContext={playContext} onSongContextMenu={onSongContextMenu} selectedSongId={selectedSongId} />
              ) : (
                <div className="py-12 text-center text-zinc-500 text-sm">还没有上传过音乐</div>
              )}
            </>
          )}

          {activeSubTab === 'albums' && (
            <CollectionList
              collections={myAlbums}
              collectionsLoading={collectionsLoading}
              emptyIcon={<Icons.Disc size={28} />}
              emptyLabel="还没有创建专辑"
              actionLabel="新建专辑"
              createType="album"
              isCurrentUser={isCurrentUser}
              onCreateCollection={onCreateCollection}
              onCollectionContextMenu={onCollectionContextMenu}
              selectedCollectionId={selectedCollectionId}
            />
          )}

          {activeSubTab === 'playlists' && (
            <CollectionList
              collections={myPlaylists}
              collectionsLoading={collectionsLoading}
              emptyIcon={<Icons.ListMusic size={28} />}
              emptyLabel="还没有创建歌单"
              actionLabel="新建歌单"
              createType="playlist"
              showPlayCount
              isCurrentUser={isCurrentUser}
              onCreateCollection={onCreateCollection}
              onCollectionContextMenu={onCollectionContextMenu}
              selectedCollectionId={selectedCollectionId}
            />
          )}
        </div>
      )}

      {activeTab === 'collection' && (
        <div className="grid grid-cols-1 gap-4 pb-32">
          {favoriteSongs.length > 0 ? (
            <SongList songs={favoriteSongs} playContext={playContext} onSongContextMenu={onSongContextMenu} selectedSongId={selectedSongId} />
          ) : (
            <div className="px-6 py-20 text-center flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center text-zinc-600">
                <Icons.Heart size={32} />
              </div>
              <p className="text-zinc-500 font-medium">还没有收藏任何内容</p>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('jzone:navigate-home'))}
                className="px-6 py-2 bg-white/10 rounded-full text-white text-sm font-bold"
              >
                去发现
              </button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  </AnimatePresence>
);
