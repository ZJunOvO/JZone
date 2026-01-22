create table if not exists public.user_song_plays (
  user_id uuid not null references auth.users(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  plays_count bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, song_id)
);

create index if not exists user_song_plays_user_id_idx on public.user_song_plays(user_id);
create index if not exists user_song_plays_song_id_idx on public.user_song_plays(song_id);

alter table public.user_song_plays enable row level security;

drop policy if exists "user_song_plays_select_owner" on public.user_song_plays;
drop policy if exists "user_song_plays_insert_owner" on public.user_song_plays;
drop policy if exists "user_song_plays_update_owner" on public.user_song_plays;

create policy "user_song_plays_select_owner"
on public.user_song_plays
for select
to authenticated
using (user_id = auth.uid());

create policy "user_song_plays_insert_owner"
on public.user_song_plays
for insert
to authenticated
with check (user_id = auth.uid());

create policy "user_song_plays_update_owner"
on public.user_song_plays
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.increment_user_song_play(p_song_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare next_count bigint;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.user_song_plays (user_id, song_id, plays_count, updated_at)
  values (auth.uid(), p_song_id, 1, now())
  on conflict (user_id, song_id)
  do update set plays_count = public.user_song_plays.plays_count + 1, updated_at = now()
  returning plays_count into next_count;

  return next_count;
end;
$$;

grant execute on function public.increment_user_song_play(uuid) to authenticated;

