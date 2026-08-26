-- 聆听回顾一期：逐事件来源、覆盖起点、RLS 与安全 RPC。
--
-- 本迁移不回填历史 user_song_plays，也不修改旧 RPC 签名。新事件由
-- record_listening_play_event 在同一事务中写入事件并更新两种播放累计；accepted_at 永远由数据库生成。

create table if not exists public.listening_recap_coverage (
  coverage_key text primary key,
  coverage_version text not null,
  coverage_start timestamptz not null,
  last_accepted_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint listening_recap_coverage_key_check
    check (coverage_key = 'qualified_play'),
  constraint listening_recap_coverage_version_check
    check (coverage_version = 'events-v1')
);

create table if not exists public.listening_play_events (
  event_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  play_session_id uuid not null,
  song_id uuid not null references public.songs(id) on delete cascade,
  metric text not null,
  policy_version text not null,
  accepted_at timestamptz not null default now(),
  observed_at timestamptz,
  qualifying_seconds double precision,
  listened_seconds double precision,
  primary key (user_id, event_id),
  constraint listening_play_events_session_metric_key
    unique (user_id, play_session_id, metric),
  constraint listening_play_events_metric_check
    check (metric = 'qualified_play'),
  constraint listening_play_events_policy_check
    check (policy_version = 'd1-20pct-v1'),
  constraint listening_play_events_qualifying_seconds_check
    check (
      qualifying_seconds is null
      or (
        qualifying_seconds >= 0
        and qualifying_seconds::text not in ('NaN', 'Infinity', '-Infinity')
      )
    ),
  constraint listening_play_events_listened_seconds_check
    check (
      listened_seconds is null
      or (
        listened_seconds >= 0
        and listened_seconds::text not in ('NaN', 'Infinity', '-Infinity')
      )
    )
);

create index if not exists listening_play_events_user_accepted_at_idx
  on public.listening_play_events (user_id, accepted_at);

create index if not exists listening_play_events_user_song_accepted_at_idx
  on public.listening_play_events (user_id, song_id, accepted_at);

create index if not exists listening_play_events_song_accepted_at_idx
  on public.listening_play_events (song_id, accepted_at);

-- 迁移执行时记录事件源的启用起点。重复执行不得重置既有覆盖起点。
insert into public.listening_recap_coverage (
  coverage_key,
  coverage_version,
  coverage_start
)
values (
  'qualified_play',
  'events-v1',
  now()
)
on conflict (coverage_key) do nothing;

alter table public.listening_recap_coverage enable row level security;
alter table public.listening_play_events enable row level security;

drop policy if exists "listening_play_events_select_owner" on public.listening_play_events;

create policy "listening_play_events_select_owner"
on public.listening_play_events
for select
to authenticated
using (user_id = (select auth.uid()));

-- songs 的线上读取口径以 is_public 为唯一公开标记；owner 可读取自己的私有歌曲。
-- 重新创建策略以覆盖早期 visibility 口径，并用 initPlan 形式读取当前身份。
drop policy if exists "songs_select_authed_public_or_owner" on public.songs;
drop policy if exists "songs_select_public_or_owner" on public.songs;

create policy "songs_select_public_or_owner"
on public.songs
for select
to authenticated
using (is_public = true or owner_id = (select auth.uid()));

-- 事件表不提供客户端 insert/update/delete policy；只允许安全 RPC 写入。
revoke all on table public.listening_play_events from public;
revoke all on table public.listening_play_events from anon;
revoke all on table public.listening_play_events from authenticated;
grant select on table public.listening_play_events to authenticated;

-- 覆盖记录只供安全函数读取/更新，客户端没有任何表权限或 policy。
revoke all on table public.listening_recap_coverage from public;
revoke all on table public.listening_recap_coverage from anon;
revoke all on table public.listening_recap_coverage from authenticated;

