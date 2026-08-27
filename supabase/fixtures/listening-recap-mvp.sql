-- 聆听回顾一期隔离 fixture。
--
-- 运行前提：先在本地/隔离 Supabase Postgres 中按顺序执行既有迁移、
-- 021_listening_recap_mvp.sql 和 022_listening_recap_event_compatibility.sql，
-- 再以可创建 auth.users 的数据库角色执行本文件。
-- 全部数据都在事务中创建并在末尾回滚，不连接远端，也不保留 fixture 数据。

begin;

-- 两个脱敏测试账号；不写入任何密码、项目标识或其他凭据。
insert into auth.users (
  id,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-4000-8000-0000000000a1'::uuid,
    'fixture-listening-a@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    '2026-01-01 00:00:00+00'::timestamptz,
    '2026-01-01 00:00:00+00'::timestamptz
  ),
  (
    '00000000-0000-4000-8000-0000000000b1'::uuid,
    'fixture-listening-b@example.invalid',
    '{}'::jsonb,
    '{}'::jsonb,
    '2026-01-01 00:00:00+00'::timestamptz,
    '2026-01-01 00:00:00+00'::timestamptz
  )
on conflict (id) do nothing;

insert into public.songs (
  id,
  owner_id,
  visibility,
  is_public,
  plays_count,
  title,
  artist,
  duration,
  trim_end,
  audio_path,
  cover_path,
  created_at
)
values
  (
    '00000000-0000-4000-8000-0000000010a1'::uuid,
    '00000000-0000-4000-8000-0000000000a1'::uuid,
    'public',
    true,
    0,
    'Fixture 公共歌曲',
    'Fixture A',
    120,
    120,
    'fixture/audio/public-a.mp3',
    null,
    '2026-01-01 00:00:00+00'::timestamptz
  ),
  (
    '00000000-0000-4000-8000-0000000010a2'::uuid,
    '00000000-0000-4000-8000-0000000000a1'::uuid,
    'private',
    false,
    0,
    'Fixture 私有歌曲',
    'Fixture A',
    90,
    90,
    'fixture/audio/private-a.mp3',
    null,
    '2026-01-01 00:00:00+00'::timestamptz
  ),
  (
    '00000000-0000-4000-8000-0000000010a3'::uuid,
    '00000000-0000-4000-8000-0000000000b1'::uuid,
    'public',
    true,
    0,
    'Fixture 他人公共歌曲',
    'Fixture B',
    150,
    150,
    'fixture/audio/public-b.mp3',
    null,
    '2026-01-01 00:00:00+00'::timestamptz
  ),
  (
    '00000000-0000-4000-8000-0000000010a4'::uuid,
    '00000000-0000-4000-8000-0000000000b1'::uuid,
    'private',
    false,
    0,
    'Fixture 他人私有歌曲',
    'Fixture B',
    180,
    180,
    'fixture/audio/private-b.mp3',
    null,
    '2026-01-01 00:00:00+00'::timestamptz
  )
on conflict (id) do nothing;

-- 旧累计只作为 legacy_only 的存在背景，不为它创建任何虚构事件。
insert into public.user_song_plays (user_id, song_id, plays_count, updated_at)
values
  (
    '00000000-0000-4000-8000-0000000000a1'::uuid,
    '00000000-0000-4000-8000-0000000010a1'::uuid,
    7,
    '2025-12-31 16:00:00+00'::timestamptz
  ),
  (
    '00000000-0000-4000-8000-0000000000a1'::uuid,
    '00000000-0000-4000-8000-0000000010a2'::uuid,
    2,
    '2025-12-31 16:00:00+00'::timestamptz
  )
on conflict (user_id, song_id) do nothing;

-- 事件窗口覆盖前移到 2026-01-01，便于先验证完整窗口；稍后在同一事务内
-- 移到 2026-07-15 进行 event_partial/legacy_only 验证。
update public.listening_recap_coverage
set coverage_start = '2026-01-01 00:00:00+00'::timestamptz,
    last_accepted_at = null,
    updated_at = '2026-01-01 00:00:00+00'::timestamptz
