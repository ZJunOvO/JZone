create table if not exists public.song_artists (
  song_id uuid not null references public.songs(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  display_name text not null check (btrim(display_name) <> ''),
  role text not null default 'primary' check (role in ('primary', 'featured', 'producer', 'other')),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (song_id, sort_order)
);

create index if not exists song_artists_profile_id_idx
  on public.song_artists(profile_id)
  where profile_id is not null;

alter table public.song_artists enable row level security;

grant select, insert, update, delete on public.song_artists to authenticated;
revoke all on public.song_artists from anon;

drop policy if exists "song_artists_select_if_song_visible" on public.song_artists;
create policy "song_artists_select_if_song_visible"
on public.song_artists
for select
to authenticated
using (
  exists (
    select 1
    from public.songs s
    where s.id = song_id
      and (
        s.visibility = 'public'
        or coalesce(s.is_public, false) = true
        or s.owner_id = (select auth.uid())
      )
  )
);

drop policy if exists "song_artists_insert_owner_only" on public.song_artists;
create policy "song_artists_insert_owner_only"
on public.song_artists
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

drop policy if exists "song_artists_update_owner_only" on public.song_artists;
create policy "song_artists_update_owner_only"
on public.song_artists
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

drop policy if exists "song_artists_delete_owner_only" on public.song_artists;
create policy "song_artists_delete_owner_only"
on public.song_artists
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

create or replace function public.upsert_song_artists(
  p_song_id uuid,
  p_artists jsonb,
  p_legacy_artist text default null
)
returns setof public.song_artists
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artists jsonb := coalesce(p_artists, '[]'::jsonb);
  v_legacy_artist text := nullif(btrim(p_legacy_artist), '');
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1
    from public.songs s
    where s.id = p_song_id
      and s.owner_id = auth.uid()
  ) then
    raise exception 'permission denied';
  end if;

  if jsonb_typeof(v_artists) <> 'array' then
    raise exception 'artists must be a JSON array';
  end if;

  delete from public.song_artists
  where song_id = p_song_id;

  insert into public.song_artists (
    song_id,
    profile_id,
    display_name,
    role,
    sort_order
  )
  select
    p_song_id,
    nullif(btrim(artist.value->>'profile_id'), '')::uuid,
    btrim(artist.value->>'display_name'),
    coalesce(
      nullif(artist.value->>'role', ''),
      case when artist.ordinality = 1 then 'primary' else 'featured' end
    ),
    (artist.ordinality - 1)::integer
  from jsonb_array_elements(v_artists) with ordinality as artist(value, ordinality);

  if v_legacy_artist is null then
    select string_agg(sa.display_name, ' / ' order by sa.sort_order)
    into v_legacy_artist
    from public.song_artists sa
    where sa.song_id = p_song_id;
  end if;

  if v_legacy_artist is not null then
    update public.songs
    set artist = v_legacy_artist
    where id = p_song_id;
  end if;

  return query
  select sa.*
  from public.song_artists sa
  where sa.song_id = p_song_id
  order by sa.sort_order;
end;
$$;

revoke execute on function public.upsert_song_artists(uuid, jsonb, text) from public;
revoke execute on function public.upsert_song_artists(uuid, jsonb, text) from anon;
grant execute on function public.upsert_song_artists(uuid, jsonb, text) to authenticated;

select pg_notify('pgrst', 'reload schema');
