-- 高码率源文件继续保存在 audio_path，播放器优先使用可选的低码率副本。
alter table public.songs
  add column if not exists stream_audio_path text,
  add column if not exists stream_file_size bigint,
  add column if not exists stream_bitrate_kbps integer;

comment on column public.songs.stream_audio_path is '用于日常播放的低码率音频副本；为空时回退 audio_path';
comment on column public.songs.stream_file_size is '播放副本大小，单位字节';
comment on column public.songs.stream_bitrate_kbps is '播放副本目标码率，单位 kbps';

