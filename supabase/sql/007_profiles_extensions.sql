-- Add new fields to profiles table for extended UI features
alter table public.profiles 
add column if not exists background_opacity numeric default 1.0,
add column if not exists add column if not exists avatar_frame_id text;

-- Ensure RLS allows updates to these new columns (existing update policy covers all columns, but good to double check)
-- Policy "Users can update own profile." on profiles for update using ( auth.uid() = id );
