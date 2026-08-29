-- 封面采用内容寻址路径，删除前必须跨 RLS 统计歌曲与合集的全部引用。
create or replace function public.get_media_cover_reference_count(p_path text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (select count(*) from public.songs where cover_path = p_path)
    +
    (select count(*) from public.albums where cover_url = p_path)
  )::integer;
$$;

revoke all on function public.get_media_cover_reference_count(text) from public;
grant execute on function public.get_media_cover_reference_count(text) to authenticated;
