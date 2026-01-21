drop policy if exists "storage_audio_read_authed_public_or_owner" on storage.objects;
drop policy if exists "storage_audio_write_owner_only" on storage.objects;
drop policy if exists "storage_audio_update_owner_only" on storage.objects;
drop policy if exists "storage_audio_delete_owner_only" on storage.objects;
drop policy if exists "storage_covers_read_authed_public_or_owner" on storage.objects;
drop policy if exists "storage_covers_write_owner_only" on storage.objects;
drop policy if exists "storage_covers_update_owner_only" on storage.objects;
drop policy if exists "storage_covers_delete_owner_only" on storage.objects;

create policy "storage_audio_read_authed_public_or_owner"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'audio'
  and exists (
    select 1
    from public.songs s
    where s.audio_path = storage.objects.name
      and (s.visibility = 'public' or s.owner_id = auth.uid())
  )
);

create policy "storage_audio_write_owner_only"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'audio'
  and (storage.foldername(storage.objects.name))[1] = auth.uid()::text
);

create policy "storage_audio_update_owner_only"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'audio'
  and (storage.foldername(storage.objects.name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'audio'
  and (storage.foldername(storage.objects.name))[1] = auth.uid()::text
);

create policy "storage_audio_delete_owner_only"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'audio'
  and (storage.foldername(storage.objects.name))[1] = auth.uid()::text
);

create policy "storage_covers_read_authed_public_or_owner"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'covers'
  and (
    exists (
      select 1
      from public.songs s
      where s.cover_path = storage.objects.name
        and (s.visibility = 'public' or s.owner_id = auth.uid())
    )
    or (storage.foldername(storage.objects.name))[1] = auth.uid()::text
  )
);

create policy "storage_covers_write_owner_only"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'covers'
  and (storage.foldername(storage.objects.name))[1] = auth.uid()::text
);

create policy "storage_covers_update_owner_only"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'covers'
  and (storage.foldername(storage.objects.name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'covers'
  and (storage.foldername(storage.objects.name))[1] = auth.uid()::text
);

create policy "storage_covers_delete_owner_only"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'covers'
  and (storage.foldername(storage.objects.name))[1] = auth.uid()::text
);

