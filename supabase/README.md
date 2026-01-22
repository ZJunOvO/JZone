# Supabase 设置（最小可用版）

本项目采用方案 A：站点内容仅对已登录用户可见；歌曲可设公开/私有（仍在登录用户范围内）。

## 1) Auth

- Email + Password
- 关闭 Email Confirm（你们已决定不做邮件验证）
- 你们两人注册完成后，在 Supabase 控制台关闭 Signups

## 2) Database & RLS

在 Supabase SQL Editor 运行：

- `supabase/sql/001_init.sql`

## 3) Storage

在 Storage 创建两个 bucket（都设为 Private）：

- `audio`
- `covers`

然后在 SQL Editor 运行：

- `supabase/sql/002_storage_policies.sql`

