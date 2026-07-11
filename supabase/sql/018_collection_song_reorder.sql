create or replace function public.reorder_collection_songs(
  p_album_id uuid,
  p_song_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected_count integer;
  v_received_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.user_can_manage_collection_songs(p_album_id) then
    raise exception 'permission denied';
  end if;

  select count(*) into v_expected_count
  from public.album_songs
  where album_id = p_album_id;

  select count(distinct song_id) into v_received_count
  from unnest(coalesce(p_song_ids, array[]::uuid[])) as t(song_id);

  if v_received_count <> v_expected_count then
    raise exception 'song order must include every collection song exactly once';
  end if;

  if exists (
    select 1
    from unnest(p_song_ids) as t(song_id)
    where not exists (
      select 1
      from public.album_songs rel
      where rel.album_id = p_album_id
        and rel.song_id = t.song_id
    )
  ) then
    raise exception 'song order contains an unrelated song';
  end if;

  update public.album_songs rel
  set sort_order = ordered.position - 1
  from unnest(p_song_ids) with ordinality as ordered(song_id, position)
  where rel.album_id = p_album_id
    and rel.song_id = ordered.song_id;
end;
$$;

revoke execute on function public.reorder_collection_songs(uuid, uuid[]) from public;
revoke execute on function public.reorder_collection_songs(uuid, uuid[]) from anon;
grant execute on function public.reorder_collection_songs(uuid, uuid[]) to authenticated;

select pg_notify('pgrst', 'reload schema');
