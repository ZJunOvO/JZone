-- 歌曲影像一期：COS 保存视频与海报，Supabase 只保存关系和播放参数。
create table if not exists public.song_videos (
  id uuid primary key,
  song_id uuid not null references public.songs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  video_path text not null,
  poster_path text,
  file_name text not null default '',
  file_size bigint not null default 0,
  duration_ms integer not null,
  video_start_ms integer not null default 0,
  video_end_ms integer,
  song_start_ms integer,
  song_end_ms integer,
  audio_mix numeric(5,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint song_videos_kind_check check (kind in ('full', 'memory')),
  constraint song_videos_duration_check check (duration_ms > 0),
  constraint song_videos_video_range_check check (
    video_start_ms >= 0 and (video_end_ms is null or video_end_ms > video_start_ms)
  ),
  constraint song_videos_song_range_check check (
    (kind = 'full' and song_start_ms is null and song_end_ms is null)
    or
    (kind = 'memory' and song_start_ms is not null and song_end_ms is not null and song_start_ms >= 0 and song_end_ms > song_start_ms)
  ),
  constraint song_videos_audio_mix_check check (audio_mix >= 0 and audio_mix <= 1)
);

create index if not exists song_videos_song_created_idx
  on public.song_videos(song_id, created_at desc);

create unique index if not exists song_videos_one_full_per_song_idx
  on public.song_videos(song_id) where kind = 'full';

create unique index if not exists song_videos_one_memory_per_song_idx
  on public.song_videos(song_id) where kind = 'memory';

create or replace function public.set_song_videos_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists song_videos_set_updated_at on public.song_videos;
create trigger song_videos_set_updated_at
before update on public.song_videos
for each row execute function public.set_song_videos_updated_at();

alter table public.song_videos enable row level security;

drop policy if exists "song_videos_select_song_visible" on public.song_videos;
create policy "song_videos_select_song_visible"
on public.song_videos for select to authenticated
using (
  exists (
    select 1 from public.songs s
    where s.id = song_id
      and (s.owner_id = (select auth.uid()) or coalesce(s.is_public, s.visibility = 'public'))
  )
);

drop policy if exists "song_videos_insert_song_owner" on public.song_videos;
create policy "song_videos_insert_song_owner"
on public.song_videos for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (select 1 from public.songs s where s.id = song_id and s.owner_id = (select auth.uid()))
);

drop policy if exists "song_videos_update_song_owner" on public.song_videos;
create policy "song_videos_update_song_owner"
on public.song_videos for update to authenticated
using (owner_id = (select auth.uid()))
with check (
  owner_id = (select auth.uid())
  and exists (select 1 from public.songs s where s.id = song_id and s.owner_id = (select auth.uid()))
);

drop policy if exists "song_videos_delete_song_owner" on public.song_videos;
create policy "song_videos_delete_song_owner"
on public.song_videos for delete to authenticated
using (owner_id = (select auth.uid()));
revoke all on table public.song_videos from public;
revoke all on table public.song_videos from anon;
grant select, insert, update, delete on table public.song_videos to authenticated;
