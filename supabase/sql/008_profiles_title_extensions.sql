-- Add new fields to profiles table for title and status system
alter table public.profiles
add column if not exists title_text text,
add column if not exists title_style text default 'default';

-- Add default title for existing users if needed (optional)
-- update public.profiles set title_text = '音乐人' where title_text is null;
