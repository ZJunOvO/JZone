# COS 存储迁移（媒体文件）

目标：保留 Supabase 作为 Auth + DB（songs/comments/plays），把音频与封面从 Supabase Storage 迁移到腾讯云 COS。

## 为什么不能纯前端直连 COS

- COS 需要使用 SecretId/SecretKey 做签名；这些密钥不能下发到前端。
- 正确方式是：前端向“你自己的后端”请求一次性签名（临时凭证/预签名 URL），然后前端用该 URL 直接上传/下载。

## 推荐架构（最少改动）

- Supabase：Auth（登录），DB（songs/comments），RLS（数据权限）
- COS：仅存放二进制文件（audio/cover）
- 新增一个轻量服务（任选其一）：
  - Node/Express（最简单）
  - Serverless（腾讯云函数 SCF）
  - Supabase Edge Function（可行，但需要你在函数里接入腾讯云签名逻辑）

该服务提供 2 类 API：

1) 获取上传 URL（预签名 PUT）

- `POST /media/presign-upload`
- body（示例）：
  - `type`: `audio` | `cover`
  - `ext`: `mp3` | `m4a` | `flac` ...
  - `contentType`: `audio/mpeg` ...
- 返回（示例）：
  - `objectKey`: `uid/songId/audio.mp3`
  - `uploadUrl`: `https://...`（带签名、短有效期）
  - `headers`:（必须带上的请求头，如 `Content-Type`）

2) 获取播放/显示 URL（预签名 GET）

- `POST /media/presign-download`
- body（示例）：
  - `objectKey`: `uid/songId/audio.mp3`
- 返回：
  - `downloadUrl`

## 数据表如何存

保持 `songs.audio_path` / `songs.cover_path` 字段，但把含义从“Supabase Storage path”改成 “COS objectKey”。

- `audio_path`: `uid/songId/audio.mp3`
- `cover_path`: `uid/songId/cover.jpg`

## 迁移步骤（一步一步）

### Step 1：创建 COS bucket + CORS

- bucket：建议 `jzone-media`
- 地域：选择离主要用户最近的地域（你截图的成都 OK；创建后无法修改）
- 访问权限：建议保持“私有读写”（配合预签名 URL），不要开公开读写
- 自定义域名：后续建议绑定自定义域名（稳定、便于缓存与 CORS 管理）
- CORS：允许你的 Web 域名发起 PUT/GET（本地开发可先 `http://192.168.1.4:3000`）
  - Allowed Methods：GET/PUT/HEAD（需要分片或补传再加 POST）
  - Allowed Origin：你的站点域名（开发阶段可先填你的局域网地址）
  - Allowed Header：`*`（先通链路，后续再收紧）
  - Expose Header：`ETag,x-cos-request-id`
  - MaxAge：600 或 3600
- 如果你只用预签名 URL，一般不需要公开读权限

### Step 2：实现签名服务（后端）

实现：
- 认证：请求头带 Supabase 的 `access_token`（Bearer），后端验证 token（用 Supabase JWT 公钥或调用 Supabase）
- 授权：只允许给“当前用户自己的 objectKey”签名（前缀为 `uid/`）
- 签名：生成短期（例如 5 分钟）预签名 URL

### Step 3：前端接入（代码改动方向）

需要把以下能力从 “Supabase Storage” 切换到 “COS Sign API”：

- 上传：获取 uploadUrl → PUT 文件到 COS → DB insert songs（audio_path/cover_path 存 objectKey）
- 播放/封面：用 objectKey 调 `/media/presign-download` 获取 downloadUrl → 设置为 audio.src / img.src

建议增加环境变量：

- `VITE_MEDIA_PROVIDER=supabase|cos`
- `VITE_MEDIA_SIGN_ENDPOINT=https://你的签名服务域名`

### Step 4：迁移历史数据（可选）

- 逐条从 Supabase Storage 下载并上传到 COS
- 更新 `songs.audio_path/cover_path` 为 COS objectKey
- 确认播放无误后再关闭 Supabase Storage 的策略/清理桶

## 下一步需要你给的信息

- COS 的 bucket 名、region
- 你打算把“签名服务”跑在哪里（Node 服务 / SCF / Edge Function）
- 你的站点最终域名（用于 CORS 与 Allowed Origins）
