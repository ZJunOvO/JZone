-- 原始录制日期来自音频元数据，也允许用户在编辑歌曲信息时修正。
alter table public.songs
  add column if not exists recorded_at date;

comment on column public.songs.recorded_at is
  '音频原始录制日期；为空表示文件未提供可靠日期且用户尚未补录。';
