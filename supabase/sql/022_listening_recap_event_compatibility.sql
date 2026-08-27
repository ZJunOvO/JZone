-- 聆听回顾事件兼容修正：songs.plays_count 只是旧客户端兼容旁路。
--
-- 021 的事件、个人累计和覆盖标记语义保持不变；本迁移只把全局歌曲累计
-- 变成 best-effort 子事务。旧约束、触发器、权限或计数溢出不能阻塞已接受事件，
-- 也不能改变认证、event_id 幂等和 play_session_id 幂等语义。

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

  -- 覆盖记录必须存在；新事件、个人累计和 last_accepted_at 之后在同一事务完成。
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
    -- songs.plays_count 是旧客户端兼容旁路，只能 best-effort 更新。
    -- 子事务回滚仅限这次全局累计失败，不能回滚事件、个人累计或覆盖标记。
    begin
      update public.songs
      set plays_count = coalesce(plays_count, 0) + 1
      where id = p_song_id
        and (is_public = true or owner_id = v_user_id)
      returning plays_count into v_song_play_count;
    exception when others then
      v_song_play_count := null;
    end;

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

-- 重建函数后再次明确维持原有认证边界：仅 authenticated 可执行。
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
