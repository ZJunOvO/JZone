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

## 3) Storage

本项目媒体存储统一使用腾讯云 COS，不再使用 Supabase Storage（Supabase 仅用于 Auth + Database）。

