alter table public.songs
add column if not exists plays_count bigint not null default 0;

create or replace function public.increment_song_play(p_song_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.songs
  set plays_count = plays_count + 1
  where id = p_song_id
    and (visibility = 'public' or owner_id = auth.uid());
end;
$$;

grant execute on function public.increment_song_play(uuid) to authenticated;

