drop policy if exists cover_puzzle_records_select_own on public.cover_puzzle_records;
drop policy if exists cover_puzzle_records_insert_own on public.cover_puzzle_records;
drop policy if exists cover_puzzle_records_update_own on public.cover_puzzle_records;

create policy cover_puzzle_records_select_own
on public.cover_puzzle_records
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy cover_puzzle_records_insert_own
on public.cover_puzzle_records
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy cover_puzzle_records_update_own
on public.cover_puzzle_records
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
