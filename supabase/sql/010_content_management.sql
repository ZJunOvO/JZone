-- Add is_public and pinned_at to songs
ALTER TABLE public.songs 
ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS pinned_at timestamp with time zone DEFAULT null;

-- Add is_public and pinned_at to albums
ALTER TABLE public.albums 
ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS pinned_at timestamp with time zone DEFAULT null;

-- Update existing data to be public by default
UPDATE public.songs SET is_public = true WHERE is_public IS NULL;
UPDATE public.albums SET is_public = true WHERE is_public IS NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS songs_is_public_idx ON public.songs(is_public);
CREATE INDEX IF NOT EXISTS songs_pinned_at_idx ON public.songs(pinned_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS albums_is_public_idx ON public.albums(is_public);
CREATE INDEX IF NOT EXISTS albums_pinned_at_idx ON public.albums(pinned_at DESC NULLS LAST);

-- Update Policies for Songs

-- Drop existing select policy (it was using visibility or owner_id)
DROP POLICY IF EXISTS "songs_select_authed_public_or_owner" ON public.songs;

-- Create new select policy using is_public
-- Users can see public songs OR their own songs
CREATE POLICY "songs_select_public_or_owner" ON public.songs
FOR SELECT
TO authenticated
USING (is_public = true OR owner_id = auth.uid());

-- Update Policies for Albums

-- Drop existing select policy (it was "Albums are viewable by everyone")
DROP POLICY IF EXISTS "Albums are viewable by everyone" ON public.albums;

-- Create new select policy
CREATE POLICY "albums_select_public_or_owner" ON public.albums
FOR SELECT
TO authenticated
USING (is_public = true OR artist_id = auth.uid());
