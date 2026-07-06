# 资料库与创作工作台重构 Task

## P0：先修正内容边界

- [x] 修复 Supabase 合集可见性：统一以 `albums.visibility` 为单一事实来源，废弃旧策略对 `albums.is_public` 的放行。
- [x] 同步现有合集数据：`is_public = (visibility = 'public')`，避免旧数据继续误导。
- [x] 增加数据库层同步触发器：后续更新 `visibility` 时自动同步 `is_public`，直到旧字段完全删除。
- [x] 验证测试账号不能看到非本人 private playlist。
- [x] 检查 `fetchMyCollections` 是否应显式限制当前用户，避免未来误用。

## P1：上传能力统一

- [x] 新建 `components/upload/UploadEditor.tsx`，承载文件选择、封面、裁剪、元数据、公开私有、合集选择。
- [ ] 新建 `components/upload/useUploadDraft.ts`，统一草稿恢复、草稿持久化、objectURL 释放。
- [ ] 新建 `components/upload/useUploadSave.ts`，统一 Supabase/COS 上传、创建歌曲、加入合集、错误处理。
- [x] 将 `UploadModal.tsx` 改成 Modal 壳 + `UploadEditor`。
- [x] 将 `Upload.tsx` 改成创作工作台壳 + `UploadEditor` + 我的上传管理列表。
- [x] 删除重复上传逻辑，保留一套字段默认值和错误提示。

## P2：创作工作台产品化

- [x] 底部 Tab 文案从“上传”改为“创作”。
- [ ] 工作台顶部显示草稿状态、已用空间、我的上传数量。
- [ ] 我的上传列表支持公开/私有、编辑、删除、置顶、加入专辑/歌单。
- [ ] 上传保存后加入骨架反馈，直到列表中真实数据刷新完成。
- [x] 默认艺人名使用当前用户昵称；如果文件名解析出艺人，则优先文件名。

## P3：资料库列表视图重构

- [ ] 将资料库筛选从静态 chip 改为真实筛选：全部、我的、公开、私有、收藏。
- [ ] 增加搜索入口，支持歌曲名、艺人、专辑。
- [ ] 分段切换歌曲 / 专辑 / 歌单，保留画布视图作为探索模式。
- [ ] 列表项按照 Apple Music 风格收敛：封面、主标题、副标题、状态图标、更多按钮。
- [ ] 长按菜单与更多按钮菜单统一，不再只有长按入口。

## P4：现在就听补真实数据

- [ ] 移除 `featuredSongs = [...songs, ...songs]` 占位逻辑。
- [ ] 增加最近播放数据来源。
- [ ] 首页只展示少量高价值入口：继续播放、最近播放、最新公开、我的最近上传。

## P5：验收与回归

- [ ] `npm run check`
- [ ] `npm run smoke:auth`
- [ ] 手机局域网实机验证：`http://192.168.1.7:3000`
- [ ] 测试账号 A 创建 private 歌单，测试账号 B 不可见。
- [ ] 测试账号 A 上传 private 歌曲，测试账号 B 不可见，账号 A 自己在资料库和创作页可见。
