create table if not exists public.cover_puzzle_records (
  user_id uuid not null references public.profiles(id) on delete cascade,
  cover_key text not null,
  cover_path text,
  album_title text,
  best_time_ms integer not null check (best_time_ms > 0),
  completion_count integer not null default 1 check (completion_count > 0),
  first_completed_at timestamptz not null default now(),
  best_completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, cover_key),
  constraint cover_puzzle_records_cover_key_length check (char_length(cover_key) between 8 and 128)
);

alter table public.cover_puzzle_records enable row level security;

drop policy if exists "cover_puzzle_records_select_own" on public.cover_puzzle_records;
create policy "cover_puzzle_records_select_own"
on public.cover_puzzle_records for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "cover_puzzle_records_insert_own" on public.cover_puzzle_records;
create policy "cover_puzzle_records_insert_own"
on public.cover_puzzle_records for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "cover_puzzle_records_update_own" on public.cover_puzzle_records;
create policy "cover_puzzle_records_update_own"
on public.cover_puzzle_records for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.cover_puzzle_records from public, anon;
grant select, insert, update on table public.cover_puzzle_records to authenticated;

create or replace function public.record_cover_puzzle_result(
  p_cover_key text,
  p_cover_path text,
  p_album_title text,
  p_elapsed_ms integer
)
returns setof public.cover_puzzle_records
language sql
security invoker
set search_path = public
as $$
  insert into public.cover_puzzle_records (
    user_id,
    cover_key,
    cover_path,
    album_title,
    best_time_ms
  ) values (
    (select auth.uid()),
    trim(p_cover_key),
    nullif(trim(p_cover_path), ''),
    nullif(trim(p_album_title), ''),
    greatest(1, p_elapsed_ms)
  )
  on conflict (user_id, cover_key) do update set
    cover_path = coalesce(excluded.cover_path, public.cover_puzzle_records.cover_path),
    album_title = coalesce(excluded.album_title, public.cover_puzzle_records.album_title),
    best_time_ms = least(public.cover_puzzle_records.best_time_ms, excluded.best_time_ms),
    completion_count = public.cover_puzzle_records.completion_count + 1,
    best_completed_at = case
      when excluded.best_time_ms < public.cover_puzzle_records.best_time_ms then now()
      else public.cover_puzzle_records.best_completed_at
    end,
    updated_at = now()
  returning *;
$$;

revoke all on function public.record_cover_puzzle_result(text, text, text, integer) from public, anon;
grant execute on function public.record_cover_puzzle_result(text, text, text, integer) to authenticated;

comment on table public.cover_puzzle_records is
  '每位用户按封面身份去重的 3x3 记忆拼图最佳成绩。';