where coverage_key = 'qualified_play';

-- 这些时间点验证 Asia/Shanghai 的月初/月末半开区间：
-- 2026-06-30 16:00:00Z = 7 月 1 日 00:00:00（包含）；
-- 2026-07-31 16:00:00Z = 8 月 1 日 00:00:00（不属于 7 月）。
insert into public.listening_play_events (
  event_id,
  user_id,
  play_session_id,
  song_id,
  metric,
  policy_version,
  accepted_at,
  observed_at,
  qualifying_seconds,
  listened_seconds
)
values
  (
    '10000000-0000-4000-8000-0000000000a1'::uuid,
    '00000000-0000-4000-8000-0000000000a1'::uuid,
    '20000000-0000-4000-8000-0000000000a1'::uuid,
    '00000000-0000-4000-8000-0000000010a1'::uuid,
    'qualified_play',
    'd1-20pct-v1',
    '2026-06-30 15:59:59+00'::timestamptz,
    '2026-06-30 15:59:58+00'::timestamptz,
    1,
    1
  ),
  (
    '10000000-0000-4000-8000-0000000000a2'::uuid,
    '00000000-0000-4000-8000-0000000000a1'::uuid,
    '20000000-0000-4000-8000-0000000000a2'::uuid,
    '00000000-0000-4000-8000-0000000010a1'::uuid,
    'qualified_play',
    'd1-20pct-v1',
    '2026-06-30 16:00:00+00'::timestamptz,
    '2026-06-30 15:59:00+00'::timestamptz,
    1,
    1
  ),
  (
    '10000000-0000-4000-8000-0000000000a3'::uuid,
    '00000000-0000-4000-8000-0000000000a1'::uuid,
    '20000000-0000-4000-8000-0000000000a3'::uuid,
    '00000000-0000-4000-8000-0000000010a2'::uuid,
    'qualified_play',
    'd1-20pct-v1',
    '2026-07-20 12:00:00+00'::timestamptz,
    '2026-07-20 11:59:00+00'::timestamptz,
    1,
    1
  ),
  (
    '10000000-0000-4000-8000-0000000000a4'::uuid,
    '00000000-0000-4000-8000-0000000000a1'::uuid,
    '20000000-0000-4000-8000-0000000000a4'::uuid,
    '00000000-0000-4000-8000-0000000010a3'::uuid,
    'qualified_play',
    'd1-20pct-v1',
    '2026-07-31 15:59:59+00'::timestamptz,
    '2026-07-31 15:59:00+00'::timestamptz,
    1,
    1
  ),
  (
    '10000000-0000-4000-8000-0000000000a5'::uuid,
    '00000000-0000-4000-8000-0000000000a1'::uuid,
    '20000000-0000-4000-8000-0000000000a5'::uuid,
    '00000000-0000-4000-8000-0000000010a1'::uuid,
    'qualified_play',
    'd1-20pct-v1',
    '2026-07-31 16:00:00+00'::timestamptz,
    '2026-07-31 15:59:00+00'::timestamptz,
    1,
    1
  ),
  -- 模拟绕过记录 RPC 的隔离脏数据：事件属于 A，但歌曲元数据对 A 不可见。
  -- 查询 RPC 必须在服务端 join 可见 songs 后排除它。
  (
    '10000000-0000-4000-8000-0000000000a6'::uuid,
    '00000000-0000-4000-8000-0000000000a1'::uuid,
    '20000000-0000-4000-8000-0000000000a6'::uuid,
    '00000000-0000-4000-8000-0000000010a4'::uuid,
    'qualified_play',
    'd1-20pct-v1',
    '2026-07-20 13:00:00+00'::timestamptz,
    '2026-07-20 12:59:00+00'::timestamptz,
    1,
    1
  );

