create or replace function public.user_can_manage_collection_songs(p_album_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.albums a
    where a.id = p_album_id
      and a.creator_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.album_songs rel
    join public.songs s on s.id = rel.song_id
    where rel.album_id = p_album_id
      and s.owner_id = (select auth.uid())
  );
$$;

revoke execute on function public.user_can_manage_collection_songs(uuid) from public;
revoke execute on function public.user_can_manage_collection_songs(uuid) from anon;
grant execute on function public.user_can_manage_collection_songs(uuid) to authenticated;

drop policy if exists "albums_select_if_public_or_owner" on public.albums;
drop policy if exists "albums_select_public_or_owner" on public.albums;
drop policy if exists "albums_select_if_public_owner_or_collaborator" on public.albums;
create policy "albums_select_if_public_owner_or_collaborator" on public.albums
  for select
  to authenticated
  using (
    visibility = 'public'
    or coalesce(is_public, false) = true
    or creator_id = (select auth.uid())
    or public.user_can_manage_collection_songs(id)
  );

drop policy if exists "album_songs_select_if_collection_visible" on public.album_songs;
drop policy if exists "album_songs_select_if_collection_visible_or_collaborator" on public.album_songs;
create policy "album_songs_select_if_collection_visible_or_collaborator" on public.album_songs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.albums a
      where a.id = album_id
        and (
          a.visibility = 'public'
          or coalesce(a.is_public, false) = true
          or a.creator_id = (select auth.uid())
          or public.user_can_manage_collection_songs(album_id)
        )
    )
  );

drop policy if exists "album_songs_mutate_owner_only" on public.album_songs;
drop policy if exists "album_songs_mutate_creator_or_collaborator" on public.album_songs;
create policy "album_songs_mutate_creator_or_collaborator" on public.album_songs
  for all
  to authenticated
  using (public.user_can_manage_collection_songs(album_id))
  with check (public.user_can_manage_collection_songs(album_id));

drop policy if exists "albums_update_owner_only" on public.albums;
drop policy if exists "albums_update_creator_or_collaborator" on public.albums;
create policy "albums_update_creator_or_collaborator" on public.albums
  for update
  to authenticated
  using (public.user_can_manage_collection_songs(id))
  with check (public.user_can_manage_collection_songs(id));

drop policy if exists "albums_delete_owner_only" on public.albums;
drop policy if exists "albums_delete_creator_or_collaborator" on public.albums;
create policy "albums_delete_creator_or_collaborator" on public.albums
  for delete
  to authenticated
  using (public.user_can_manage_collection_songs(id));

create or replace function public.add_songs_to_collection(
  p_album_id uuid,
  p_song_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_base int;
  v_song_count int;
  v_visible_count int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if coalesce(array_length(p_song_ids, 1), 0) = 0 then
    return;
  end if;

  if not public.user_can_manage_collection_songs(p_album_id) then
    raise exception 'permission denied';
  end if;

  select count(distinct song_id) into v_song_count
  from unnest(p_song_ids) as t(song_id);

  select count(distinct s.id) into v_visible_count
  from public.songs s
  where s.id = any(p_song_ids)
    and (s.visibility = 'public' or s.owner_id = v_uid or coalesce(s.is_public, false) = true);

  if v_visible_count <> v_song_count then
    raise exception 'some songs are not visible';
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_base
  from public.album_songs
  where album_id = p_album_id;

  insert into public.album_songs (album_id, song_id, sort_order)
  select p_album_id, t.song_id, v_base + t.ord - 1
  from unnest(p_song_ids) with ordinality as t(song_id, ord)
  on conflict (album_id, song_id) do nothing;
end;
$$;

create or replace function public.remove_songs_from_collection(
  p_album_id uuid,
  p_song_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if coalesce(array_length(p_song_ids, 1), 0) = 0 then
    return;
  end if;

  if not public.user_can_manage_collection_songs(p_album_id) then
    raise exception 'permission denied';
  end if;

  delete from public.album_songs
  where album_id = p_album_id
    and song_id = any(p_song_ids);
end;
$$;

revoke execute on function public.add_songs_to_collection(uuid, uuid[]) from public;
revoke execute on function public.add_songs_to_collection(uuid, uuid[]) from anon;
grant execute on function public.add_songs_to_collection(uuid, uuid[]) to authenticated;

revoke execute on function public.remove_songs_from_collection(uuid, uuid[]) from public;
revoke execute on function public.remove_songs_from_collection(uuid, uuid[]) from anon;
grant execute on function public.remove_songs_from_collection(uuid, uuid[]) to authenticated;

create or replace function public.set_collection_visibility(
  p_album_id uuid,
  p_visibility text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.user_can_manage_collection_songs(p_album_id) then
    raise exception 'permission denied';
  end if;

  update public.albums
  set visibility = p_visibility::public.collection_visibility
  where id = p_album_id;
end;
$$;

revoke execute on function public.set_collection_visibility(uuid, text) from public;
revoke execute on function public.set_collection_visibility(uuid, text) from anon;
grant execute on function public.set_collection_visibility(uuid, text) to authenticated;

select pg_notify('pgrst', 'reload schema');
