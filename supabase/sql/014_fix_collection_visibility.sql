-- Fix collection visibility leakage caused by legacy albums.is_public policy/field.
-- Canonical source of truth for collections is albums.visibility.

update public.albums
set is_public = (visibility = 'public')
where is_public is distinct from (visibility = 'public');

drop policy if exists "albums_select_public_or_owner" on public.albums;
drop policy if exists "albums_select_if_public_or_owner" on public.albums;
drop policy if exists "Albums are viewable by everyone" on public.albums;

create policy "albums_select_if_public_or_owner" on public.albums
  for select
  to authenticated
  using (visibility = 'public' or creator_id = auth.uid());

create or replace function public.sync_album_visibility_columns()
returns trigger
language plpgsql
as $$
begin
  if new.visibility is null then
    new.visibility := case when coalesce(new.is_public, true) then 'public'::public.collection_visibility else 'private'::public.collection_visibility end;
  end if;

  new.is_public := (new.visibility = 'public');
  return new;
end;
$$;

drop trigger if exists sync_album_visibility_columns_before_write on public.albums;

create trigger sync_album_visibility_columns_before_write
before insert or update of visibility, is_public on public.albums
for each row
execute function public.sync_album_visibility_columns();

select pg_notify('pgrst', 'reload schema');