-- 角色/权限检查在切换到 authenticated 前完成。
do $assert$
declare
  v_events_rls boolean;
  v_coverage_rls boolean;
  v_auth_can_select boolean;
  v_auth_can_insert boolean;
  v_public_can_record boolean;
  v_anon_can_record boolean;
  v_auth_can_record boolean;
begin
  select c.relrowsecurity
  into v_events_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'listening_play_events';

  select c.relrowsecurity
  into v_coverage_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'listening_recap_coverage';

  v_auth_can_select := has_table_privilege(
    'authenticated',
    'public.listening_play_events',
    'select'
  );
  v_auth_can_insert := has_table_privilege(
    'authenticated',
    'public.listening_play_events',
    'insert'
  );
  v_anon_can_record := has_function_privilege(
    'anon',
    'public.record_listening_play_event(uuid,uuid,uuid,text,text,timestamptz,double precision,double precision)'::regprocedure,
    'execute'
  );
  v_public_can_record := has_function_privilege(
    'public',
    'public.record_listening_play_event(uuid,uuid,uuid,text,text,timestamptz,double precision,double precision)'::regprocedure,
    'execute'
  );
  v_auth_can_record := has_function_privilege(
    'authenticated',
    'public.record_listening_play_event(uuid,uuid,uuid,text,text,timestamptz,double precision,double precision)'::regprocedure,
    'execute'
  );

  if v_events_rls is distinct from true or v_coverage_rls is distinct from true then
    raise exception 'fixture assertion failed: new public tables must have RLS enabled';
  end if;
  if v_auth_can_select is distinct from true or v_auth_can_insert is distinct from false then
    raise exception 'fixture assertion failed: event table grant matrix';
  end if;
  if v_public_can_record is distinct from false
    or v_anon_can_record is distinct from false
    or v_auth_can_record is distinct from true then
    raise exception 'fixture assertion failed: record RPC grant matrix';
  end if;
end;
$assert$;

-- 账号 A：RLS 只能看到自己的事件和可见歌曲；A 的私有歌曲仍可被本人读取。
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-0000000000a1',
  true
);

do $assert$
declare
  v_event_count bigint;
  v_own_private_song_count bigint;
  v_other_private_song_count bigint;
begin
  select count(*) into v_event_count
  from public.listening_play_events;
  select count(*) into v_own_private_song_count
  from public.songs
  where id = '00000000-0000-4000-8000-0000000010a2'::uuid;
  select count(*) into v_other_private_song_count
  from public.songs
  where id = '00000000-0000-4000-8000-0000000010a4'::uuid;

  if v_event_count <> 6 then
    raise exception 'fixture assertion failed: account A event RLS count %', v_event_count;
  end if;
  if v_own_private_song_count <> 1 or v_other_private_song_count <> 0 then
    raise exception 'fixture assertion failed: account A song visibility';
  end if;
end;
$assert$;

-- 完整 2026-07：月初包含、月末边界排除；隐藏元数据事件也不能进入统计。
do $assert$
declare
  v_response jsonb;
begin
  select public.get_listening_recap('month', '2026-07') into v_response;
  if v_response->'coverage'->>'status' <> 'event_complete'
    or v_response->'summary'->>'validPlayCount' <> '3'
    or v_response->'summary'->>'songCount' <> '3'
    or v_response->'summary'->>'listeningDayCount' <> '3' then
    raise exception 'fixture assertion failed: account A complete summary %', v_response;
  end if;
  if v_response->'longestCompanion'->>'isTie' <> 'true'
    or jsonb_array_length(v_response->'longestCompanion'->'songs') <> 2
    or v_response->'opening'->'coverSong'->>'id' <> '00000000-0000-4000-8000-0000000010a3' then
    raise exception 'fixture assertion failed: longest companion tie/order %', v_response;
  end if;
  if v_response->'ownedSounds'->>'songCount' <> '2'
    or v_response->'queue'->>'totalCount' <> '3'
    or v_response->'queue'->'songIds' <> jsonb_build_array(
      '00000000-0000-4000-8000-0000000010a1',
      '00000000-0000-4000-8000-0000000010a2',
      '00000000-0000-4000-8000-0000000010a3'
    ) then
    raise exception 'fixture assertion failed: owned/queue visibility/order %', v_response;
  end if;
  if v_response ? 'events' then
    raise exception 'fixture assertion failed: raw event list leaked';
  end if;
