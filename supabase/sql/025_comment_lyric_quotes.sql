-- 评论可选地保留发送时引用的歌词，避免后续歌词修改改变历史评论语义。
alter table public.comments
  add column if not exists quoted_lyric text;

alter table public.comments
  drop constraint if exists comments_quoted_lyric_length_check;

alter table public.comments
  add constraint comments_quoted_lyric_length_check
  check (quoted_lyric is null or char_length(quoted_lyric) <= 500);
