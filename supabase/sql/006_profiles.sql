-- Create a table for public profiles
create table public.profiles (
  id uuid references auth.users not null primary key,
  nickname text,
  avatar_url text,
  cover_url text,
  signature text,
  background_style text default 'half', -- 'half' or 'full'
  followers_count integer default 0,
  following_count integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Set up Row Level Security (RLS)
alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone."
  on profiles for select
  using ( true );

create policy "Users can insert their own profile."
  on profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update own profile."
  on profiles for update
  using ( auth.uid() = id );

-- Handle automatic profile creation when a user signs up
-- This trigger ensures that every user in auth.users has a corresponding entry in public.profiles
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nickname, avatar_url, cover_url, signature)
  values (
    new.id, 
    new.raw_user_meta_data->>'nickname', 
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'cover_url',
    new.raw_user_meta_data->>'signature'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Storage buckets for profiles
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) ON CONFLICT DO NOTHING;
insert into storage.buckets (id, name, public) values ('covers', 'covers', true) ON CONFLICT DO NOTHING;

create policy "Avatar images are publicly accessible."
  on storage.objects for select
  using ( bucket_id = 'avatars' );

create policy "Anyone can upload an avatar."
  on storage.objects for insert
  with check ( bucket_id = 'avatars' );

create policy "Cover images are publicly accessible."
  on storage.objects for select
  using ( bucket_id = 'covers' );

create policy "Anyone can upload a cover."
  on storage.objects for insert
  with check ( bucket_id = 'covers' );