end;
$assert$;

-- 只有旧累计的窗口：不得返回窗口数字、候选歌曲或播放队列。
reset role;
update public.listening_recap_coverage
set coverage_start = '2026-07-15 00:00:00+08'::timestamptz,
    updated_at = '2026-07-15 00:00:00+08'::timestamptz
where coverage_key = 'qualified_play';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-0000000000a1',
  true
);

do $assert$
declare
  v_response jsonb;
begin
  select public.get_listening_recap('month', '2026-06') into v_response;
  if v_response->'coverage'->>'status' <> 'legacy_only'
    or v_response->'summary' is distinct from 'null'::jsonb
    or v_response->'opening' is distinct from 'null'::jsonb
    or v_response->'queue'->'songIds' <> '[]'::jsonb then
    raise exception 'fixture assertion failed: legacy_only contract %', v_response;
  end if;
end;
$assert$;

-- 跨启用点的窗口：只统计覆盖起点之后的事件，并附带 partial 标记。
do $assert$
declare
  v_response jsonb;
begin
  select public.get_listening_recap('month', '2026-07') into v_response;
  if v_response->'coverage'->>'status' <> 'event_partial'
    or v_response->'summary'->>'validPlayCount' <> '2'
    or v_response->'summary'->>'songCount' <> '2'
    or v_response->'coverage'->>'messageKey' <> 'events_coverage_starts_at' then
    raise exception 'fixture assertion failed: event_partial contract %', v_response;
  end if;
end;
$assert$;

-- 账号 B：没有自己的事件时为 no_event；不能读取 A 的事件或 A 的私有歌曲。
reset role;
update public.listening_recap_coverage
set coverage_start = '2026-01-01 00:00:00+00'::timestamptz,
    updated_at = '2026-01-01 00:00:00+00'::timestamptz
where coverage_key = 'qualified_play';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-0000000000b1',
  true
);

do $assert$
declare
  v_event_count bigint;
  v_other_private_song_count bigint;
  v_response jsonb;
begin
  select count(*) into v_event_count
  from public.listening_play_events;
  select count(*) into v_other_private_song_count
  from public.songs
  where id = '00000000-0000-4000-8000-0000000010a2'::uuid;
  select public.get_listening_recap('month', '2026-07') into v_response;

  if v_event_count <> 0 or v_other_private_song_count <> 0 then
    raise exception 'fixture assertion failed: account B isolation';
  end if;
  if v_response->'coverage'->>'status' <> 'no_event'
    or v_response->'summary'->>'validPlayCount' <> '0'
    or v_response->'queue'->'songIds' <> '[]'::jsonb then
    raise exception 'fixture assertion failed: account B no_event response %', v_response;
  end if;
end;
$assert$;

-- 记录 RPC：首次写入、同 event_id 重试、同会话换 event_id、不同会话分别计数。
reset role;
update public.listening_recap_coverage
set coverage_start = '2026-01-01 00:00:00+00'::timestamptz,
    updated_at = '2026-01-01 00:00:00+00'::timestamptz
where coverage_key = 'qualified_play';
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-0000000000a1',
  true
);

do $assert$
declare
  v_first jsonb;
  v_retry jsonb;
  v_same_session jsonb;
  v_new_session jsonb;
  v_private jsonb;
  v_count bigint;
  v_song_play_count bigint;
  v_user_song_play_count bigint;
  v_global_before bigint;
  v_global_after bigint;
  v_compat jsonb;
  v_accepted_at text;
  v_message text;
