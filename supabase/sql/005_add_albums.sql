-- Create albums table
create table if not exists public.albums (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  cover_url text not null,
  artist_id uuid references auth.users(id) on delete cascade not null,
  release_year int,
  genre text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add album_id to songs table
alter table public.songs add column if not exists album_id uuid references public.albums(id) on delete set null;

-- Add index for performance
create index if not exists albums_artist_id_idx on public.albums(artist_id);
create index if not exists songs_album_id_idx on public.songs(album_id);

-- Enable RLS for albums
alter table public.albums enable row level security;

-- Policies for albums (similar to songs)
create policy "Albums are viewable by everyone" on public.albums
  for select using (true);

create policy "Users can insert their own albums" on public.albums
  for insert with check (auth.uid() = artist_id);

create policy "Users can update their own albums" on public.albums
  for update using (auth.uid() = artist_id);

create policy "Users can delete their own albums" on public.albums
  for delete using (auth.uid() = artist_id);
