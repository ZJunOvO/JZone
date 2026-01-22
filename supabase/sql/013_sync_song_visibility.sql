do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'songs'
      and column_name = 'is_public'
  ) then
    update public.songs
    set visibility = case when is_public then 'public' else 'private' end
    where visibility is distinct from case when is_public then 'public' else 'private' end;
  end if;
end
$$;
