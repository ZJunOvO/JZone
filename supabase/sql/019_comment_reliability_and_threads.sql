-- 评论可靠性与单层回复：分页排序、软删除和歌曲所有者管理。

alter table public.comments
  add column if not exists parent_comment_id uuid references public.comments(id) on delete restrict,
  add column if not exists deleted_at timestamptz,
  add column if not exists likes_count integer not null default 0;

create index if not exists comments_song_parent_created_idx
  on public.comments(song_id, parent_comment_id, created_at desc);

create index if not exists comments_song_parent_likes_idx
  on public.comments(song_id, parent_comment_id, likes_count desc, created_at desc);

create or replace function public.validate_comment_parent()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_parent_song_id uuid;
  v_grandparent_id uuid;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  select song_id, parent_comment_id
    into v_parent_song_id, v_grandparent_id
  from public.comments
  where id = new.parent_comment_id;

  if not found then
    raise exception 'Parent comment does not exist';
  end if;
  if v_parent_song_id <> new.song_id then
    raise exception 'Reply must belong to the same song';
  end if;
  if v_grandparent_id is not null then
    raise exception 'Only one reply level is supported';
  end if;

  return new;
end;
$$;

drop trigger if exists comments_validate_parent on public.comments;
create trigger comments_validate_parent
before insert or update of parent_comment_id, song_id on public.comments
for each row execute function public.validate_comment_parent();

update public.comments c
set likes_count = counts.total
from (
  select comment_id, count(*)::integer as total
  from public.comment_likes
  group by comment_id
) counts
where c.id = counts.comment_id;

update public.comments c
set likes_count = 0
where not exists (
  select 1 from public.comment_likes l where l.comment_id = c.id
);

create or replace function public.sync_comment_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update public.comments
    set likes_count = likes_count + 1
    where id = new.comment_id;
    return new;
  end if;

  update public.comments
  set likes_count = greatest(0, likes_count - 1)
  where id = old.comment_id;
  return old;
end;
$$;

drop trigger if exists comment_likes_sync_count on public.comment_likes;
create trigger comment_likes_sync_count
after insert or delete on public.comment_likes
for each row execute function public.sync_comment_likes_count();

create or replace function public.delete_comment(p_comment_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_comment_owner uuid;
  v_song_owner uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select c.user_id, s.owner_id
    into v_comment_owner, v_song_owner
  from public.comments c
  join public.songs s on s.id = c.song_id
  where c.id = p_comment_id;

  if not found then
    return 'missing';
  end if;
  if v_uid <> v_comment_owner and v_uid <> v_song_owner then
    raise exception 'Permission denied';
  end if;

  if exists (select 1 from public.comments where parent_comment_id = p_comment_id) then
    update public.comments
    set text = '', deleted_at = now()
    where id = p_comment_id;
    return 'soft_deleted';
  end if;

  delete from public.comments where id = p_comment_id;
  return 'deleted';
end;
$$;

revoke all on function public.delete_comment(uuid) from public;
revoke all on function public.delete_comment(uuid) from anon;
grant execute on function public.delete_comment(uuid) to authenticated;
