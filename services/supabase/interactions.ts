import { ensureSupabase } from './client';
import { createSignedAvatarUrl } from './storageApi';
import type { CommentRow, FavoriteRow, ProfileRow } from './types';

export const createInteractionsApi = () => ({
  async fetchMySongPlayStats(userId: string): Promise<Array<{ song_id: string; plays_count: number; updated_at: string }>> {
    const client = ensureSupabase();
    const { data, error } = await client
      .from('user_song_plays')
      .select('song_id, plays_count, updated_at')
      .eq('user_id', userId)
      .order('plays_count', { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      song_id: row.song_id,
      plays_count: Number(row.plays_count) || 0,
      updated_at: row.updated_at,
    }));
  },

  async fetchComments(songId: string, currentUserId?: string): Promise<CommentRow[]> {
    const client = ensureSupabase();
    const { data, error } = await client
      .from('comments')
      .select('*')
      .eq('song_id', songId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as CommentRow[];
    if (!rows.length) return rows;

    const commentIds = rows.map((row) => row.id);
    const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
    const [{ data: likeRows, error: likeError }, { data: profiles, error: profileError }] = await Promise.all([
      client.from('comment_likes').select('comment_id, user_id').in('comment_id', commentIds),
      client.from('profiles').select('id, nickname, avatar_url').in('id', userIds),
    ]);
    if (likeError) throw likeError;
    if (profileError) throw profileError;

    const likesByComment = new Map<string, number>();
    const likedByCurrentUser = new Set<string>();
    for (const like of likeRows ?? []) {
      const commentId = (like as any).comment_id as string;
      likesByComment.set(commentId, (likesByComment.get(commentId) ?? 0) + 1);
      if (currentUserId && (like as any).user_id === currentUserId) likedByCurrentUser.add(commentId);
    }

    const profilesById = new Map<string, Pick<ProfileRow, 'id' | 'nickname' | 'avatar_url'>>();
    for (const profile of profiles ?? []) {
      profilesById.set((profile as any).id, profile as Pick<ProfileRow, 'id' | 'nickname' | 'avatar_url'>);
    }

    return Promise.all(
      rows.map(async (row) => {
        const profile = profilesById.get(row.user_id);
        let avatarUrl = row.avatar_url;
        if (profile?.avatar_url) {
          try {
            avatarUrl = await createSignedAvatarUrl(profile.avatar_url, 3600);
          } catch {
            avatarUrl = profile.avatar_url;
          }
        }
        return {
          ...row,
          username: profile?.nickname?.trim() || row.username,
          avatar_url: avatarUrl,
          likes_count: likesByComment.get(row.id) ?? 0,
          user_liked: likedByCurrentUser.has(row.id),
        };
      })
    );
  },

  async addCommentLike(commentId: string, userId: string) {
    const client = ensureSupabase();
    const { error } = await client.from('comment_likes').insert({ comment_id: commentId, user_id: userId });
    if (error && error.code !== '23505') throw error;
  },

  async removeCommentLike(commentId: string, userId: string) {
    const client = ensureSupabase();
    const { error } = await client
      .from('comment_likes')
      .delete()
      .eq('comment_id', commentId)
      .eq('user_id', userId);
    if (error) throw error;
  },

  async fetchFavorites(userId: string): Promise<FavoriteRow[]> {
    const client = ensureSupabase();
    const { data, error } = await client
      .from('favorites')
      .select('user_id, song_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as FavoriteRow[];
  },

  async addFavorite(userId: string, songId: string): Promise<FavoriteRow> {
    const client = ensureSupabase();
    const { data, error } = await client
      .from('favorites')
      .insert({ user_id: userId, song_id: songId })
      .select('user_id, song_id, created_at')
      .single();
    if (error) throw error;
    return data as FavoriteRow;
  },

  async removeFavorite(userId: string, songId: string) {
    const client = ensureSupabase();
    const { error } = await client
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('song_id', songId);
    if (error) throw error;
  },

  async insertComment(input: {
    songId: string;
    userId: string;
    username: string;
    avatarUrl: string;
    text: string;
    playbackTime: number;
  }): Promise<CommentRow> {
    const client = ensureSupabase();
    const { data, error } = await client
      .from('comments')
      .insert({
        song_id: input.songId,
        user_id: input.userId,
        username: input.username,
        avatar_url: input.avatarUrl,
        text: input.text,
        playback_time: input.playbackTime,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as CommentRow;
  },
});