begin
  select public.record_listening_play_event(
    '30000000-0000-4000-8000-0000000000a1'::uuid,
    '40000000-0000-4000-8000-0000000000a1'::uuid,
    '00000000-0000-4000-8000-0000000010a1'::uuid,
    'qualified_play',
    'd1-20pct-v1',
    '2026-08-26 00:00:00+00'::timestamptz,
    24,
    24
  ) into v_first;
  v_accepted_at := v_first->>'acceptedAt';
  if v_first->>'status' <> 'accepted'
    or v_first->>'isNew' <> 'true'
    or v_first->>'userSongPlayCount' <> '8'
    or v_accepted_at is null then
    raise exception 'fixture assertion failed: first event response %', v_first;
  end if;
  select plays_count into v_song_play_count
  from public.songs
  where id = '00000000-0000-4000-8000-0000000010a1'::uuid;
  if v_song_play_count <> 1 then
    raise exception 'fixture assertion failed: first event global counter %', v_song_play_count;
  end if;

  select public.record_listening_play_event(
    '30000000-0000-4000-8000-0000000000a1'::uuid,
    '40000000-0000-4000-8000-0000000000a1'::uuid,
    '00000000-0000-4000-8000-0000000010a1'::uuid,
    'qualified_play',
    'd1-20pct-v1',
    '2026-08-26 00:01:00+00'::timestamptz,
    25,
    25
  ) into v_retry;
  if v_retry->>'status' <> 'accepted'
    or v_retry->>'isNew' <> 'false'
    or v_retry->>'acceptedAt' <> v_accepted_at
    or v_retry->>'userSongPlayCount' <> '8' then
    raise exception 'fixture assertion failed: event retry idempotency %', v_retry;
  end if;
  select plays_count into v_song_play_count
  from public.songs
  where id = '00000000-0000-4000-8000-0000000010a1'::uuid;
  if v_song_play_count <> 1 then
    raise exception 'fixture assertion failed: event retry repeated global counter %', v_song_play_count;
  end if;

  select public.record_listening_play_event(
    '30000000-0000-4000-8000-0000000000a2'::uuid,
    '40000000-0000-4000-8000-0000000000a1'::uuid,
    '00000000-0000-4000-8000-0000000010a1'::uuid,
    'qualified_play',
    'd1-20pct-v1'
  ) into v_same_session;
  if v_same_session->>'status' <> 'duplicate'
    or v_same_session->>'isNew' <> 'false'
    or v_same_session->>'eventId' <> '30000000-0000-4000-8000-0000000000a1'
    or v_same_session->>'userSongPlayCount' <> '8' then
    raise exception 'fixture assertion failed: same session deduplication %', v_same_session;
  end if;
  select plays_count into v_song_play_count
  from public.songs
  where id = '00000000-0000-4000-8000-0000000010a1'::uuid;
  if v_song_play_count <> 1 then
    raise exception 'fixture assertion failed: same session repeated global counter %', v_song_play_count;
  end if;

  select public.record_listening_play_event(
    '30000000-0000-4000-8000-0000000000a3'::uuid,
    '40000000-0000-4000-8000-0000000000a2'::uuid,
    '00000000-0000-4000-8000-0000000010a1'::uuid,
    'qualified_play',
    'd1-20pct-v1'
  ) into v_new_session;
  if v_new_session->>'status' <> 'accepted'
    or v_new_session->>'isNew' <> 'true'
    or v_new_session->>'userSongPlayCount' <> '9' then
    raise exception 'fixture assertion failed: new session count %', v_new_session;
  end if;
  select plays_count into v_song_play_count
  from public.songs
  where id = '00000000-0000-4000-8000-0000000010a1'::uuid;
  if v_song_play_count <> 2 then
    raise exception 'fixture assertion failed: new session global counter %', v_song_play_count;
  end if;

  select public.record_listening_play_event(
    '30000000-0000-4000-8000-0000000000a4'::uuid,
    '40000000-0000-4000-8000-0000000000a3'::uuid,
    '00000000-0000-4000-8000-0000000010a2'::uuid,
    'qualified_play',
    'd1-20pct-v1'
  ) into v_private;
  if v_private->>'status' <> 'accepted'
    or v_private->>'isNew' <> 'true'
    or v_private->>'userSongPlayCount' <> '3' then
    raise exception 'fixture assertion failed: owner private event %', v_private;
  end if;
  select plays_count into v_song_play_count
  from public.songs
  where id = '00000000-0000-4000-8000-0000000010a2'::uuid;
  select plays_count into v_user_song_play_count
  from public.user_song_plays
  where user_id = '00000000-0000-4000-8000-0000000000a1'::uuid
    and song_id = '00000000-0000-4000-8000-0000000010a2'::uuid;
  if v_song_play_count <> 1 or v_user_song_play_count <> 3 then
    raise exception 'fixture assertion failed: owner private counters %/%', v_song_play_count, v_user_song_play_count;
  end if;

  select count(*) into v_count
  from public.listening_play_events
  where user_id = '00000000-0000-4000-8000-0000000000a1'::uuid
    and song_id = '00000000-0000-4000-8000-0000000010a1'::uuid;
  if v_count <> 5 then
    raise exception 'fixture assertion failed: event rows counted more than once: %', v_count;
  end if;
  select plays_count into v_user_song_play_count
  from public.user_song_plays
  where user_id = '00000000-0000-4000-8000-0000000000a1'::uuid
    and song_id = '00000000-0000-4000-8000-0000000010a1'::uuid;
  if v_user_song_play_count <> 9 then
    raise exception 'fixture assertion failed: user counter counted more than once: %', v_user_song_play_count;
  end if;

  -- 兼容修正：模拟 songs 全局累计溢出。该旁路失败时，事件和个人累计仍须确认。
  select plays_count into v_global_before
  from public.songs
  where id = '00000000-0000-4000-8000-0000000010a1'::uuid;
  update public.songs
  set plays_count = 9223372036854775807
  where id = '00000000-0000-4000-8000-0000000010a1'::uuid;

  select public.record_listening_play_event(
    '30000000-0000-4000-8000-0000000000b1'::uuid,
    '40000000-0000-4000-8000-0000000000b1'::uuid,
    '00000000-0000-4000-8000-0000000010a1'::uuid,
    'qualified_play',
    'd1-20pct-v1'
  ) into v_compat;
  if v_compat->>'status' <> 'accepted'
    or v_compat->>'isNew' <> 'true'
    or v_compat->>'userSongPlayCount' <> '10' then
    raise exception 'fixture assertion failed: global counter compatibility response %', v_compat;
  end if;

  select plays_count into v_global_after
  from public.songs
  where id = '00000000-0000-4000-8000-0000000010a1'::uuid;
  select plays_count into v_user_song_play_count
  from public.user_song_plays
  where user_id = '00000000-0000-4000-8000-0000000000a1'::uuid
    and song_id = '00000000-0000-4000-8000-0000000010a1'::uuid;
  select count(*) into v_count
  from public.listening_play_events
  where event_id = '30000000-0000-4000-8000-0000000000b1'::uuid;
  if v_global_after <> 9223372036854775807
    or v_user_song_play_count <> 10
    or v_count <> 1 then
    raise exception 'fixture assertion failed: global counter must not block accepted event %/%/%',
      v_global_after, v_user_song_play_count, v_count;
  end if;
  update public.songs
  set plays_count = v_global_before
  where id = '00000000-0000-4000-8000-0000000010a1'::uuid;

  -- 不可见歌曲、非法指标、非法诊断秒数和 event payload 冲突均拒绝。
  begin
    perform public.record_listening_play_event(
      '30000000-0000-4000-8000-0000000000a5'::uuid,
      '40000000-0000-4000-8000-0000000000a4'::uuid,
      '00000000-0000-4000-8000-0000000010a4'::uuid,
      'qualified_play',
      'd1-20pct-v1'
    );
    raise exception 'fixture assertion failed: invisible song accepted';
  exception when others then
    v_message := sqlerrm;
    if position('song_not_allowed' in v_message) = 0 then
      raise;
    end if;
  end;

  begin
    perform public.record_listening_play_event(
      '30000000-0000-4000-8000-0000000000a6'::uuid,
      '40000000-0000-4000-8000-0000000000a5'::uuid,
      '00000000-0000-4000-8000-0000000010a1'::uuid,
      'other_metric',
      'd1-20pct-v1'
    );
    raise exception 'fixture assertion failed: invalid metric accepted';
  exception when others then
    v_message := sqlerrm;
    if position('invalid_metric' in v_message) = 0 then
      raise;
    end if;
  end;

  begin
    perform public.record_listening_play_event(
      '30000000-0000-4000-8000-0000000000a7'::uuid,
      '40000000-0000-4000-8000-0000000000a6'::uuid,
      '00000000-0000-4000-8000-0000000010a1'::uuid,
      'qualified_play',
      'd1-20pct-v1',
      null,
      -1,
      null
    );
    raise exception 'fixture assertion failed: negative diagnostic accepted';
  exception when others then
    v_message := sqlerrm;
    if position('invalid_input' in v_message) = 0 then
      raise;
    end if;
  end;

  begin
    perform public.record_listening_play_event(
      '30000000-0000-4000-8000-0000000000a1'::uuid,
      '40000000-0000-4000-8000-0000000000ff'::uuid,
      '00000000-0000-4000-8000-0000000010a1'::uuid,
      'qualified_play',
      'd1-20pct-v1'
    );
    raise exception 'fixture assertion failed: event payload conflict accepted';
  exception when others then
    v_message := sqlerrm;
    if position('event_conflict' in v_message) = 0 then
      raise;
    end if;
  end;
