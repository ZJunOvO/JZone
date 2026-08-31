alter table public.profiles
  add column if not exists player_skin_id text not null default 'classic';

alter table public.profiles
  drop constraint if exists profiles_player_skin_id_check;

alter table public.profiles
  add constraint profiles_player_skin_id_check
  check (player_skin_id in ('classic', 'vinyl', 'immersive'));

comment on column public.profiles.player_skin_id is
  '稳定的播放器皮肤 ID；客户端遇到未知或下架值时回退 classic。';
