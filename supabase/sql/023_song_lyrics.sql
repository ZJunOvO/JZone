-- 歌词一期：每首歌曲一份歌词，内容只存 Supabase，不进入 COS。

create table if not exists public.song_lyrics (
  song_id uuid primary key references public.songs(id) on delete cascade,
  format text not null default 'plain',
  source text not null default 'editor',
  raw_content text not null,
  normalized_content jsonb,
  offset_ms integer not null default 0,
  checksum text not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint song_lyrics_format_check
    check (format in ('plain', 'lrc', 'ttml')),
  constraint song_lyrics_source_check
    check (source in ('upload', 'embedded', 'editor')),
  constraint song_lyrics_version_check
    check (version > 0)
);

-- 对已存在的同名表只补缺失字段，重复执行不会覆盖既有歌词内容。
alter table public.song_lyrics
  add column if not exists format text not null default 'plain',
  add column if not exists source text not null default 'editor',
  add column if not exists raw_content text not null default '',
  add column if not exists normalized_content jsonb,
  add column if not exists offset_ms integer not null default 0,
  add column if not exists checksum text not null default '',
  add column if not exists version integer not null default 1,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- song_id 主键已经保证一首歌最多一条；唯一索引兼容历史上已存在但尚未建主键的表。
create unique index if not exists song_lyrics_song_id_uidx
  on public.song_lyrics(song_id);
create index if not exists song_lyrics_updated_at_idx
  on public.song_lyrics(updated_at desc);

create or replace function public.set_song_lyrics_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists song_lyrics_set_updated_at on public.song_lyrics;
create trigger song_lyrics_set_updated_at
before update on public.song_lyrics
for each row
execute function public.set_song_lyrics_updated_at();

alter table public.song_lyrics enable row level security;

drop policy if exists "song_lyrics_select_song_visible" on public.song_lyrics;
create policy "song_lyrics_select_song_visible"
on public.song_lyrics
for select
to authenticated
using (
  exists (
    select 1
    from public.songs s
    where s.id = song_id
      and (
        s.owner_id = (select auth.uid())
        or coalesce(s.is_public, s.visibility = 'public')
      )
  )
);

drop policy if exists "song_lyrics_insert_song_owner" on public.song_lyrics;
create policy "song_lyrics_insert_song_owner"
on public.song_lyrics
for insert
to authenticated
with check (
  exists (
    select 1
    from public.songs s
    where s.id = song_id
      and s.owner_id = (select auth.uid())
  )
);

drop policy if exists "song_lyrics_update_song_owner" on public.song_lyrics;
create policy "song_lyrics_update_song_owner"
on public.song_lyrics
for update
to authenticated
using (
  exists (
    select 1
    from public.songs s
    where s.id = song_id
      and s.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.songs s
    where s.id = song_id
      and s.owner_id = (select auth.uid())
  )
);

drop policy if exists "song_lyrics_delete_song_owner" on public.song_lyrics;
create policy "song_lyrics_delete_song_owner"
on public.song_lyrics
for delete
to authenticated
using (
  exists (
    select 1
    from public.songs s
    where s.id = song_id
      and s.owner_id = (select auth.uid())
  )
);

-- 仅允许已认证用户通过 RLS 读写，匿名用户不能探测私有歌曲是否有歌词。
revoke all on table public.song_lyrics from public;
revoke all on table public.song_lyrics from anon;
grant select, insert, update, delete on table public.song_lyrics to authenticated;
