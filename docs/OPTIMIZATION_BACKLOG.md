# 优化建议与优先级（jzone-player）

本清单按“投入产出比 + 风险等级 + 未来扩展价值”排序，建议从 P0 开始逐步落地。

## P0（高收益/低风险，建议优先做）

- 移除或补齐缺失资源引用：确保 `/index.css` 存在或从 `index.html` 去掉引用
- 秘钥处理改造：不要将 `GEMINI_API_KEY` 注入前端；改为后端代理/短期令牌
- 统一 seek/clamp 策略：所有 `seek()`、评论时间点、进度条交互均限制在有效播放区间
- 释放 objectURL：上传音频与封面使用完毕后 `URL.revokeObjectURL`

## P1（提升可维护性与体验，成本中等）

- 拆分状态层：
  - 将 `songs/comments` 与 `playerState` 拆分为多个 Context
  - 或引入可选择性订阅的 store（例如外部 store + selector）
- 降低 `currentTime` 更新频率：
  - requestAnimationFrame 驱动 UI
  - 或固定 200ms/250ms 节流更新
- 上传“播放选段”按 `range[1]` 自动停止，并提供循环/单次播放选项
- 图片加载策略：
  - 列表与卡片加入 `loading="lazy"`、合适的 `sizes`
  - 允许配置封面图默认占位与错误兜底

## P2（架构增强与产品化方向）

- 数据持久化：
  - 本地：IndexedDB/Cache Storage 保存 songs、comments、上传文件
  - 服务端：用户体系 + 版权/权限 + 多端同步
- 播放能力增强：随机/单曲循环/列表循环、播放历史、收藏、搜索与筛选
- 可观测性：错误边界、统一日志与埋点、性能监控（Web Vitals）

## 维度化建议索引

### 代码质量

- 增加纯函数工具层：时间格式化、区间 clamp、队列计算等抽离到 utils
- 为 action 增加更明确的错误处理策略（返回值/状态枚举），替代 `console.*`

### 性能优化

- 高频状态拆分：将“播放时钟”与“业务状态”隔离
- 大图与滤镜可降级：低端机减少 blur 与阴影层级

### 架构优化

- 引入 AudioManager 抽象：UI 与 `HTMLAudioElement` 解耦，便于测试与替换
- 明确领域模块：Library（歌曲库）、Player（播放）、Social（评论）边界

### 安全加固

- 前端不存储长期秘钥；配置 CSP（script-src/style-src 等）并去除运行时 CDN 依赖
- 为用户输入增加长度/频率限制（避免滥用与 DoS 类问题）

### 用户体验

- 进度条/时间显示统一：迷你条与全屏播放器同一套“裁剪区间”逻辑
- 上传流程增加错误提示：不支持格式、解码失败、封面加载失败等

