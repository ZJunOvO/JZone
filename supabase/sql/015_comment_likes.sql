create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists comment_likes_user_id_idx on public.comment_likes(user_id);

alter table public.comment_likes enable row level security;

grant select, insert, delete on public.comment_likes to authenticated;
revoke all on public.comment_likes from anon;

drop policy if exists "comment_likes_select_if_comment_visible" on public.comment_likes;
create policy "comment_likes_select_if_comment_visible"
on public.comment_likes
for select
to authenticated
using (
  exists (
    select 1
    from public.comments c
    join public.songs s on s.id = c.song_id
    where c.id = comment_likes.comment_id
      and (s.visibility = 'public' or s.owner_id = (select auth.uid()))
  )
);

drop policy if exists "comment_likes_insert_once_if_comment_visible" on public.comment_likes;
create policy "comment_likes_insert_once_if_comment_visible"
on public.comment_likes
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.comments c
    join public.songs s on s.id = c.song_id
    where c.id = comment_likes.comment_id
      and (s.visibility = 'public' or s.owner_id = (select auth.uid()))
  )
);

drop policy if exists "comment_likes_delete_owner_only" on public.comment_likes;
create policy "comment_likes_delete_owner_only"
on public.comment_likes
for delete
to authenticated
using (user_id = (select auth.uid()));
