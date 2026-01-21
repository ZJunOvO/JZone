alter table public.songs add column if not exists genre text;
alter table public.songs add column if not exists story text;
alter table public.songs add column if not exists file_size bigint;
create index if not exists songs_genre_idx on public.songs(genre);
