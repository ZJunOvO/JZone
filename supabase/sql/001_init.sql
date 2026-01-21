create extension if not exists pgcrypto;

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  title text not null,
  artist text not null,
  album text,
  duration double precision not null,
  trim_start double precision not null default 0,
  trim_end double precision not null,
  audio_path text not null,
  cover_path text,
  created_at timestamptz not null default now()
);

create index if not exists songs_owner_id_idx on public.songs(owner_id);
create index if not exists songs_visibility_idx on public.songs(visibility);
create index if not exists songs_created_at_idx on public.songs(created_at desc);

alter table public.songs enable row level security;

create policy "songs_select_authed_public_or_owner"
on public.songs
for select
to authenticated
using (visibility = 'public' or owner_id = auth.uid());

create policy "songs_insert_owner_only"
on public.songs
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "songs_update_owner_only"
on public.songs
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "songs_delete_owner_only"
on public.songs
for delete
to authenticated
using (owner_id = auth.uid());

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  avatar_url text not null,
  text text not null,
  playback_time double precision not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists comments_song_id_idx on public.comments(song_id);
create index if not exists comments_created_at_idx on public.comments(created_at desc);

alter table public.comments enable row level security;

create policy "comments_select_if_song_visible"
on public.comments
for select
to authenticated
using (
  exists (
    select 1
    from public.songs s
    where s.id = song_id
      and (s.visibility = 'public' or s.owner_id = auth.uid())
  )
);

create policy "comments_insert_if_song_visible"
on public.comments
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.songs s
    where s.id = song_id
      and (s.visibility = 'public' or s.owner_id = auth.uid())
  )
);

create policy "comments_update_owner_only"
on public.comments
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "comments_delete_owner_only"
on public.comments
for delete
to authenticated
using (user_id = auth.uid());

