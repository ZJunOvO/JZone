import { ensureSupabase } from './client';
import { createSignedAvatarUrl } from './storageApi';
import type { CommentRow, FavoriteRow, ProfileRow } from './types';
import type { CommentSort } from '../../types';

export interface CommentPage {
  rows: CommentRow[];
  hasMore: boolean;
  nextOffset: number;
  schemaVersion: 'legacy' | 'threaded';
}

let commentSchemaVersion: 'legacy' | 'threaded' | null = null;

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

  async fetchCommentsPage(input: {
    songId: string;
    currentUserId?: string;
    offset: number;
    limit: number;
    sort: CommentSort;
  }): Promise<CommentPage> {
    const client = ensureSupabase();
    let upgradedSchema = commentSchemaVersion === 'threaded';
    let data: any[] | null = null;
    let error: any = null;

    if (!upgradedSchema) {
      const compatibleResult = await client
        .from('comments')
        .select('*')
        .eq('song_id', input.songId)
        .order('created_at', { ascending: false })
        .range(input.offset, input.offset + input.limit);
      data = compatibleResult.data;
      error = compatibleResult.error;
      const sample = compatibleResult.data?.[0] as Record<string, unknown> | undefined;
      if (sample && 'parent_comment_id' in sample && 'likes_count' in sample) {
        commentSchemaVersion = 'threaded';
        upgradedSchema = true;
      } else if (sample) {
        commentSchemaVersion = 'legacy';
      }
    }

    if (upgradedSchema) {
      let query = client
        .from('comments')
        .select('*')
        .eq('song_id', input.songId)
        .is('parent_comment_id', null);
      query = input.sort === 'popular'
        ? query.order('likes_count', { ascending: false }).order('created_at', { ascending: false })
        : query.order('created_at', { ascending: false });
      const threadedResult = await query.range(input.offset, input.offset + input.limit);
      data = threadedResult.data;
      error = threadedResult.error;
    }
    if (error) throw error;
    const fetchedRoots = (data ?? []) as CommentRow[];
    const hasMore = fetchedRoots.length > input.limit;
    const roots = fetchedRoots.slice(0, input.limit);
    if (!roots.length) return {
      rows: [],
      hasMore: false,
      nextOffset: input.offset,
      schemaVersion: upgradedSchema ? 'threaded' : 'legacy',
    };

    const rootIds = roots.map((row) => row.id);
    let replies: CommentRow[] = [];
    if (upgradedSchema) {
      const { data: replyData, error: replyError } = await client
        .from('comments')
        .select('*')
        .in('parent_comment_id', rootIds)
        .order('created_at', { ascending: true });
      if (replyError) throw replyError;
      replies = (replyData ?? []) as CommentRow[];
    }
    const rows = [...roots, ...replies];

    const commentIds = rows.map((row) => row.id);
    const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
    const { data: profiles, error: profileError } = await client
      .from('profiles')
      .select('id, nickname, avatar_url, avatar_frame_id')
      .in('id', userIds);
    if (profileError) throw profileError;

    let likedByCurrentUser = new Set<string>();
    const legacyLikesByComment = new Map<string, number>();
    if (!upgradedSchema) {
      const { data: likeRows, error: likeError } = await client
        .from('comment_likes')
        .select('comment_id, user_id')
        .in('comment_id', commentIds);
      if (likeError) throw likeError;
      for (const like of likeRows ?? []) {
        const commentId = (like as any).comment_id as string;
        legacyLikesByComment.set(commentId, (legacyLikesByComment.get(commentId) ?? 0) + 1);
        if (input.currentUserId && (like as any).user_id === input.currentUserId) likedByCurrentUser.add(commentId);
      }
    } else if (input.currentUserId) {
      const { data: likeRows, error: likeError } = await client
        .from('comment_likes')
        .select('comment_id')
        .eq('user_id', input.currentUserId)
        .in('comment_id', commentIds);
      if (likeError) throw likeError;
      likedByCurrentUser = new Set((likeRows ?? []).map((like: any) => like.comment_id as string));
    }

    const profilesById = new Map<string, Pick<ProfileRow, 'id' | 'nickname' | 'avatar_url' | 'avatar_frame_id'>>();
    for (const profile of profiles ?? []) {
      profilesById.set(
        (profile as any).id,
        profile as Pick<ProfileRow, 'id' | 'nickname' | 'avatar_url' | 'avatar_frame_id'>,
      );
    }

    const enrichedRows = await Promise.all(
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
          avatar_frame_id: profile?.avatar_frame_id ?? null,
          likes_count: upgradedSchema ? Number(row.likes_count) || 0 : legacyLikesByComment.get(row.id) ?? 0,
          user_liked: likedByCurrentUser.has(row.id),
        };
      })
    );

    return {
      rows: enrichedRows,
      hasMore,
      nextOffset: input.offset + roots.length,
      schemaVersion: upgradedSchema ? 'threaded' : 'legacy',
    };
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
    quotedLyric?: string | null;
    parentCommentId?: string | null;
  }): Promise<CommentRow> {
    const client = ensureSupabase();
    const payload: Record<string, unknown> = {
      song_id: input.songId,
      user_id: input.userId,
      username: input.username,
      avatar_url: input.avatarUrl,
      text: input.text,
      playback_time: input.playbackTime,
    };
    if (input.quotedLyric) payload.quoted_lyric = input.quotedLyric;
    if (input.parentCommentId) payload.parent_comment_id = input.parentCommentId;
    let { data, error } = await client
      .from('comments')
      .insert(payload)
      .select('*')
      .single();
    if (error?.code === 'PGRST204' && input.quotedLyric) {
      delete payload.quoted_lyric;
      const legacyResult = await client
        .from('comments')
        .insert(payload)
        .select('*')
        .single();
      data = legacyResult.data;
      error = legacyResult.error;
    }
    if (error) throw error;
    return data as CommentRow;
  },

  async deleteComment(commentId: string): Promise<'deleted' | 'soft_deleted' | 'missing'> {
    const client = ensureSupabase();
    const { data, error } = await client.rpc('delete_comment', { p_comment_id: commentId });
    if (error) throw error;
    return (data ?? 'missing') as 'deleted' | 'soft_deleted' | 'missing';
  },
});
