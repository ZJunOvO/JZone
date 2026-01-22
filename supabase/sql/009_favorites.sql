create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, song_id)
);

create index if not exists favorites_user_id_idx on public.favorites(user_id);
create index if not exists favorites_song_id_idx on public.favorites(song_id);

alter table public.favorites enable row level security;

create policy "favorites_select_owner"
on public.favorites
for select
to authenticated
using (user_id = auth.uid());

create policy "favorites_insert_owner"
on public.favorites
for insert
to authenticated
with check (user_id = auth.uid());

create policy "favorites_delete_owner"
on public.favorites
for delete
to authenticated
using (user_id = auth.uid());
