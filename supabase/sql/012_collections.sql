do $$
begin
  if not exists (select 1 from pg_type where typname = 'collection_type') then
    create type public.collection_type as enum ('album', 'playlist');
  end if;
  if not exists (select 1 from pg_type where typname = 'collection_visibility') then
    create type public.collection_visibility as enum ('private', 'public');
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'albums'
      and column_name = 'artist_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'albums'
      and column_name = 'creator_id'
  ) then
    alter table public.albums rename column artist_id to creator_id;
  end if;
end
$$;

alter table public.albums
  add column if not exists type public.collection_type not null default 'album',
  add column if not exists visibility public.collection_visibility not null default 'public',
  add column if not exists description text,
  add column if not exists play_count bigint not null default 0;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'albums'
      and column_name = 'cover_url'
      and is_nullable = 'NO'
  ) then
    alter table public.albums alter column cover_url drop not null;
  end if;
end
$$;

create index if not exists albums_creator_id_idx on public.albums(creator_id);
create index if not exists albums_type_idx on public.albums(type);
create index if not exists albums_visibility_idx on public.albums(visibility);

create table if not exists public.album_songs (
  album_id uuid not null references public.albums(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  added_at timestamptz not null default now(),
  sort_order int not null default 0,
  primary key (album_id, song_id)
);

create index if not exists album_songs_album_id_sort_order_idx on public.album_songs(album_id, sort_order);
create index if not exists album_songs_song_id_idx on public.album_songs(song_id);

alter table public.album_songs enable row level security;

drop policy if exists "album_songs_select_if_collection_visible" on public.album_songs;
create policy "album_songs_select_if_collection_visible" on public.album_songs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.albums a
      where a.id = album_id
        and (a.visibility = 'public' or a.creator_id = auth.uid())
    )
  );

drop policy if exists "album_songs_mutate_owner_only" on public.album_songs;
create policy "album_songs_mutate_owner_only" on public.album_songs
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.albums a
      where a.id = album_id
        and a.creator_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.albums a
      where a.id = album_id
        and a.creator_id = auth.uid()
    )
  );

drop policy if exists "albums_select_if_public_or_owner" on public.albums;
create policy "albums_select_if_public_or_owner" on public.albums
  for select
  to authenticated
  using (visibility = 'public' or creator_id = auth.uid());

drop policy if exists "albums_insert_owner_only" on public.albums;
create policy "albums_insert_owner_only" on public.albums
  for insert
  to authenticated
  with check (creator_id = auth.uid());

drop policy if exists "albums_update_owner_only" on public.albums;
create policy "albums_update_owner_only" on public.albums
  for update
  to authenticated
  using (creator_id = auth.uid())
  with check (creator_id = auth.uid());

drop policy if exists "albums_delete_owner_only" on public.albums;
create policy "albums_delete_owner_only" on public.albums
  for delete
  to authenticated
  using (creator_id = auth.uid());

drop function if exists public.create_collection(public.collection_type, text, text, text, int, text, public.collection_visibility);
create or replace function public.create_collection(
  p_type text,
  p_title text,
  p_cover_url text default null,
  p_description text default null,
  p_release_year int default null,
  p_genre text default null,
  p_visibility text default 'public'
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.albums (type, title, cover_url, description, release_year, genre, visibility, creator_id)
  values (
    p_type::public.collection_type,
    p_title,
    p_cover_url,
    p_description,
    p_release_year,
    p_genre,
    p_visibility::public.collection_visibility,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.add_songs_to_collection(
  p_album_id uuid,
  p_song_ids uuid[]
)
returns void
language plpgsql
as $$
declare
  v_base int;
begin
  select coalesce(max(sort_order), -1) + 1 into v_base
  from public.album_songs
  where album_id = p_album_id;

  insert into public.album_songs (album_id, song_id, sort_order)
  select p_album_id, t.song_id, v_base + t.ord - 1
  from unnest(p_song_ids) with ordinality as t(song_id, ord)
  on conflict (album_id, song_id) do nothing;
end;
$$;

drop function if exists public.set_collection_visibility(uuid, public.collection_visibility);
create or replace function public.set_collection_visibility(
  p_album_id uuid,
  p_visibility text
)
returns void
language plpgsql
as $$
begin
  update public.albums
  set visibility = p_visibility::public.collection_visibility
  where id = p_album_id
    and creator_id = auth.uid();
end;
$$;

create or replace function public.increment_collection_play_count(
  p_album_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.albums
  set play_count = play_count + 1
  where id = p_album_id
    and type = 'playlist'
    and (visibility = 'public' or creator_id = auth.uid());
end;
$$;

grant execute on function public.create_collection(text, text, text, text, int, text, text) to authenticated;
grant execute on function public.add_songs_to_collection(uuid, uuid[]) to authenticated;
grant execute on function public.set_collection_visibility(uuid, text) to authenticated;
grant execute on function public.increment_collection_play_count(uuid) to authenticated;

select pg_notify('pgrst', 'reload schema');
