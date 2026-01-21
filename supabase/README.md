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

在 Storage 创建两个 bucket（都设为 Private）：

- `audio`
- `covers`

如果你创建 bucket 时使用了不同的名字（比如 `AUDIO`/`COVERS` 大写），请保持策略里的 `bucket_id` 与 bucket 名字完全一致；并在前端环境变量里设置：

- `VITE_SUPABASE_AUDIO_BUCKET`
- `VITE_SUPABASE_COVERS_BUCKET`

### 方式 A：用 SQL（需要足够权限）

在 SQL Editor 运行：

- `supabase/sql/002_storage_policies.sql`

如果你看到以下错误之一，说明你当前在 SQL Editor 的执行身份没有权限修改 `storage.objects`：

- `must be owner of table objects`
- `permission denied to set role "supabase_storage_admin"`

这时请改用下面的方式 B（控制台 UI 创建策略）。

### 方式 B：用控制台 UI（推荐，最不容易卡权限）

路径：Storage → 进入 bucket → Policies → New policy（分别对 `audio` 与 `covers` 创建）

`audio` bucket（目标角色：authenticated）

- SELECT（USING）：
  - `bucket_id = 'audio' and exists (select 1 from public.songs s where s.audio_path = name and (s.visibility = 'public' or s.owner_id = auth.uid()))`
- INSERT（WITH CHECK）：
  - `bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text`
- UPDATE（USING / WITH CHECK 同上 INSERT 条件）：
  - `bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text`
- DELETE（USING）：
  - `bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text`

`covers` bucket（目标角色：authenticated）

- SELECT（USING）：
  - `bucket_id = 'covers' and (exists (select 1 from public.songs s where s.cover_path = name and (s.visibility = 'public' or s.owner_id = auth.uid())) or (storage.foldername(name))[1] = auth.uid()::text)`
- INSERT（WITH CHECK）：
  - `bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text`
- UPDATE（USING / WITH CHECK 同上 INSERT 条件）：
  - `bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text`
- DELETE（USING）：
  - `bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text`

