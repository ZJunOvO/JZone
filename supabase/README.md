# Supabase 设置（最小可用版）

本项目采用方案 A：站点内容仅对已登录用户可见；歌曲可设公开/私有（仍在登录用户范围内）。

## 1) Auth

- Email + Password
- 关闭 Email Confirm（你们已决定不做邮件验证）
- 你们两人注册完成后，在 Supabase 控制台关闭 Signups

## 2) Database & RLS

在 Supabase SQL Editor 运行：

- `supabase/sql/001_init.sql`
- `supabase/sql/003_plays.sql`（播放次数统计）
- `supabase/sql/019_comment_reliability_and_threads.sql`（评论分页排序、单层回复、头像挂件资料映射和删除权限）

SQL 文件按编号顺序执行。`019` 依赖 `015_comment_likes.sql` 已经存在。

> JZone 远程项目已于 2026-07-13 应用 `019_comment_reliability_and_threads.sql`，迁移版本：`20260713120746_comment_reliability_and_threads`；删除 RPC 权限加固版本：`20260713121022_restrict_delete_comment_to_authenticated`。

## 3) Storage

本项目媒体存储统一使用腾讯云 COS，不再使用 Supabase Storage（Supabase 仅用于 Auth + Database）。