end;
$assert$;

-- 客户端不能直接写/改/删事件；只能调用记录 RPC。
do $assert$
declare
  v_succeeded boolean;
  v_sqlstate text;
begin
  begin
    insert into public.listening_play_events (
      event_id, user_id, play_session_id, song_id, metric, policy_version
    ) values (
      '50000000-0000-4000-8000-0000000000a1'::uuid,
      '00000000-0000-4000-8000-0000000000a1'::uuid,
      '60000000-0000-4000-8000-0000000000a1'::uuid,
      '00000000-0000-4000-8000-0000000010a1'::uuid,
      'qualified_play',
      'd1-20pct-v1'
    );
    v_succeeded := true;
  exception when others then
    v_succeeded := false;
    v_sqlstate := sqlstate;
  end;
  if v_succeeded or v_sqlstate <> '42501' then
    raise exception 'fixture assertion failed: direct insert privilege';
  end if;

  begin
    update public.listening_play_events
    set observed_at = now()
    where event_id = '10000000-0000-4000-8000-0000000000a2'::uuid;
    v_succeeded := true;
  exception when others then
    v_succeeded := false;
    v_sqlstate := sqlstate;
  end;
  if v_succeeded or v_sqlstate <> '42501' then
    raise exception 'fixture assertion failed: direct update privilege';
  end if;

  begin
    delete from public.listening_play_events
    where event_id = '10000000-0000-4000-8000-0000000000a2'::uuid;
    v_succeeded := true;
  exception when others then
    v_succeeded := false;
    v_sqlstate := sqlstate;
  end;
  if v_succeeded or v_sqlstate <> '42501' then
    raise exception 'fixture assertion failed: direct delete privilege';
  end if;
end;
$assert$;

-- 账号 A/B 的私有歌曲与记录权限均按当前 auth.uid() 隔离；B 可以记录自己的私有歌曲。
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-0000000000b1',
  true
);
select public.record_listening_play_event(
  '30000000-0000-4000-8000-0000000000b1'::uuid,
  '40000000-0000-4000-8000-0000000000b1'::uuid,
  '00000000-0000-4000-8000-0000000010a4'::uuid,
  'qualified_play',
  'd1-20pct-v1'
);

reset role;
select 'listening-recap-mvp fixture assertions passed' as fixture_status;

rollback;