create or replace function public.record_listening_play_event(
  p_event_id uuid,
  p_play_session_id uuid,
  p_song_id uuid,
  p_metric text,
  p_policy_version text,
  p_observed_at timestamptz default null,
  p_qualifying_seconds double precision default null,
  p_listened_seconds double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid;
  v_existing public.listening_play_events%rowtype;
  v_inserted public.listening_play_events%rowtype;
  v_song_play_count bigint := 0;
  v_user_song_play_count bigint := 0;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception using
      message = 'not authenticated [not_authenticated]',
      errcode = 'P0001';
  end if;

  if p_event_id is null or p_play_session_id is null or p_song_id is null then
    raise exception using
      message = 'invalid input [invalid_input]',
      errcode = 'P0001';
  end if;

  if p_metric is distinct from 'qualified_play' then
    raise exception using
      message = 'invalid metric [invalid_metric]',
      errcode = 'P0001';
  end if;

  if p_policy_version is distinct from 'd1-20pct-v1' then
    raise exception using
      message = 'invalid policy [invalid_policy]',
      errcode = 'P0001';
  end if;

  if p_qualifying_seconds is not null
    and (
      p_qualifying_seconds < 0
      or p_qualifying_seconds::text in ('NaN', 'Infinity', '-Infinity')
    ) then
    raise exception using
      message = 'invalid input [invalid_input]',
      errcode = 'P0001';
  end if;

  if p_listened_seconds is not null
    and (
      p_listened_seconds < 0
      or p_listened_seconds::text in ('NaN', 'Infinity', '-Infinity')
    ) then
    raise exception using
      message = 'invalid input [invalid_input]',
      errcode = 'P0001';
  end if;

  -- SECURITY DEFINER 会绕过 songs 的 RLS，因此这里必须再次执行可见性校验。
  if not exists (
    select 1
    from public.songs s
    where s.id = p_song_id
      and (s.is_public = true or s.owner_id = v_user_id)
  ) then
    raise exception using
      message = 'song not allowed [song_not_allowed]',
      errcode = 'P0001';
  end if;

  -- 相同用户和 event_id 是幂等键；payload 改变则是冲突而不是第二条事件。
  select *
  into v_existing
  from public.listening_play_events e
  where e.user_id = v_user_id
    and e.event_id = p_event_id
  for update;

  if found then
    if v_existing.play_session_id is distinct from p_play_session_id
      or v_existing.song_id is distinct from p_song_id
      or v_existing.metric is distinct from p_metric
      or v_existing.policy_version is distinct from p_policy_version then
      raise exception using
        message = 'event conflict [event_conflict]',
        errcode = 'P0001';
    end if;

    select coalesce((
      select usp.plays_count
      from public.user_song_plays usp
      where usp.user_id = v_user_id
        and usp.song_id = v_existing.song_id
    ), 0)
    into v_user_song_play_count;

    return jsonb_build_object(
      'status', 'accepted',
      'isNew', false,
      'eventId', v_existing.event_id,
      'playSessionId', v_existing.play_session_id,
      'songId', v_existing.song_id,
      'metric', v_existing.metric,
      'policyVersion', v_existing.policy_version,
      'acceptedAt', v_existing.accepted_at,
      'userSongPlayCount', v_user_song_play_count
    );
  end if;

  -- 覆盖记录必须存在；新事件、累计和 last_accepted_at 之后在同一事务完成。
  perform 1
  from public.listening_recap_coverage c
  where c.coverage_key = 'qualified_play'
    and c.coverage_version = 'events-v1';
  if not found then
    raise exception using
      message = 'rpc unavailable [rpc_unavailable]',
      errcode = 'P0001';
  end if;

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
  values (
    p_event_id,
    v_user_id,
    p_play_session_id,
    p_song_id,
    p_metric,
    p_policy_version,
    now(),
    p_observed_at,
    p_qualifying_seconds,
    p_listened_seconds
  )
  on conflict do nothing
  returning * into v_inserted;

  if found then
    -- 新事件和两种累计必须同事务完成；任一更新失败都会回滚事件。
    update public.songs
    set plays_count = coalesce(plays_count, 0) + 1
    where id = p_song_id
      and (is_public = true or owner_id = v_user_id)
    returning plays_count into v_song_play_count;

    if not found then
      raise exception using
        message = 'song not allowed [song_not_allowed]',
        errcode = 'P0001';
    end if;

    insert into public.user_song_plays (
      user_id,
      song_id,
      plays_count,
      updated_at
    )
    values (v_user_id, p_song_id, 1, now())
    on conflict (user_id, song_id)
    do update set
      plays_count = public.user_song_plays.plays_count + 1,
      updated_at = now()
    returning plays_count into v_user_song_play_count;

    update public.listening_recap_coverage
    set last_accepted_at = case
      when last_accepted_at is null or last_accepted_at < v_inserted.accepted_at
        then v_inserted.accepted_at
      else last_accepted_at
    end,
      updated_at = now()
    where coverage_key = 'qualified_play'
      and coverage_version = 'events-v1';
    if not found then
      raise exception using
        message = 'rpc unavailable [rpc_unavailable]',
        errcode = 'P0001';
    end if;

    return jsonb_build_object(
      'status', 'accepted',
      'isNew', true,
      'eventId', v_inserted.event_id,
      'playSessionId', v_inserted.play_session_id,
      'songId', v_inserted.song_id,
      'metric', v_inserted.metric,
      'policyVersion', v_inserted.policy_version,
      'acceptedAt', v_inserted.accepted_at,
      'userSongPlayCount', v_user_song_play_count
    );
  end if;

  -- ON CONFLICT 已等待并发事务结束；先区分 event_id 冲突，再区分同会话幂等。
  select *
  into v_existing
  from public.listening_play_events e
  where e.user_id = v_user_id
    and e.event_id = p_event_id
  for update;

  if found then
    if v_existing.play_session_id is distinct from p_play_session_id
      or v_existing.song_id is distinct from p_song_id
      or v_existing.metric is distinct from p_metric
      or v_existing.policy_version is distinct from p_policy_version then
      raise exception using
        message = 'event conflict [event_conflict]',
        errcode = 'P0001';
    end if;

    select coalesce((
      select usp.plays_count
      from public.user_song_plays usp
      where usp.user_id = v_user_id
        and usp.song_id = v_existing.song_id
    ), 0)
    into v_user_song_play_count;

    return jsonb_build_object(
      'status', 'accepted',
      'isNew', false,
      'eventId', v_existing.event_id,
      'playSessionId', v_existing.play_session_id,
      'songId', v_existing.song_id,
      'metric', v_existing.metric,
      'policyVersion', v_existing.policy_version,
      'acceptedAt', v_existing.accepted_at,
      'userSongPlayCount', v_user_song_play_count
    );
  end if;

  select *
  into v_existing
  from public.listening_play_events e
  where e.user_id = v_user_id
    and e.play_session_id = p_play_session_id
    and e.metric = p_metric
  for update;

  if found then
    if v_existing.song_id is distinct from p_song_id
      or v_existing.policy_version is distinct from p_policy_version then
      raise exception using
        message = 'event conflict [event_conflict]',
        errcode = 'P0001';
    end if;

    select coalesce((
      select usp.plays_count
      from public.user_song_plays usp
      where usp.user_id = v_user_id
        and usp.song_id = v_existing.song_id
    ), 0)
    into v_user_song_play_count;

    return jsonb_build_object(
      'status', 'duplicate',
      'isNew', false,
      'eventId', v_existing.event_id,
      'playSessionId', v_existing.play_session_id,
      'songId', v_existing.song_id,
      'metric', v_existing.metric,
      'policyVersion', v_existing.policy_version,
      'acceptedAt', v_existing.accepted_at,
      'userSongPlayCount', v_user_song_play_count
    );
  end if;

  -- 这里只可能是未知的唯一约束冲突；不猜测成功，避免客户端重复累计。
  raise exception using
    message = 'event conflict [event_conflict]',
    errcode = 'P0001';
end;
$function$;

create or replace function public.get_listening_recap(
  p_period_type text,
  p_period_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid;
  v_as_of timestamptz;
  v_generated_at timestamptz;
  v_local_as_of timestamp;
  v_start_local timestamp;
  v_end_local timestamp;
  v_start timestamptz;
  v_end timestamptz;
  v_effective_start timestamptz;
  v_period_id text;
  v_coverage_version text;
  v_coverage_start timestamptz;
  v_status text;
  v_source text;
  v_message_key text;
  v_title text;
  v_valid_play_count bigint := 0;
  v_song_count bigint := 0;
  v_listening_day_count bigint := 0;
  v_summary jsonb;
  v_opening jsonb;
  v_opening_cover_song jsonb;
  v_longest_songs jsonb := '[]'::jsonb;
  v_longest_count bigint := 0;
  v_longest_is_tie boolean := false;
  v_owned_song_count bigint := 0;
  v_owned_songs jsonb := '[]'::jsonb;
  v_queue_song_ids jsonb := '[]'::jsonb;
  v_queue_total_count bigint := 0;
  v_queue_truncated boolean := false;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception using
      message = 'not authenticated [not_authenticated]',
      errcode = 'P0001';
  end if;

  if p_period_type is distinct from 'month'
    and p_period_type is distinct from 'year' then
    raise exception using
      message = 'invalid input [invalid_input]',
      errcode = 'P0001';
  end if;

  v_as_of := now();
  v_generated_at := clock_timestamp();
  v_local_as_of := v_as_of at time zone 'Asia/Shanghai';

  if p_period_type = 'month' then
    v_period_id := coalesce(p_period_id, to_char(v_local_as_of, 'YYYY-MM'));
    if v_period_id !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
      raise exception using
        message = 'invalid input [invalid_input]',
        errcode = 'P0001';
    end if;
    v_start_local := to_date(v_period_id || '-01', 'YYYY-MM-DD')::timestamp;
    v_end_local := v_start_local + interval '1 month';
    v_title := to_char(v_start_local, 'YYYY') || ' 年 '
      || to_char(v_start_local, 'FMMM') || ' 月的声音';
  else
    v_period_id := coalesce(p_period_id, to_char(v_local_as_of, 'YYYY'));
    if v_period_id !~ '^[0-9]{4}$' then
      raise exception using
        message = 'invalid input [invalid_input]',
        errcode = 'P0001';
    end if;
    v_start_local := to_date(v_period_id || '-01-01', 'YYYY-MM-DD')::timestamp;
    v_end_local := v_start_local + interval '1 year';
    v_title := to_char(v_start_local, 'YYYY') || ' 年的声音';
  end if;

  if v_start_local > v_local_as_of then
    raise exception using
      message = 'invalid input [invalid_input]',
      errcode = 'P0001';
  end if;

  v_start := v_start_local at time zone 'Asia/Shanghai';
  if v_end_local > v_local_as_of then
    v_end := v_as_of;
  else
    v_end := v_end_local at time zone 'Asia/Shanghai';
  end if;

  select c.coverage_version, c.coverage_start
  into v_coverage_version, v_coverage_start
  from public.listening_recap_coverage c
  where c.coverage_key = 'qualified_play';
  if not found then
    raise exception using
      message = 'rpc unavailable [rpc_unavailable]',
      errcode = 'P0001';
  end if;

  -- 事件启用前的窗口没有可还原的逐次时间，只能明确标注旧累计覆盖不足。
  if v_end <= v_coverage_start then
    return jsonb_build_object(
      'schemaVersion', 'listening-recap.v1',
      'coverageVersion', v_coverage_version,
      'period', jsonb_build_object(
        'type', p_period_type,
        'id', v_period_id,
        'timezone', 'Asia/Shanghai',
        'start', v_start,
        'end', v_end,
        'asOf', v_as_of
      ),
      'coverage', jsonb_build_object(
        'status', 'legacy_only',
        'source', 'user_song_plays',
        'coverageStart', v_coverage_start,
        'messageKey', 'events_not_available_for_period'
      ),
      'summary', null,
      'opening', null,
      'longestCompanion', null,
      'ownedSounds', null,
      'queue', jsonb_build_object(
        'songIds', '[]'::jsonb,
        'totalCount', 0,
        'truncated', false,
        'order', 'first_accepted_at_asc_song_id_asc'
      ),
      'generatedAt', v_generated_at,
      'error', null
    );
  end if;

  v_effective_start := greatest(v_start, v_coverage_start);
  v_status := case
    when v_start < v_coverage_start then 'event_partial'
    else 'event_complete'
  end;
  v_source := 'listening_play_events';
  v_message_key := case
    when v_status = 'event_partial' then 'events_coverage_starts_at'
    else null
  end;

  -- 所有统计都在服务端从 accepted_at 聚合；客户端永远不会收到原始事件列表。
  with visible_events as (
    select e.song_id, e.accepted_at
    from public.listening_play_events e
    join public.songs s on s.id = e.song_id
    where e.user_id = v_user_id
      and e.metric = 'qualified_play'
      and e.policy_version = 'd1-20pct-v1'
      and e.accepted_at >= v_effective_start
      and e.accepted_at < v_end
      and (s.is_public = true or s.owner_id = v_user_id)
  )
  select count(*)::bigint,
    count(distinct song_id)::bigint,
    count(distinct ((accepted_at at time zone 'Asia/Shanghai')::date))::bigint
  into v_valid_play_count, v_song_count, v_listening_day_count
  from visible_events;

  if v_valid_play_count = 0 then
    if v_status = 'event_complete' then
      v_status := 'no_event';
      v_message_key := 'no_events_in_period';
    end if;
    v_summary := jsonb_build_object(
      'validPlayCount', 0,
      'songCount', 0,
      'listeningDayCount', 0
    );
    v_opening := jsonb_build_object(
      'title', v_title,
      'coverSong', null
    );

    return jsonb_build_object(
      'schemaVersion', 'listening-recap.v1',
      'coverageVersion', v_coverage_version,
      'period', jsonb_build_object(
        'type', p_period_type,
        'id', v_period_id,
        'timezone', 'Asia/Shanghai',
        'start', v_start,
        'end', v_end,
        'asOf', v_as_of
      ),
      'coverage', jsonb_build_object(
        'status', v_status,
        'source', v_source,
        'coverageStart', v_coverage_start,
        'messageKey', v_message_key
      ),
      'summary', v_summary,
      'opening', v_opening,
      'longestCompanion', null,
      'ownedSounds', null,
      'queue', jsonb_build_object(
        'songIds', '[]'::jsonb,
        'totalCount', 0,
        'truncated', false,
        'order', 'first_accepted_at_asc_song_id_asc'
      ),
      'generatedAt', v_generated_at,
      'error', null
    );
  end if;

  v_summary := jsonb_build_object(
    'validPlayCount', v_valid_play_count,
    'songCount', v_song_count,
    'listeningDayCount', v_listening_day_count
  );

  with visible_events as (
    select e.song_id,
      e.accepted_at,
      s.owner_id,
      s.title,
      s.artist,
      s.cover_path,
      case when s.is_public = true then 'public' else 'private' end as visibility
    from public.listening_play_events e
    join public.songs s on s.id = e.song_id
    where e.user_id = v_user_id
      and e.metric = 'qualified_play'
      and e.policy_version = 'd1-20pct-v1'
      and e.accepted_at >= v_effective_start
      and e.accepted_at < v_end
      and (s.is_public = true or s.owner_id = v_user_id)
  ),
  song_stats as (
    select song_id,
      owner_id,
      max(title) as title,
      max(artist) as artist,
      max(cover_path) as cover_path,
      max(visibility) as visibility,
      count(*)::bigint as valid_play_count,
      min(accepted_at) as first_accepted_at,
      max(accepted_at) as last_accepted_at
    from visible_events
    group by song_id, owner_id
  ),
  maxed as (
    select max(valid_play_count)::bigint as max_count
    from song_stats
  ),
  ranked as (
    select ss.*,
      row_number() over (
        order by ss.last_accepted_at desc, ss.song_id asc
      ) as tie_rank
    from song_stats ss
    cross join maxed
    where ss.valid_play_count = maxed.max_count
  ),
  selected as (
    select *
    from ranked
    where tie_rank <= 2
  )
  select
    coalesce(maxed.max_count, 0)::bigint,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', selected.song_id,
            'title', selected.title,
            'artist', selected.artist,
            'coverUrl', selected.cover_path,
            'visibility', selected.visibility,
            'validPlayCount', selected.valid_play_count,
            'firstAcceptedAt', selected.first_accepted_at,
            'lastAcceptedAt', selected.last_accepted_at
          )
          order by selected.tie_rank
        )
        from selected
      ),
      '[]'::jsonb
    ),
    coalesce((select count(*) > 1 from ranked), false)
  into v_longest_count, v_longest_songs, v_longest_is_tie
  from maxed;

  v_opening_cover_song := v_longest_songs -> 0;
  if v_opening_cover_song is null then
    -- 只有在陪伴候选缺失时才按最早事件回退；正常有事件时上面的候选必然存在。
    with visible_events as (
      select e.song_id,
        e.accepted_at,
        s.owner_id,
        s.title,
        s.artist,
        s.cover_path,
        case when s.is_public = true then 'public' else 'private' end as visibility
      from public.listening_play_events e
      join public.songs s on s.id = e.song_id
      where e.user_id = v_user_id
        and e.metric = 'qualified_play'
        and e.policy_version = 'd1-20pct-v1'
        and e.accepted_at >= v_effective_start
        and e.accepted_at < v_end
        and (s.is_public = true or s.owner_id = v_user_id)
    ),
    song_stats as (
      select song_id,
        owner_id,
        max(title) as title,
        max(artist) as artist,
        max(cover_path) as cover_path,
        max(visibility) as visibility,
        count(*)::bigint as valid_play_count,
        min(accepted_at) as first_accepted_at,
        max(accepted_at) as last_accepted_at
      from visible_events
      group by song_id, owner_id
    )
    select jsonb_build_object(
      'id', ss.song_id,
      'title', ss.title,
      'artist', ss.artist,
      'coverUrl', ss.cover_path,
      'visibility', ss.visibility,
      'validPlayCount', ss.valid_play_count,
      'firstAcceptedAt', ss.first_accepted_at,
      'lastAcceptedAt', ss.last_accepted_at
    )
    into v_opening_cover_song
    from song_stats ss
    order by ss.first_accepted_at asc, ss.song_id asc
    limit 1;
  end if;

  v_opening := jsonb_build_object(
    'title', v_title,
    'coverSong', v_opening_cover_song
  );

  with visible_events as (
    select e.song_id,
      e.accepted_at,
      s.owner_id,
      s.title,
      s.artist,
      s.cover_path,
      case when s.is_public = true then 'public' else 'private' end as visibility
    from public.listening_play_events e
    join public.songs s on s.id = e.song_id
    where e.user_id = v_user_id
      and e.metric = 'qualified_play'
      and e.policy_version = 'd1-20pct-v1'
      and e.accepted_at >= v_effective_start
      and e.accepted_at < v_end
      and (s.is_public = true or s.owner_id = v_user_id)
  ),
  song_stats as (
    select song_id,
      owner_id,
      max(title) as title,
      max(artist) as artist,
      max(cover_path) as cover_path,
      max(visibility) as visibility,
      count(*)::bigint as valid_play_count,
      min(accepted_at) as first_accepted_at,
      max(accepted_at) as last_accepted_at
    from visible_events
    group by song_id, owner_id
  ),
  owned_ranked as (
    select ss.*,
      row_number() over (
        order by ss.first_accepted_at asc, ss.song_id asc
      ) as owned_rank
    from song_stats ss
    where ss.owner_id = v_user_id
  )
  select count(*)::bigint,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', owned_ranked.song_id,
            'title', owned_ranked.title,
            'artist', owned_ranked.artist,
            'coverUrl', owned_ranked.cover_path,
            'visibility', owned_ranked.visibility,
            'validPlayCount', owned_ranked.valid_play_count,
            'firstAcceptedAt', owned_ranked.first_accepted_at,
            'lastAcceptedAt', owned_ranked.last_accepted_at
          )
          order by owned_ranked.owned_rank
        )
        from owned_ranked
        where owned_ranked.owned_rank <= 3
      ),
      '[]'::jsonb
    )
  into v_owned_song_count, v_owned_songs
  from owned_ranked;

  with visible_events as (
    select e.song_id, e.accepted_at
    from public.listening_play_events e
    join public.songs s on s.id = e.song_id
    where e.user_id = v_user_id
      and e.metric = 'qualified_play'
      and e.policy_version = 'd1-20pct-v1'
      and e.accepted_at >= v_effective_start
      and e.accepted_at < v_end
      and (s.is_public = true or s.owner_id = v_user_id)
  ),
  song_first as (
    select song_id, min(accepted_at) as first_accepted_at
    from visible_events
    group by song_id
  ),
  ordered as (
    select song_id,
      first_accepted_at,
      row_number() over (
        order by first_accepted_at asc, song_id asc
      ) as queue_rank,
      count(*) over () as total_count
    from song_first
  )
  select coalesce(
      (
        select jsonb_agg(ordered.song_id::text order by ordered.queue_rank)
        from ordered
        where ordered.queue_rank <= 50
      ),
      '[]'::jsonb
    ),
    coalesce(max(ordered.total_count), 0)::bigint
  into v_queue_song_ids, v_queue_total_count
  from ordered;
  v_queue_truncated := v_queue_total_count > 50;

  return jsonb_build_object(
    'schemaVersion', 'listening-recap.v1',
    'coverageVersion', v_coverage_version,
    'period', jsonb_build_object(
      'type', p_period_type,
      'id', v_period_id,
      'timezone', 'Asia/Shanghai',
      'start', v_start,
      'end', v_end,
      'asOf', v_as_of
    ),
    'coverage', jsonb_build_object(
      'status', v_status,
      'source', v_source,
      'coverageStart', v_coverage_start,
      'messageKey', v_message_key
    ),
    'summary', v_summary,
    'opening', v_opening,
    'longestCompanion', jsonb_build_object(
      'songs', v_longest_songs,
      'validPlayCount', v_longest_count,
      'isTie', v_longest_is_tie
    ),
    'ownedSounds', jsonb_build_object(
      'songCount', v_owned_song_count,
      'songs', v_owned_songs
    ),
    'queue', jsonb_build_object(
      'songIds', v_queue_song_ids,
      'totalCount', v_queue_total_count,
      'truncated', v_queue_truncated,
      'order', 'first_accepted_at_asc_song_id_asc'
    ),
    'generatedAt', v_generated_at,
    'error', null
  );
end;
$function$;

-- 明确收紧为：只有已认证客户端可调用安全函数；anon/PUBLIC 不可执行。
revoke all on function public.record_listening_play_event(
  uuid,
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  double precision,
  double precision
) from public;
revoke all on function public.record_listening_play_event(
  uuid,
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  double precision,
  double precision
) from anon;
revoke all on function public.record_listening_play_event(
  uuid,
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  double precision,
  double precision
) from authenticated;
grant execute on function public.record_listening_play_event(
  uuid,
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  double precision,
  double precision
) to authenticated;

revoke all on function public.get_listening_recap(text, text) from public;
revoke all on function public.get_listening_recap(text, text) from anon;
revoke all on function public.get_listening_recap(text, text) from authenticated;
grant execute on function public.get_listening_recap(text, text) to authenticated;
